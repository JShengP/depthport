# SPDX-License-Identifier: AGPL-3.0-only
import os
from types import SimpleNamespace

import numpy as np
import pytest

from depthport.tracking_recovery_control import deferred_edges, RecoveryDeferral, PARAMETERS


def tracks(*states):
    return [SimpleNamespace(tracker_id=tid, time_since_update=age) for tid, age in states]


def test_only_missed_confirmed_edge_with_active_admissible_close_competitor_is_deferred():
    refs = tracks((0, 2), (1, 1), (-1, 1), (2, 3))
    s = np.array([[.7, 0.], [.66, .9], [.8, 0.], [.9, 0.]])
    before = s.copy()
    assert deferred_edges(s, .1, refs, [(0, 0), (1, 1)]) == [
        {'row': 0, 'column': 0, 'competitor_rows': [1]}]
    np.testing.assert_array_equal(s, before)
    # A stronger alternative is also competition; assigned elsewhere is allowed.
    s[1, 0] = .8
    assert len(deferred_edges(s, .1, refs, [(0, 0)])) == 1
    # Below gate, larger margin, tentative competitor, or another missed row: no veto.
    for value, gate in [(.09, .1), (.64, .1), (.66, .8)]:
        s[1, 0] = value
        assert deferred_edges(s, gate, refs, [(0, 0)]) == []
    assert deferred_edges([[.7], [.69]], .1, tracks((0, 3), (-1, 1)), [(0, 0)]) == []
    assert deferred_edges([[.7], [.69]], .1, tracks((0, 3), (1, 2)), [(0, 0)]) == []
    assert deferred_edges([[.7], [.69]], .1, tracks((-1, 3), (1, 1)), [(0, 0)]) == []


def test_empty_matrices_and_nonfinite_rejection():
    assert deferred_edges(np.empty((0, 0)), .1, [], []) == []
    with pytest.raises(ValueError, match='Finite'):
        deferred_edges([[np.nan]], .1, tracks((1, 2)), [])


class FakeByte:
    def __init__(self, fail=False):
        self.tracks = tracks((0, 3), (1, 1))
        self.seen = []; self.fail = fail

    def _get_associated_indices(self, s, gate):
        self.seen.append((s, gate))
        return ([], [0, 1], []) if s.shape[1] == 0 else ([(0, 0), (1, 1)], [], [])

    def update(self, d, frame=None, timestamp=None):
        self.high = np.empty((2, 0)); self.weak = np.array([[.7, 0.], [.69, .8]])
        self.high_result = self._get_associated_indices(self.high, .1)
        self.weak_result = self._get_associated_indices(self.weak, .1)
        if self.fail:
            raise RuntimeError('failure')
        return d


@pytest.mark.parametrize('fail', [False, True])
def test_hook_preserves_inputs_other_edges_and_restores_even_on_failure(fail):
    t = FakeByte(fail)
    with RecoveryDeferral(t) as control:
        if fail:
            with pytest.raises(RuntimeError):
                t.update('original input')
        else:
            assert t.update('original input') == 'original input'
        assert t.high_result == ([], [0, 1], [])
        assert t.weak_result == ([(1, 1)], [0], [0])
        assert control.last == [{'row': 0, 'column': 0, 'competitor_rows': [1]}]
        assert t.seen[0][0] is t.high and t.seen[1][0] is t.weak
    assert 'update' not in t.__dict__ and '_get_associated_indices' not in t.__dict__


def test_research_screen_requires_coverage_identity_and_actual_intervention():
    from tools.validate_tracking_recovery import research_screen
    ref = {'CLR_FP': 10, 'CLR_FN': 20, 'IDSW': 2, 'IDF1': .5, 'HOTA': .4}
    candidate = {**ref, 'CLR_FP': 9}
    events = {'long_low_visibility': {'lost_same_id_to_changed': 0, 'lost_same_id_to_missing': 0}}
    assert research_screen(ref, candidate, events, 1)['passes']
    for key, value in [('CLR_FN', 21), ('IDSW', 3), ('IDF1', .49), ('HOTA', .39)]:
        assert not research_screen(ref, {**candidate, key: value}, events, 1)['passes']
    assert not research_screen(ref, candidate, events, 0)['passes']
    assert not research_screen(ref, ref, events, 1)['passes']


@pytest.mark.skipif(os.getenv('RUN_TRACKERS_CONTRACTS') != '1', reason='Opt-in trackers/NumPy 2 environment')
def test_real_byte_weak_continuation_uncontested_recovery_and_contested_deferral():
    import supervision as sv
    from trackers.core.base import BaseTracker
    from depthport.video_tracking_benchmark import make_tracker
    from depthport.tracking_association_probe import AssociationProbe
    registry = dict(BaseTracker._registry)
    def step(t, boxes, scores):
        d = sv.Detections(xyxy=np.array(boxes, dtype=np.float32).reshape(-1, 4),
            confidence=np.array(scores, dtype=np.float32), class_id=np.zeros(len(scores), dtype=int))
        before = d.xyxy.copy()
        result = t.update(d)
        np.testing.assert_array_equal(d.xyxy, before)
        assert len(result) == len(d)  # No weak-input loss, including deferred ID -1.
        return result
    box = [10, 10, 30, 40]
    for enabled in (False, True):
        from contextlib import nullcontext
        t = make_tracker('bytetrack', fps=30, parameters=PARAMETERS)
        with RecoveryDeferral(t) if enabled else nullcontext():
            step(t, [box], [.9]); confirmed = int(step(t, [box], [.9]).tracker_id[0])
            assert int(step(t, [box], [.2]).tracker_id[0]) == confirmed
            step(t, [], [])
            assert int(step(t, [box], [.2]).tracker_id[0]) == confirmed
    # Manufacture two already-confirmed upstream hypotheses at weak-stage entry:
    # deterministic scores isolate policy from Kalman/assignment drift.
    t = make_tracker('bytetrack', fps=30, parameters=PARAMETERS)
    step(t, [box, [40, 10, 60, 40]], [.9, .9])
    step(t, [box, [40, 10, 60, 40]], [.9, .9])
    t.tracks[0].time_since_update = 2
    class FixedIoU:
        def compute(self, boxes, detections):
            return np.empty((len(boxes), 0)) if len(detections) == 0 else np.array([[.7, 0.], [.69, .8]])
    t.iou = FixedIoU()
    missed_id = t.tracks[0].tracker_id; active_id = t.tracks[1].tracker_id
    with RecoveryDeferral(t) as control, AssociationProbe(t, 'bytetrack') as probe:
        result = step(t, [box, [40, 10, 60, 40]], [.2, .2])
        assert set(result.tracker_id) == {-1, active_id}
        assert len(control.last) == 1
        assert t.tracks[0].tracker_id == missed_id and t.tracks[0].time_since_update >= 3
        assert probe.last['stages'][1]['matched'] == [[1, 1]]
    assert BaseTracker._registry == registry
    assert 'update' not in t.__dict__ and '_get_associated_indices' not in t.__dict__
