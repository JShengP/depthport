# SPDX-License-Identifier: AGPL-3.0-only
import copy
import pytest
from depthport.tracking_accepted_events import AcceptedLedger, compare, strict_json


def event(index, birth=(1, 0), stage='high', active=True, confirmed=True, box=None):
    return {'input': (2, index), 'birth': birth, 'stage': stage, 'active': active,
            'pre_confirmed': True, 'confirmed': confirmed, 'posterior_box': box or [0., 0., 2., 2.]}


def ledger(events=(), births=()):
    obj = AcceptedLedger(); obj.frames = 2
    obj.events = {e['input']: e for e in events}; obj.birth_keys = set(births)
    return obj


def test_net_gain_does_not_hide_lost_input_and_all_zero_denominators_stay_zero():
    old = ledger([event(0)], [(1, 0)]); new = ledger([event(1), event(2)], [(1, 1), (1, 2)])
    value, _ = compare(old, new)
    assert value['membership']['input_membership'] == {'reference': 1, 'control': 2, 'common': 0, 'lost': 1, 'added': 2}
    assert value['lost_confirmed_partition']['input_missing'] == 1
    assert value['birth_membership'] == {'reference': 1, 'control': 2, 'lost': 1, 'added': 2}
    empty, _ = compare(ledger(), ledger())
    assert empty['membership']['input_membership'] == dict.fromkeys(('reference', 'control', 'common', 'lost', 'added'), 0)
    assert not empty['identity_or_accuracy_accepted']


def test_weak_to_high_changes_stage_membership_but_does_not_drop_input():
    value, _ = compare(ledger([event(0, stage='weak')]), ledger([event(0)]))
    assert value['membership']['input_membership']['lost'] == 0
    assert value['original_proxy_loss_counts']['weak'] == 1
    assert value['lost_weak_partition'] == {'input_missing': 0, 'moved_to_high': 1}
    assert value['lost_active_partition_priority']['stage_changed'] == 1


@pytest.mark.parametrize('change,reason', [('missing', 'input_missing'), ('birth', 'birth_lineage_changed'),
                                         ('stage', 'stage_changed'), ('role', 'became_retained')])
def test_lost_active_edges_have_exhaustive_disjoint_priority(change, reason):
    new = event(0)
    if change == 'birth': new['birth'] = (1, 1)
    if change == 'stage': new['stage'] = 'weak'
    if change == 'role': new['active'] = False
    result, _ = compare(ledger([event(0)]), ledger([] if change == 'missing' else [new]))
    assert result['lost_active_partition_priority'][reason] == 1
    assert sum(result['lost_active_partition_priority'].values()) == 1


def test_lineage_change_is_not_labelled_true_id_switch_or_geometry_error():
    value, _ = compare(ledger([event(0)]), ledger([event(0, birth=(1, 9), box=[0., 0., 3., 3.])]))
    assert value['common_input_birth_lineage_changes'] == 1
    assert value['common_input_posterior_box_encoding_changes'] == 1
    assert value['membership']['lineage_membership']['lost'] == 1
    assert not value['identity_or_accuracy_accepted']


def state(token=1, confirmed=False):
    return {'token': token, 'tracker_id': 3 if confirmed else -1,
            'bbox': [0., 0., 2., 2.], 'age_since_update': 0}


def history(token=1, native_id=3):
    seed = state(token)
    base = {'input_boxes': [[0., 0., 2., 2.]], 'input_confidences': [.9], 'high_indices': [0], 'weak_indices': [],
            'before_update': [], 'before_predict': [], 'predicted': [], 'after_budget_prune': [], 'stages': [],
            'birth_candidates': [], 'births': [], 'before_lifecycle_prune': [], 'after_update': [], 'removals': []}
    first = copy.deepcopy(base); first.update(frame=1, births=[{'detection_index': 0, 'state': seed,
        'reason': 'unmatched_high_above_activation'}], before_lifecycle_prune=[seed], after_update=[seed])
    after = state(token, True); after['tracker_id'] = native_id
    second = copy.deepcopy(base); second.update(frame=2, before_update=[seed], before_predict=[seed],
        before_lifecycle_prune=[after], after_update=[after], stages=[{'name': 'high_all', 'tracks': [seed],
        'detection_indices': [0], 'matched': [[0, 0]]}])
    return [{'lifecycle': first, 'numerical': {'frame': 1, 'operations': []}, 'geometry': {'frame': 1}},
            {'lifecycle': second, 'numerical': {'frame': 2, 'operations': [{'operation': 'update', 'token': token,
             'phase': 'high_all'}]}, 'geometry': {'frame': 2}}]


