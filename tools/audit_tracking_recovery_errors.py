#!/usr/bin/env python3
# SPDX-License-Identifier: AGPL-3.0-only
"""Post-hoc audit of immutable recovery-study outputs; never rerun/tune trackers.

Publish aggregate added-error contexts/HOTA components only. Raw cases remain
in --work-dir. Supports the original MOT20 study and moving MOT17 replication.
"""
from __future__ import annotations

import argparse
from collections import Counter
import configparser
import hashlib
import json
from pathlib import Path
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from depthport.video_tracking_benchmark import sha256_file, read_cache
from depthport.tracking_recovery_control import ARMS
from depthport.tracking_recovery_diagnostics import analyse_added_errors
from depthport.tracking_diagnostics import clear_trace, fp_context, cache_index
from depthport.mot_scenarios import read_mot_gt, scenario_events
from tools.validate_mot_tracking import TRACKEVAL_COMMIT, canonical_predictions, write_mot_predictions, metric_summary, source_coordinate_scale
from tools.diagnose_tracking_association import read_json
from tools.validate_tracking_recovery_replication import sum_nested_counts


def weak_stage_contexts(cases, frames):
    """Selected-row states for added misses, without comparing cross-run IDs."""
    indexed = {f['frame']: f for f in frames}
    labels = Counter()
    for case in cases:
        trace = indexed[case['frame']]
        if len(trace['stages']) < 2:
            label = 'no_weak_stage'
        else:
            stage = trace['stages'][1]; index = case['reference_detection_index']
            col = stage['detection_indices'].index(index) if index in stage['detection_indices'] else None
            pairs = [r for r,c in stage['matched'] if c == col] if col is not None else []
            deferred = any(e['column'] == col for e in trace['deferred']) if col is not None else False
            label = ('not_in_weak_stage' if col is None else 'deferred' if deferred else
                     'matched_confirmed' if pairs and stage['tracks'][pairs[0]]['tracker_id'] >= 0 else
                     'matched_tentative' if pairs else 'unmatched_weak')
        case['candidate_weak_stage'] = label
        labels[label] += 1
    return dict(sorted(labels.items()))


