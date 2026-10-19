#!/usr/bin/env python3
# SPDX-License-Identifier: AGPL-3.0-only
"""Offline MOT17 fixed-detection acceptance; only aggregate results are public.

Download licensed inputs separately. Raw GT, events, predictions and evaluator
files go to --work-dir and must stay local. This tool never downloads or uploads.
"""
from __future__ import annotations

import argparse
import configparser
import hashlib
import importlib.metadata
import json
from pathlib import Path
import re
import shutil
import statistics
import subprocess
import sys
import zipfile

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT))
from depthport.video_tracking_benchmark import read_cache,run_video_tracker,sha256_file
from depthport.mot_scenarios import read_mot_gt,scenario_events,score_events

TRACKEVAL_COMMIT='12c8791b303e0a0b50f753af204249e622d0281a'
METHODS=('baseline','bytetrack','botsort')
DETECTOR_KEYS=('model','weight_sha256','confidence','imgsz','source','device','classes','max_det','nms_iou','ultralytics')


def load_manifest(path):
    if path.is_symlink() or not path.is_file() or path.stat().st_size>1024*1024:
        raise ValueError('Manifest must be a local regular file <=1 MiB')
    manifest=json.loads(path.read_text())
    seqs=manifest['sequences']
    if not isinstance(seqs,list) or not 1<=len(seqs)<=8:
        raise ValueError('Select 1..8 unique MOT17 training sequences')
    names=set()
    for seq in seqs:
        scene=seq['name'].rsplit('-',1)[0]
        if not re.fullmatch(r'MOT17-\d{2}-(DPM|FRCNN|SDP)',seq['name']) or scene in names:
            raise ValueError('Invalid/duplicate MOT17 sequence name')
        names.add(scene)
        if type(seq['camera_motion']) is not bool:
            raise ValueError('Explicit camera-motion source annotation required')
        expected_url='https://motchallenge.net/sequenceVideos/'+seq['name']+'-raw.mp4'
        if seq['video_url']!=expected_url:
            raise ValueError('Use the official compressed sequence URL')
    return manifest


def canonical_predictions(pred):
    ids={};out=[]
    for f in pred['frames']:
        objects=[]
        for o in f['objects']:
            tid=ids.setdefault(o['object_id'],len(ids)+1)
            objects.append([tid,o['class_id'],o['confidence'],*o['bbox']])
        out.append([f['index'],objects])
    return json.dumps(out,separators=(',',':'),allow_nan=False)


def source_coordinate_scale(cache,meta):
    source_w,source_h=int(meta['imWidth']),int(meta['imHeight'])
    w,h=cache['width'],cache['height']
    scale=source_w/w
    if not 1<=scale<=4 or scale!=source_h/h or scale!=int(scale):
        raise ValueError('Only exact uniform 1x..4x source-to-video scaling is supported')
    return scale


def write_mot_predictions(pred,path,scale=1):
    path.parent.mkdir(parents=True,exist_ok=True);ids={};lines=[]
    for f in pred['frames']:
        for o in f['objects']:
            if o['class_id']!=0:
                raise ValueError('MOT pedestrian acceptance requires class-0-only detection cache')
            tid=ids.setdefault(o['object_id'],len(ids)+1);x,y,xx,yy=o['bbox']
            lines.append(f'{f["index"]},{tid},{x*scale+1:.9f},{y*scale+1:.9f},{(xx-x)*scale:.9f},{(yy-y)*scale:.9f},{o["confidence"]:.9f},-1,-1,-1')
    path.write_text('\n'.join(lines)+'\n')


def frame_matches(data,original_ids):
    from scipy.optimize import linear_sum_assignment
    matches={}
    for t,(gtids,trids,scores) in enumerate(zip(data['gt_ids'],data['tracker_ids'],data['similarity_scores']),1):
        keep=scores.copy();keep[keep<.5]=0
        a,b=linear_sum_assignment(-keep)
        matches[t]={original_ids[int(gtids[i])]:int(trids[j]) for i,j in zip(a,b) if keep[i,j]>0}
    return matches


