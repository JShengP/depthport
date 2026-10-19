#!/usr/bin/env python3
# SPDX-License-Identifier: AGPL-3.0-only
"""Frozen independent competition experiment; raw diagnostics stay local.

Four separate arms, fixed common detector cache, no downloads, tuning or GT-fed
tracking. The equivalent-assignment alternative is never installed as matching.
"""
from __future__ import annotations
import argparse
from collections import Counter
from contextlib import ExitStack
import configparser
import hashlib
import importlib.metadata
import inspect
import json
from pathlib import Path
import shutil
import subprocess
import sys
import zipfile
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT))
from depthport.video_tracking_benchmark import make_tracker,read_cache,sha256_file,_one_step,run_video_tracker
from depthport.tracking_eval import PRED_FORMAT
from depthport.tracking_association_probe import AssociationProbe
from depthport.tracking_recovery_control import PARAMETERS,MARGIN
from depthport.tracking_exclusive_control import ARMS,OBJECTIVE_ATOL,ExclusiveDeferral
from depthport.tracking_admission import admission_error_locations,paired_error_counts
from depthport.mot_scenarios import read_mot_gt,scenario_events,score_events,compare_event_recovery
from tools.validate_mot_tracking import canonical_predictions,write_mot_predictions,source_coordinate_scale,TRACKEVAL_COMMIT,metric_summary,frame_matches
from tools.validate_tracking_recovery import research_screen,run_arm as original_run_arm
from tools.diagnose_tracking_association import analyse_trace,public_summary


def run_arm(video, cache, arm, trace_path=None):
    import cv2
    if video.is_symlink() or sha256_file(video) != cache['video_sha256']:
        raise ValueError('Immutable video mismatch')
    tracker = make_tracker('bytetrack', fps=cache['fps'], parameters=PARAMETERS)
    cap = cv2.VideoCapture(str(video)); frames = []; digest = hashlib.sha256()
    file = trace_path.open('w', encoding='utf-8') if trace_path else None
    try:
        if not cap.isOpened():
            raise ValueError('Cannot decode video')
        with ExitStack() as stack:
            control = stack.enter_context(ExclusiveDeferral(tracker,arm))
            probe = stack.enter_context(AssociationProbe(tracker, 'bytetrack'))
            for item in cache['frames']:
                ok, frame = cap.read()
                if not ok or frame.shape[:2] != (cache['height'], cache['width']):
                    raise ValueError('Dense frame coverage differs')
                objects, _, _, _ = _one_step('bytetrack', tracker, {}, 1,
                    item['detections'], frame, item['index'])
                frames.append({'index': item['index'], 'objects': objects})
                probe.last['deferred'] = control.last
                probe.last['competition_audit'] = control.audit
                line = json.dumps(probe.last, sort_keys=True, separators=(',', ':'), allow_nan=False)+'\n'
                digest.update(line.encode())
                if file:
                    file.write(line)
            if cap.read()[0]:
                raise ValueError('Video truncated by cache')
    finally:
        cap.release()
        if file:
            file.close()
    return {'format': PRED_FORMAT, 'session_id': 'video-'+cache['video_sha256'][:24],
            'sampling': 'dense_video', 'tracker': 'bytetrack',
            'source': 'offline_video_fixed_detection_cache', 'frames': frames}, digest.hexdigest()


def exposure(stages):
    """Fixed-label aggregates only; never output matrices or identifiers."""
    c=Counter()
    for f in stages:
        for edge in f['competition_audit']:
            c['legacy_eligible_edges']+=1
            c['edges_with_available_competitor']+=any(not x['assigned_elsewhere'] for x in edge['competitors'])
            c['edges_with_equivalent_alternative']+=any(x['equivalent'] for x in edge['competitors'])
            c['vetoed_edges']+=edge['veto']
            for x in edge['competitors']:
                c['competitor_alternatives']+=1
                c['assigned_elsewhere']+=x['assigned_elsewhere']
                c['available']+=not x['assigned_elsewhere']
                c['equivalent']+=x['equivalent']
                c['loses_admissible_pair']+=x['admissible_pair_change']<0
    return {k:c[k] for k in ('legacy_eligible_edges','edges_with_available_competitor',
        'edges_with_equivalent_alternative','vetoed_edges','competitor_alternatives',
        'assigned_elsewhere','available','equivalent','loses_admissible_pair')}