def main(argv=None):
    p = argparse.ArgumentParser(description=__doc__)
    for name in ('manifest', 'record', 'runs-dir', 'trackeval-root', 'work-dir', 'output'):
        p.add_argument('--'+name, type=Path, required=True)
    a = p.parse_args(argv); record = read_json(a.record); manifest = read_json(a.manifest)
    if record['format'] == 'depthport.recovery-deferral-acceptance.v1':
        benchmark = 'MOT20'; specs = [record['sequence']]; seqs = [manifest]
    elif record['format'] == 'depthport.recovery-moving-replication.v1':
        benchmark = 'MOT17'; specs = record['sequences']; seqs = manifest['sequences']
    else:
        p.error('Supported immutable recovery record required')
    if a.work_dir.is_symlink() or a.output.is_symlink():
        p.error('Non-symlink local destinations required')
    evaluator = a.trackeval_root.resolve()
    if (subprocess.check_output(['git', '-C', str(evaluator), 'rev-parse', 'HEAD'], text=True).strip() != TRACKEVAL_COMMIT
        or subprocess.run(['git', '-C', str(evaluator), 'diff', '--quiet', 'HEAD']).returncode):
        p.error('Clean pinned evaluator required')
    import numpy as np
    for key, value in [('int', int), ('float', float), ('bool', bool)]:
        if key not in np.__dict__:
            setattr(np, key, value)
    sys.path.insert(0, str(evaluator)); import trackeval
    metrics = [trackeval.metrics.CLEAR({'PRINT_CONFIG': False}),
               trackeval.metrics.Identity({'PRINT_CONFIG': False}), trackeval.metrics.HOTA({'PRINT_CONFIG': False})]
    report = {'format': 'depthport.recovery-error-audit.v1', 'checked_on': '2026-10-19',
        'input_record_sha256': sha256_file(a.record), 'source_terms': record['source_terms'],
        'analysis_source_sha256': {f: sha256_file(ROOT/f) for f in
            ('tools/audit_tracking_recovery_errors.py', 'depthport/tracking_recovery_diagnostics.py')},
        'scope': 'Post-hoc deterministic diagnosis only, after frozen experiment results. No tracking, parameter search or altered inputs.',
        'sequences': [], 'public_scope': record['public_scope']}
    for seq, spec in zip(seqs, specs):
        name = spec['name']; cache = read_cache(Path(seq['detections'])); n = len(cache['frames'])
        for key in ('video', 'detections', 'gt', 'seqinfo'):
            if sha256_file(Path(seq[key])) != spec[key+'_sha256']:
                p.error('Recorded input mismatch')
        cfg = configparser.ConfigParser(); cfg.read(seq['seqinfo']); scale = source_coordinate_scale(cache, cfg['Sequence'])
        rows = read_mot_gt(Path(seq['gt']), n); events = scenario_events(rows, cache['fps'])
        local = a.runs_dir/name if benchmark == 'MOT17' else a.runs_dir
        methods = spec['methods'] if benchmark == 'MOT17' else record['methods']
        predictions = {}; frames = {}; data = {}; raw = {}; traces = {}; emitted = {}; hota = {}
        output_local = a.work_dir/name; output_local.mkdir(parents=True, exist_ok=True)
        for arm in ARMS:
            pred = read_json(local/(arm+'-predictions.local.json')); predictions[arm] = pred
            if hashlib.sha256(canonical_predictions(pred).encode()).hexdigest() != methods[arm]['canonical_predictions_sha256']:
                p.error('Saved predictions differ from recorded output')
            trace = local/(arm+'-trace.local.jsonl')
            if sha256_file(trace) != methods[arm]['local_trace_sha256']:
                p.error('Saved diagnostic trace differs from record')
            frames[arm] = [json.loads(line) for line in trace.read_text().splitlines()]
            check_file = output_local/(arm+'-mot.local.txt'); write_mot_predictions(pred, check_file, scale)
            if check_file.read_bytes() != (a.runs_dir/'mot-trackers'/arm/'data'/(name+'.txt')).read_bytes():
                p.error('Saved MOT output mismatch')
        if sha256_file(a.runs_dir/'mot-gt'/name/'gt/gt.txt') != spec['gt_sha256']:
            p.error('Evaluator GT differs from record')
        dataset = trackeval.datasets.MotChallenge2DBox({'GT_FOLDER': str(a.runs_dir/'mot-gt'),
            'TRACKERS_FOLDER': str(a.runs_dir/'mot-trackers'), 'SKIP_SPLIT_FOL': True,
            'BENCHMARK': benchmark, 'SPLIT_TO_EVAL': 'train', 'SEQ_INFO': {name: n},
            'TRACKERS_TO_EVAL': list(ARMS), 'PRINT_CONFIG': False})
        for arm in ARMS:
            raw[arm] = dataset.get_raw_seq_data(arm, name)
            d = dataset.get_preprocessed_seq_data(raw[arm], 'pedestrian'); data[arm] = d
            scores = {m.get_name(): m.eval_sequence(d) for m in metrics}
            if any(abs(v-methods[arm]['metrics'][k]) > 1e-12 for k,v in metric_summary(scores).items()):
                p.error('Official metrics differ from recorded experiment')
            traces[arm] = clear_trace(d)
            if any(traces[arm]['summary'][k] != scores['CLEAR'][k] for k in traces[arm]['summary']):
                p.error('CLEAR diagnostic counts differ')
            emitted[arm] = {(f+1, cache_index(box, score, cache['frames'][f]['detections'], scale))
                for f,(boxes,conf) in enumerate(zip(d['tracker_dets'], d['tracker_confidences'])) for box,score in zip(boxes,conf)}
            hota[arm] = {k: float(scores['HOTA'][k].mean()) for k in
                ('HOTA', 'DetA', 'AssA', 'DetPr', 'DetRe', 'AssPr', 'AssRe')}
        summary, cases = analyse_added_errors(data[ARMS[0]], data[ARMS[1]], rows, events, cache,
            scale, predictions[ARMS[1]], frames[ARMS[1]])
        summary['added_fn_candidate_weak_stage'] = weak_stage_contexts(cases['added_fn'], frames[ARMS[1]])
        old_fp = {(c['frame'], cache_index(data[ARMS[0]]['tracker_dets'][c['frame']-1][c['col']],
            data[ARMS[0]]['tracker_confidences'][c['frame']-1][c['col']], cache['frames'][c['frame']-1]['detections'], scale))
            for c in traces[ARMS[0]]['false_positives']}
        fp = []
        for case in traces[ARMS[1]]['false_positives']:
            ctx = fp_context(case, data[ARMS[1]], raw[ARMS[1]], cache, scale)
            key = (ctx['frame'], ctx['cache_index'])
            if key not in old_fp:
                fp.append({**ctx, 'reference_emitted_after_preprocessing': key in emitted[ARMS[0]]})
        (output_local/'added-errors.local.json').write_text(json.dumps({**cases, 'added_fp': fp}, allow_nan=False))
        report['sequences'].append({'name': name, 'official_scores_reproduced': True,
            'added_error_diagnosis': summary, 'hota_components_mean_over_thresholds': hota,
            'added_fp': {'total': len(fp), 'categories': dict(sorted(Counter(c['category'] for c in fp).items())),
                'reference_emitted_after_preprocessing': sum(c['reference_emitted_after_preprocessing'] for c in fp),
                'overlaps_excluded_annotation': sum(c['overlaps_excluded_annotation'] for c in fp)}})
    report['combined_added_errors'] = sum_nested_counts([
        {**{k:v for k,v in s['added_error_diagnosis'].items() if k != 'added_fn_episodes'}, 'added_fp': s['added_fp']}
        for s in report['sequences']])
    a.output.parent.mkdir(parents=True, exist_ok=True)
    a.output.write_text(json.dumps(report, ensure_ascii=False, indent=2, allow_nan=False)+'\n')
    print('Immutable predictions/traces and all official scores reproduced; post-hoc aggregate written.', flush=True)
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
