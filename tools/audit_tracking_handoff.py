#!/usr/bin/env python3
# SPDX-License-Identifier: AGPL-3.0-only
"""Freeze/read sealed handoff histories; never run models, tracking or scoring."""
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
from depthport.tracking_handoff_audit import HandoffAudit, TARGETS
from tools.audit_tracking_accepted_events import digest, write, input_paths, check_inputs, records
from tools.audit_tracking_observation_bridge import scope_rows as prior_scope

PROTOCOL = ROOT / 'docs/validation/v0.3-handoff-audit-protocol.json'
RESULT = ROOT / 'docs/validation/v0.3-handoff-audit.json'
WORK = ROOT / 'artifacts/tracking-handoff-audit'
PREVIOUS = ('docs/validation/v0.3-observation-bridge-protocol.json', 'docs/validation/v0.3-observation-bridge.json')
FILES = ('depthport/tracking_handoff_audit.py', 'tools/audit_tracking_handoff.py', 'tests/test_tracking_handoff_audit.py')
SELECTED = ['MOT17-09-DPM', 'MOT17-11-DPM']
EXPECTED = {'MOT17-09-DPM': [2, 0], 'MOT17-11-DPM': [1, 1]}


def read(path): return strict_json((ROOT / path).read_bytes())


def scope_rows():
    return [{k: v for k, v in r.items() if k != 'bridge'} | {'handoff': None} for r in prior_scope()]


