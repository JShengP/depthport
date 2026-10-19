# SPDX-License-Identifier: AGPL-3.0-only
import numpy as np

from depthport.tracking_recovery_diagnostics import analyse_added_errors
from tests.test_tracking_diagnostics import assignment


def fixture():
    detections = [{'bbox': [0., 0., 10., 20.], 'confidence': .2},
                  {'bbox': [5., 0., 15., 20.], 'confidence': .8}]
    cache = {'fps': 2, 'frames': [{'index': f, 'detections': detections} for f in range(1, 6)]}
    def data(tids, scores, cols):
        return {'gt_ids': [np.array([0])]*3+[np.array([0, 1]), np.array([0])],
            'tracker_ids': [np.array(t) for t in tids],
            'similarity_scores': [np.array(s).reshape(len(g), len(t)) for s,g,t in
                zip(scores, [range(1)]*3+[range(2), range(1)], tids)],
            'tracker_dets': [np.array([[detections[i]['bbox'][0]+1, 1., 10., 20.] for i in c]).reshape(-1,4) for c in cols],
            'tracker_confidences': [np.array([detections[i]['confidence'] for i in c]) for c in cols]}
    old = data([[4], [4], [4], [4, 5], [4]], [[[.9]], [[.9]], [[.9]], [[.9,.1],[.1,.9]], [[.9]]],
               [[0], [0], [0], [0,1], [0]])
    new = data([[7], [], [], [9], [8]], [[[.9]], [[]], [[]], [[.8],[.9]], [[.9]]],
               [[0], [], [], [0], [0]])
    rows = [{'frame': f, 'id': 10, 'bbox': [1., 1., 10., 20.], 'visibility': .2 if f == 2 else 1.}
            for f in range(1,6)] + [{'frame': 4, 'id': 20, 'bbox': [6.,1.,10.,20.], 'visibility': 1.}]
    pred = {'frames': [{'index': f, 'objects': [detections[0]] if f in (1,4,5) else []} for f in range(1,6)]}
    frames = [{'frame': f, 'stages': [], 'deferred': []} for f in range(1,6)]
    frames[1].update(stages=[{}, {'detection_indices': [0,1], 'matched': []}],
                     deferred=[{'row': 0, 'column': 0}])
    events = {'long_low_visibility': [], 'overlap_order_exchange': []}
    return old, new, rows, events, cache, pred, frames


def test_added_misses_separate_direct_deferral_downstream_output_and_assignment():
    old, new, rows, events, cache, pred, frames = fixture()
    summary, raw = analyse_added_errors(old, new, rows, events, cache, 1, pred, frames, assignment)
    assert summary['added_fn']['total'] == 3
    assert summary['added_fn']['categories'] == {
        'direct_current_deferral': 1,
        'reference_detection_not_emitted_without_current_deferral': 1,
        'reference_detection_still_emitted': 1}
    assert summary['added_fn']['signals']['low_visibility'] == 1
    assert summary['added_fn_episodes'] == {'count': 1, 'max_frames': 3}
    assert [c['frame'] for c in raw['added_fn']] == [2,3,4]
    # Only native IDs inside EACH run define switches; different starting IDs are harmless.
    assert summary['added_idsw']['total'] == 1
    assert raw['added_idsw'][0]['frame'] == 5
    assert summary['added_idsw']['signals']['same_input_detection_as_reference'] == 1
    assert summary['added_idsw']['categories'] == {'gap_with_raw_detection_support': 1}
    assert not any(k in str(summary) for k in ['reference_detection_index', 'previous_tid', "'frame':"])


def test_emitted_deferred_detection_is_rejected_and_empty_added_sets_are_valid():
    import pytest
    old, new, rows, events, cache, pred, frames = fixture()
    pred['frames'][1]['objects'] = [cache['frames'][1]['detections'][0]]
    with pytest.raises(ValueError, match='still matched/emitted'):
        analyse_added_errors(old, new, rows, events, cache, 1, pred, frames, assignment)
    pred['frames'][1]['objects'] = []
    summary, _ = analyse_added_errors(new, new, rows, events, cache, 1, pred, frames, assignment)
    assert summary['added_fn']['total'] == summary['added_idsw']['total'] == 0
    assert summary['added_fn_episodes'] == {'count': 0, 'max_frames': 0}


def test_weak_stage_audit_distinguishes_tentative_assignment_from_emitted_confirmed():
    from tools.audit_tracking_recovery_errors import weak_stage_contexts
    stage = {'detection_indices': [0,1,2,3], 'matched': [[0,0],[1,1]],
             'tracks': [{'tracker_id': -1}, {'tracker_id': 8}]}
    frames = [{'frame': 1, 'stages': [{},stage], 'deferred': [{'column': 2}]}]
    cases = [{'frame': 1, 'reference_detection_index': i} for i in range(4)]
    assert weak_stage_contexts(cases, frames) == {
        'matched_tentative': 1, 'matched_confirmed': 1, 'deferred': 1, 'unmatched_weak': 1}
    assert all('candidate_weak_stage' in c for c in cases)