def metric_summary(results):
    clear=results['CLEAR'];ident=results['Identity'];hota=results['HOTA']
    return {**{k:int(clear[k]) for k in ('CLR_TP','CLR_FP','CLR_FN','IDSW','Frag')},
            **{k:float(clear[k]) for k in ('CLR_Re','CLR_Pr','MOTA')},
            'IDF1':float(ident['IDF1']),'HOTA':float(hota['HOTA'].mean())}


def combine_scenario_scores(sequences):
    """Sum disjoint-sequence counts; never average rates with unequal cohorts."""
    result={}
    for method in METHODS:
        result[method]={}
        for scenario in ('long_low_visibility','overlap_order_exchange'):
            records=[s['methods'][method]['scenarios'][scenario] for s in sequences]
            fields=('events','subjects','matched_at_both_anchors','same_id','changed_id','missing_before',
                    'missing_after','event_gt_observations','event_matched_observations','duration_seconds_total')
            c={key:sum(r[key] for r in records) for key in fields}
            both=c['matched_at_both_anchors'];obs=c['event_gt_observations'];subjects=c['subjects']
            c['same_id_rate_among_both_matched']=c['same_id']/both if both else None
            c['same_id_subject_coverage']=c['same_id']/subjects if subjects else None
            c['event_instance_recall']=c['event_matched_observations']/obs if obs else None
            result[method][scenario]=c
    return result