def freeze(archive_root):
    require(not PROTOCOL.exists() and not WORK.exists(), 'No overwrite or retry')
    prior = read(PREVIOUS[0]); previous = read(PREVIOUS[1])
    sealed = {**prior['source_records_sha256'], **prior['implementation_sha256'],
        **{p: digest(ROOT / p) for p in (*PREVIOUS, 'depthport/tracking_lifecycle_probe.py')}}
    for name, sha in sealed.items(): require(digest(ROOT / name) == sha, 'Prior public seal differs')
    for r in previous['ledger']:
        if r['name'] in SELECTED:
            counts = r['bridge']['groups']['lost_original_active']['categories']
            require([counts[k] for k in TARGETS] == EXPECTED[r['name']], 'Predeclared four boundary counts differ')
    paths = input_paths(archive_root, records())
    check_inputs(paths, read('docs/validation/v0.3-accepted-events-protocol.json')['local_input_sha256'])
    plan = {'format': 'depthport.handoff-audit-protocol.v1', 'report_date_local': '2026-10-22',
        'frozen_at_utc': datetime.now(timezone.utc).isoformat(),
        'base_commit': subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT, text=True).strip(),
        'audit_python': platform.python_version(), 'implementation_sha256': {p: digest(ROOT / p) for p in FILES},
        'source_records_sha256': sealed, 'selected_sources': SELECTED, 'expected_target_categories': EXPECTED,
        'original_local_input_seal': {'record': 'docs/validation/v0.3-accepted-events-protocol.json',
            'field': 'local_input_sha256', 'files': len(paths)}, 'ledger': scope_rows(),
        'prior_information': 'Previous bridge audit already found3 empty-reference-history and1 established unbridged event among89 lost-active keys;85 supported merges and10 broader split relations. All sources already seen. No new boundary context or suffix extracted before this local definition freeze.',
        'definitions': {
            'scope': 'All525+900 original frames, two original archived trials per arm/eight histories. Targets are exactly original lost-active common inputs whose frozen past bridge category is missing_reference_support or unbridged_known_chains. Fixed2/0 and1/1 expected counts; mismatch fails source/null, no case replacement or outcome-based selection. Four event boundaries are not necessarily four physical incidents, independent samples or independent confirmation.',
            'time': 'Evidence query at frame f accesses only Timeline committed through f-1 plus the validated before_update role. All births, accepted updates, cross-arm birth-input actions and removal records must have t<f. Snapshot evidence before current graph/timeline commits. Current accepted event identifies the previously frozen boundary and has a separate result pane; it never anchors itself. The entire suffix f+1..source-end is descriptive, never repairs the prior snapshot.',
            'birth': 'Immutable within-arm birth(frame,index) receipt and original unmatched-high reason; birth is NOT an accepted observation or identity anchor. At the same past seed input in the other arm, record birth, accepted_high/weak (owner/predecision role), unaccepted or missing_evidence. Same source input verified by original receipts, not box/ID similarity. No inferred reason for unaccepted inputs and no parameter/eligibility adjustment.',
            'accepted': 'Record all original pre-f owner accepted updates, including high/weak, active/retained and tentative/confirmed roles. Keep empty history separate from missing birth/evidence. Retrieve every direct past graph neighbor and its own birth/accepted/removal evidence; graph includes retired owners, not merely current competitors. Native tokens identify owners only within one arm, never join arms.',
            'expiry': 'Require complete explicit before_lifecycle_prune minus after_update removal receipts and recorded reason expired/immature_unmatched/expired_and_immature; never infer expiry from absence, age, lack of an update or a future deletion. No lifetime threshold recomputation or change. Query live owners as active/retained x confirmed/tentative; removed neighbors retain explicit prior reason. No prior removal means only no recorded removal through f-1. End-of-source live owners are censored, not expired.',
            'suffix': 'Keep each target pair fixed. For every later common input, record original causal graph category/role/stage for that pair, or changed counterpart touching either owner; separately count later per-arm high/weak owner updates and source-end removal/censoring. Read complete suffix, no fitted window. Cases may share owners and suffixes, so these are case-exposures, not unique events/people or independent trials. Current frame excluded from all following counts.',
            'integrity': 'Strict original AcceptedLedger and native uncompressed-history/input/event receipts; complete previous bridge summary/ordered receipt and previous accepted-event memberships must match. Two archived repeats independently read with identical complete raw case receipt and aggregate. Verify434 original files and all prior public/code seals before/after; pickle hash only. No GT/scores/media/cache/evaluator/solver/inference/tracker execution or tuning. No weak continuation, geometry, confirmation/buffer or default change.',
            'failure': 'Refuse overwrite/retry. Source failures retain null results and local exceptions. Keep26 source rows,20 out-of-scope nulls/four old failures nulls, incomplete discovery/eight false formal replication flags and both failed original active proxies. No retrospective gate relaxation, new identity/quality acceptance or intervention.',
            'publication': 'Only source/category aggregate counts, denominators, roles/stages, nulls/statuses and hashes. No per-case frame, input, birth/owner/token/ID, box, raw update/removal histories or local paths. Raw cases stay ignored local. Inherit reviewed MOT/KITTI noncommercial research terms; no media/GT/raw-result redistribution.'}}
    write(PROTOCOL, plan); write(WORK / 'seal.local.json', {'protocol_sha256': digest(PROTOCOL)})
    print({'protocol_sha256': digest(PROTOCOL), 'sealed_original_files': len(paths), 'case_extraction': False})


def verify(archive_root):
    plan = strict_json(PROTOCOL.read_bytes())
    require(digest(PROTOCOL) == strict_json((WORK / 'seal.local.json').read_bytes())['protocol_sha256'], 'Freeze seal differs')
    require(platform.python_version() == plan['audit_python'], 'Frozen interpreter required')
    for group in ('implementation_sha256', 'source_records_sha256'):
        for path, sha in plan[group].items(): require(digest(ROOT / path) == sha, 'Frozen source differs: ' + path)
    paths = input_paths(archive_root, records())
    check_inputs(paths, read('docs/validation/v0.3-accepted-events-protocol.json')['local_input_sha256'])
    return plan, paths


def audit_pair(paths, expected, dest):
    ledgers = [AcceptedLedger(), AcceptedLedger()]; bridge = PastBridge(); audit = HandoffAudit()
    receipts = [hashlib.sha256(), hashlib.sha256()]
    with gzip.open(paths[0], 'rb') as ref, gzip.open(paths[1], 'rb') as ctrl:
        for lines in zip_longest(ref, ctrl):
            require(all(line is not None for line in lines), 'Unequal complete histories')
            records_here = [strict_json(line) for line in lines]; events = []
            for i, record in enumerate(records_here):
                receipts[i].update(lines[i]); raw = ledgers[i].add(record)
                events.append({tuple(e['input']): e for e in raw if e['kind'] == 'accepted'})
            require(ledgers[0].input_hash.digest() == ledgers[1].input_hash.digest(), 'Original input prefix differs')
            audit.add([r['lifecycle'] for r in records_here], events, bridge)
    for i, exp in enumerate(expected): require(receipts[i].hexdigest() == exp['trace_sha256'], 'Original history seal differs')
    result = audit.finish()
    with dest.open('xb') as output:
        for case in audit.cases: output.write(encoded(case))
    return result, ledgers, bridge.summary()


