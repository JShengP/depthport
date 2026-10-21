#!/usr/bin/env python3
# SPDX-License-Identifier: AGPL-3.0-only
"""Freeze then audit causal observation bridges without GT or tracker execution."""
import argparse
from datetime import datetime, timezone
import gzip
import hashlib
from itertools import zip_longest
from pathlib import Path
import platform
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from depthport.tracking_accepted_events import AcceptedLedger, compare, encoded, require, strict_json
from depthport.tracking_observation_bridge import PastBridge
from tools.audit_tracking_accepted_events import digest, write, input_paths, check_inputs, records

PREVIOUS = ('docs/validation/v0.3-accepted-events-protocol.json',
            'docs/validation/v0.3-accepted-events.json')
FILES = ('depthport/tracking_observation_bridge.py', 'tools/audit_tracking_observation_bridge.py',
         'tests/test_tracking_observation_bridge.py')
PROTOCOL = ROOT / 'docs/validation/v0.3-observation-bridge-protocol.json'
RESULT = ROOT / 'docs/validation/v0.3-observation-bridge.json'
WORK = ROOT / 'artifacts/tracking-observation-bridge'
SELECTED = ['MOT17-09-DPM', 'MOT17-11-DPM']


def previous():
    return [strict_json((ROOT / name).read_bytes()) for name in PREVIOUS]


def scope_rows():
    rows = []
    for old in previous()[1]['ledger']:
        status = 'scheduled' if old['name'] in SELECTED else (
            'unmeasured_original_failure' if old['audit_status'] == 'unmeasured_original_failure' else 'out_of_scope')
        rows.append({'name': old['name'], 'phase': old['phase'], 'frames': old['frames'],
                     'prior_audit_status': old['audit_status'], 'audit_status': status, 'bridge': None})
    return rows


