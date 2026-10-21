#!/usr/bin/env python3
# SPDX-License-Identifier: AGPL-3.0-only
"""Freeze then read sealed histories; no GT, media, inference, tracker or solver."""
import argparse
from datetime import datetime, timezone
import gzip
import hashlib
import json
from pathlib import Path
import platform
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from depthport.tracking_accepted_events import AcceptedLedger, compare, encoded, require, strict_json

PREFIX = 'docs/validation/v0.3-geometry-exposure-'
RECORDS = tuple(PREFIX + n + '.json' for n in ('protocol', 'discovery', 'discovery-references',
    'archive-compatibility', 'confirmation', 'confirmation-references', 'preparation', 'pre-inference')) + (
    'docs/validation/v0.3-carrier-role-audit-protocol.json', 'docs/validation/v0.3-carrier-role-audit.json')
FILES = ('depthport/tracking_accepted_events.py', 'tools/audit_tracking_accepted_events.py',
         'tests/test_tracking_accepted_events.py')
PROTOCOL = ROOT / 'docs/validation/v0.3-accepted-events-protocol.json'
RESULT = ROOT / 'docs/validation/v0.3-accepted-events.json'
WORK = ROOT / 'artifacts/tracking-accepted-events'
SELECTED = ['MOT17-09-DPM', 'MOT17-11-DPM', 'MOT20-07']


def digest(path):
    h = hashlib.sha256()
    with path.open('rb') as stream:
        for part in iter(lambda: stream.read(1024 * 1024), b''):
            h.update(part)
    return h.hexdigest()


def write(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, indent=2, allow_nan=False) + '\n', encoding='utf-8')


def records():
    return {phase: strict_json((ROOT / (PREFIX + phase + '.json')).read_bytes())
            for phase in ('discovery', 'confirmation')}


def input_paths(archive_root, old):
    base = archive_root.resolve()
    require(archive_root.name == 'artifacts' and not archive_root.is_symlink(), 'Existing local artifacts root required')
    paths = {}
    for phase, document in old.items():
        for scene in document['ledger']:
            for arm, value in scene['passes'].items():
                for name in value['sha256']:
                    key = '/'.join((phase, scene['name'], arm, name))
                    paths[key] = base / 'tracking-geometry-exposure' / key
                if arm != 'native':
                    key = '/'.join((phase, scene['name'], arm, 'trace.local.jsonl.gz'))
                    paths[key] = base / 'tracking-geometry-exposure' / key
    for i in range(4):
        name = f'KITTI-{i:04d}'
        paths['historical-carrier/' + name] = base / 'tracking-past-support/run' / name / 'activation_control-predictions.local.json'
    for path in paths.values():
        require(path.resolve().is_relative_to(base) and all(not p.is_symlink() for p in (path, *path.parents)
            if p.is_relative_to(base)), 'Local sealed non-symlink input required')
    return paths


def selected_ledger(old):
    rows = []
    changed = []
    for phase, document in old.items():
        for scene in document['ledger']:
            if scene['status'] != 'completed':
                status = 'unmeasured_original_failure'
            elif scene['passes']['reference-0']['canonical_prediction_sha256'] != scene['passes']['projection-0']['canonical_prediction_sha256']:
                status = 'scheduled_changed_output' if phase == 'discovery' else 'out_of_scope_confirmation'
                if phase == 'discovery': changed.append(scene['name'])
            else:
                status = 'out_of_scope_unchanged_output'
            rows.append({'name': scene['name'], 'phase': phase, 'frames': scene['frames'],
                'original_status': scene['status'], 'audit_status': status, 'event_counts': None})
    require(changed == SELECTED, 'Previously public complete changed-source list differs')
    return rows


def check_inputs(paths, expected):
    require(set(paths) == set(expected), 'Full 434-file original inventory required')
    for index, (key, path) in enumerate(paths.items(), 1):
        require(digest(path) == expected[key], 'Sealed local input bytes differ: ' + key)
        if index % 100 == 0: print(f'Sealed input integrity {index}/{len(paths)}', flush=True)


