#!/usr/bin/env python3
# SPDX-License-Identifier: AGPL-3.0-only
"""Observe promotion/recovery association locally; publish aggregate counts only.

No download, tuning, GT-fed tracking or application/worker integration.
Full cost matrices, row IDs and diagnostic events stay in --work-dir.
"""
from __future__ import annotations
import argparse
from collections import Counter, defaultdict
import configparser
import hashlib
import importlib.metadata
import json
from pathlib import Path
import shutil
import subprocess
import sys
import zipfile

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from depthport.video_tracking_benchmark import make_tracker,read_cache,sha256_file,_one_step
from depthport.tracking_eval import PRED_FORMAT
from depthport.tracking_admission import admission_configurations
from depthport.tracking_association_probe import AssociationProbe,edge_competition
from depthport.tracking_diagnostics import clear_trace,cache_index,box_ious
from depthport.mot_scenarios import read_mot_gt
from tools.validate_mot_tracking import (load_manifest,canonical_predictions,
    write_mot_predictions,source_coordinate_scale,TRACKEVAL_COMMIT,metric_summary)

PROFILES = ('activation_control', 'confirm3')
METHODS = tuple(b+'__'+p for b in ('bytetrack','botsort') for p in PROFILES)


def read_json(path):
    if path.is_symlink() or not path.is_file() or path.stat().st_size > 32*1024*1024:
        raise ValueError('Regular local JSON <=32 MiB required')
    return json.loads(path.read_text(encoding='utf-8'))


def probed_run(video, cache, backend, parameters, trace_path=None):
    import cv2
    if video.is_symlink() or not video.is_file() or sha256_file(video) != cache['video_sha256']:
        raise ValueError('Video differs from immutable detector input')
    tracker = make_tracker(backend, fps=cache['fps'], parameters=parameters)
    cap = cv2.VideoCapture(str(video)); frames=[]; digest=hashlib.sha256()
    file = trace_path.open('w', encoding='utf-8') if trace_path else None
    try:
        if not cap.isOpened():
            raise ValueError('Cannot decode local sequence')
        with AssociationProbe(tracker,backend) as probe:
            for item in cache['frames']:
                ok,frame=cap.read()
                if not ok or frame.shape[:2] != (cache['height'],cache['width']):
                    raise ValueError('Video/cache frame cardinality or resolution mismatch')
                objects,_,_,_= _one_step(backend,tracker,{},1,item['detections'],frame,item['index'])
                assert probe.last['frame'] == item['index']
                frames.append({'index':item['index'],'objects':objects})
                line=json.dumps(probe.last,sort_keys=True,separators=(',',':'),allow_nan=False)+'\n'
                digest.update(line.encode())
                if file:
                    file.write(line)
            if cap.read()[0]:
                raise ValueError('Cache does not cover entire video')
    finally:
        cap.release()
        if file:
            file.close()
    pred={'format':PRED_FORMAT,'session_id':'video-'+cache['video_sha256'][:24],
          'sampling':'dense_video','tracker':backend,
          'source':'offline_video_fixed_detection_cache','frames':frames}
    return pred,digest.hexdigest()


