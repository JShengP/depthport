#!/usr/bin/env python3
# SPDX-License-Identifier: AGPL-3.0-only
"""Offline default vs activation-only error diagnosis; raw cases stay in work-dir."""
from __future__ import annotations
import argparse
from collections import Counter,defaultdict
import configparser
import hashlib
import json
from pathlib import Path
import statistics
import subprocess
import sys
import zipfile

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT))
from tools.validate_mot_tracking import TRACKEVAL_COMMIT,load_manifest,source_coordinate_scale,canonical_predictions,write_mot_predictions
from depthport.video_tracking_benchmark import read_cache,sha256_file
from depthport.mot_scenarios import read_mot_gt,scenario_events
from depthport.tracking_diagnostics import clear_trace,switch_context,fp_context,case_counts,paired_locations,cache_index

SWITCH_SIGNALS=('low_visibility_context','long_visibility_event_context','crossing_event_context','current_gt_overlap',
                'current_match_ambiguous','recent_other_gt_owner','reference_unmatched_at_switch',
                'gap_has_no_raw_overlap','gap_has_partial_raw_overlap','visible_gap_missing_raw_box','low_visibility_gap_missing_raw_box')
FP_SIGNALS=('overlaps_excluded_annotation','track_has_no_tp','track_matches_multiple_gt')


def read_json(path):
    if path.is_symlink() or not path.is_file() or path.stat().st_size>32*1024*1024:raise ValueError('Regular local JSON <=32 MiB required')
    return json.loads(path.read_text(encoding='utf-8'))


def episodes(cases):
    groups=defaultdict(list)
    for c in cases:groups[(c.get('sequence'),c['tid'],c['category'])].append(c)
    out=[]
    for items in groups.values():
        for c in sorted(items,key=lambda c:c['frame']):
            if not out or out[-1][-1].get('sequence')!=c.get('sequence') or out[-1][-1]['tid']!=c['tid'] or out[-1][-1]['category']!=c['category'] or out[-1][-1]['frame']+1!=c['frame']:
                out.append([])
            out[-1].append(c)
    return out


def comparison_summary(pair,kind):
    result={'shared_location_count':pair['shared_count'],'net_change':pair['net_change']}
    for direction in ('added','removed'):
        cases=pair[direction];result[direction]=case_counts(cases,SWITCH_SIGNALS if kind=='switch' else FP_SIGNALS)
        if kind=='fp':
            e=episodes(cases);lengths=[len(x) for x in e]
            result[direction]['contiguous_track_category_episodes']={'count':len(e),'max_frames':max(lengths,default=0),'median_frames':statistics.median(lengths) if lengths else None}
            if direction=='added':result[direction]['reference_output_status']=dict(sorted(Counter(c['reference_status'] for c in cases).items()))
    return result