def test_native_ids_and_tokens_are_not_cross_arm_join_keys():
    ledgers = []
    for token, ident in ((1, 3), (99, 808)):
        obj = AcceptedLedger()
        for frame in history(token, ident): obj.add(frame)
        ledgers.append(obj)
    result, _ = compare(*ledgers)
    assert result['membership']['stage_lineage_membership']['common'] == 1
    assert result['common_input_birth_lineage_changes'] == 0
    assert ledgers[0].summary()['accepted_high'] == 1
    assert ledgers[0].summary()['tentative_promotions'] == 1


@pytest.mark.parametrize('kind', ['duplicate', 'frame_gap', 'unknown_field', 'missing_birth', 'receipt', 'input'])
def test_corrupt_histories_fail_instead_of_becoming_zero(kind):
    rows = history(); obj = AcceptedLedger(); obj.add(rows[0]); row = rows[1]
    if kind == 'duplicate': row['lifecycle']['stages'][0]['matched'].append([0, 0])
    if kind == 'frame_gap': row['lifecycle']['frame'] = 3
    if kind == 'unknown_field': row['lifecycle']['gt'] = []
    if kind == 'missing_birth': obj.births.clear()
    if kind == 'receipt': row['numerical']['operations'].clear()
    if kind == 'input': row['lifecycle']['weak_indices'] = [0]
    with pytest.raises(ValueError): obj.add(row)


def test_different_input_receipts_cannot_be_compared():
    a, b = ledger(), ledger(); b.input_hash.update(b'different input')
    with pytest.raises(ValueError, match='Same full source'): compare(a, b)


@pytest.mark.parametrize('text', ['{"a":0,"a":1}', '{"a":NaN}', '{"a":Infinity}'])
def test_ambiguous_json_rejected(text):
    with pytest.raises(ValueError): strict_json(text)


def test_complete_scope_keeps_failed_histories_null_and_unchanged_sources_out_of_scope():
    from tools.audit_tracking_accepted_events import selected_ledger, SELECTED
    def scene(name, changed=False, failed=False):
        return {'name': name, 'frames': 1, 'status': 'failed' if failed else 'completed',
            'passes': {'reference-0': {'canonical_prediction_sha256': 'a'},
                       'projection-0': {'canonical_prediction_sha256': 'b' if changed else 'a'}}}
    rows = selected_ledger({'discovery': {'ledger': [scene(n, True) for n in SELECTED] +
        [scene('unchanged'), scene('blocked', failed=True)]}, 'confirmation': {'ledger': []}})
    assert rows[-1]['audit_status'] == 'unmeasured_original_failure' and rows[-1]['event_counts'] is None
    assert rows[-2]['audit_status'] == 'out_of_scope_unchanged_output' and rows[-2]['event_counts'] is None


@pytest.mark.skipif(__import__('os').getenv('RUN_TRACKERS_CONTRACTS') != '1', reason='Optional NumPy2 generated native contract')
@pytest.mark.parametrize('arm', ['reference', 'projection'])
@pytest.mark.parametrize('outcome', ['high', 'weak', 'unmatched'])
def test_actual_generated_native_history_schema_and_reconciliation(arm, outcome):
    from tests.test_tracking_carrier_roles import generated_history
    obj = AcceptedLedger()
    for row in generated_history(10, arm, outcome): obj.add(row)
    value = obj.summary()
    assert value['births'] == (2 if outcome == 'unmatched' else 1)
    assert value['accepted_inputs'] == (0 if outcome == 'unmatched' else 1)
    assert value['accepted_weak'] == int(outcome == 'weak')
    assert value['tentative_promotions'] == int(outcome != 'unmatched')
