# SPDX-License-Identifier: AGPL-3.0-only
"""Synthetic diagnostics contracts; no dataset/model dependencies or accuracy claim."""
import itertools
import numpy as np
import pytest
from depthport.tracking_diagnostics import clear_trace,box_ious,cache_index,paired_locations,fp_context,switch_context
from tools.diagnose_tracking_errors import episodes


def assignment(cost):
    n,m=cost.shape
    if n>m:
        b,a=assignment(cost.T)
        return a,b
    best=min(itertools.permutations(range(m),n),key=lambda cols:sum(cost[i,j] for i,j in enumerate(cols)))
    return np.arange(n),np.array(best,dtype=int)


def data(frames):
    return {'gt_ids':[np.array(g,dtype=int) for g,t,s in frames],
            'tracker_ids':[np.array(t,dtype=int) for g,t,s in frames],
            'similarity_scores':[np.array(s,dtype=float).reshape(len(g),len(t)) for g,t,s in frames]}


def test_clear_continuity_priority_differs_from_independent_iou_matching():
    d=data([([0,1],[10,11],[[.9,.1],[.1,.9]]),([0,1],[10,11],[[.51,.99],[.99,.51]]),([0,1],[12,11],[[.9,.1],[.1,.9]])])
    t=clear_trace(d,assignment)
    assert t['summary']=={'CLR_TP':6,'CLR_FP':0,'CLR_FN':0,'IDSW':1}
    assert t['matches'][1][0]['tid']==10 and t['matches'][1][1]['tid']==11
    assert t['switches'][0]['previous_frame']==2 and t['switches'][0]['frame']==3


def test_clear_empty_frames_preserve_official_continuity_and_history():
    d=data([([0,1],[10,11],[[.9,.1],[.1,.9]]),([0,1],[],[[],[]]),([0,1],[10,11],[[.51,.99],[.99,.51]])])
    assert clear_trace(d,assignment)['summary']=={'CLR_TP':4,'CLR_FP':0,'CLR_FN':2,'IDSW':0}
    d=data([([0],[10],[[.9]]),([],[11],[]),([0],[12],[[.9]])])
    t=clear_trace(d,assignment)
    assert t['summary']=={'CLR_TP':2,'CLR_FP':1,'CLR_FN':0,'IDSW':1}
    assert t['switches'][0]['gap_frames']==1


def test_clear_threshold_and_duplicate_false_positive():
    d=data([([0],[10,11],[[.5,.9]]),([0],[12],[[.499]]),([0],[13],[[.7]])])
    t=clear_trace(d,assignment)
    assert t['summary']=={'CLR_TP':2,'CLR_FP':2,'CLR_FN':1,'IDSW':1}
    assert t['false_positives'][0]['tid']==10
    assert t['switches'][0]['previous_tid']==11


def test_cache_keys_follow_input_boxes_not_cross_run_ids_and_refuse_ambiguity():
    det=[{'bbox':[5.,10.,15.,30.],'confidence':.65}]
    assert cache_index([11.,21.,20.,40.],.65000001,det,2)==0
    with pytest.raises(ValueError):cache_index([11,21,20,40],.65,det*2,2)
    with pytest.raises(ValueError):cache_index([13,21,20,40],.65,det,2)
    assert np.allclose(box_ious([0,0,10,10],[[0,0,10,10],[20,20,10,10]]),[1,0])


def test_added_removed_locations_reconcile_net_change_without_raw_id_comparison():
    a=[{'frame':1,'gt':0,'tid':10},{'frame':2,'gt':0,'tid':11}]
    b=[{'frame':1,'gt':0,'tid':99},{'frame':3,'gt':0,'tid':77},{'frame':4,'gt':1,'tid':88}]
    p=paired_locations(a,b,lambda c:(c['frame'],c['gt']))
    assert p['shared_count']==1 and len(p['added'])==2 and len(p['removed'])==1 and p['net_change']==1
    with pytest.raises(ValueError):paired_locations(a+a,b,lambda c:(c['frame'],c['gt']))


def test_fp_context_separates_competition_from_partial_or_absent_pedestrian_overlap():
    dets=[{'bbox':[0.,0.,10.,20.],'confidence':.65},{'bbox':[5.,0.,15.,20.],'confidence':.8},{'bbox':[50.,0.,60.,20.],'confidence':.9}]
    cache={'frames':[{'detections':dets}]}
    d={'tracker_dets':[np.array([[1,1,10,20],[6,1,10,20],[51,1,10,20]])],
       'tracker_confidences':[np.array([.65,.8,.9])],'gt_dets':[np.array([[1,1,10,20]])]}
    raw={'gt_dets':[np.array([[51,1,10,20]])],'gt_classes':[np.array([7])],'gt_extras':[{'zero_marked':np.array([1])}]}
    got=[fp_context({'frame':1,'tid':i,'col':i},d,raw,cache,1) for i in range(3)]
    assert [c['category'] for c in got]==['duplicate_or_assignment_competition','partial_overlap_below_.50','no_evaluated_pedestrian_overlap']
    assert got[2]['overlaps_excluded_annotation'] and got[0]['confidence_band']=='.60_to_.70'


def test_switch_gap_raw_support_is_not_automatically_occlusion_or_association_blame():
    case={'frame':3,'gt':0,'tid':8,'col':0,'previous_frame':1,'gap_frames':1,'other_previous_owner':None}
    rows=[{'frame':f,'id':10,'bbox':[1,1,10,20],'visibility':.2 if f==2 else 1} for f in [1,2,3]]
    d={'similarity_scores':[np.array([[1.]])]*3,'gt_ids':[np.array([0])]*3,'tracker_confidences':[np.array([.8])]*3}
    events={'long_low_visibility':[],'overlap_order_exchange':[]};cache={'fps':30,'frames':[{'detections':[]} for _ in range(3)]}
    a=switch_context(case,d,[10],rows,events,cache,1)
    assert a['category']=='gap_with_missing_raw_detection' and a['low_visibility_context']
    cache['frames'][1]['detections']=[{'bbox':[0,0,10,20],'confidence':.4}]
    b=switch_context(case,d,[10],rows,events,cache,1)
    assert b['category']=='gap_with_raw_detection_support' and b['gap_frames_with_high_conf_box']==0
    c=switch_context(case,d,[10],[r for r in rows if r['frame']!=2],events,cache,1)
    assert c['category']=='gap_without_gt_observations' and c['gap_gt_absent_frames']==1


def test_fp_episodes_never_join_equal_ids_across_sequences_or_categories():
    cases=[{'sequence':s,'tid':1,'category':c,'frame':f} for s,c,f in [('a','x',1),('a','x',2),('b','x',3),('b','y',4),('b','y',6)]]
    assert sorted(len(e) for e in episodes(cases))==[1,1,1,2]
