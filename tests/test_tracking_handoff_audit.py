# SPDX-License-Identifier: AGPL-3.0-only
"""Synthetic prefix/future separation; no real data, scoring or tracker calls."""
from copy import deepcopy
import pytest
from depthport.tracking_handoff_audit import HandoffAudit, Timeline, STATUSES, TARGETS
from depthport.tracking_observation_bridge import PastBridge, CATEGORIES


def step(audit, bridge, births=((), ()), matches=({}, {}), removals=({}, {})):
    f = bridge.frame + 1; lives = []; events = []
    size = max([0] + [i for side in births for i in side] + [i for side in matches for i in side]) + 1
    for side, timeline in enumerate(audit.timelines):
        pre = list(deepcopy(timeline.live).values()); post = deepcopy(pre)
        by_owner = {timeline.tokens[s['token']]: s for s in post}
        ev = {}
        for i, (owner, stage) in matches[side].items():
            before = timeline.live[owner]; state = by_owner[owner]
            ev[(f, i)] = {'kind': 'accepted', 'input': (f, i), 'birth': owner, 'stage': stage,
                'active': before['age_since_update'] == 0, 'pre_confirmed': before['tracker_id'] >= 0, 'confirmed': True}
            state['tracker_id'] = state['token'] + 100
        accepted_owners = {tuple(e['birth']) for e in ev.values()}
        for owner, state in by_owner.items():
            state['age_since_update'] = 0 if owner in accepted_owners else state['age_since_update'] + 1
        born = []
        for i in births[side]:
            state = {'token': (len(timeline.tokens) + len(born) + 1) * (1 if side == 0 else 17),
                     'tracker_id': -1, 'age_since_update': 0}
            born.append({'detection_index': i, 'state': state, 'reason': 'unmatched_high_above_activation'})
            post.append(state)
        removed = [{'state': deepcopy(by_owner[o]), 'reason': reason} for o, reason in removals[side].items()]
        removed_tokens = {r['state']['token'] for r in removed}
        lives.append({'frame': f, 'before_update': pre, 'before_lifecycle_prune': post,
            'after_update': [s for s in post if s['token'] not in removed_tokens],
            'births': born, 'input_boxes': [None] * size, 'removals': removed})
        events.append(ev)
    audit.add(lives, events, bridge)
    return lives, events


def empty_history_boundary():
    a, b = HandoffAudit(), PastBridge()
    step(a, b, births=((0,), (0,)))
    step(a, b, births=((1,), ()), matches=({0: ((1, 0), 'high')}, {0: ((1, 0), 'high')}))
    step(a, b, matches=({0: ((2, 1), 'high')}, {0: ((1, 0), 'high')}))
    return a, b


def established_boundary():
    a, b = HandoffAudit(), PastBridge()
    step(a, b, births=((0, 1), (0, 1)))
    step(a, b, matches=({0: ((1, 0), 'high'), 1: ((1, 1), 'weak')},
                        {0: ((1, 0), 'high'), 1: ((1, 1), 'weak')}))
    step(a, b, matches=({0: ((1, 0), 'high')}, {0: ((1, 1), 'high')}))
    return a, b


def test_current_acceptance_and_future_never_repair_empty_prior_history():
    a, b = empty_history_boundary(); p = deepcopy(a.cases[0]['prefix'])
    assert p['bridge']['category'] == 'missing_reference_support'
    assert p['owners_prior'][0]['birth']['input'] == (2, 1)
    assert p['owners_prior'][0]['accepted'] == []
    assert p['owners_prior'][0]['status'] == 'active_tentative'
    assert p['birth_input_other_arm'][0]['kind'] == 'unaccepted'
    assert p['neighbors_prior'][1][0]['evidence']['status'] == 'active_confirmed'
    step(a, b, matches=({0: ((2, 1), 'weak')}, {0: ((1, 0), 'weak')}),
         removals=({(1, 0): 'expired'}, {}))
    s = a.finish()
    assert a.cases[0]['prefix'] == p
    assert s['groups']['missing_reference_support']['following_same_pair_categories']['merge_relation'] == 1
    assert not s['current_or_future_used_as_prior_evidence']
    assert a.cases[0]['following']['owner_updates'][0] == {'high': 0, 'weak': 1}
    assert a.cases[0]['source_end'][0]['source_end_censored']


def test_known_unbridged_histories_and_following_other_owners_are_separate():
    a, b = established_boundary(); p = deepcopy(a.cases[0]['prefix'])
    assert p['bridge']['category'] == 'unbridged_known_chains'
    assert not p['bridge']['indirect_connected_without_direct']
    assert [len(e['accepted']) for e in p['owners_prior']] == [1, 1]
    assert p['neighbors_prior'][0][0]['evidence']['status'] == 'active_confirmed'
    step(a, b, matches=({0: ((1, 0), 'weak')}, {0: ((1, 1), 'weak')}))
    step(a, b, matches=({0: ((1, 0), 'high'), 1: ((1, 1), 'weak')},
                        {0: ((1, 0), 'high'), 1: ((1, 1), 'weak')}))
    s = a.finish()['groups']['unbridged_known_chains']
    assert a.cases[0]['prefix'] == p
    assert s['following_same_pair_categories']['many_to_many_relation'] == 1
    assert s['following_other_control_for_reference'] == s['following_other_reference_for_control'] == 1


