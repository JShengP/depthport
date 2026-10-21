# SPDX-License-Identifier: AGPL-3.0-only
"""Synthetic causal contracts; no native tracker, media or GT."""
import pytest
from depthport.tracking_observation_bridge import PastBridge, CATEGORIES


def event(frame, index, birth, stage='high', active=True, confirmed=True, **extra):
    return {'input': (frame, index), 'birth': birth, 'stage': stage, 'active': active,
            'pre_confirmed': confirmed, **extra}


def feed(bridge, owners, **kwargs):
    f = bridge.frame + 1
    ref = { (f, i): event(f, i, a, **kwargs) for i, (a, b) in enumerate(owners)}
    ctrl = {(f, i): event(f, i, b, **kwargs) for i, (a, b) in enumerate(owners)}
    return bridge.add(f, ref, ctrl)


def fresh():
    b = PastBridge(); b.add(1, {}, {}); return b


def seed(bridge, pairs):
    for pair in pairs: feed(bridge, [pair])


def test_same_birth_labels_are_not_evidence_and_same_frame_cannot_bootstrap():
    b = fresh(); pair = ((1, 0), (1, 0))
    rows = feed(b, [pair])
    assert rows[0]['category'] == 'missing_both_support'
    assert rows[0]['past_common_pair_anchors'] == 0
    assert feed(b, [pair])[0]['past_common_pair_anchors'] == 1
    # Two one-to-one current edges must both use the old graph snapshot.
    rows = feed(b, [((1, 0), (1, 2)), ((1, 3), (1, 0))])
    assert [r['category'] for r in rows] == ['missing_control_support', 'missing_reference_support']
    assert [r['past_common_pair_anchors'] for r in rows] == [0, 0]


@pytest.mark.parametrize('stage', ['high', 'weak'])
@pytest.mark.parametrize('confirmed', [False, True])
def test_all_original_accepted_stages_and_roles_supply_past_evidence(stage, confirmed):
    b = fresh(); pair = ((1, 0), (1, 1))
    feed(b, [pair], stage=stage, active=False, confirmed=confirmed)
    r = feed(b, [pair], stage=stage, active=False, confirmed=confirmed)[0]
    assert r['category'] == 'unique_continuation'
    assert r['reference_role'] == 'retained_' + ('confirmed' if confirmed else 'tentative')


@pytest.mark.parametrize('pairs,category', [
    ([((1, 0), (1, 2))], 'unique_continuation'),
    ([((1, 0), (1, 2)), ((1, 1), (1, 2))], 'merge_relation'),
    ([((1, 0), (1, 2)), ((1, 0), (1, 3))], 'split_relation'),
    ([((1, 0), (1, 2)), ((1, 1), (1, 2)), ((1, 0), (1, 3))], 'many_to_many_relation')])
def test_direct_graph_topology(pairs, category):
    b = fresh(); seed(b, pairs)
    assert b.classify((1, 0), (1, 2))['category'] == category


def test_missing_one_side_and_known_disconnected_are_distinct():
    b = fresh(); seed(b, [((1, 0), (1, 2)), ((1, 1), (1, 3))])
    assert b.classify((1, 0), (1, 3))['category'] == 'unbridged_known_chains'
    assert not b.classify((1, 0), (1, 3))['indirect_connected_without_direct']
    assert b.classify((1, 4), (1, 2))['category'] == 'missing_reference_support'
    assert b.classify((1, 0), (1, 4))['category'] == 'missing_control_support'


def test_transitive_path_does_not_create_direct_support():
    b = fresh(); seed(b, [((1, 0), (1, 2)), ((1, 1), (1, 2)), ((1, 1), (1, 3))])
    info = b.classify((1, 0), (1, 3))
    assert info['category'] == 'unbridged_known_chains'
    assert info['indirect_connected_without_direct']
    assert info['past_common_pair_anchors'] == 0


def test_noncommon_updates_count_history_but_never_bridge():
    b = fresh()
    b.add(2, {(2, 0): event(2, 0, (1, 0))}, {(2, 1): event(2, 1, (1, 2))})
    info = b.classify((1, 0), (1, 2))
    assert info['category'] == 'missing_both_support'
    assert info['reference_only_noncommon_history'] and info['control_only_noncommon_history']
    assert not info['reference_accepted_history_empty']
    assert b.summary()['common_anchors'] == 0


def test_future_cannot_change_frozen_prefix_or_previous_rows():
    b = fresh(); rows = feed(b, [((1, 0), (1, 2))]); first = dict(rows[0])
    feed(b, [((1, 1), (1, 2))])
    assert rows[0] == first and first['category'] == 'missing_both_support'
    assert b.classify((1, 0), (1, 2))['category'] == 'merge_relation'


def test_graph_is_not_pruned_when_owners_are_absent():
    b = fresh(); feed(b, [((1, 0), (1, 2))]); feed(b, [])
    assert feed(b, [((1, 0), (1, 2))])[0]['category'] == 'unique_continuation'


@pytest.mark.parametrize('bad', ['birth', 'future', 'wrong_frame', 'skipped_frame'])
def test_invalid_anchor_or_clock_rejected(bad):
    b = fresh(); r = event(2, 0, (1, 0))
    if bad == 'birth': r['kind'] = 'birth'
    if bad == 'future': r['birth'] = (2, 0)
    if bad == 'wrong_frame': r['input'] = (3, 0)
    with pytest.raises(ValueError): b.add(3 if bad == 'skipped_frame' else 2, {(2, 0): r}, {})


def test_current_native_ids_boxes_and_tokens_do_not_enter_bridge():
    a, b = fresh(), fresh()
    for f in (2, 3):
        base = event(f, 0, (1, 0)); ctrl = event(f, 0, (1, 2))
        x = a.add(f, {(f, 0): base}, {(f, 0): ctrl})
        y = b.add(f, {(f, 0): {**base, 'local_token': 'arbitrary', 'tracker_id': 999, 'posterior_box': [1, 2, 3, 4]}},
                  {(f, 0): {**ctrl, 'local_token': 'unrelated', 'tracker_id': -1}})
        assert x == y
    assert a.summary() == b.summary()


def test_complete_zero_categories_denominators_and_first_pair_receipts():
    b = fresh(); feed(b, [((1, 0), (1, 2))]); feed(b, [((1, 0), (1, 2))])
    summary = b.summary(); groups = summary['groups']
    assert not summary['identity_accepted']
    for g in groups.values():
        assert set(g['categories']) == set(CATEGORIES)
        assert sum(g['categories'].values()) == g['events'] == sum(r['events'] for r in g['strata'])
        assert sum(g['first_event_per_pair_categories'].values()) == g['distinct_owner_pairs']
        assert g['flags']['direct_supported'] + g['flags']['direct_unsupported'] == g['events']
    assert groups['all_common']['events'] == groups['changed_lineage']['events'] == groups['lost_original_active']['events'] == 2
    assert groups['unchanged_lineage']['events'] == 0
    assert groups['changed_lineage']['distinct_owner_pairs'] == 1


def test_duplicate_owner_update_is_rejected():
    b = fresh()
    with pytest.raises(ValueError): feed(b, [((1, 0), (1, 2)), ((1, 0), (1, 3))])
