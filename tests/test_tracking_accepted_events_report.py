# SPDX-License-Identifier: AGPL-3.0-only
"""Public evidence preserves denominators, prior failures and sealed originals."""
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(name):
    return json.loads((ROOT / ('docs/validation/' + name + '.json')).read_text())


def test_original_sources_and_public_statuses_remain_sealed():
    plan = read('v0.3-accepted-events-protocol')
    result = read('v0.3-accepted-events')
    assert hashlib.sha256((ROOT / 'docs/validation/v0.3-accepted-events-protocol.json').read_bytes()).hexdigest() == result['protocol_sha256']
    for group in ('implementation_sha256', 'source_records_sha256'):
        for name, expected in plan[group].items():
            assert hashlib.sha256((ROOT / name).read_bytes()).hexdigest() == expected
    assert len(plan['local_input_sha256']) == result['sealed_local_inputs_rechecked'] == 434
    assert result['original_records_bytes_unchanged'] and not result['original_discovery_completed']
    assert result['original_failures_retained'] == [f'KITTI-{i:04d}' for i in range(4)]
    assert not any(result['original_replication_flags'].values())
    assert not any(result[k] for k in ('gt_read', 'accuracy_scoring', 'inference', 'tracking_rerun',
        'retuned', 'weak_stage_changed', 'defaults_changed', 'tracking_quality_accepted'))


def test_full_ledger_keeps_unmeasured_and_out_of_scope_counts_null():
    result = read('v0.3-accepted-events')
    assert len(result['ledger']) == 26
    done = [r for r in result['ledger'] if r['audit_status'] == 'completed']
    assert [r['name'] for r in done] == result['selected_sources']
    assert sum(r['frames'] for r in done) == 2010
    assert sum(r['audit_status'] == 'unmeasured_original_failure' for r in result['ledger']) == 4
    assert sum(r['audit_status'] == 'out_of_scope_unchanged_output' for r in result['ledger']) == 19
    for row in result['ledger']:
        if row['audit_status'] != 'completed':
            assert row['event_counts'] is None


def test_published_membership_and_original_proxy_partitions_reconcile():
    result = read('v0.3-accepted-events')
    for row in result['ledger']:
        if row['audit_status'] != 'completed': continue
        counts, compare = row['event_counts'], row['membership']
        assert row['archived_repeat_equal']
        for v in compare['membership'].values():
            assert v['reference'] == v['common'] + v['lost']
            assert v['control'] == v['common'] + v['added']
            assert v['control'] - v['reference'] == v['added'] - v['lost']
        assert sum(compare['lost_weak_partition'].values()) == compare['original_proxy_loss_counts']['weak']
        assert sum(compare['lost_confirmed_partition'].values()) == compare['original_proxy_loss_counts']['confirmed']
        assert sum(compare['lost_active_partition_priority'].values()) == compare['original_proxy_loss_counts']['active']
        v = compare['membership']['input_membership']
        assert v['control'] - v['reference'] == sum(counts['projection']['accepted_' + stage]
            - counts['reference']['accepted_' + stage] for stage in ('high', 'weak'))
        assert not compare['identity_or_accuracy_accepted']
