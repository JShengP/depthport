#!/usr/bin/env python3
# SPDX-License-Identifier: AGPL-3.0-only
"""Unchanged recovery-control replication on frozen licensed moving sequences.

No downloads or tuning. Original runner/control remain unchanged. Full matrices,
predictions and added-error cases go to ignored local storage only.
"""
from __future__ import annotations

import argparse
from collections import Counter
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

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from depthport.video_tracking_benchmark import read_cache, run_video_tracker, sha256_file
from depthport.tracking_recovery_control import PARAMETERS, ARMS, MARGIN
from depthport.tracking_admission import admission_error_locations, paired_error_counts
from depthport.tracking_recovery_diagnostics import analyse_added_errors
from depthport.mot_scenarios import read_mot_gt, scenario_events, score_events, compare_event_recovery
from tools.validate_mot_tracking import (TRACKEVAL_COMMIT, load_manifest, canonical_predictions,
    write_mot_predictions, source_coordinate_scale, metric_summary, combine_scenario_scores, DETECTOR_KEYS, frame_matches)
from tools.validate_tracking_recovery import run_arm, research_screen
from tools.diagnose_tracking_association import read_json, analyse_trace, public_summary


def sum_nested_counts(records):
    """Only additive fixed-label count dictionaries, never metric-rate averaging."""
    keys = sorted({key for record in records for key in record})
    return {key: (sum_nested_counts([r.get(key, {}) for r in records])
                  if isinstance(next(r[key] for r in records if key in r), dict)
                  else sum(r.get(key, 0) for r in records)) for key in keys}


