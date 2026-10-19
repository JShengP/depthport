# SPDX-License-Identifier: AGPL-3.0-only
"""Local CLEAR event traces and observational error contexts, never causal labels.

Matching follows pinned TrackEval CLEAR: previous-step continuity first, IoU
second, and switches against the last match at any earlier time. Callers must
verify TP/FP/FN/IDSW against the unmodified official evaluator before reporting.
"""
from __future__ import annotations

from collections import Counter
import math
import numpy as np


def clear_trace(data, assign=None):
    if assign is None:
        from scipy.optimize import linear_sum_assignment
        assign=linear_sum_assignment
    eps=np.finfo(float).eps
    history={};previous_step={};owners={};frames=[];switches=[];fps=[]
    summary={'CLR_TP':0,'CLR_FP':0,'CLR_FN':0,'IDSW':0}
    for f,(gids,tids,ious) in enumerate(zip(data['gt_ids'],data['tracker_ids'],data['similarity_scores']),1):
        pairs=[]
        if len(gids) and len(tids):
            score=ious.copy()
            for i,g in enumerate(gids):
                score[i]+=1000*(tids==previous_step.get(int(g),-1))
            score[ious<.5-eps]=0
            a,b=assign(-score)
            pairs=[(int(i),int(j)) for i,j in zip(a,b) if score[i,j]>eps]
        matched={int(gids[i]):{'tid':int(tids[j]),'col':j,'row':i} for i,j in pairs}
        for g,m in matched.items():
            if g in history and history[g]['tid']!=m['tid']:
                prior=history[g]
                owner=owners.get(m['tid'])
                switches.append({'frame':f,'gt':g,'tid':m['tid'],'col':m['col'],
                    'previous_tid':prior['tid'],'previous_frame':prior['frame'],
                    'gap_frames':f-prior['frame']-1,
                    'other_previous_owner':owner if owner and owner['gt']!=g else None})
        for g,m in matched.items():
            history[g]={'tid':m['tid'],'frame':f};owners[m['tid']]={'gt':g,'frame':f}
        # TrackEval's early-continue empty-frame behavior retains previous-step state.
        if len(gids) and len(tids):
            previous_step={g:m['tid'] for g,m in matched.items()}
        used={j for _,j in pairs}
        fps.extend({'frame':f,'tid':int(tids[j]),'col':j} for j in range(len(tids)) if j not in used)
        summary['CLR_TP']+=len(pairs);summary['CLR_FP']+=len(tids)-len(pairs);summary['CLR_FN']+=len(gids)-len(pairs)
        frames.append(matched)
    summary['IDSW']=len(switches)
    return {'summary':summary,'switches':switches,'false_positives':fps,'matches':frames}


def box_ious(box, others):
    """MOT xywh boxes; output is only a geometric diagnostic."""
    a=np.asarray(box,dtype=float);b=np.asarray(others,dtype=float).reshape(-1,4)
    if not len(b):return np.empty(0)
    extent=np.maximum(0,np.minimum(a[:2]+a[2:],b[:,:2]+b[:,2:])-np.maximum(a[:2],b[:,:2]))
    inter=extent.prod(axis=1)
    return inter/(a[2]*a[3]+b[:,2]*b[:,3]-inter)


def cache_index(box, confidence, detections, scale):
    """Pair profiles by the immutable input detection, never by tracker ID."""
    x,y,w,h=box;xyxy=np.array([(x-1)/scale,(y-1)/scale,(x+w-1)/scale,(y+h-1)/scale])
    found=[i for i,d in enumerate(detections) if np.allclose(xyxy,d['bbox'],atol=1e-6,rtol=0)
           and math.isclose(float(confidence),d['confidence'],abs_tol=1e-6,rel_tol=0)]
    if len(found)!=1:raise ValueError('Ambiguous/unmapped prediction-to-cache detection')
    return found[0]


def confidence_band(value):
    return 'below_.60' if value<.6 else '.60_to_.70' if value<.7 else 'at_least_.70'


