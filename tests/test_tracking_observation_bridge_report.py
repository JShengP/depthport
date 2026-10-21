# SPDX-License-Identifier: AGPL-3.0-only
"""Public report provenance, denominator and historical-failure contracts."""
import hashlib
import json
from pathlib import Path
from depthport.tracking_observation_bridge import CATEGORIES, GROUPS

ROOT = Path(__file__).resolve().parents[1]


def read(name):
    return json.loads((ROOT / f'docs/validation/{name}.json').read_bytes())


def test_bridge_method_and_prior_records_match_frozen_bytes():
    plan = read('v0.3-observation-bridge-protocol')
    report = read('v0.3-observation-bridge')
    assert hashlib.sha256((ROOT / 'docs/validation/v0.3-observation-bridge-protocol.json').read_bytes()).hexdigest() == report['protocol_sha256']
    for group in ('implementation_sha256', 'source_records_sha256'):
        for name, sha in plan[group].items():
            assert hashlib.sha256((ROOT / name).read_bytes()).hexdigest() == sha
    old = read('v0.3-accepted-events-protocol')
    assert plan['original_local_input_seal']['files'] == len(old['local_input_sha256']) == report['sealed_original_files_rechecked'] == 434


def test_full_scope_preserves_old_failure_nulls_and_unmeasured_sources():
    report = read('v0.3-observation-bridge')
    old = read('v0.3-accepted-events')
    assert len(report['ledger']) == 26
    assert [(r['name'], r['phase'], r['frames']) for r in report['ledger']] == [(r['name'], r['phase'], r['frames']) for r in old['ledger']]
    done = [r for r in report['ledger'] if r['audit_status'] == 'completed']
    assert [r['name'] for r in done] == report['selected_sources'] == ['MOT17-09-DPM', 'MOT17-11-DPM']
    assert sum(r['frames'] for r in done) == report['unique_source_frames'] == 1425
    assert len(done) * 4 == report['archived_histories'] == 8
    assert sum(r['audit_status'] == 'out_of_scope' for r in report['ledger']) == 20
    assert sum(r['audit_status'] == 'unmeasured_original_failure' for r in report['ledger']) == 4
    for r in report['ledger']:
        if r['audit_status'] != 'completed': assert r['bridge'] is None
    assert report['original_failures_retained'] == old['original_failures_retained']
    assert not report['original_discovery_completed']
    assert report['original_replication_flags'] == old['original_replication_flags']
    assert not any(report['original_replication_flags'].values())


def test_bridge_denominators_reconcile_without_passing_old_proxies():
    report = read('v0.3-observation-bridge'); old = read('v0.3-accepted-events')
    for row in report['ledger']:
        if row['audit_status'] != 'completed': continue
        prior = next(r for r in old['ledger'] if r['name'] == row['name'])
        b = row['bridge']; groups = b['groups']
        assert row['archived_repeat_equal'] and b['frames'] == row['frames']
        assert not b['identity_accepted']
        assert len(b['local_bridge_receipt_sha256']) == 64
        assert set(groups) == set(GROUPS)
        assert groups['all_common']['events'] == b['common_anchors'] == prior['membership']['membership']['input_membership']['common']
        assert groups['changed_lineage']['events'] == prior['membership']['common_input_birth_lineage_changes']
        assert groups['lost_original_active']['events'] == prior['membership']['original_proxy_loss_counts']['active']
        assert groups['all_common']['events'] == groups['changed_lineage']['events'] + groups['unchanged_lineage']['events']
        for g in groups.values():
            assert set(g['categories']) == set(g['first_event_per_pair_categories']) == set(CATEGORIES)
            assert all(type(n) is int and n >= 0 for n in g['categories'].values())
            assert sum(g['categories'].values()) == g['events'] == sum(s['events'] for s in g['strata'])
            assert sum(g['first_event_per_pair_categories'].values()) == g['distinct_owner_pairs']
            flags = g['flags']
            assert flags['direct_supported'] + flags['direct_unsupported'] == g['events']
            assert flags['direct_supported'] == sum(g['categories'][c] for c in CATEGORIES[:4])
            for category in CATEGORIES:
                assert sum(s['events'] for s in g['strata'] if s['category'] == category) == g['categories'][category]
        for side in ('reference', 'control'):
            assert sum(int(degree) * n for degree, n in b[side + '_degree_histogram'].items()) == b['graph_edges']
        assert row['original_proxy_gates'] == prior['membership']['original_membership_proxy_gates']
        assert not row['original_proxy_gates']['no_lost_active_update_pairs']


def test_diagnosis_does_not_claim_gt_or_new_tracking_acceptance():
    r = read('v0.3-observation-bridge')
    assert r['original_records_bytes_unchanged'] and r['all_selected_audits_completed']
    assert not any(r[k] for k in ('gt_read', 'accuracy_scoring', 'inference', 'tracking_rerun',
        'retuned', 'weak_stage_changed', 'defaults_changed', 'tracking_quality_accepted', 'independent_confirmation'))