def analyse_trace(trace_path, pred, data, rows, cache, scale, expected_counts):
    """GT joins happen only AFTER tracking; no case identifiers escape this function."""
    official_trace=clear_trace(data)
    if any(official_trace['summary'][k]!=expected_counts[k] for k in official_trace['summary']):
        raise ValueError('Trace differs from official CLEAR')
    original_gt_ids=sorted({r['id'] for r in rows})
    if data['num_gt_ids']!=len(original_gt_ids) or data['num_gt_dets']!=len(rows):
        raise ValueError('Official GT mapping/cardinality differs from diagnostic rows')
    gt_rows={(r['frame'],r['id']):r for r in rows}
    native={};status={};current_matches=[]
    for f in pred['frames']:
        for obj in f['objects']:
            x,y,xx,yy=obj['bbox']
            index=cache_index([x*scale+1,y*scale+1,(xx-x)*scale,(yy-y)*scale],
                              obj['confidence'],cache['frames'][f['index']-1]['detections'],scale)
            key=(f['index'],index)
            if key in native:
                raise ValueError('Duplicate emitted detection')
            native[key]=int(obj['object_id'].rsplit('-',1)[1]);status[key]=('excluded',None)
    for f,(boxes,scores) in enumerate(zip(data['tracker_dets'],data['tracker_confidences']),1):
        for box,score in zip(boxes,scores):
            index=cache_index(box,score,cache['frames'][f-1]['detections'],scale)
            status[(f,index)]=('fp',None)
        matches={}
        for gt,match in official_trace['matches'][f-1].items():
            col=match['col'];index=cache_index(boxes[col],scores[col],cache['frames'][f-1]['detections'],scale)
            status[(f,index)]=('tp',gt);matches[native[(f,index)]]=gt
        current_matches.append(matches)
    counts=Counter();stages=defaultdict(Counter);samples=defaultdict(list);history={};raw=[]
    with trace_path.open(encoding='utf-8') as file:
        for line in file:
            frame=json.loads(line);f=frame['frame'];dets=cache['frames'][f-1]['detections']
            for stage in frame['stages']:
                summary=stages[stage['name']];sim=stage['similarity'];gate=stage['gate']
                summary['calls']+=1;summary['chosen_pairs']+=len(stage['matched'])
                summary['admissible_edges']+=sum(s>=gate for row in sim for s in row)
                summary['competing_columns']+=sum(sum(row[c]>=gate for row in sim)>1
                    for c in range(len(stage['detection_indices'])))
                residual=[(r,c) for r in stage['unmatched_rows'] for c in stage['unmatched_columns'] if sim[r][c]>=gate]
                summary['residual_valid_edges_after_assignment_filter']+=len(residual)
                summary['residual_valid_rows_after_assignment_filter']+=len({r for r,c in residual})
            first=frame['stages'][0] if frame['stages'] else None
            # A confirmed retained hypothesis with >=1 fully missed prior frame.
            if first:
                for row,t in enumerate(first['tracks']):
                    if t['tracker_id'] < 0 or t['age_since_update'] < 2:
                        continue
                    counts['recovery_opportunities']+=1
                    gt=history.get(t['tracker_id'])
                    if gt is None:
                        counts['opportunity_no_previous_official_tp']+=1;continue
                    target=gt_rows.get((f,original_gt_ids[gt]))
                    if target is None:
                        counts['opportunity_gt_not_annotated']+=1;continue
                    counts['opportunity_current_low_visibility']+=int(target['visibility']<=.3)
                    xywh=[[d['bbox'][0]*scale+1,d['bbox'][1]*scale+1,
                            (d['bbox'][2]-d['bbox'][0])*scale,(d['bbox'][3]-d['bbox'][1])*scale] for d in dets]
                    supports=[i for i,v in enumerate(box_ious(target['bbox'],xywh)) if v>=.5]
                    strong=[i for i in supports if dets[i]['confidence']>=.6]
                    if not supports:
                        reason='no_raw_geometric_support'
                    elif not strong:
                        reason='weak_only_geometric_support'
                    else:
                        cols=[first['detection_indices'].index(i) for i in strong]
                        eligible=[c for c in cols if first['similarity'][row][c]>=first['gate']]
                        if not eligible:
                            reason='strong_support_below_high_stage_gate'
                        elif any(r==row and c in eligible for r,c in first['matched']):
                            reason='strong_support_selected_for_hypothesis'
                        else:
                            reason='strong_support_admissible_not_selected'
                    counts['opportunity_'+reason]+=1
                    if reason=='weak_only_geometric_support' and pred['tracker']=='botsort':
                        counts['opportunity_weak_only_lost_excluded_from_weak_stage']+=1
                    raw.append({'frame':f,'kind':'recovery_opportunity','token':t['token'],
                                'prior_gt':gt,'reason':reason,'low_visibility':target['visibility']<=.3})
            for event in frame['events']:
                kind=event['kind'];counts[kind+'_total']+=1
                if kind=='instant_first_frame':
                    continue
                stage=frame['stages'][event['stage']]
                competition=edge_competition(stage,event['row'],event['column'])
                outcome,gt=status.get((f,event['detection_index']),('not_emitted',None))
                if kind=='recovery' and outcome=='tp':
                    prior=history.get(event['tracker_id'])
                    outcome=('tp_no_previous_identity' if prior is None else
                             'tp_same_previous_gt' if gt==prior else 'tp_different_previous_gt')
                counts[kind+'_'+outcome]+=1
                counts[kind+'_ambiguous_'+outcome]+=int(competition['ambiguous'])
                counts[kind+'_column_competition_'+outcome]+=int(competition['admissible_column_alternatives']>0)
                samples[kind+'_'+outcome+'_selected_cost'].append(competition['selected_cost'])
                if kind=='recovery':
                    samples['recovery_'+outcome+'_missed_frames'].append(event['missed_frames_before_match'])
                    if gt is not None:
                        target=gt_rows.get((f,original_gt_ids[gt]))
                        counts['recovery_current_low_visibility_'+outcome]+=int(target is not None and target['visibility']<=.3)
                if competition['best_alternative_margin'] is not None:
                    samples[kind+'_'+outcome+'_alternative_margin'].append(competition['best_alternative_margin'])
                if kind=='promotion' and event['stage']>0 and first:
                    index=event['detection_index']
                    if index in first['detection_indices']:
                        c=first['detection_indices'].index(index)
                        existing=[r for r,t in enumerate(first['tracks']) if t['tracker_id']>=0 and first['similarity'][r][c]>=first['gate']]
                        counts['promotion_prior_high_stage_existing_admissible_'+outcome]+=int(bool(existing))
                raw.append({'frame':f,**event,'outcome':outcome,'current_gt':gt,'competition':competition})
            # Last known official TP, available only in the post-hoc GT join.
            history.update(current_matches[f-1])
    return {'counts':counts,'stages':stages,'samples':samples},raw


