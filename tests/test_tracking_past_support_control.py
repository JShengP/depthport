# SPDX-License-Identifier: AGPL-3.0-only
import os
from types import SimpleNamespace
import numpy as np
import pytest
from depthport.tracking_past_support_control import ARMS, PastSupportDeferral, protect_updates
from tests.test_tracking_diagnostics import assignment


def refs():
    return [SimpleNamespace(tracker_id=10, time_since_update=1),
            SimpleNamespace(tracker_id=20, time_since_update=1)]


def record(control, frame, s, tracks, indices, matched):
    control.frame = frame; control._accepted_this_frame = set()
    control._record(np.asarray(s, dtype=float).reshape(len(tracks), len(indices)), .1, tracks, indices, matched)


def qualified(arm, occupied=False):
    r, q = refs(); c = PastSupportDeferral(None, arm, assignment)
    record(c, 1, [[.7, 0], [.69, .9]], [r, q], [5, 7], [(0, 0), (1, 1)])
    record(c, 2, [[.9]], [q], [2], [(0, 0)])
    c.frame = 3; r.time_since_update = 2
    s = np.array([[.7, 0], [.69, .9]]) if occupied else np.array([[.7], [.69]])
    matched = [(0, 0), (1, 1)] if occupied else [(0, 0)]
    return c, [r, q], s, matched


@pytest.mark.parametrize('arm,expected', list(zip(ARMS, [False, True, True, True])))
def test_factorial_decisions_use_past_keys_and_do_not_change_scores(arm, expected):
    c, tracks, s, matched = qualified(arm); before = s.copy()
    veto, audit = c.decide(s, .1, tracks, matched)
    assert bool(veto) is expected
    evidence = audit[0]['competitors'][0]['past']
    assert evidence['selected_observation'] == (1, 5) and evidence['competitor_observation'] == (1, 7)
    assert evidence['selected_observation'][0] < c.frame
    np.testing.assert_array_equal(s, before)


@pytest.mark.parametrize('arm,expected', list(zip(ARMS, [False, True, False, False])))
def test_protection_independently_blocks_occupied_competitor(arm, expected):
    c, tracks, s, matched = qualified(arm, True)
    veto, audit = c.decide(s, .1, tracks, matched)
    assert bool(veto) is expected
    assert audit[0]['competitors'][0]['past']['qualified']
    assert audit[0]['competitors'][0]['protection']['reason'] == 'competitor_occupied'


def test_positive_opportunity_cost_can_preserve_other_updates_without_equality_gate():
    assert protect_updates([[.7], [.69]], .1, 0, 1, 0, [(0, 0)], assignment)['protected']
    # Original optimum .9+.7=1.6; forced .88+.71=1.59 keeps count but loses row 1.
    result = protect_updates([[.9, .71], [0, .7], [.88, 0]], .1, 0, 2, 0, [(0, 0), (1, 1)], assignment)
    assert not result['protected'] and result['lost_other_updates'] == 1
    assert result['alternative_accepted_count'] == 2


def test_conjunction_cannot_mix_support_and_protection_from_different_competitors():
    for arm, expected in zip(ARMS, (False, True, True, False)):
        c, tracks, _, matched = qualified(arm, occupied=True)
        new = SimpleNamespace(tracker_id=30, time_since_update=1)
        record(c, 2, [[.9]], [new], [4], [(0, 0)])
        c.frame = 3; tracks.append(new)
        s = np.array([[.7, 0], [.69, .9], [.69, 0]])
        veto, audit = c.decide(s, .1, tracks, matched)
        assert bool(veto) is expected
        assert audit[0]['competitors'][0]['past']['qualified']
        assert audit[0]['competitors'][1]['protection']['protected']
        assert not audit[0]['competitors'][1]['past']['qualified']


def test_missing_evidence_and_retained_roles_cannot_qualify_as_observed_active_support():
    c, tracks, s, matched = qualified(ARMS[3])
    q = tracks[1]; q.time_since_update = 2
    veto, audit = c.decide(s, .1, tracks, matched)
    assert not veto and audit[0]['competitors'][0]['past']['reason'] == 'current_retained'
    q.time_since_update = 1; q.tracker_id = -1
    assert not c.decide(s, .1, tracks, matched)[0]
    q.tracker_id = 20; c._keys[c._owner(q)] = []
    assert c.past_evidence(*tracks)['reason'] == 'missing_recorded_history'


@pytest.mark.parametrize('change,reason', [('role', 'past_retained'), ('accepted_key', 'past_competitor_without_observation'),
                                         ('gate_supported', 'past_below_gate'), ('gap_supported', 'past_gap_not_supported')])
def test_incomplete_past_support_is_explicit_not_filled(change, reason):
    c, tracks, _, _ = qualified(ARMS[3]); r, q = map(c._owner, tracks)
    old = c._contexts[r]['competitors'][q]
    old[change] = 'retained' if change == 'role' else None if change == 'accepted_key' else False
    assert c.past_evidence(*tracks) == {'qualified': False, 'reason': reason}