def analyze(archive_root):
    plan, paths = verify(archive_root); work = WORK / 'run'
    require(not work.exists() and not RESULT.exists(), 'No overwrite or retry'); work.mkdir()
    rows = scope_rows(); prior = read(PREVIOUS[1]); accepted = read('docs/validation/v0.3-accepted-events.json')
    old = records()
    for row in rows:
        if row['audit_status'] != 'scheduled': continue
        row['audit_status'] = 'failed'
        try:
            scene = next(s for s in old['discovery']['ledger'] if s['name'] == row['name'])
            prior_row = next(r for r in prior['ledger'] if r['name'] == row['name'])
            accepted_row = next(r for r in accepted['ledger'] if r['name'] == row['name'])
            outcomes = []; hashes = []
            for trial in (0, 1):
                arms = ('reference', 'projection')
                keys = ['/'.join(('discovery', row['name'], f'{a}-{trial}', 'trace.local.jsonl.gz')) for a in arms]
                dest = work / f'{row["name"]}-{trial}.cases.local.jsonl'
                outcome, ledgers, bridge = audit_pair([paths[k] for k in keys], [scene['passes'][f'{a}-{trial}'] for a in arms], dest)
                require(bridge == prior_row['bridge'], 'Complete previous causal bridge differs')
                for arm, ledger in zip(arms, ledgers): require(ledger.summary() == accepted_row['event_counts'][arm], 'Original event receipt differs')
                require(compare(*ledgers)[0] == accepted_row['membership'], 'Original membership/proxies differ')
                require([outcome['groups'][k]['boundaries'] for k in TARGETS] == EXPECTED[row['name']], 'Frozen boundary counts differ')
                outcomes.append(outcome); hashes.append(digest(dest))
            require(outcomes[0] == outcomes[1] and hashes[0] == hashes[1], 'Archived repeat evidence/suffix differs')
            row.update(audit_status='completed', handoff=outcomes[0], local_case_receipt_sha256=hashes[0],
                archived_repeat_equal=True, original_proxy_gates=prior_row['original_proxy_gates'])
        except Exception as error:
            (work / f'{row["name"]}-failure.local.txt').write_text(repr(error) + '\n', encoding='utf-8')
            row['reason'] = 'handoff_history_contract_failed'
        print(row['name'] + ' ' + row['audit_status'], flush=True); write(work / 'progress.local.json', rows)
    verify(archive_root)
    result = {'format': 'depthport.handoff-audit.v1', 'protocol_sha256': digest(PROTOCOL),
        'selected_sources': SELECTED, 'unique_source_frames': 1425, 'archived_histories': 8,
        'all_selected_audits_completed': all(r['audit_status'] == 'completed' for r in rows if r['name'] in SELECTED),
        'sealed_original_files_rechecked': len(paths), 'original_records_bytes_unchanged': True,
        **{k: prior[k] for k in ('original_discovery_completed', 'original_replication_flags', 'original_failures_retained')},
        **{k: False for k in ('gt_read', 'accuracy_scoring', 'inference', 'tracking_rerun', 'retuned',
            'weak_stage_changed', 'defaults_changed', 'tracking_quality_accepted', 'independent_confirmation')}, 'ledger': rows}
    write(RESULT, result); return 0 if result['all_selected_audits_completed'] else 1


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('command', choices=('freeze', 'analyze'))
    parser.add_argument('--archive-root', type=Path, required=True); args = parser.parse_args()
    if args.command == 'freeze': freeze(args.archive_root)
    else: raise SystemExit(analyze(args.archive_root))
