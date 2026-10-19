# SPDX-License-Identifier: AGPL-3.0-only
"""Admission ablations must preserve detections and weak continuation."""
import os
from types import SimpleNamespace

import pytest

from depthport.tracking_admission import competition_tracker_class, admission_configurations,paired_error_counts,admission_error_locations
from depthport.video_tracking_benchmark import make_tracker, validate_tracker_parameters, VideoBenchmarkError


def test_factorial_profiles_change_confirmation_and_competition_independently():
    runs = admission_configurations()
    for backend in ('bytetrack', 'botsort'):
        params = lambda p: runs[backend + '__' + p]['parameters']
        control = params('activation_control')
        for name, field in [('confirm3', 'minimum_consecutive_frames'),
                            ('confirm5', 'minimum_consecutive_frames'),
                            ('competition', 'birth_competition_iou')]:
            candidate = params(name)
            assert {k for k in candidate if candidate[k] != control.get(k)} == {field}
            assert candidate['high_conf_det_threshold'] == .6
            assert candidate['lost_track_buffer'] == 30
        assert params('confirm3_competition') == {**params('confirm3'), 'birth_competition_iou': .5}
    runs['bytetrack__confirm3']['parameters']['minimum_consecutive_frames'] = 9
    assert admission_configurations()['bytetrack__confirm3']['parameters']['minimum_consecutive_frames'] == 3


def test_error_pairing_uses_locations_not_cross_run_ids_and_keeps_regressions():
    reference = {'FP': {(1, 3), (2, 7)}, 'FN': {(1, 2)}, 'IDSW': {(2, 4)}}
    candidate = {'FP': {(2, 7)}, 'FN': {(1, 2), (3, 1)}, 'IDSW': {(3, 4)}}
    assert paired_error_counts(reference, candidate) == {
        'FP': {'added': 0, 'removed': 1, 'shared': 1, 'net_change': -1},
        'FN': {'added': 1, 'removed': 0, 'shared': 1, 'net_change': 1},
        'IDSW': {'added': 1, 'removed': 1, 'shared': 0, 'net_change': 0}}


def test_error_locations_reconcile_fn_fp_switches_and_original_detection_index(monkeypatch):
    import numpy as np
    from depthport import tracking_diagnostics
    from tests.test_tracking_diagnostics import assignment
    # Tiny synthetic matrices use the existing exhaustive test solver. SciPy is
    # optional for real benchmarks and is deliberately absent from base CI.
    original_trace = tracking_diagnostics.clear_trace
    monkeypatch.setattr(tracking_diagnostics, 'clear_trace',
                        lambda data: original_trace(data, assign=assignment))
    data = {'gt_ids': [np.array([0]), np.array([0, 1])],
            'tracker_ids': [np.array([2, 3]), np.array([9])],
            'similarity_scores': [np.array([[1., 0.]]), np.array([[1.], [0.]])],
            'tracker_dets': [np.array([[1., 1., 10., 10.], [21., 1., 10., 10.]]),
                             np.array([[1., 1., 10., 10.]])],
            'tracker_confidences': [np.array([.9, .8]), np.array([.9])]}
    cache = {'frames': [{'detections': [{'bbox': [0, 0, 10, 10], 'confidence': .9},
                                       {'bbox': [20, 0, 30, 10], 'confidence': .8}]},
                        {'detections': [{'bbox': [0, 0, 10, 10], 'confidence': .9}]}]}
    locations, summary = admission_error_locations(data, cache, 1)
    assert locations == {'FP': {(1, 1)}, 'FN': {(2, 1)}, 'IDSW': {(2, 0)}}
    assert summary == {'CLR_TP': 2, 'CLR_FP': 1, 'CLR_FN': 1, 'IDSW': 1}


@pytest.mark.parametrize('parameters', [
    {'minimum_consecutive_frames': True}, {'minimum_consecutive_frames': 0},
    {'minimum_consecutive_frames': 11}, {'minimum_consecutive_frames': 2.5},
    {'birth_competition_iou': True}, {'birth_competition_iou': -.1},
    {'birth_competition_iou': 1.1}, {'birth_competition_iou': float('nan')},
])
def test_invalid_admission_parameters_fail_before_dependency_import(parameters):
    with pytest.raises(VideoBenchmarkError):
        validate_tracker_parameters('bytetrack', parameters)