def freeze(archive_root):
    require(not PROTOCOL.exists() and not WORK.exists(), 'Freeze must not overwrite evidence')
    old = records()
    prior = strict_json((ROOT / RECORDS[-2]).read_bytes())
    paths = input_paths(archive_root, old)
    require(len(paths) == 434, 'Original complete inventory required')
    check_inputs(paths, prior['local_input_sha256'])
    rows = selected_ledger(old)
    protocol = {'format': 'depthport.accepted-events-protocol.v1',
        'frozen_at_utc': datetime.now(timezone.utc).isoformat(), 'report_date_local': '2026-10-21',
        'base_commit': subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT, text=True).strip(),
        'scope': 'Locally prospective definition freeze after public changed-output and carrier/role results, before extracting new accepted-event memberships. All sources already seen; descriptive audit, not independent confirmation or external preregistration.',
        'implementation_sha256': {p: digest(ROOT / p) for p in FILES},
        'source_records_sha256': {p: digest(ROOT / p) for p in RECORDS},
        'local_input_sha256': prior['local_input_sha256'], 'selected_sources': SELECTED,
        'complete_scope_ledger': rows, 'original_parameters': prior['parameters'],
        'original_runtime': prior['runtime'], 'original_upstream_sha256': prior['upstream_sha256'],
        'audit_python': platform.python_version(),
        'definitions': {
            'selection': 'All three previously public changed discovery outputs, in original order, full 525/900/585 frames; no new selection based on extracted events. Retain all 26 source rows: 19 unchanged completed sources out of scope, four failed/missing histories unmeasured with null counts, three scheduled. Both already sealed trials0/1 per arm independently read; repeats add no new source.',
            'inputs': 'Read only the 12 pinned compressed histories for selected sources, plus public GT-free protocols/results. Stream every original frame; verify dense continuity, original high/weak partitions, one-to-one accepted edges and numerical update receipts. Match complete original births, high/weak and confirmed counts and uncompressed history digests. Verify all434 original files before and after (including full output/native/final pickle files, 88 histories and four carriers); pickle is hashed only, never loaded. No media/cache/GT/labels/evaluator/score reads.',
            'keys': 'Accepted input=(source frame, original zero-based detection index); immutable seed lineage=(birth frame, original detection index). Cross-arm joins never use track token or native ID. Per-arm tokens only recover birth ownership within the same history. Birth seed is separate, not an accepted update. Frames are dense one-based source indices. Inputs must have identical full per-frame receipt hashes across both arms and repeats.',
            'membership': 'Compare accepted-input sets, stage-labelled sets, seed-lineage sets and stage+lineage sets separately. Keep reference/control/common/lost/added denominators and exact added-minus-lost balance, including zeros. For common inputs count stage changes, seed-lineage changes and posterior box JSON-encoding changes separately; these are not verified identity switches or localisation errors.',
            'proxy_partition': 'Reproduce original geometry-validation membership operator: weak accepted inputs by stage, active updates keyed by frame/birth/input/stage with pre-update missed age0, confirmed accepted inputs by post-update native ID>=0, and new birth events. Partition lost weak into missing accepted input vs moved to high; lost confirmed into missing accepted input vs accepted but unconfirmed. Partition lost active edges with fixed exclusive priority: missing input, else different birth lineage, else different stage, else became retained. All denominators/zeros retained; no GT-free proxy is true FN/FP/IDSW/HOTA or empirical safety acceptance.',
            'repeat_and_failures': 'Two original archived repeats independently extracted and compared for aggregate, ordered raw receipt, immutable inputs and membership differences; no retries. Missing/corrupt/inconsistent sources remain failed with null result; later code changes require dated amendment and keep previous failures. Never overwrite original or new evidence. Old carrier failures, incomplete discovery and false formal replication flags remain unchanged.',
            'decision': 'Descriptive diagnosis only. No new geometry guard, thresholds, confirmation/buffer changes, solver call, forced role exposure or default promotion. Weak detections/continuation, original parameters and accepted decisions stay frozen. True harm/identity quality and genuinely unseen confirmation remain open.',
            'publication': 'Only source-level counts, partitions, denominators, equality/failure flags and hashes. Raw per-frame/input/seed/token/ID/box cases, exceptions and local paths stay in ignored artifacts. No private data, source media, GT, detection caches or raw tracker output is published.'},
        'terms': 'Inherited previously reviewed MOT/KITTI terms in pinned geometry-exposure protocol; local noncommercial research only. No media/labels/raw-result redistribution or relicensing.'}
    write(PROTOCOL, protocol)
    write(WORK / 'seal.local.json', {'protocol_sha256': digest(PROTOCOL)})
    print(json.dumps({'protocol_sha256': digest(PROTOCOL), 'sealed_files': len(paths), 'new_event_extraction': False}))