def main(argv=None):
    p = argparse.ArgumentParser(description=__doc__)
    for name in ('protocol', 'manifest', 'trackeval-root', 'work-dir', 'output'):
        p.add_argument('--'+name, type=Path, required=True)
    a = p.parse_args(argv)
    from tools.diagnose_tracking_association import read_json
    protocol = read_json(a.protocol); manifest = read_json(a.manifest)
    if protocol['parameters'] != PARAMETERS or protocol['margin'] != MARGIN or protocol['arms'] != list(ARMS) or protocol['objective_atol'] != OBJECTIVE_ATOL:
        p.error('Protocol does not match fixed control implementation')
    for name, digest in protocol['implementation_sha256'].items():
        if sha256_file(ROOT/name) != digest:
            p.error('Implementation differs from frozen protocol')
    if a.work_dir.is_symlink() or a.output.is_symlink():
        p.error('Non-symlink local destinations required')
    evaluator = a.trackeval_root.resolve()
    if (subprocess.check_output(['git', '-C', str(evaluator), 'rev-parse', 'HEAD'], text=True).strip() != TRACKEVAL_COMMIT
        or subprocess.run(['git', '-C', str(evaluator), 'diff', '--quiet', 'HEAD']).returncode):
        p.error('Clean pinned TrackEval required')
    runtime = {n: importlib.metadata.version(n) for n in protocol['runtime']}
    if runtime != protocol['runtime']:
        p.error('Runtime differs from frozen protocol')
    from trackers import ByteTrackTracker
    if hashlib.sha256(inspect.getsource(ByteTrackTracker).encode()).hexdigest() != protocol['upstream_bytetrack_class_sha256']:
        p.error('Upstream class differs from frozen protocol')
    seq = protocol['sequence']; name = seq['name']
    if name != 'MOT17-04-DPM' or protocol['repeats'] != 3:
        p.error('This frozen experiment requires MOT17-04-DPM and three repeats')
    archive = Path(manifest['labels_archive'])
    if archive.is_symlink() or sha256_file(archive) != protocol['source_terms']['labels_archive_sha256']:
        p.error('Official labels archive hash differs')
    for key in ('video', 'detections', 'gt', 'seqinfo'):
        path = Path(manifest[key])
        if path.is_symlink() or sha256_file(path) != seq[key+'_sha256']:
            p.error('Input differs from frozen protocol: '+key)
    with zipfile.ZipFile(archive) as z:
        if (z.read('train/'+name+'/gt/gt.txt') != Path(manifest['gt']).read_bytes()
            or z.read('train/'+name+'/seqinfo.ini') != Path(manifest['seqinfo']).read_bytes()):
            p.error('Inputs differ from official archive')
    cache = read_cache(Path(manifest['detections']))
    if cache['detector'] != protocol['detector'] or cache['video_sha256'] != seq['video_sha256']:
        p.error('Detector input/configuration differs')
    cfg = configparser.ConfigParser(); cfg.read(manifest['seqinfo']); meta = cfg['Sequence']
    scale = source_coordinate_scale(cache, meta); n = len(cache['frames'])
    if n != seq['frames'] or n != int(meta['seqLength']) or cache['fps'] != float(meta['frameRate']):
        p.error('Full sequence metadata mismatch')
    import cv2
    import numpy as np
    cv2.setNumThreads(1)
    for key, value in [('int', int), ('float', float), ('bool', bool)]:
        if key not in np.__dict__:
            setattr(np, key, value)
    sys.path.insert(0, str(evaluator)); import trackeval
    metrics = [trackeval.metrics.CLEAR({'PRINT_CONFIG': False}),
               trackeval.metrics.Identity({'PRINT_CONFIG': False}), trackeval.metrics.HOTA({'PRINT_CONFIG': False})]
    a.work_dir.mkdir(parents=True, exist_ok=True)
    first = {}; hashes = {}; trace_hashes = {}
    for trial in range(3):
        order = ARMS[trial % 2:] + ARMS[:trial % 2]
        for arm in order:
            cv2.setRNGSeed(0)
            pred, trace_hash = run_arm(Path(manifest['video']), cache, arm,
                a.work_dir/(arm+'-trace.local.jsonl') if trial == 0 else None)
            h = hashlib.sha256(canonical_predictions(pred).encode()).hexdigest()
            if arm in hashes and (hashes[arm] != h or trace_hashes[arm] != trace_hash):
                raise ValueError('Repeated predictions or full diagnostics differ')
            hashes[arm] = h; trace_hashes[arm] = trace_hash
            if trial == 0:
                first[arm] = pred
                (a.work_dir/(arm+'-predictions.local.json')).write_text(json.dumps(pred))
            print(arm+' trial '+str(trial+1)+': repeat hash checks passed', flush=True)
    audit,_ = run_video_tracker(Path(manifest['video']),cache,'bytetrack',parameters=PARAMETERS)
    if hashlib.sha256(canonical_predictions(audit).encode()).hexdigest() != hashes[ARMS[0]]:
        raise ValueError('Observed reference differs from unhooked upstream')
    old,_ = original_run_arm(Path(manifest['video']),cache,ARMS[1])
    if hashlib.sha256(canonical_predictions(old).encode()).hexdigest() != hashes[ARMS[1]]:
        raise ValueError('Legacy arm differs from original implementation')
    gt_dest = a.work_dir/'mot-gt'/name/'gt/gt.txt'
    gt_dest.parent.mkdir(parents=True, exist_ok=True); shutil.copyfile(manifest['gt'], gt_dest)
    for arm, pred in first.items():
        write_mot_predictions(pred, a.work_dir/'mot-trackers'/arm/'data'/(name+'.txt'), scale)
    dataset = trackeval.datasets.MotChallenge2DBox({'GT_FOLDER': str(a.work_dir/'mot-gt'),
        'TRACKERS_FOLDER': str(a.work_dir/'mot-trackers'), 'SKIP_SPLIT_FOL': True,
        'BENCHMARK': 'MOT17', 'SPLIT_TO_EVAL': 'train', 'SEQ_INFO': {name: n},
        'TRACKERS_TO_EVAL': list(ARMS), 'PRINT_CONFIG': False})
    rows = read_mot_gt(Path(manifest['gt']), n); ids = sorted({r['id'] for r in rows})
    events = scenario_events(rows, cache['fps']); errors = {}; matches = {}; methods = {}
    (a.work_dir/'scenario-events.local.json').write_text(json.dumps(events))
    for arm, pred in first.items():
        data = dataset.get_preprocessed_seq_data(dataset.get_raw_seq_data(arm, name), 'pedestrian')
        if data['num_gt_ids'] != len(ids) or data['num_gt_dets'] != len(rows):
            raise ValueError('Official GT mapping/cardinality differs')
        scores = metric_summary({m.get_name(): m.eval_sequence(data) for m in metrics})
        locations, counts = admission_error_locations(data, cache, scale)
        if any(counts[k] != scores[k] for k in counts):
            raise ValueError('Paired locations differ from official CLEAR')
        errors[arm] = locations
        (a.work_dir/(arm+'-error-locations.local.json')).write_text(json.dumps({k: sorted(v) for k,v in locations.items()}))
        matches[arm] = frame_matches(data, ids)
        group, raw = analyse_trace(a.work_dir/(arm+'-trace.local.jsonl'), pred, data, rows, cache, scale, scores)
        (a.work_dir/(arm+'-events.local.json')).write_text(json.dumps(raw, allow_nan=False))
        stages = [json.loads(line) for line in (a.work_dir/(arm+'-trace.local.jsonl')).read_text().splitlines()]
        deferred_count = sum(len(f['deferred']) for f in stages)
        methods[arm] = {'metrics': scores, 'diagnosis': public_summary([group]),
            'scenarios': {k: score_events(v, matches[arm], rows, cache['fps']) for k,v in events.items()},
            'deferred_edges': deferred_count, 'frames_with_deferral': sum(bool(f['deferred']) for f in stages),
            'canonical_predictions_sha256': hashes[arm], 'local_trace_sha256': trace_hashes[arm],
            'repeated_predictions_and_full_trace_equal': True,
            'competition_exposure': exposure(stages)}
    paired = {arm:{k:compare_event_recovery(v,matches[ARMS[0]],matches[arm]) for k,v in events.items()} for arm in ARMS[1:]}
    result = {'format': 'depthport.exclusive-competition-acceptance.v1', 'checked_on': protocol['checked_on'],
        'protocol_sha256': sha256_file(a.protocol), 'source_terms': protocol['source_terms'],
        'sequence': {**seq, 'resolution': [cache['width'], cache['height']], 'video_to_gt_scale': scale,
                     'cached_detections': sum(len(f['detections']) for f in cache['frames']),
                     'gt_pedestrian_observations': len(rows), 'scenario_event_counts': {k: len(v) for k,v in events.items()}},
        'detector': protocol['detector'], 'runtime': runtime, 'repeats': 3, 'evaluator_commit': TRACKEVAL_COMMIT,
        'methods': methods, 'paired_errors': {arm:paired_error_counts(errors[ARMS[0]],errors[arm]) for arm in ARMS[1:]},
        'paired_scenarios': paired,
        'screen': {arm:research_screen(methods[ARMS[0]]['metrics'],methods[arm]['metrics'],paired[arm],methods[arm]['deferred_edges']) for arm in ARMS[1:]},
        'unhooked_reference_equal':True,'original_legacy_equal':True,
        'limitations': protocol['limitations'], 'public_scope': protocol['public_scope']}
    a.output.parent.mkdir(parents=True, exist_ok=True)
    a.output.write_text(json.dumps(result, ensure_ascii=False, indent=2, allow_nan=False)+'\n')
    print('Aggregate experiment written; raw matrices/IDs/events remain local.', flush=True)
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
