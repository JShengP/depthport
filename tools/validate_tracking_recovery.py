#!/usr/bin/env python3
# SPDX-License-Identifier: AGPL-3.0-only
"""Frozen two-arm MOT20-01 research experiment. All raw diagnostics stay local.

No download, tuning, Session integration or GT-fed tracking. Supply licensed
local inputs through a private manifest; only the aggregate output is public.
"""
from __future__ import annotations

import argparse
from collections import Counter
from contextlib import ExitStack
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
from depthport.video_tracking_benchmark import make_tracker, read_cache, sha256_file, _one_step
from depthport.tracking_eval import PRED_FORMAT
from depthport.tracking_association_probe import AssociationProbe
from depthport.tracking_recovery_control import RecoveryDeferral, PARAMETERS, ARMS, MARGIN
from depthport.tracking_admission import admission_error_locations, paired_error_counts
from depthport.mot_scenarios import read_mot_gt, scenario_events, score_events, compare_event_recovery
from tools.validate_mot_tracking import (canonical_predictions, write_mot_predictions,
    source_coordinate_scale, TRACKEVAL_COMMIT, metric_summary, frame_matches)
from tools.diagnose_tracking_association import analyse_trace, public_summary


def research_screen(reference, candidate, paired_scenarios, interventions):
    """Frozen non-regression research screen, not release acceptance."""
    conditions = {'triggered': interventions > 0,
                  'fp_strictly_lower': candidate['CLR_FP'] < reference['CLR_FP'],
                  'fn_no_increase': candidate['CLR_FN'] <= reference['CLR_FN'],
                  'idsw_no_increase': candidate['IDSW'] <= reference['IDSW'],
                  'idf1_no_decrease': candidate['IDF1'] >= reference['IDF1'],
                  'hota_no_decrease': candidate['HOTA'] >= reference['HOTA'],
                  'no_paired_recovery_loss': all(v['lost_same_id_to_changed'] == 0
                      and v['lost_same_id_to_missing'] == 0 for v in paired_scenarios.values())}
    return {'conditions': conditions, 'passes': all(conditions.values())}


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
            control = (stack.enter_context(RecoveryDeferral(tracker))
                       if arm == ARMS[1] else None)
            probe = stack.enter_context(AssociationProbe(tracker, 'bytetrack'))
            for item in cache['frames']:
                ok, frame = cap.read()
                if not ok or frame.shape[:2] != (cache['height'], cache['width']):
                    raise ValueError('Dense frame coverage differs')
                objects, _, _, _ = _one_step('bytetrack', tracker, {}, 1,
                    item['detections'], frame, item['index'])
                frames.append({'index': item['index'], 'objects': objects})
                probe.last['deferred'] = control.last if control else []
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


def main(argv=None):
    p = argparse.ArgumentParser(description=__doc__)
    for name in ('protocol', 'manifest', 'trackeval-root', 'work-dir', 'output'):
        p.add_argument('--'+name, type=Path, required=True)
    a = p.parse_args(argv)
    from tools.diagnose_tracking_association import read_json
    protocol = read_json(a.protocol); manifest = read_json(a.manifest)
    if protocol['parameters'] != PARAMETERS or protocol['margin'] != MARGIN or protocol['arms'] != list(ARMS):
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
    seq = protocol['sequence']; name = seq['name']
    if name != 'MOT20-01' or protocol['repeats'] != 3:
        p.error('This frozen experiment requires MOT20-01 and three repeats')
    archive = Path(manifest['labels_archive'])
    if archive.is_symlink() or sha256_file(archive) != protocol['source_terms']['labels_archive_sha256']:
        p.error('Official labels archive hash differs')
    for key in ('video', 'detections', 'gt', 'seqinfo'):
        path = Path(manifest[key])
        if path.is_symlink() or sha256_file(path) != seq[key+'_sha256']:
            p.error('Input differs from frozen protocol: '+key)
    with zipfile.ZipFile(archive) as z:
        if (z.read('MOT20Labels/train/'+name+'/gt/gt.txt') != Path(manifest['gt']).read_bytes()
            or z.read('MOT20Labels/train/'+name+'/seqinfo.ini') != Path(manifest['seqinfo']).read_bytes()):
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
    gt_dest = a.work_dir/'mot-gt'/name/'gt/gt.txt'
    gt_dest.parent.mkdir(parents=True, exist_ok=True); shutil.copyfile(manifest['gt'], gt_dest)
    for arm, pred in first.items():
        write_mot_predictions(pred, a.work_dir/'mot-trackers'/arm/'data'/(name+'.txt'), scale)
    dataset = trackeval.datasets.MotChallenge2DBox({'GT_FOLDER': str(a.work_dir/'mot-gt'),
        'TRACKERS_FOLDER': str(a.work_dir/'mot-trackers'), 'SKIP_SPLIT_FOL': True,
        'BENCHMARK': 'MOT20', 'SPLIT_TO_EVAL': 'train', 'SEQ_INFO': {name: n},
        'TRACKERS_TO_EVAL': list(ARMS), 'PRINT_CONFIG': False})
    rows = read_mot_gt(Path(manifest['gt']), n); ids = sorted({r['id'] for r in rows})
    events = scenario_events(rows, cache['fps']); errors = {}; matches = {}; methods = {}
    (a.work_dir/'scenario-events.local.json').write_text(json.dumps(events))
    for arm, pred in first.items():
        data = dataset.get_preprocessed_seq_data(dataset.get_raw_seq_data(arm, name), 'pedestrian')
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
            'repeated_predictions_and_full_trace_equal': True}
    paired = {k: compare_event_recovery(v, matches[ARMS[0]], matches[ARMS[1]]) for k,v in events.items()}
    result = {'format': 'depthport.recovery-deferral-acceptance.v1', 'checked_on': protocol['checked_on'],
        'protocol_sha256': sha256_file(a.protocol), 'source_terms': protocol['source_terms'],
        'sequence': {**seq, 'resolution': [cache['width'], cache['height']], 'video_to_gt_scale': scale,
                     'cached_detections': sum(len(f['detections']) for f in cache['frames']),
                     'gt_pedestrian_observations': len(rows), 'scenario_event_counts': {k: len(v) for k,v in events.items()}},
        'detector': protocol['detector'], 'runtime': runtime, 'repeats': 3, 'evaluator_commit': TRACKEVAL_COMMIT,
        'methods': methods, 'paired_errors': paired_error_counts(errors[ARMS[0]], errors[ARMS[1]]),
        'paired_scenarios': paired,
        'screen': research_screen(methods[ARMS[0]]['metrics'], methods[ARMS[1]]['metrics'], paired, methods[ARMS[1]]['deferred_edges']),
        'limitations': protocol['limitations'], 'public_scope': protocol['public_scope']}
    a.output.parent.mkdir(parents=True, exist_ok=True)
    a.output.write_text(json.dumps(result, ensure_ascii=False, indent=2, allow_nan=False)+'\n')
    print('Aggregate experiment written; raw matrices/IDs/events remain local.', flush=True)
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