def freeze(archive_root):
    require(not PROTOCOL.exists() and not WORK.exists(), 'No overwrite or retry')
    prior, result = previous()
    require([r['name'] for r in result['ledger'] if r.get('membership', {}).get(
        'original_membership_proxy_gates', {}).get('no_lost_active_update_pairs') is False] == SELECTED,
        'Predeclared two failed proxies required')
    paths = input_paths(archive_root, records())
    check_inputs(paths, prior['local_input_sha256'])
    sealed = {**prior['implementation_sha256'], **prior['source_records_sha256'],
              **{p: digest(ROOT / p) for p in PREVIOUS}}
    for name, sha in sealed.items(): require(digest(ROOT / name) == sha, 'Prior public seal differs')
    plan = {'format': 'depthport.observation-bridge-protocol.v1',
        'frozen_at_utc': datetime.now(timezone.utc).isoformat(), 'report_date_local': '2026-10-22',
        'base_commit': subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT, text=True).strip(),
        'audit_python': platform.python_version(), 'selected_sources': SELECTED,
        'implementation_sha256': {p: digest(ROOT / p) for p in FILES},
        'source_records_sha256': sealed,
        'original_local_input_seal': {'record': PREVIOUS[0], 'field': 'local_input_sha256', 'files': len(paths)},
        'prior_information': {'accepted_input_loss': [0, 0], 'changed_seed_lineages': [51, 39],
            'lost_original_active_keys': [51, 38], 'all_sources_previously_seen': True},
        'ledger': scope_rows(),
        'definitions': {
            'scope': 'Prospective local definition freeze after public accepted-event aggregates, before new bridge extraction. Two previously failed scenes, complete525+900 frames, two archived trials per arm/eight histories. No new source, independent confirmation or external preregistration.',
            'anchor': 'At frame f use ONLY original accepted input keys (t,original detection index) common to both arms with t<f. Incremental prefix intersection, never full-sequence hindsight. Birth seeds, unmatched inputs, single-arm updates, current-frame high/weak updates and future observations cannot anchor. Whole-frame barrier is deliberately stricter than per-stage availability. All accepted high/weak and tentative/confirmed observations qualify equally; no fitted support threshold.',
            'ownership': 'Vertices are per-arm immutable birth(frame,index) keys; equal labels across arms alone are no evidence. Native tokens recover ownership only within one arm; never cross-arm joins. Edge(r,c) exists iff at least one common accepted past observation belongs to those owners. Preserve all edges/support counts forever in this descriptive history graph, including retired lineages; no temporal decay, role eligibility or intervention. A transitive path alone is not a direct bridge.',
            'categories': 'Exclusive priority: direct edge and degrees1/1=unique_continuation;1/>1=merge_relation (multiple reference owners to control);>1/1=split_relation;>1/>1=many_to_many_relation. No direct edge: both positive degrees=unbridged_known_chains; reference degree0 only=missing_reference_support; control degree0 only=missing_control_support; both0=missing_both_support. Indirect connectivity, empty accepted history vs only noncommon history are separate flags. Merge/split describes observation-chain ownership, not true physical identity.',
            'denominators': 'Classify every common accepted input before committing any current anchors. Separately aggregate all_common, changed_lineage, unchanged_lineage and lost_original_active keys. Preserve all8 categories including zeros, per-group distinct owner-pair first-event categories, stage and predecision active/retained x tentative/confirmed strata. Denominators overlap explicitly; do not sum groups as independent cases. Lost-active includes original current owner/stage/role proxy semantics, never redefines its gate.',
            'integrity': 'Reuse immutable AcceptedLedger validation. Read only eight compressed histories and pinned GT-free public records; stream every dense frame. Match complete original input/event receipts and original compare() memberships to previous report; raw JSONL and its digest local. Both archived trials independently analyzed, require exact summaries/ordered receipts. Recheck434 original byte hashes and all old source pins before/after. Pickles hash only; never load. No GT/media/cache/evaluator/solver/inference/tracker reads or execution.',
            'failure': 'No overwrite, retry, imputation or source selection by outcome. Any inconsistent source failed with null bridge and local exception; keep26-row scope ledger, four old KITTI failures/nulls, out-of-scope counts null, incomplete discovery and eight false replication flags. Repeat trials add no independent evidence.',
            'decision': 'Descriptive diagnosis only, no tuning/intervention/default or weak-stage change. Original two failed proxies remain failed regardless of bridge result. Chains are not physical identities: no FN/FP/IDSW/HOTA, merge correctness or true-harm acceptance. Missing evidence stays unknown. Choose further prospective diagnosis only after seeing complete frozen outcomes.',
            'publication': 'Public source-level aggregate counts, denominators, role/stage strata and hashes only. Per-frame keys, owners, IDs, boxes, histories, cases, exceptions and local paths remain ignored local artifacts. Inherit reviewed MOT/KITTI noncommercial research terms; no raw media/GT/results redistribution.'}}
    write(PROTOCOL, plan); write(WORK / 'seal.local.json', {'protocol_sha256': digest(PROTOCOL)})
    print({'protocol_sha256': digest(PROTOCOL), 'sealed_original_files': len(paths), 'bridge_extraction': False})


def verify(archive_root):
    plan = strict_json(PROTOCOL.read_bytes())
    require(strict_json((WORK / 'seal.local.json').read_bytes())['protocol_sha256'] == digest(PROTOCOL), 'Freeze seal differs')
    require(platform.python_version() == plan['audit_python'], 'Frozen audit interpreter required')
    for group in ('implementation_sha256', 'source_records_sha256'):
        for p, sha in plan[group].items(): require(digest(ROOT / p) == sha, 'Frozen public source differs: ' + p)
    paths = input_paths(archive_root, records())
    check_inputs(paths, previous()[0]['local_input_sha256'])
    return plan, paths


def audit_pair(ref_path, ctrl_path, expected, dest):
    ledgers = [AcceptedLedger(), AcceptedLedger()]; bridge = PastBridge()
    receipts = [hashlib.sha256(), hashlib.sha256()]
    with gzip.open(ref_path, 'rb') as ref, gzip.open(ctrl_path, 'rb') as ctrl, dest.open('xb') as output:
        for lines in zip_longest(ref, ctrl):
            require(all(line is not None for line in lines), 'Unequal frame counts')
            events = []
            for i, line in enumerate(lines):
                receipts[i].update(line)
                raw = ledgers[i].add(strict_json(line))
                events.append({tuple(e['input']): e for e in raw if e['kind'] == 'accepted'})
            require(ledgers[0].input_hash.digest() == ledgers[1].input_hash.digest(), 'Per-frame original input prefix differs')
            for row in bridge.add(ledgers[0].frames, *events): output.write(encoded(row))
    for i, arm in enumerate(('reference', 'projection')):
        require(receipts[i].hexdigest() == expected[arm]['trace_sha256'], 'Original uncompressed history differs')
    return bridge.summary(), ledgers