def main(argv=None):
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--manifest',type=Path,required=True)
    p.add_argument('--trackeval-root',type=Path,required=True)
    p.add_argument('--work-dir',type=Path,required=True)
    p.add_argument('--output',type=Path,required=True)
    p.add_argument('--repeats',type=int,default=3)
    a=p.parse_args(argv)
    if not 1<=a.repeats<=5 or a.output.is_symlink() or a.work_dir.is_symlink():
        p.error('Invalid repeats or symlink output/work directory')
    manifest=load_manifest(a.manifest)
    evaluator=a.trackeval_root.resolve()
    commit=subprocess.check_output(['git','-C',str(evaluator),'rev-parse','HEAD'],text=True).strip()
    if commit!=TRACKEVAL_COMMIT or subprocess.run(['git','-C',str(evaluator),'diff','--quiet','HEAD']).returncode:
        p.error('A clean pinned TrackEval checkout is required')
    import numpy as np
    import cv2
    cv2.setNumThreads(1)
    aliases=[]
    for name,value in [('int',int),('float',float),('bool',bool)]:
        if name not in np.__dict__:setattr(np,name,value);aliases.append(name)
    sys.path.insert(0,str(evaluator))
    import trackeval
    metrics=[trackeval.metrics.CLEAR({'PRINT_CONFIG':False}),trackeval.metrics.Identity({'PRINT_CONFIG':False}),trackeval.metrics.HOTA({'PRINT_CONFIG':False})]
    archive=Path(manifest['labels_archive'])
    if archive.is_symlink() or not archive.is_file() or sha256_file(archive)!=manifest['labels_archive_sha256']:
        p.error('Labels archive SHA mismatch')
    report={'format':'depthport.mot17-scenario-acceptance.v1','checked_on':manifest['checked_on'],
            'source_terms':{'dataset':'MOT17 train','page':'https://motchallenge.net/data/MOT17/',
              'license':'CC-BY-NC-SA-3.0; original-source conditions may also apply',
              'license_url':'https://creativecommons.org/licenses/by-nc-sa/3.0/',
              'use':'Local non-commercial research; inputs and per-frame results not redistributed',
              'labels_url':'https://motchallenge.net/data/MOT17Labels.zip','labels_archive_sha256':manifest['labels_archive_sha256']},
            'evaluation':{'repository':'https://github.com/JonathonLuiten/TrackEval','commit':commit,'numpy_aliases':aliases,
              'benchmark':'MOT17 pedestrian with distractor/zero-mark preprocessing, CLEAR IoU .5, Identity and HOTA',
              'coordinates':'uniform integer video-to-original-GT scale verified per sequence, then x/y shifted +1 for one-based MOT output',
              'scenario_diagnostics':'Separate full-frame Hungarian IoU .5 endpoint/instance diagnostics; not official scenario MOT metrics',
              'scenario_rules':{'long_low_visibility':'visibility <=.3 for >=1s, >=.6 visibility anchors within 1s before and after',
                'overlap_order_exchange':'GT box IoU >=.1, overlap index gaps merged <=ceil(.5*fps) frame steps, horizontal center order flips across >=.6 visibility anchors within 1s',
                'endpoints':'last matched pre / first matched post eligible anchor; denominator reports missing endpoints separately'},
              'repeats':a.repeats,'timing':'Three fresh tracker runs by default; rotated method order, first update included, no warmup exclusion. Detector/decode/startup excluded from update latency. Descriptive single-host timing, not real-time acceptance.'},
            'runtime':{n:importlib.metadata.version(n) for n in ['numpy','opencv-python','trackers','supervision','scipy']},
            'sequences':[],'limitations':['Selected compressed training clips, not original benchmark JPEGs or a held-out leaderboard result.',
              'Visibility/order proxies do not establish physical occlusion or true 3D crossing; audit examples separately.',
              'Default tracker parameters except source FPS; no tuning or ReID. Cross-scene comparisons are not a causal CMC ablation.',
              'No real-camera, calibrated 3D, Windows, endurance or end-to-end throughput acceptance.'],
            'public_scope':'Aggregates, source/configuration identifiers and hashes only. Media, GT, event identities/windows, per-frame predictions, weights and paths stay local.'}
    all_scores={m:{} for m in METHODS};moving_scores={m:{} for m in METHODS};frozen=None
    for seq in manifest['sequences']:
        name=seq['name'];video=Path(seq['video']);cache_path=Path(seq['detections']);gt=Path(seq['gt']);ini=Path(seq['seqinfo'])
        cache=read_cache(cache_path);n=len(cache['frames']);fps=cache['fps']
        if cache['video_sha256']!=seq['video_sha256'] or sha256_file(gt)!=seq['gt_sha256']:
            raise ValueError('Source video or GT hash mismatch')
        cfg=configparser.ConfigParser();cfg.read(ini);meta=cfg['Sequence']
        if n!=int(meta['seqLength']) or fps!=float(meta['frameRate']):
            raise ValueError('Video/cache differs from official sequence metadata')
        scale=source_coordinate_scale(cache,meta)
        with zipfile.ZipFile(archive) as z:
            if hashlib.sha256(z.read('train/'+name+'/gt/gt.txt')).hexdigest()!=seq['gt_sha256']:
                raise ValueError('GT differs from official archive')
            if z.read('train/'+name+'/seqinfo.ini')!=ini.read_bytes():raise ValueError('Sequence metadata differs from archive')
        detector={k:cache['detector'][k] for k in DETECTOR_KEYS}
        if detector['classes']!=[0] or not re.fullmatch('[a-f0-9]{64}',detector['weight_sha256']):
            raise ValueError('Pinned pedestrian-only detector required')
        if frozen is None:frozen=detector;report['frozen_detector']=detector
        elif detector!=frozen:raise ValueError('All sequences must share detector settings/runtime/weights')
        rows=read_mot_gt(gt,n);events=scenario_events(rows,fps)
        local=a.work_dir/name;local.mkdir(parents=True,exist_ok=True)
        (local/'events.local.json').write_text(json.dumps(events))
        outputs={m:[] for m in METHODS};canonical={};first={}
        for trial in range(a.repeats):
            order=METHODS[trial%3:]+METHODS[:trial%3]
            for method in order:
                cv2.setRNGSeed(0)
                pred,timing=run_video_tracker(video,cache,method)
                identity=canonical_predictions(pred)
                if method in canonical and identity!=canonical[method]:raise ValueError('Repeated run changed canonical IDs/boxes')
                canonical[method]=identity;outputs[method].append(timing)
                if trial==0:
                    first[method]=pred
                    (local/(method+'-predictions.local.json')).write_text(json.dumps(pred))
                print(f'{name} {method} trial {trial+1}/{a.repeats}: P50 {timing["tracker_update"]["p50_ms"]:.3f}ms',flush=True)
        gt_dest=a.work_dir/'mot-gt'/name/'gt/gt.txt';gt_dest.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(gt,gt_dest)
        for method in METHODS:write_mot_predictions(first[method],a.work_dir/'mot-trackers'/method/'data'/(name+'.txt'),scale)
        dataset=trackeval.datasets.MotChallenge2DBox({'GT_FOLDER':str(a.work_dir/'mot-gt'),'TRACKERS_FOLDER':str(a.work_dir/'mot-trackers'),
          'SKIP_SPLIT_FOL':True,'BENCHMARK':'MOT17','SPLIT_TO_EVAL':'train','SEQ_INFO':{name:n},'TRACKERS_TO_EVAL':list(METHODS),'PRINT_CONFIG':False})
        result={'name':name,'frames':n,'fps':fps,'resolution':[cache['width'],cache['height']],
                'original_gt_resolution':[int(meta['imWidth']),int(meta['imHeight'])],'video_to_gt_scale':scale,
                'camera_motion':seq['camera_motion'],'source_description':seq['description'],'video_url':seq['video_url'],
                'video_sha256':cache['video_sha256'],'gt_sha256':seq['gt_sha256'],'detection_cache_sha256':sha256_file(cache_path),
                'frames_at_detection_cap':cache['detector']['frames_at_detection_cap'],
                'cached_detections':sum(len(f['detections']) for f in cache['frames']),
                'gt_pedestrian_observations':len(rows),'scenario_event_counts':{k:len(v) for k,v in events.items()},'methods':{}}
        ids=sorted({r['id'] for r in rows})
        for method in METHODS:
            raw=dataset.get_raw_seq_data(method,name);data=dataset.get_preprocessed_seq_data(raw,'pedestrian')
            if data['num_gt_ids']!=len(ids) or data['num_gt_dets']!=len(rows):raise ValueError('GT mapping differs from TrackEval preprocessing')
            scores={m.get_name():m.eval_sequence(data) for m in metrics};all_scores[method][name]=scores
            if seq['camera_motion']:moving_scores[method][name]=scores
            matches=frame_matches(data,ids)
            (local/(method+'-matches.local.json')).write_text(json.dumps(matches))
            result['methods'][method]={'metrics':metric_summary(scores),
              'retained_observations_before_mot_preprocessing':sum(len(f['objects']) for f in first[method]['frames']),
              'scenarios':{key:score_events(value,matches,rows,fps) for key,value in events.items()},
              'update_timing_trials':[t['tracker_update'] for t in outputs[method]],
              'median_trial_p50_ms':statistics.median(t['tracker_update']['p50_ms'] for t in outputs[method]),
              'median_trial_p95_ms':statistics.median(t['tracker_update']['p95_ms'] for t in outputs[method]),
              'repeated_canonical_predictions_equal':True,
              'canonical_predictions_sha256':hashlib.sha256(canonical[method].encode()).hexdigest()}
        report['sequences'].append(result)
    report['combined']={}
    for group,source in [('all_sequences',all_scores),('moving_camera_sequences',moving_scores)]:
        report['combined'][group]={}
        for method in METHODS:
            if source[method]:
                combined={m.get_name():m.combine_sequences({name:s[m.get_name()] for name,s in source[method].items()}) for m in metrics}
                report['combined'][group][method]=metric_summary(combined)
    report['combined_scenarios']=combine_scenario_scores(report['sequences'])
    a.output.parent.mkdir(parents=True,exist_ok=True);a.output.write_text(json.dumps(report,ensure_ascii=False,indent=2,allow_nan=False)+'\n')
    print('Aggregate acceptance report written; raw evaluation files remain in local work directory.',flush=True)
    return 0


if __name__=='__main__':raise SystemExit(main())