def main(argv=None):
    p=argparse.ArgumentParser(description=__doc__)
    for name in ('manifest','validation-record','runs-dir','trackeval-root','work-dir','output'):p.add_argument('--'+name,type=Path,required=True)
    a=p.parse_args(argv)
    if a.output.is_symlink() or a.work_dir.is_symlink():p.error('Symlink output/work directory refused')
    manifest=load_manifest(a.manifest);prior=read_json(a.validation_record)
    if prior.get('format')!='depthport.mot17-parameter-acceptance.v1':p.error('Parameter acceptance record required')
    root=a.trackeval_root.resolve()
    if subprocess.check_output(['git','-C',str(root),'rev-parse','HEAD'],text=True).strip()!=TRACKEVAL_COMMIT or subprocess.run(['git','-C',str(root),'diff','--quiet','HEAD']).returncode:
        p.error('Clean pinned TrackEval required')
    import numpy as np
    for name,value in [('int',int),('float',float),('bool',bool)]:
        if name not in np.__dict__:setattr(np,name,value)
    sys.path.insert(0,str(root));import trackeval
    official=trackeval.metrics.CLEAR({'PRINT_CONFIG':False})
    archive=Path(manifest['labels_archive'])
    if sha256_file(archive)!=manifest['labels_archive_sha256']:p.error('Official labels hash mismatch')
    report={'format':'depthport.activation-error-diagnosis.v1','checked_on':manifest['checked_on'],
        'source_terms':prior['source_terms'],'input_validation_sha256':sha256_file(a.validation_record),
        'evaluator_commit':TRACKEVAL_COMMIT,'comparison':'default vs activation_only; split .60 and 1s buffer unchanged',
        'methods':{},'sequences':[],'limitations':['Observational contexts can co-occur; they do not establish causal blame.',
        'Added/removed IDSW locations use (frame, GT); shared locations may have different transitions. Raw IDs are never compared across runs.',
        'FP locations use immutable (frame, cache detection index), after official preprocessing. Metric FP is not proof of a nonexistent person.',
        'Per-GT raw detection support is a geometric upper bound, not one-to-one matching or proof a backend could associate it.',
        'Existing compressed training clips; no new accuracy experiment, tuning, default change, ReID or held-out claim.'],
        'public_scope':'Aggregate counts/hashes only. Raw cases, GT, images, event windows, per-frame boxes/IDs and paths remain local.'}
    combined={b:{'switch':{'added':[],'removed':[],'shared_count':0,'net_change':0},'fp':{'added':[],'removed':[],'shared_count':0,'net_change':0}} for b in ('bytetrack','botsort')}
    samples=[];totals={b:{profile:Counter() for profile in ('default','activation_only')} for b in combined}
    for seq in manifest['sequences']:
        name=seq['name'];cache=read_cache(Path(seq['detections']));n=len(cache['frames']);gt=Path(seq['gt']);ini=Path(seq['seqinfo'])
        recorded=next(s for s in prior['sequences'] if s['name']==name)
        if sha256_file(Path(seq['detections']))!=recorded['detection_cache_sha256'] or sha256_file(gt)!=recorded['gt_sha256'] or sha256_file(Path(seq['video']))!=recorded['video_sha256']:
            raise ValueError('Input differs from recorded parameter experiment')
        cfg=configparser.ConfigParser();cfg.read(ini);scale=source_coordinate_scale(cache,cfg['Sequence'])
        with zipfile.ZipFile(archive) as z:
            if z.read('train/'+name+'/gt/gt.txt')!=gt.read_bytes() or z.read('train/'+name+'/seqinfo.ini')!=ini.read_bytes():raise ValueError('GT/metadata archive mismatch')
        rows=read_mot_gt(gt,n);ids=sorted({r['id'] for r in rows});events=scenario_events(rows,cache['fps'])
        methods=[b+'__'+profile for b in combined for profile in ('default','activation_only')]
        data={};raw={};traces={};fps={};switches={};emitted={};raw_emitted={};native_ids={};local=a.work_dir/name;local.mkdir(parents=True,exist_ok=True)
        for method in methods:
            pred=read_json(a.runs_dir/name/(method+'-predictions.local.json'))
            if hashlib.sha256(canonical_predictions(pred).encode()).hexdigest()!=recorded['methods'][method]['canonical_predictions_sha256']:raise ValueError('Saved prediction hash mismatch')
            raw_emitted[method]=set();native_ids[method]={}
            for frame in pred['frames']:
                for obj in frame['objects']:
                    x,y,xx,yy=obj['bbox'];box=[x*scale+1,y*scale+1,(xx-x)*scale,(yy-y)*scale]
                    key=(frame['index'],cache_index(box,obj['confidence'],cache['frames'][frame['index']-1]['detections'],scale))
                    raw_emitted[method].add(key);native_ids[method][key]=obj['object_id']
            mot=local/(method+'.txt');write_mot_predictions(pred,mot,scale)
            if mot.read_bytes()!=(a.runs_dir/'mot-trackers'/method/'data'/(name+'.txt')).read_bytes():raise ValueError('MOT file differs from validated predictions')
        dataset=trackeval.datasets.MotChallenge2DBox({'GT_FOLDER':str(a.runs_dir/'mot-gt'),'TRACKERS_FOLDER':str(a.runs_dir/'mot-trackers'),
            'SKIP_SPLIT_FOL':True,'BENCHMARK':'MOT17','SPLIT_TO_EVAL':'train','SEQ_INFO':{name:n},'TRACKERS_TO_EVAL':methods,'PRINT_CONFIG':False})
        if sha256_file(a.runs_dir/'mot-gt'/name/'gt/gt.txt')!=seq['gt_sha256']:raise ValueError('Evaluator GT differs from verified input')
        for method in methods:
            raw[method]=dataset.get_raw_seq_data(method,name);d=dataset.get_preprocessed_seq_data(raw[method],'pedestrian');data[method]=d
            if d['num_gt_ids']!=len(ids) or d['num_gt_dets']!=len(rows):raise ValueError('GT ID map mismatch')
            trace=clear_trace(d);expected=official.eval_sequence(d)
            if any(trace['summary'][k]!=expected[k] or expected[k]!=recorded['methods'][method]['metrics'][k] for k in trace['summary']):raise ValueError('Diagnostic trace differs from official/recorded CLEAR counts')
            traces[method]=trace;owners=defaultdict(set)
            for frame in trace['matches']:
                for g,m in frame.items():owners[m['tid']].add(g)
            fps[method]=[fp_context(c,d,raw[method],cache,scale) for c in trace['false_positives']]
            for c in fps[method]:c.update(track_has_no_tp=not owners[c['tid']],track_matches_multiple_gt=len(owners[c['tid']])>1)
            switches[method]=[switch_context(c,d,ids,rows,events,cache,scale) for c in trace['switches']]
            emitted[method]={(f+1,cache_index(box,score,cache['frames'][f]['detections'],scale)) for f,(boxes,scores) in enumerate(zip(d['tracker_dets'],d['tracker_confidences'])) for box,score in zip(boxes,scores)}
            id_map={int(tid):native_ids[method][(f+1,cache_index(box,score,cache['frames'][f]['detections'],scale))]
                for f,(tids,boxes,scores) in enumerate(zip(d['tracker_ids'],d['tracker_dets'],d['tracker_confidences'])) for tid,box,score in zip(tids,boxes,scores)}
            (local/(method+'-id-map.local.json')).write_text(json.dumps(id_map),encoding='utf-8')
        seq_result={'name':name,'frames':n,'methods':{},'source_hashes':{k:recorded[k] for k in ('video_sha256','gt_sha256','detection_cache_sha256')}}
        for backend in combined:
            default=backend+'__default';candidate=backend+'__activation_only'
            for method in (default,candidate):
                other=traces[default]['matches']
                for c in switches[method]:c['reference_unmatched_at_switch']=c['gt'] not in other[c['frame']-1]
            pair_sw=paired_locations(switches[default],switches[candidate],lambda c:(c['frame'],c['gt']))
            pair_fp=paired_locations(fps[default],fps[candidate],lambda c:(c['frame'],c['cache_index']))
            for c in pair_fp['added']:
                key=(c['frame'],c['cache_index'])
                c['reference_status']='reference_tp' if key in emitted[default] else 'reference_preprocessed_out' if key in raw_emitted[default] else 'not_emitted_by_reference'
            pairs={'switch':pair_sw,'fp':pair_fp}
            seq_result['methods'][backend]={'official_counts':{profile:traces[backend+'__'+profile]['summary'] for profile in ('default','activation_only')},**{kind:comparison_summary(pair,kind) for kind,pair in pairs.items()}}
            for profile in ('default','activation_only'):totals[backend][profile].update(traces[backend+'__'+profile]['summary'])
            for kind,pair in pairs.items():
                (local/(backend+'-'+kind+'-cases.local.json')).write_text(json.dumps(pair,indent=2),encoding='utf-8')
                c=combined[backend][kind]
                for direction in ('added','removed'):c[direction].extend({**x,'sequence':name} for x in pair[direction])
                c['shared_count']+=pair['shared_count'];c['net_change']+=pair['net_change']
        report['sequences'].append(seq_result)
        print(name+': exact official CLEAR reconciliation passed for four stored runs.',flush=True)
    for backend,groups in combined.items():
        report['methods'][backend]={'official_counts':{p:dict(c) for p,c in totals[backend].items()},**{k:comparison_summary(v,k) for k,v in groups.items()}}
        for kind,pair in groups.items():
            choices=episodes(pair['added']) if kind=='fp' else [[c] for c in pair['added']]
            categories=sorted({x[0]['category'] for x in choices})
            for category in categories:
                eligible=[x for x in choices if x[0]['category']==category]
                chosen=sorted(eligible,key=lambda x:(-len(x),-x[0].get('gap_frames',0),x[0]['sequence'],x[0]['frame'],x[0]['tid']))[0]
                case=chosen[len(chosen)//2];samples.append({'backend':backend,'kind':kind,'case':case,'episode_frames':len(chosen)})
    a.work_dir.mkdir(parents=True,exist_ok=True)
    (a.work_dir/'audit-selection.local.json').write_text(json.dumps(samples,indent=2),encoding='utf-8')
    report['audit_selection']={'policy':'One added case per backend/kind/category; longest FP episode or largest IDSW match gap; stable sequence/frame/ID ties. No image/semantic judgment in automatic category.',
        'selected_cases':len(samples),'status':'Local visual audit not performed by this tool'}
    a.output.parent.mkdir(parents=True,exist_ok=True);a.output.write_text(json.dumps(report,indent=2,allow_nan=False)+'\n',encoding='utf-8')
    print('Aggregate diagnosis written; raw cases and selected event locations remain local.',flush=True)
    return 0


if __name__=='__main__':raise SystemExit(main())