def verify(archive_root):
    protocol = strict_json(PROTOCOL.read_bytes())
    require(strict_json((WORK / 'seal.local.json').read_bytes())['protocol_sha256'] == digest(PROTOCOL), 'Freeze seal differs')
    require(platform.python_version() == protocol['audit_python'], 'Frozen audit interpreter required')
    for group in ('implementation_sha256', 'source_records_sha256'):
        for path, sha in protocol[group].items(): require(digest(ROOT / path) == sha, 'Frozen source differs: ' + path)
    old = records(); paths = input_paths(archive_root, old)
    check_inputs(paths, protocol['local_input_sha256'])
    return protocol, old, paths


def extract(path, expected, dest):
    ledger = AcceptedLedger(); receipt = hashlib.sha256()
    with gzip.open(path, 'rb') as source, dest.open('xb') as output:
        for line in source:
            receipt.update(line)
            for event in ledger.add(strict_json(line)): output.write(encoded(event))
    require(receipt.hexdigest() == expected['trace_sha256'], 'Original uncompressed history seal differs')
    summary = ledger.summary()
    for key in ('frames', 'births', 'accepted_high', 'accepted_weak', 'confirmed_observations'):
        require(summary[key] == expected['counts'][key], 'Original count reconciliation failed: ' + key)
    return ledger


def analyze(archive_root):
    protocol, old, paths = verify(archive_root)
    work = WORK / 'run'
    require(not work.exists() and not RESULT.exists(), 'No overwrite or retry')
    work.mkdir(); rows = selected_ledger(old)
    for row in rows:
        if row['audit_status'] != 'scheduled_changed_output': continue
        row['audit_status'] = 'failed'
        try:
            scene = next(s for s in old['discovery']['ledger'] if s['name'] == row['name'])
            arms = {}
            for arm in ('reference', 'projection'):
                trials = []
                for trial in (0, 1):
                    key = '/'.join(('discovery', row['name'], f'{arm}-{trial}', 'trace.local.jsonl.gz'))
                    dest = work / f'{row["name"]}-{arm}-{trial}.events.local.jsonl'
                    trials.append(extract(paths[key], scene['passes'][f'{arm}-{trial}'], dest))
                require(trials[0].summary() == trials[1].summary(), 'Original archived repeat event receipts differ')
                arms[arm] = trials
            outcomes = [compare(arms['reference'][i], arms['projection'][i]) for i in (0, 1)]
            require(outcomes[0] == outcomes[1], 'Original archived repeat membership differs')
            dest = work / f'{row["name"]}-differences.local.jsonl'
            with dest.open('xb') as output:
                for event in outcomes[0][1]: output.write(encoded(event))
            row.update(audit_status='completed', event_counts={a: v[0].summary() for a, v in arms.items()},
                membership=outcomes[0][0], archived_repeat_equal=True,
                local_difference_sha256=digest(dest))
        except Exception as error:
            (work / f'{row["name"]}-failure.local.txt').write_text(repr(error) + '\n', encoding='utf-8')
            row['reason'] = 'history_integrity_or_membership_contract_failed'
        print(row['name'] + ' ' + row['audit_status'], flush=True)
        write(work / 'progress.local.json', rows)
    # Recheck every original input and all public statuses, not just selected traces.
    verify(archive_root)
    result = {'format': 'depthport.accepted-events-audit.v1', 'protocol_sha256': digest(PROTOCOL),
        'gt_read': False, 'accuracy_scoring': False, 'inference': False, 'tracking_rerun': False,
        'retuned': False, 'weak_stage_changed': False, 'defaults_changed': False,
        'original_records_bytes_unchanged': True, 'original_discovery_completed': old['discovery']['all_scheduled_completed'],
        'original_replication_flags': {k: v['replicated_in_both_reserved'] for k, v in old['confirmation']['confirmation'].items()},
        'original_failures_retained': [s['name'] for s in old['discovery']['ledger'] if s['status'] == 'failed'],
        'sealed_local_inputs_rechecked': len(paths), 'selected_sources': SELECTED,
        'all_selected_audits_completed': all(r['audit_status'] == 'completed' for r in rows if r['name'] in SELECTED),
        'tracking_quality_accepted': False, 'ledger': rows}
    write(RESULT, result)
    return 0 if result['all_selected_audits_completed'] else 1


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('command', choices=('freeze', 'analyze'))
    parser.add_argument('--archive-root', type=Path, required=True, help='Existing ignored artifacts directory; read only')
    args = parser.parse_args()
    if args.command == 'freeze': freeze(args.archive_root)
    else: raise SystemExit(analyze(args.archive_root))