def main(argv=None):
    p = argparse.ArgumentParser(description=__doc__)
    for name in ('protocol', 'manifest', 'trackeval-root', 'work-dir', 'output'):
        p.add_argument('--'+name, type=Path, required=True)
    a = p.parse_args(argv); protocol = read_json(a.protocol); manifest = load_manifest(a.manifest)
    previous = read_json(ROOT/'docs/validation/v0.3-recovery-deferral-protocol.json')
    if (protocol['parameters'] != PARAMETERS or protocol['margin'] != MARGIN
        or protocol['arms'] != list(ARMS) or protocol['repeats'] != 3
        or any(protocol[k] != previous[k] for k in ('parameters', 'margin', 'arms', 'runtime', 'upstream_bytetrack_class_sha256'))):
        p.error('Control, arms or runtime differs from original frozen policy')
    if sha256_file(ROOT/'docs/validation/v0.3-recovery-deferral-protocol.json') != protocol['previous_protocol_sha256']:
        p.error('Original protocol changed')
    for name, digest in protocol['implementation_sha256'].items():
        if sha256_file(ROOT/name) != digest:
            p.error('Frozen implementation changed: '+name)
    if a.work_dir.is_symlink() or a.output.is_symlink():
        p.error('Non-symlink local destinations required')
    evaluator = a.trackeval_root.resolve()
    if (subprocess.check_output(['git', '-C', str(evaluator), 'rev-parse', 'HEAD'], text=True).strip() != TRACKEVAL_COMMIT
        or subprocess.run(['git', '-C', str(evaluator), 'diff', '--quiet', 'HEAD']).returncode):
        p.error('Clean pinned evaluator required')
    runtime = {n: importlib.metadata.version(n) for n in protocol['runtime']}
    from trackers import ByteTrackTracker
    if (runtime != protocol['runtime'] or hashlib.sha256(inspect.getsource(ByteTrackTracker).encode()).hexdigest()
        != protocol['upstream_bytetrack_class_sha256']):
        p.error('Runtime or upstream implementation changed')
    expected = [s['name'] for s in protocol['sequences']]
    if (expected != ['MOT17-11-DPM', 'MOT17-13-DPM']
        or [s['name'] for s in manifest['sequences']] != expected
        or not all(s['camera_motion'] for s in manifest['sequences'])):
        p.error('Frozen 11/13 moving-camera cohort required')
    archive = Path(manifest['labels_archive'])
    if archive.is_symlink() or sha256_file(archive) != protocol['source_terms']['labels_archive_sha256']:
        p.error('Labels archive hash mismatch')
    import cv2
    import numpy as np
    cv2.setNumThreads(1)
    for key, value in [('int', int), ('float', float), ('bool', bool)]:
        if key not in np.__dict__:
            setattr(np, key, value)
    sys.path.insert(0, str(evaluator)); import trackeval
    metrics = [trackeval.metrics.CLEAR({'PRINT_CONFIG': False}),
               trackeval.metrics.Identity({'PRINT_CONFIG': False}), trackeval.metrics.HOTA({'PRINT_CONFIG': False})]
    all_scores = {arm: {} for arm in ARMS}
    result = {'format': 'depthport.recovery-moving-replication.v1', 'checked_on': protocol['checked_on'],
        'protocol_sha256': sha256_file(a.protocol), 'source_terms': protocol['source_terms'],
        'runtime': runtime, 'evaluator_commit': TRACKEVAL_COMMIT, 'repeats': 3,
        'control_unchanged': True, 'sequences': [], 'limitations': protocol['limitations'],
        'public_scope': protocol['public_scope']}
    for seq, frozen in zip(manifest['sequences'], protocol['sequences']):
        name = seq['name']; cache = read_cache(Path(seq['detections'])); n = len(cache['frames'])
        for key in ('video', 'detections', 'gt', 'seqinfo'):
            path = Path(seq[key])
            if path.is_symlink() or sha256_file(path) != frozen[key+'_sha256']:
                p.error('Frozen input mismatch: '+name+'/'+key)
        if (cache['detector'] != frozen['detector'] or cache['video_sha256'] != frozen['video_sha256']
            or {k: cache['detector'][k] for k in DETECTOR_KEYS} != protocol['detector_settings']):
            p.error('Common detector differs from frozen settings')
        cfg = configparser.ConfigParser(); cfg.read(seq['seqinfo']); meta = cfg['Sequence']
        scale = source_coordinate_scale(cache, meta)
        if n != frozen['frames'] or n != int(meta['seqLength']) or cache['fps'] != float(meta['frameRate']):
            p.error('Full dense sequence metadata mismatch')
        with zipfile.ZipFile(archive) as z:
            if (z.read('train/'+name+'/gt/gt.txt') != Path(seq['gt']).read_bytes()
                or z.read('train/'+name+'/seqinfo.ini') != Path(seq['seqinfo']).read_bytes()):
                p.error('GT/metadata differs from official archive')
        local = a.work_dir/name; local.mkdir(parents=True, exist_ok=True)
        first = {}; hashes = {}; trace_hashes = {}
        for trial in range(3):
            for arm in ARMS[trial % 2:]+ARMS[:trial % 2]:
                cv2.setRNGSeed(0)
                pred, trace_hash = run_arm(Path(seq['video']), cache, arm,
                    local/(arm+'-trace.local.jsonl') if trial == 0 else None)
                h = hashlib.sha256(canonical_predictions(pred).encode()).hexdigest()
                if arm in hashes and (hashes[arm] != h or trace_hashes[arm] != trace_hash):
                    raise ValueError('Repeated predictions or diagnostic traces differ')
                hashes[arm] = h; trace_hashes[arm] = trace_hash
                if trial == 0:
                    first[arm] = pred
                    (local/(arm+'-predictions.local.json')).write_text(json.dumps(pred))
                print(name+' '+arm+' repeat '+str(trial+1)+': hash checks passed', flush=True)
        audit, _ = run_video_tracker(Path(seq['video']), cache, 'bytetrack', parameters=PARAMETERS)
        if hashlib.sha256(canonical_predictions(audit).encode()).hexdigest() != hashes[ARMS[0]]:
            raise ValueError('Observed reference differs from unhooked upstream')
        gt_dest = a.work_dir/'mot-gt'/name/'gt/gt.txt'
        gt_dest.parent.mkdir(parents=True, exist_ok=True); shutil.copyfile(seq['gt'], gt_dest)
        for arm, pred in first.items():
            write_mot_predictions(pred, a.work_dir/'mot-trackers'/arm/'data'/(name+'.txt'), scale)
        dataset = trackeval.datasets.MotChallenge2DBox({'GT_FOLDER': str(a.work_dir/'mot-gt'),
            'TRACKERS_FOLDER': str(a.work_dir/'mot-trackers'), 'SKIP_SPLIT_FOL': True,
            'BENCHMARK': 'MOT17', 'SPLIT_TO_EVAL': 'train', 'SEQ_INFO': {name: n},
            'TRACKERS_TO_EVAL': list(ARMS), 'PRINT_CONFIG': False})
        rows = read_mot_gt(Path(seq['gt']), n); ids = sorted({r['id'] for r in rows})
        events = scenario_events(rows, cache['fps']); errors = {}; matches = {}; methods = {}; data = {}; traces = {}
        (local/'scenario-events.local.json').write_text(json.dumps(events))
        for arm, pred in first.items():
            d = dataset.get_preprocessed_seq_data(dataset.get_raw_seq_data(arm, name), 'pedestrian'); data[arm] = d
            if d['num_gt_ids'] != len(ids) or d['num_gt_dets'] != len(rows):
                raise ValueError('Official GT mapping/cardinality differs')
            scores = {m.get_name(): m.eval_sequence(d) for m in metrics}; summary = metric_summary(scores)
            all_scores[arm][name] = scores
            errors[arm], counts = admission_error_locations(d, cache, scale)
            if any(counts[k] != summary[k] for k in counts):
                raise ValueError('Diagnostic counts differ from official CLEAR')
            matches[arm] = frame_matches(d, ids)
            group, raw = analyse_trace(local/(arm+'-trace.local.jsonl'), pred, d, rows, cache, scale, summary)
            (local/(arm+'-events.local.json')).write_text(json.dumps(raw, allow_nan=False))
            (local/(arm+'-error-locations.local.json')).write_text(json.dumps({k: sorted(v) for k,v in errors[arm].items()}))
            traces[arm] = [json.loads(line) for line in (local/(arm+'-trace.local.jsonl')).read_text().splitlines()]
            methods[arm] = {'metrics': summary, 'diagnosis': public_summary([group]),
                'scenarios': {k: score_events(v, matches[arm], rows, cache['fps']) for k,v in events.items()},
                'deferred_edges': sum(len(f['deferred']) for f in traces[arm]),
                'frames_with_deferral': sum(bool(f['deferred']) for f in traces[arm]),
                'canonical_predictions_sha256': hashes[arm], 'local_trace_sha256': trace_hashes[arm],
                'repeated_predictions_and_full_trace_equal': True}
        paired = {k: compare_event_recovery(v, matches[ARMS[0]], matches[ARMS[1]]) for k,v in events.items()}
        diagnosis, cases = analyse_added_errors(data[ARMS[0]], data[ARMS[1]], rows, events, cache,
            scale, first[ARMS[1]], traces[ARMS[1]])
        paired_errors = paired_error_counts(errors[ARMS[0]], errors[ARMS[1]])
        if diagnosis['added_fn']['total'] != paired_errors['FN']['added'] or diagnosis['added_idsw']['total'] != paired_errors['IDSW']['added']:
            raise ValueError('Added-error diagnosis counts differ from paired errors')
        (local/'added-error-cases.local.json').write_text(json.dumps(cases, allow_nan=False))
        result['sequences'].append({**frozen, 'resolution': [cache['width'], cache['height']],
            'video_to_gt_scale': scale, 'gt_pedestrian_observations': len(rows),
            'cached_detections': sum(len(f['detections']) for f in cache['frames']),
            'scenario_event_counts': {k: len(v) for k,v in events.items()}, 'methods': methods,
            'unhooked_reference_equal': True, 'paired_errors': paired_errors,
            'paired_scenarios': paired, 'added_error_diagnosis': diagnosis,
            'screen': research_screen(methods[ARMS[0]]['metrics'], methods[ARMS[1]]['metrics'], paired, methods[ARMS[1]]['deferred_edges'])})
    result['combined_metrics'] = {arm: metric_summary({m.get_name(): m.combine_sequences(
        {name: s[m.get_name()] for name,s in all_scores[arm].items()}) for m in metrics}) for arm in ARMS}
    for key in ('paired_errors', 'paired_scenarios'):
        result['combined_'+key] = sum_nested_counts([s[key] for s in result['sequences']])
    summaries = [s['added_error_diagnosis'] for s in result['sequences']]
    result['combined_added_error_diagnosis'] = sum_nested_counts([{k:v for k,v in s.items() if k != 'added_fn_episodes'} for s in summaries])
    result['combined_added_error_diagnosis']['added_fn_episodes'] = {
        'count': sum(s['added_fn_episodes']['count'] for s in summaries),
        'max_frames': max(s['added_fn_episodes']['max_frames'] for s in summaries)}
    result['combined_scenarios'] = combine_scenario_scores(result['sequences'], ARMS)
    combined_screen = research_screen(result['combined_metrics'][ARMS[0]], result['combined_metrics'][ARMS[1]],
        result['combined_paired_scenarios'], sum(s['methods'][ARMS[1]]['deferred_edges'] for s in result['sequences']))
    result['screen'] = {'combined': combined_screen,
        'all_sequences_pass': all(s['screen']['passes'] for s in result['sequences']),
        'passes': combined_screen['passes'] and all(s['screen']['passes'] for s in result['sequences'])}
    a.output.parent.mkdir(parents=True, exist_ok=True)
    a.output.write_text(json.dumps(result, ensure_ascii=False, indent=2, allow_nan=False)+'\n')
    print('Replication aggregate written; original control/inputs unchanged, raw cases remain local.', flush=True)
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