def switch_context(case,data,original_ids,rows,events,cache,scale):
    f=case['frame'];ident=original_ids[case['gt']];start=case['previous_frame'];lookup={(r['frame'],r['id']):r for r in rows}
    current=lookup[(f,ident)];gap=[lookup[(t,ident)] for t in range(start+1,f) if (t,ident) in lookup]
    missing=high=no_overlap=partial=visible_missing=low_missing=0
    for r in gap:
        dets=cache['frames'][r['frame']-1]['detections']
        boxes=[[(d['bbox'][0]*scale+1),(d['bbox'][1]*scale+1),(d['bbox'][2]-d['bbox'][0])*scale,(d['bbox'][3]-d['bbox'][1])*scale] for d in dets]
        scores=box_ious(r['bbox'],boxes)
        best=float(scores.max()) if len(scores) else 0.
        missing+=best<.5;no_overlap+=best<.1;partial+=.1<=best<.5
        visible_missing+=best<.5 and r['visibility']>=.6
        low_missing+=best<.5 and r['visibility']<=.3
        high+=any(v>=.5 and d['confidence']>=.6 for v,d in zip(scores,dets))
    others=[r['bbox'] for r in rows if r['frame']==f and r['id']!=ident]
    overlap=bool(np.any(box_ious(current['bbox'],others)>=.1))
    near_cross=any(ident in e['ids'] and e['start']-math.ceil(cache['fps']*.5)<=f<=e['end']+math.ceil(cache['fps']*.5) for e in events['overlap_order_exchange'])
    low=any(lookup[(t,ident)]['visibility']<=.3 for t in range(start,f+1) if (t,ident) in lookup)
    long=any(ident in e['ids'] and start<=e['end'] and e['start']<=f<=e['end']+math.ceil(cache['fps']) for e in events['long_low_visibility'])
    if case['gap_frames']:
        category='gap_with_missing_raw_detection' if missing else 'gap_with_raw_detection_support' if gap else 'gap_without_gt_observations'
    else:category='continuous_overlap_or_crossing' if overlap or near_cross else 'continuous_other'
    i=case['gt'];j=case['col'];scores=data['similarity_scores'][f-1];gids=list(data['gt_ids'][f-1]);row=gids.index(i)
    owner=case['other_previous_owner']
    return {**case,'original_gt':ident,'category':category,'low_visibility_context':low,'long_visibility_event_context':long,
            'crossing_event_context':near_cross,'current_gt_overlap':overlap,
            'current_match_ambiguous':bool(np.sum(scores[row]>=.5)>1 or np.sum(scores[:,j]>=.5)>1),
            'recent_other_gt_owner':bool(owner and f-owner['frame']<=math.ceil(cache['fps'])),
            'gap_gt_observations':len(gap),'gap_gt_absent_frames':case['gap_frames']-len(gap),
            'gap_frames_without_raw_box_iou_half':int(missing),'gap_frames_with_high_conf_box':int(high),
            'gap_has_no_raw_overlap':bool(no_overlap),'gap_has_partial_raw_overlap':bool(partial),
            'visible_gap_missing_raw_box':bool(visible_missing),'low_visibility_gap_missing_raw_box':bool(low_missing),
            'current_confidence_band':confidence_band(data['tracker_confidences'][f-1][j])}


def fp_context(case,data,raw,cache,scale):
    f=case['frame'];j=case['col'];box=data['tracker_dets'][f-1][j];score=float(data['tracker_confidences'][f-1][j])
    values=box_ious(box,data['gt_dets'][f-1]);best=float(values.max()) if len(values) else 0.
    category='duplicate_or_assignment_competition' if best>=.5 else 'partial_overlap_below_.50' if best>=.1 else 'no_evaluated_pedestrian_overlap'
    excluded=[b for b,c,z in zip(raw['gt_dets'][f-1],raw['gt_classes'][f-1],raw['gt_extras'][f-1]['zero_marked']) if c!=1 or not z]
    return {**case,'cache_index':cache_index(box,score,cache['frames'][f-1]['detections'],scale),
            'category':category,'best_pedestrian_iou':best,'confidence_band':confidence_band(score),
            'overlaps_excluded_annotation':bool(np.any(box_ious(box,excluded)>=.5))}


def case_counts(cases,boolean_fields=()):
    return {'total':len(cases),'categories':dict(sorted(Counter(c['category'] for c in cases).items())),
            'signals':{key:sum(bool(c[key]) for c in cases) for key in boolean_fields},
            'current_confidence_bands':dict(sorted(Counter(c.get('confidence_band',c.get('current_confidence_band')) for c in cases).items()))}


def paired_locations(reference,candidate,key):
    old={key(c):c for c in reference};new={key(c):c for c in candidate}
    if len(old)!=len(reference) or len(new)!=len(candidate):raise ValueError('Duplicate comparison location')
    return {'added':[new[k] for k in sorted(new.keys()-old.keys())],
            'removed':[old[k] for k in sorted(old.keys()-new.keys())],
            'shared_count':len(old.keys()&new.keys()),'net_change':len(new)-len(old)}