def public_summary(groups):
    import numpy as np
    counts=Counter();stages=defaultdict(Counter);samples=defaultdict(list)
    for g in groups:
        counts.update(g['counts'])
        for name,v in g['stages'].items():stages[name].update(v)
        for name,v in g['samples'].items():samples[name].extend(v)
    return {'counts':dict(sorted(counts.items())),
        'stages':{k:dict(sorted(v.items())) for k,v in sorted(stages.items())},
        'distributions':{k:{'n':len(v),'min':min(v),'p50':float(np.percentile(v,50)),
                           'p95':float(np.percentile(v,95)),'max':max(v)} for k,v in sorted(samples.items()) if v}}


def main(argv=None):
    p=argparse.ArgumentParser(description=__doc__)
    for name in ('manifest','admission-record','trackeval-root','work-dir','output'):
        p.add_argument('--'+name,type=Path,required=True)
    p.add_argument('--repeats',type=int,default=2)
    a=p.parse_args(argv)
    if not 2<=a.repeats<=3 or a.work_dir.is_symlink() or a.output.is_symlink():
        p.error('Need 2..3 repeats and non-symlink destinations')
    manifest=load_manifest(a.manifest);reference=read_json(a.admission_record)
    if reference.get('format')!='depthport.mot17-admission-acceptance.v1':p.error('Admission reference record required')
    evaluator=a.trackeval_root.resolve()
    if subprocess.check_output(['git','-C',str(evaluator),'rev-parse','HEAD'],text=True).strip()!=TRACKEVAL_COMMIT or subprocess.run(['git','-C',str(evaluator),'diff','--quiet','HEAD']).returncode:
        p.error('Clean pinned TrackEval required')
    import cv2,numpy as np
    cv2.setNumThreads(1)
    for name,value in [('int',int),('float',float),('bool',bool)]:
        if name not in np.__dict__:setattr(np,name,value)
    sys.path.insert(0,str(evaluator));import trackeval
    metric_objects=[trackeval.metrics.CLEAR({'PRINT_CONFIG':False}),trackeval.metrics.Identity({'PRINT_CONFIG':False}),trackeval.metrics.HOTA({'PRINT_CONFIG':False})]
    configs=admission_configurations();all_groups=defaultdict(list)
    report={'format':'depthport.association-diagnosis.v1','checked_on':manifest['checked_on'],
        'reference_record_sha256':sha256_file(a.admission_record),'source_terms':reference['source_terms'],
        'runtime':{n:importlib.metadata.version(n) for n in ['numpy','opencv-python','trackers','supervision','scipy']},
        'repeats':a.repeats,'sequences':[],'methods':{},'evaluator_commit':TRACKEVAL_COMMIT,
        'definitions':{'cost':'1 - actual similarity supplied to upstream assignment; BoT-SORT high/unconfirmed similarity is score-fused, weak stage is not. Not Mahalanobis, appearance, probability or a common cross-stage calibrated cost.',
            'ambiguity':'Chosen edge margin <=.05 to best other admissible edge in its row/column; can be negative. Alternatives can be assigned elsewhere.',
            'promotion':'Matched tentative hypothesis acquires a confirmed ID; instant first-frame births reported separately.',
            'recovery':'Confirmed retained hypothesis matched after >=1 fully missed frame; not proof of physical occlusion.',
            'opportunity':'Each frame/hypothesis with confirmed ID and >=1 prior miss at first-stage entry; correlated repeated opportunities, not unique people.',
            'support':'Current cache detection IoU >=.5 with last-known official-TP GT box; strong >=.6. Geometric support, not feasible one-to-one association or a causal detector diagnosis.'},
        'limitations':['Previously studied MOT17 training previews, not independent acceptance or a held-out test.',
            'GT is joined after tracking only; last official TP may itself follow an earlier identity error.',
            'No intervention, threshold search, ReID, worker IPC timing, camera/3D/Windows/endurance acceptance.'],
        'public_scope':'Reviewed aggregate counts/distributions and source hashes only. Matrices, cases, frames, IDs, exact events and local paths remain local.'}
    archive=Path(manifest['labels_archive'])
    if sha256_file(archive)!=manifest['labels_archive_sha256']:raise ValueError('Labels hash mismatch')
    a.work_dir.mkdir(parents=True,exist_ok=True)
    for seq in manifest['sequences']:
        name=seq['name'];recorded=next(s for s in reference['sequences'] if s['name']==name)
        cache=read_cache(Path(seq['detections']));n=len(cache['frames'])
        for field,path in [('video_sha256',seq['video']),('gt_sha256',seq['gt']),('detection_cache_sha256',seq['detections'])]:
            if sha256_file(Path(path))!=recorded[field]:raise ValueError('Input differs from reference')
        ini=Path(seq['seqinfo']);cfg=configparser.ConfigParser();cfg.read(ini);meta=cfg['Sequence'];scale=source_coordinate_scale(cache,meta)
        if n!=int(meta['seqLength']) or cache['fps']!=float(meta['frameRate']):raise ValueError('Metadata mismatch')
        with zipfile.ZipFile(archive) as z:
            if z.read('train/'+name+'/gt/gt.txt')!=Path(seq['gt']).read_bytes() or z.read('train/'+name+'/seqinfo.ini')!=ini.read_bytes():raise ValueError('Official archive mismatch')
        local=a.work_dir/name;local.mkdir(parents=True,exist_ok=True);predictions={};trace_hashes={};canonical={}
        for trial in range(a.repeats):
            order=METHODS[trial:]+METHODS[:trial]
            for method in order:
                cv2.setRNGSeed(0);backend=method.split('__')[0]
                if configs[method]!=recorded['methods'][method]['configuration']:
                    raise ValueError('Requested profile differs from frozen reference')
                pred,h=probed_run(Path(seq['video']),cache,backend,configs[method]['parameters'],local/(method+'-trace.local.jsonl') if trial==0 else None)
                identity=hashlib.sha256(canonical_predictions(pred).encode()).hexdigest()
                if identity!=recorded['methods'][method]['canonical_predictions_sha256']:raise ValueError('Probe changed reference predictions')
                if method in trace_hashes and h!=trace_hashes[method]:raise ValueError('Repeated probe trace changed')
                trace_hashes[method]=h;canonical[method]=identity
                if trial==0:
                    predictions[method]=pred
                    (local/(method+'-predictions.local.json')).write_text(json.dumps(pred))
                print(name+' '+method+' trial '+str(trial+1)+': exact reference and probe trace checks passed',flush=True)
        gt_dest=a.work_dir/'mot-gt'/name/'gt/gt.txt';gt_dest.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(seq['gt'],gt_dest)
        for method,pred in predictions.items():write_mot_predictions(pred,a.work_dir/'mot-trackers'/method/'data'/(name+'.txt'),scale)
        dataset=trackeval.datasets.MotChallenge2DBox({'GT_FOLDER':str(a.work_dir/'mot-gt'),'TRACKERS_FOLDER':str(a.work_dir/'mot-trackers'),
            'SKIP_SPLIT_FOL':True,'BENCHMARK':'MOT17','SPLIT_TO_EVAL':'train','SEQ_INFO':{name:n},'TRACKERS_TO_EVAL':list(METHODS),'PRINT_CONFIG':False})
        rows=read_mot_gt(Path(seq['gt']),n);seq_result={'name':name,'frames':n,'source_hashes':{k:recorded[k] for k in ['video_sha256','gt_sha256','detection_cache_sha256']},'methods':{}}
        for method,pred in predictions.items():
            data=dataset.get_preprocessed_seq_data(dataset.get_raw_seq_data(method,name),'pedestrian')
            scores=metric_summary({m.get_name():m.eval_sequence(data) for m in metric_objects})
            if any(abs(v-recorded['methods'][method]['metrics'][k])>1e-12 for k,v in scores.items()):raise ValueError('Metrics differ from reference')
            group,raw=analyse_trace(local/(method+'-trace.local.jsonl'),pred,data,rows,cache,scale,scores)
            (local/(method+'-events.local.json')).write_text(json.dumps(raw,allow_nan=False))
            all_groups[method].append(group)
            seq_result['methods'][method]={**public_summary([group]),'reference_metrics_reproduced':scores,
                'canonical_predictions_sha256':canonical[method],'local_trace_sha256':trace_hashes[method],
                'repeated_trace_equal':True,'exact_reference_predictions_equal':True}
        report['sequences'].append(seq_result)
    report['methods']={method:public_summary(groups) for method,groups in all_groups.items()}
    a.output.parent.mkdir(parents=True,exist_ok=True)
    a.output.write_text(json.dumps(report,ensure_ascii=False,indent=2,allow_nan=False)+'\n')
    print('Aggregate diagnosis written; full costs and event identities remain local.',flush=True)
    return 0


if __name__=='__main__':raise SystemExit(main())