def test_birth_veto_keeps_all_original_indices_and_ignores_tentative_competitors():
    class Upstream:
        def __init__(self):
            self.track_activation_threshold = .3
            self.tracks = []
            self.spawned = []

        def _spawn_new_tracks(self, boxes, scores, unmatched, high, out, ids, **kwargs):
            for local in unmatched:
                out.append(int(high[local])); ids.append(-1)
                if scores[high[local]] >= self.track_activation_threshold:
                    self.spawned.append(int(high[local]))

    t = competition_tracker_class(Upstream)(birth_competition_iou=.5)
    def track(box, ident, gap):
        return SimpleNamespace(get_state_bbox=lambda: box, tracker_id=ident, time_since_update=gap)
    t.tracks = [track([0, 0, 10, 10], 1, 0), track([20, 0, 30, 10], 2, 3),
                track([40, 0, 50, 10], -1, 0)]
    boxes = [[40, 0, 50, 10], [0, 0, 10, 10], [20, 0, 30, 10], [60, 0, 70, 10]]
    indices, ids = [], []
    t._spawn_new_tracks(boxes, [.9, .9, .9, .2], [2, 0, 1, 3], [0, 1, 2, 3], indices, ids)
    assert indices == [2, 0, 1, 3] and ids == [-1]*4
    assert t.spawned == [0]
    assert t.birth_admission_counts == {'eligible_births': 3, 'vetoed_matched_track': 1,
                                       'vetoed_unmatched_retained_track': 1}


@pytest.mark.skipif(os.getenv('RUN_TRACKERS_CONTRACTS') != '1', reason='Opt-in trackers 2.6.1 / NumPy 2 environment')
@pytest.mark.parametrize('backend', ['bytetrack', 'botsort'])
def test_real_confirmation_keeps_weak_continuation_and_veto_never_filters_input(backend):
    import numpy as np
    import supervision as sv
    from trackers.core.base import BaseTracker
    from copy import deepcopy
    registry = dict(BaseTracker._registry)
    frame = np.zeros((64, 64, 3), dtype=np.uint8)
    def step(tracker, scores):
        boxes = [[10, 10, 30, 40]] * len(scores)
        detection = sv.Detections(xyxy=np.array(boxes, dtype=np.float32).reshape(-1, 4),
                                  confidence=np.array(scores, dtype=np.float32),
                                  class_id=np.zeros(len(scores), dtype=np.int32))
        original = deepcopy(detection)
        result = tracker.update(detection, frame=frame if backend == 'botsort' else None)
        np.testing.assert_array_equal(detection.xyxy, original.xyxy)
        np.testing.assert_array_equal(detection.confidence, original.confidence)
        assert len(result) == len(detection)
        return [int(i) for i in result.tracker_id if i >= 0]

    first_output = {}
    configs = admission_configurations()
    for profile in ('activation_control', 'confirm3', 'confirm5', 'competition', 'confirm3_competition'):
        t = make_tracker(backend, fps=30., parameters=configs[backend+'__'+profile]['parameters'])
        step(t, [])  # Avoid the documented BoT-SORT instant-first-frame exception.
        first = None
        for index in range(8):
            ids = step(t, [.9])
            if ids and first is None:
                first = index
        first_output[profile] = first
        assert len(ids) == 1
        assert step(t, [.2]) == ids  # Below split AND activation, still continues.
        if 'competition' in profile:
            assert step(t, [.9, .9]) == ids  # Duplicate birth veto, confirmed ID survives.
            assert sum(t.birth_admission_counts[k] for k in ('vetoed_matched_track', 'vetoed_unmatched_retained_track')) == 1
    assert first_output['activation_control'] < first_output['confirm3'] < first_output['confirm5']
    assert first_output['competition'] == first_output['activation_control']
    assert first_output['confirm3_competition'] == first_output['confirm3']
    assert BaseTracker._registry == registry