@pytest.mark.parametrize('reason', ['expired', 'immature_unmatched', 'expired_and_immature'])
def test_removal_reason_must_be_recorded_and_strictly_prior(reason):
    a, b = HandoffAudit(), PastBridge(); step(a, b, births=((0,), (0,)))
    step(a, b, removals=({(1, 0): reason}, {(1, 0): reason}))
    e = a.timelines[0].evidence((1, 0))
    assert e['status'] == 'removed_' + reason and e['removal']['frame'] == 2
    assert e['removal_evidence'] == 'recorded_prior_removal'
    assert a.timelines[0].evidence((1, 99))['status'] == 'missing_evidence'


def test_current_and_future_birth_or_input_receipts_are_inadmissible():
    t = Timeline()
    for key in ((1, 0), (99, 0)):
        with pytest.raises(ValueError): t.evidence(key)
        with pytest.raises(ValueError): t.action(key)


def test_birth_receipt_is_not_an_accepted_observation():
    a, b = HandoffAudit(), PastBridge(); step(a, b, births=((0,), (0,)))
    e = a.timelines[0].evidence((1, 0))
    assert e['birth'] and not e['accepted']
    assert b.common_anchors == 0
    assert a.timelines[0].action((1, 0))['kind'] == 'birth'


def test_source_end_censoring_does_not_invent_expiry():
    a, b = empty_history_boundary(); a.finish()
    for end in a.cases[0]['source_end']:
        assert end['source_end_censored'] and end['removal'] is None
        assert end['status'] == 'active_confirmed'


def test_current_removal_is_not_visible_until_commit_and_not_relabelled_expiry():
    a, b = HandoffAudit(), PastBridge(); step(a, b, births=((0,), (0,)))
    before = a.timelines[0].evidence((1, 0))
    step(a, b, removals=({(1, 0): 'immature_unmatched'}, {}))
    assert before['status'] == 'active_tentative' and before['removal'] is None
    assert a.timelines[0].evidence((1, 0))['status'] == 'removed_immature_unmatched'


def test_missing_removal_record_is_rejected():
    a, b = HandoffAudit(), PastBridge(); lives, events = step(a, b, births=((0,), (0,)))
    t = Timeline(); t.commit(lives[0], events[0])
    life = {'frame': 2, 'before_update': list(t.live.values()), 'before_lifecycle_prune': list(t.live.values()),
            'after_update': [], 'removals': [], 'births': [], 'input_boxes': []}
    with pytest.raises(ValueError, match='removal'): t.commit(life, {})


def test_absent_prior_owner_cannot_be_accepted_or_reappear_after_removal():
    a, b = HandoffAudit(), PastBridge(); lives, events = step(a, b, births=((0,), (0,)))
    t = Timeline(); t.commit(lives[0], {})
    bad = {'frame': 2, 'before_update': [], 'births': [], 'input_boxes': []}
    with pytest.raises(ValueError, match='Predecision'): t.prepare(bad)


def test_zero_case_audit_keeps_all_categories_and_null_is_not_zero():
    a, b = HandoffAudit(), PastBridge(); step(a, b)
    s = a.finish(); assert s['boundaries'] == 0 and set(s['groups']) == set(TARGETS)
    for g in s['groups'].values():
        assert g['boundaries'] == 0 and set(g['following_same_pair_categories']) == set(CATEGORIES)
        assert sum(g['following_same_pair_categories'].values()) == 0
        assert set(g['owners']['reference']['statuses']) == set(STATUSES)
    with pytest.raises(ValueError): a.finish()
    with pytest.raises(ValueError): step(a, b)


@pytest.mark.skipif(__import__('os').getenv('RUN_TRACKERS_CONTRACTS') != '1', reason='Optional NumPy2 generated native contract')
@pytest.mark.parametrize('arm', ['reference', 'projection'])
@pytest.mark.parametrize('outcome', ['high', 'weak', 'unmatched'])
def test_generated_native_lifecycle_receipts_remain_compatible(arm, outcome):
    from tests.test_tracking_carrier_roles import generated_history
    from depthport.tracking_accepted_events import AcceptedLedger
    histories = [generated_history(10, arm, outcome), generated_history(10, arm, outcome)]
    ledgers = [AcceptedLedger(), AcceptedLedger()]; audit = HandoffAudit(); bridge = PastBridge()
    for records in zip(*histories):
        events = []
        for ledger, record in zip(ledgers, records):
            raw = ledger.add(record)
            events.append({tuple(e['input']): e for e in raw if e['kind'] == 'accepted'})
        audit.add([r['lifecycle'] for r in records], events, bridge)
    assert audit.finish()['boundaries'] == 0
    t = audit.timelines[0]
    if outcome == 'unmatched':
        assert t.evidence((1, 0))['status'] == 'removed_immature_unmatched'
        assert t.evidence((3, 0))['accepted'] == []
    else:
        assert t.action((2, 0))['kind'] == 'accepted_' + outcome
        assert len(t.evidence((1, 0))['accepted']) == 1