def test_other_stage_history_unknown_and_native_ids_do_not_join_or_retarget():
    c, tracks, s, matched = qualified(ARMS[3]); r, q = map(c._owner, tracks)
    tracks[0].tracker_id = tracks[1].tracker_id = 999
    assert c.decide(s, .1, tracks, matched)[0]
    c._contexts[r]['competitors'].pop(q)
    assert c.past_evidence(*tracks)['reason'] == 'past_stage_comparison_missing'


def test_future_information_tampered_history_and_duplicate_observations_fail_closed():
    c, tracks, _, _ = qualified(ARMS[3]); r = c._owner(tracks[0])
    c._contexts[r]['key'] = (3, 5)
    with pytest.raises(ValueError, match='precede'):
        c.past_evidence(*tracks)
    c._contexts[r]['key'] = (1, 6)
    with pytest.raises(ValueError, match='history differs'):
        c.past_evidence(*tracks)
    c, tracks, _, _ = qualified(ARMS[3])
    with pytest.raises(ValueError, match='Duplicate'):
        record(c, 4, [[.7, 0], [0, .8]], tracks, [2, 2], [(0, 0), (1, 1)])


@pytest.mark.skipif(os.getenv('RUN_TRACKERS_CONTRACTS') != '1', reason='Optional pinned NumPy 2 trackers')
@pytest.mark.parametrize('arm', ARMS)
def test_real_weak_continuation_gap_recovery_input_and_instance_restoration(arm):
    import supervision as sv
    from depthport.video_tracking_benchmark import make_tracker
    from depthport.tracking_recovery_control import PARAMETERS
    from trackers.core.base import BaseTracker
    registry = dict(BaseTracker._registry); tracker = make_tracker('bytetrack', fps=10, parameters=PARAMETERS)
    def step(scores):
        d = sv.Detections(xyxy=np.array([[10, 10, 30, 40]]*len(scores), dtype=np.float32).reshape(-1, 4),
                          confidence=np.array(scores, dtype=np.float32), class_id=np.zeros(len(scores), dtype=int))
        before = d.xyxy.copy(); output = tracker.update(d)
        np.testing.assert_array_equal(before, d.xyxy); assert len(d) == len(output)
        return output.tracker_id
    with PastSupportDeferral(tracker, arm) as control:
        step([.9]); tid = int(step([.9])[0]); assert int(step([.2])[0]) == tid
        step([]); assert int(step([.2])[0]) == tid
        assert not control.last
    assert 'update' not in tracker.__dict__ and '_get_associated_indices' not in tracker.__dict__
    assert BaseTracker._registry == registry


@pytest.mark.skipif(os.getenv('RUN_TRACKERS_CONTRACTS') != '1', reason='Optional pinned NumPy 2 trackers')
def test_real_hook_restores_on_failure_and_rejects_timestamp_without_mutating_registry():
    import supervision as sv
    from depthport.video_tracking_benchmark import make_tracker
    tracker = make_tracker('bytetrack', fps=10)
    d = sv.Detections.empty()
    with pytest.raises(ValueError, match='fixed-step'):
        with PastSupportDeferral(tracker, ARMS[3]):
            tracker.update(d, timestamp=1.)
    assert 'update' not in tracker.__dict__ and '_get_associated_indices' not in tracker.__dict__


@pytest.mark.skipif(os.getenv('RUN_TRACKERS_CONTRACTS') != '1', reason='Optional pinned NumPy 2 trackers')
@pytest.mark.parametrize('arm', ARMS)
def test_real_contested_deferral_uses_only_prior_observations_and_keeps_weak_input(arm):
    import supervision as sv
    from depthport.video_tracking_benchmark import make_tracker
    from depthport.tracking_recovery_control import PARAMETERS
    tracker = make_tracker('bytetrack', fps=10, parameters=PARAMETERS)
    def step(boxes, scores):
        d = sv.Detections(xyxy=np.array(boxes, dtype=np.float32).reshape(-1, 4),
            confidence=np.array(scores, dtype=np.float32), class_id=np.zeros(len(scores), dtype=int))
        before = d.xyxy.copy(); out = tracker.update(d)
        np.testing.assert_array_equal(d.xyxy, before); assert len(out) == len(d)
        return out
    box = [10, 10, 30, 40]
    with PastSupportDeferral(tracker, arm) as control:
        for _ in range(3):
            step([box, box], [.9, .9])
        step([[10.2, 10, 30.2, 40]], [.9])
        output = step([box], [.2])
        assert bool(control.last) == (arm != ARMS[0])
        evidence = next(c['past'] for e in control.audit for c in e['competitors'] if c['past']['qualified'])
        assert evidence['selected_observation'][0] == evidence['competitor_observation'][0] == 3
        assert control.frame == 5
        assert int(output.tracker_id[0]) < 0 if arm != ARMS[0] else int(output.tracker_id[0]) >= 0
