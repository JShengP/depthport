# SPDX-License-Identifier: AGPL-3.0-only
from copy import deepcopy
import numpy as np
import pytest
from tools.validate_tracking_past_support import scene_screen, group_screen, write_kitti_predictions, kitti_error_locations
from tests.test_tracking_diagnostics import assignment


def test_per_scene_harms_and_paired_losses_cannot_be_hidden_by_improvement():
    reference = {'CLR_FN': 20, 'CLR_FP': 10, 'IDSW': 2, 'Frag': 3, 'IDF1': .5, 'HOTA': .4}
    improved = {**reference, 'CLR_FP': 9}
    paired = {'FN': {'added': 0}, 'IDSW': {'added': 0}}
    assert scene_screen(reference, improved, paired, 1, 20)['passes']
    for key in ('CLR_FN', 'CLR_FP', 'IDSW', 'Frag'):
        assert not scene_screen(reference, {**improved, key: reference[key]+1}, paired, 1, 20)['harm_passes']
    for key in ('IDF1', 'HOTA'):
        assert not scene_screen(reference, {**improved, key: reference[key]-.001}, paired, 1, 20)['harm_passes']
    for key in ('FN', 'IDSW'):
        bad = deepcopy(paired); bad[key]['added'] = 1
        assert not scene_screen(reference, improved, bad, 1, 20)['harm_passes']
    assert not scene_screen(reference, improved, paired, 0, 20)['passes']
    assert not scene_screen(reference, reference, paired, 1, 20)['passes']
    assert not scene_screen(reference, improved, paired, 1, 0)['identity_evaluable']
    assert not scene_screen(reference, improved, paired, 1, 0)['passes']


def test_kitti_writer_preserves_zero_based_xyxy_and_confidence(tmp_path):
    p = {'frames': [{'index': 1, 'objects': [{'object_id': 'x', 'class_id': 0,
        'confidence': .3, 'bbox': [0., 2., 10., 22.]}]}]}
    target = tmp_path/'test.txt'; write_kitti_predictions(p, target)
    fields = target.read_text().split()
    assert fields[:3] == ['0', '0', 'Pedestrian']
    assert list(map(float, fields[6:10])) == [0., 2., 10., 22.]
    assert len(fields) == 18 and float(fields[17]) == .3


def test_group_screen_cannot_offset_any_scene_harm_or_treat_no_exposure_as_success():
    good = {'harm_passes': True, 'effective_exposure': True, 'passes': True}
    negative = {'harm_passes': True, 'effective_exposure': False, 'passes': False}
    assert group_screen([good, good, negative, negative])['passes']
    assert not group_screen([good, negative, negative, negative])['passes']
    assert group_screen([negative]*4)['all_effectively_exposed_scene_quality_passes'] is None
    assert not group_screen([good, good, {**negative, 'harm_passes': False}, negative])['passes']


def test_xyxy_fp_key_adapter_does_not_mutate_official_data(monkeypatch):
    import depthport.tracking_diagnostics as diagnostics
    original = diagnostics.clear_trace
    monkeypatch.setattr(diagnostics, 'clear_trace', lambda data: original(data, assignment))
    data = {'gt_ids': [np.array([], dtype=int)], 'tracker_ids': [np.array([7])],
        'similarity_scores': [np.empty((0, 1))], 'tracker_dets': [np.array([[0., 2., 10., 22.]])],
        'tracker_confidences': [np.array([.3])]}
    cache = {'frames': [{'detections': [{'bbox': [0., 2., 10., 22.], 'confidence': .3}]}]}
    before = data['tracker_dets'][0].copy(); errors, counts = kitti_error_locations(data, cache)
    assert errors == {'FP': {(1, 0)}, 'FN': set(), 'IDSW': set()}
    assert counts == {'CLR_TP': 0, 'CLR_FP': 1, 'CLR_FN': 0, 'IDSW': 0}
    np.testing.assert_array_equal(data['tracker_dets'][0], before)
