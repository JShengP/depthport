# SPDX-License-Identifier: AGPL-3.0-only
"""Opt-in fixed-step ByteTrack research control; never installed by the app.

Defer a selected weak-stage missed-hypothesis edge when an active confirmed
hypothesis has a gate-admissible score within .05 (or better) in that column.
No reassignment, input filtering, GT, state update or lifetime extension.
"""
from __future__ import annotations

import numpy as np

MARGIN = .05
PARAMETERS = {'track_activation_threshold': .3, 'high_conf_det_threshold': .6,
              'lost_track_buffer': 30, 'minimum_consecutive_frames': 2}
ARMS = ('activation_control', 'defer_competing_recovery')


def deferred_edges(similarity, gate, tracks, matched):
    """Pure decision on pre-weak-stage states. Alternatives may match elsewhere."""
    s = np.asarray(similarity)
    if s.ndim != 2 or s.shape[0] != len(tracks) or not np.all(np.isfinite(s)):
        raise ValueError('Finite track-by-detection matrix required')
    deferred = []
    for row, col in matched:
        track = tracks[row]
        if track.tracker_id < 0 or track.time_since_update < 2:
            continue
        competitors = [i for i, other in enumerate(tracks)
                       if i != row and other.tracker_id >= 0
                       and other.time_since_update == 1
                       and s[i, col] >= gate and s[row, col] - s[i, col] <= MARGIN]
        if competitors:
            deferred.append({'row': int(row), 'column': int(col),
                             'competitor_rows': competitors})
    return deferred


class RecoveryDeferral:
    """Instance-only hook around pinned ByteTrack's two association calls.

    Enter before AssociationProbe, if used. Full decisions/identifiers in .last
    are local diagnostics only. Exit restores instance method ownership even on
    failure. A deferred detection remains in upstream output with ID -1.
    """
    def __init__(self, tracker):
        self.tracker = tracker
        self.last = []
        self._restore = {}

    def __enter__(self):
        if self._restore:
            raise ValueError('Control already attached')
        tracker = self.tracker
        update, associate = tracker.update, tracker._get_associated_indices

        def controlled_update(detections, frame=None, timestamp=None):
            if timestamp is not None:
                raise ValueError('Research control requires fixed-step updates')
            self._stage = 0
            self.last = []
            return update(detections, frame=frame, timestamp=timestamp)

        def controlled_association(similarity, gate):
            result = associate(similarity, gate)
            self._stage += 1
            if self._stage == 1:
                self._remaining = [tracker.tracks[i] for i in result[1]]
                return result
            if self._stage != 2:
                raise ValueError('Unexpected pinned ByteTrack association stage')
            self.last = deferred_edges(similarity, gate, self._remaining, result[0])
            if not self.last:
                return result
            removed = {(e['row'], e['column']) for e in self.last}
            matched = [(r, c) for r, c in result[0] if (r, c) not in removed]
            rows = sorted(set(result[1]) | {r for r, c in removed})
            cols = sorted(set(result[2]) | {c for r, c in removed})
            return matched, rows, cols

        for name, replacement in [('update', controlled_update),
                                  ('_get_associated_indices', controlled_association)]:
            self._restore[name] = (name in tracker.__dict__, tracker.__dict__.get(name))
            setattr(tracker, name, replacement)
        return self

    def __exit__(self, exc_type, exc, tb):
        for name, (owned, value) in self._restore.items():
            if owned:
                setattr(self.tracker, name, value)
            else:
                delattr(self.tracker, name)
        self._restore.clear()