def analyze(archive_root):
    plan, paths = verify(archive_root)
    work = WORK / 'run'
    require(not work.exists() and not RESULT.exists(), 'No overwrite or retry')
    work.mkdir(); rows = scope_rows(); old = records(); prior = previous()[1]
    for row in rows:
        if row['audit_status'] != 'scheduled': continue
        row['audit_status'] = 'failed'
        try:
            scene = next(s for s in old['discovery']['ledger'] if s['name'] == row['name'])
            previous_row = next(s for s in prior['ledger'] if s['name'] == row['name'])
            outcomes = []
            for trial in (0, 1):
                keys = {a: '/'.join(('discovery', row['name'], f'{a}-{trial}', 'trace.local.jsonl.gz'))
                        for a in ('reference', 'projection')}
                expected = {a: scene['passes'][f'{a}-{trial}'] for a in keys}
                dest = work / f'{row["name"]}-{trial}.bridge.local.jsonl'
                outcome, ledgers = audit_pair(paths[keys['reference']], paths[keys['projection']], expected, dest)
                for i, arm in enumerate(keys):
                    require(ledgers[i].summary() == previous_row['event_counts'][arm], 'Prior event receipt/count differs')
                require(compare(*ledgers)[0] == previous_row['membership'], 'Prior proxy/membership differs')
                require(outcome['groups']['lost_original_active']['events'] == previous_row['membership']['original_proxy_loss_counts']['active'], 'Active denominator differs')
                require(outcome['groups']['changed_lineage']['events'] == previous_row['membership']['common_input_birth_lineage_changes'], 'Lineage denominator differs')
                require(outcome['local_bridge_receipt_sha256'] == digest(dest), 'Bridge receipt differs')
                outcomes.append(outcome)
            require(outcomes[0] == outcomes[1], 'Archived repeat bridges differ')
            row.update(audit_status='completed', bridge=outcomes[0], archived_repeat_equal=True,
                original_proxy_gates=previous_row['membership']['original_membership_proxy_gates'])
        except Exception as error:
            (work / f'{row["name"]}-failure.local.txt').write_text(repr(error) + '\n', encoding='utf-8')
            row['reason'] = 'history_or_bridge_contract_failed'
        print(row['name'] + ' ' + row['audit_status'], flush=True)
        write(work / 'progress.local.json', rows)
    verify(archive_root)
    result = {'format': 'depthport.observation-bridge-audit.v1', 'protocol_sha256': digest(PROTOCOL),
        'selected_sources': SELECTED, 'unique_source_frames': 1425, 'archived_histories': 8,
        'all_selected_audits_completed': all(r['audit_status'] == 'completed' for r in rows if r['name'] in SELECTED),
        'sealed_original_files_rechecked': len(paths), 'original_records_bytes_unchanged': True,
        'original_discovery_completed': prior['original_discovery_completed'],
        'original_replication_flags': prior['original_replication_flags'],
        'original_failures_retained': prior['original_failures_retained'],
        **{k: False for k in ('gt_read', 'accuracy_scoring', 'inference', 'tracking_rerun',
            'retuned', 'weak_stage_changed', 'defaults_changed', 'tracking_quality_accepted', 'independent_confirmation')},
        'ledger': rows}
    write(RESULT, result)
    return 0 if result['all_selected_audits_completed'] else 1


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('command', choices=('freeze', 'analyze'))
    parser.add_argument('--archive-root', type=Path, required=True)
    args = parser.parse_args()
    if args.command == 'freeze': freeze(args.archive_root)
    else: raise SystemExit(analyze(args.archive_root))
