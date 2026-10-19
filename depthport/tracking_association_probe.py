# SPDX-License-Identifier: AGPL-3.0-only
"""Local-only observation of pinned Roboflow 2.6.1 association decisions.

No gate/score/assignment mutation, annotation input, global monkeypatch, model
or Session integration. Full matrices and identifiers MUST stay in local files.
"""
from __future__ import annotations

import numpy as np


class AssociationProbe:
    def __init__(self, tracker, backend):
        if backend not in ('bytetrack', 'botsort'):
            raise ValueError('Probe supports direct ByteTrack/BoT-SORT only')
        self.tracker, self.backend = tracker, backend
        self.frame = 0
        self.last = None
        self._tokens = {}
        self._restore = {}

    def _token(self, track):
        # Keep the object reference to prevent Python id reuse after pruning.
        key = id(track)
        if key not in self._tokens:
            self._tokens[key] = (track, len(self._tokens)+1)
        return self._tokens[key][1]

    def _snapshot(self, track):
        successful = getattr(track, 'number_of_successful_updates', None)
        consecutive = getattr(track, 'number_of_successful_consecutive_updates', None)
        return {'token': self._token(track), 'tracker_id': int(track.tracker_id),
                'age_since_update': float(track.time_since_update),
                'successful_updates': int(successful) if successful is not None else None,
                'consecutive_updates': int(consecutive) if consecutive is not None else None}

    def _replace(self, name, replacement):
        self._restore[name] = (name in self.tracker.__dict__, self.tracker.__dict__.get(name))
        setattr(self.tracker, name, replacement)

    def __enter__(self):
        if self._restore:
            raise ValueError('Probe is already attached')
        tracker = self.tracker
        update = tracker.update
        associate = tracker._get_associated_indices

        if self.backend == 'botsort':
            matrix = tracker._get_iou_matrix

            def observe_matrix(tracks, boxes, states):
                self._matrix_tracks = list(tracks)
                self._matrix_boxes = boxes.copy()
                return matrix(tracks, boxes, states)
            self._replace('_get_iou_matrix', observe_matrix)

        def observe_association(similarity, gate):
            stage_index = len(self.last['stages'])
            if self.backend == 'bytetrack':
                if stage_index == 0:
                    refs, indices, name = list(tracker.tracks), self._high, 'high_all'
                    self._first_refs = refs
                elif stage_index == 1:
                    refs, indices, name = self._remaining_refs, self._low, 'weak_remaining'
                else:
                    raise ValueError('Unexpected ByteTrack association stage')
            else:
                refs = self._matrix_tracks
                names = ('high_confirmed_lost', 'weak_tracked', 'unconfirmed_high')
                if stage_index >= len(names):
                    raise ValueError('Unexpected BoT-SORT association stage')
                name = names[stage_index]
                indices = (self._high if stage_index == 0 else self._low if stage_index == 1
                           else self._remaining_high)
                if not np.array_equal(self._matrix_boxes, self._boxes[indices]):
                    raise ValueError('Probe detection-column mapping differs from upstream')
            copied = np.array(similarity, copy=True)
            if copied.shape != (len(refs), len(indices)) or not np.all(np.isfinite(copied)):
                raise ValueError('Unexpected association matrix shape or nonfinite scores')
            snapshots = [self._snapshot(t) for t in refs]
            result = associate(similarity, gate)  # Exact original array/gate, unchanged.
            matched, unmatched_rows, unmatched_cols = result
            stage = {'name': name, 'gate': float(gate), 'tracks': snapshots,
                     'detection_indices': [int(i) for i in indices],
                     'similarity': copied.tolist(), 'cost_one_minus_similarity': (1.-copied).tolist(),
                     'matched': [[int(r), int(c)] for r,c in matched],
                     'unmatched_rows': [int(i) for i in unmatched_rows],
                     'unmatched_columns': [int(i) for i in unmatched_cols]}
            self.last['stages'].append(stage)
            for row,col in matched:
                self._edges.append((len(self.last['stages'])-1, int(row), int(col), refs[row]))
            if stage_index == 0:
                self._remaining_refs = [refs[i] for i in unmatched_rows]
                self._remaining_high = [int(indices[i]) for i in sorted(unmatched_cols)]
            return result

        def observe_update(detections, frame=None, timestamp=None):
            self.frame += 1
            self.last = {'frame': self.frame, 'stages': [], 'events': []}
            self._edges = []
            self._boxes = detections.xyxy
            confidences = (detections.confidence if detections.confidence is not None
                           else np.ones(len(detections)))
            self._high = np.flatnonzero(confidences >= tracker.high_conf_det_threshold).tolist()
            low = confidences < tracker.high_conf_det_threshold
            if self.backend == 'botsort':
                low = low & (confidences > .1)
            self._low = np.flatnonzero(low).tolist()
            result = update(detections, frame=frame, timestamp=timestamp)
            promoted = set()
            for stage_idx,row,col,track in self._edges:
                stage = self.last['stages'][stage_idx]
                before = stage['tracks'][row]
                is_promotion = before['tracker_id'] < 0 <= track.tracker_id
                is_recovery = before['tracker_id'] >= 0 and before['age_since_update'] >= 2
                if is_promotion or is_recovery:
                    self.last['events'].append({'kind': 'promotion' if is_promotion else 'recovery',
                        'stage': stage_idx, 'row': row, 'column': col,
                        'detection_index': stage['detection_indices'][col],
                        'tracker_id': int(track.tracker_id), 'token': before['token'],
                        'missed_frames_before_match': max(0, int(before['age_since_update'])-1)})
                if is_promotion:
                    promoted.add(self._token(track))
            if self.frame == 1:
                for track in tracker.tracks:
                    if track.tracker_id >= 0 and self._token(track) not in promoted:
                        self.last['events'].append({'kind': 'instant_first_frame',
                            'tracker_id': int(track.tracker_id), 'token': self._token(track)})
            return result

        self._replace('_get_associated_indices', observe_association)
        self._replace('update', observe_update)
        return self

    def __exit__(self, exc_type, exc, tb):
        for name,(owned,value) in self._restore.items():
            if owned:
                setattr(self.tracker, name, value)
            else:
                delattr(self.tracker, name)
        self._restore.clear()


def edge_competition(stage, row, col, ambiguity_margin=.05):
    """Only same-stage admissible alternatives; not calibrated probabilities."""
    similarity = stage['similarity']
    gate = stage['gate']
    selected = similarity[row][col]
    row_alternatives = [s for j,s in enumerate(similarity[row]) if j != col and s >= gate]
    col_alternatives = [values[col] for i,values in enumerate(similarity) if i != row and values[col] >= gate]
    alternatives = row_alternatives + col_alternatives
    margin = selected - max(alternatives) if alternatives else None
    return {'selected_similarity': selected, 'selected_cost': 1.-selected,
            'admissible_row_alternatives': len(row_alternatives),
            'admissible_column_alternatives': len(col_alternatives),
            'best_alternative_margin': margin,
            'ambiguous': margin is not None and margin <= ambiguity_margin}
