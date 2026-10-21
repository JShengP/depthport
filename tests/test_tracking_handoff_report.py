# SPDX-License-Identifier: AGPL-3.0-only
"""Evidence provenance, causal-pane and privacy contracts for public aggregates."""
import hashlib
import json
from pathlib import Path
from depthport.tracking_handoff_audit import STATUSES, TARGETS, ACTIONS
from depthport.tracking_observation_bridge import CATEGORIES

ROOT = Path(__file__).resolve().parents[1]


def read(name): return json.loads((ROOT / f'docs/validation/{name}.json').read_bytes())


def test_handoff_method_prior_sources_and_original_seal_are_unchanged():
    p = read('v0.3-handoff-audit-protocol'); r = read('v0.3-handoff-audit')
    assert hashlib.sha256((ROOT / 'docs/validation/v0.3-handoff-audit-protocol.json').read_bytes()).hexdigest() == r['protocol_sha256']
    for group in ('implementation_sha256', 'source_records_sha256'):
        for name, sha in p[group].items(): assert hashlib.sha256((ROOT / name).read_bytes()).hexdigest() == sha
    assert p['original_local_input_seal']['files'] == r['sealed_original_files_rechecked'] == len(read('v0.3-accepted-events-protocol')['local_input_sha256']) == 434
    assert r['original_records_bytes_unchanged'] and r['all_selected_audits_completed']


def test_complete_scope_and_original_failed_gates_are_retained():
    r = read('v0.3-handoff-audit'); previous = read('v0.3-observation-bridge')
    assert len(r['ledger']) == 26
    assert [(x['name'], x['phase'], x['frames']) for x in r['ledger']] == [(x['name'], x['phase'], x['frames']) for x in previous['ledger']]
    done = [x for x in r['ledger'] if x['audit_status'] == 'completed']
    assert [x['name'] for x in done] == r['selected_sources'] == ['MOT17-09-DPM', 'MOT17-11-DPM']
    assert sum(x['frames'] for x in done) == r['unique_source_frames'] == 1425
    assert len(done) * 4 == r['archived_histories'] == 8
    assert sum(x['audit_status'] == 'out_of_scope' for x in r['ledger']) == 20
    assert sum(x['audit_status'] == 'unmeasured_original_failure' for x in r['ledger']) == 4
    for x in r['ledger']:
        if x['audit_status'] != 'completed': assert x['handoff'] is None
        else:
            old = next(z for z in previous['ledger'] if z['name'] == x['name'])
            assert x['archived_repeat_equal'] and len(x['local_case_receipt_sha256']) == 64
            assert x['handoff']['original_bridge_receipt_sha256'] == old['bridge']['local_bridge_receipt_sha256']
            assert x['original_proxy_gates'] == old['original_proxy_gates']
            assert not x['original_proxy_gates']['no_lost_active_update_pairs']
    for key in ('original_discovery_completed', 'original_replication_flags', 'original_failures_retained'):
        assert r[key] == previous[key]
    assert not r['original_discovery_completed'] and not any(r['original_replication_flags'].values())


def test_four_frozen_targets_and_all_suffix_role_denominators_reconcile():
    r = read('v0.3-handoff-audit'); p = read('v0.3-handoff-audit-protocol')
    total = 0
    for row in r['ledger']:
        if row['audit_status'] != 'completed': continue
        h = row['handoff']; total += h['boundaries']
        assert [h['groups'][k]['boundaries'] for k in TARGETS] == p['expected_target_categories'][row['name']]
        assert sum(g['boundaries'] for g in h['groups'].values()) == h['boundaries']
        assert h['frames'] == row['frames'] and not h['identity_accepted']
        assert not h['current_or_future_used_as_prior_evidence']
        for g in h['groups'].values():
            for owner in g['owners'].values():
                assert set(owner['statuses']) == set(owner['source_end_statuses']) == set(STATUSES)
                assert set(owner['birth_input_other_arm']) == set(ACTIONS)
                assert sum(owner['statuses'].values()) == sum(owner['birth_input_other_arm'].values()) == sum(owner['source_end_statuses'].values()) == g['boundaries']
                assert 0 <= owner['source_end_censored'] <= g['boundaries']
            for neighbors in g['past_neighbors'].values():
                assert sum(neighbors['statuses'].values()) == neighbors['neighbors']
                assert neighbors['recorded_prior_removal'] == sum(n for status, n in neighbors['statuses'].items() if status.startswith('removed_'))
            counts = g['following_same_pair_categories']
            assert set(counts) == set(CATEGORIES)
            assert sum(counts.values()) == sum(s['events'] for s in g['following_same_pair_strata'])
            for c in CATEGORIES: assert counts[c] == sum(s['events'] for s in g['following_same_pair_strata'] if s['category'] == c)
    assert total == 4


def test_public_report_contains_no_individual_case_or_identity_fields():
    r = read('v0.3-handoff-audit')
    forbidden = {'input', 'owners_prior', 'prefix', 'current', 'local_following', 'birth', 'local_token',
                 'tracker_id', 'bbox', 'frame', 'removal', 'reference_birth', 'control_birth'}
    def walk(value):
        if isinstance(value, dict):
            if 'birth' in value:
                assert set(value) == set(ACTIONS)
                assert all(type(n) is int and n >= 0 for n in value.values())
            else:
                assert not set(value) & forbidden
            for v in value.values(): walk(v)
        elif isinstance(value, list):
            for v in value: walk(v)
    walk(r)
    assert not any(r[k] for k in ('gt_read', 'accuracy_scoring', 'inference', 'tracking_rerun', 'retuned',
        'weak_stage_changed', 'defaults_changed', 'tracking_quality_accepted', 'independent_confirmation'))
