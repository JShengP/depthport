# SPDX-License-Identifier: AGPL-3.0-only
"""Instance-only, fixed-step ByteTrack lifecycle observation. Raw records local.

For the pinned research runtime only; no app/worker integration or intervention.
Original arguments, arrays, return objects, solver, births and pruning unchanged.
"""
from __future__ import annotations

import numpy as np


def require(ok, message):
    if not ok:
        raise ValueError(message)


def lifecycle_reason(track, tracker):
    """Mirror the pinned fixed-step post-association keep predicate for audit."""
    expired = track['age_since_update'] > tracker.maximum_frames_without_update
    mature = (track['tracker_id'] != -1 or
              track['consecutive_updates'] >= tracker.minimum_consecutive_frames)
    immature_lost = not mature and track['age_since_update'] != 0
    return ('expired_and_immature' if expired and immature_lost else
            'expired' if expired else 'immature_unmatched' if immature_lost else 'kept')


class LifecycleProbe:
    def __init__(self, tracker):
        self.tracker = tracker
        self.frame = 0
        self.last = None
        self._owners = {}
        self._restore = {}

    def token(self, track):
        key = id(track)
        if key not in self._owners:
            self._owners[key] = (track, len(self._owners) + 1)
        return self._owners[key][1]

    def snapshot(self, track):
        box = np.array(track.get_state_bbox(), copy=True)
        require(box.shape == (4,) and np.all(np.isfinite(box)), 'Finite native bbox required')
        return {'token': self.token(track), 'tracker_id': int(track.tracker_id),
                'bbox': box.tolist(), 'age': int(track.age),
                'age_since_update': float(track.time_since_update),
                'seconds_since_update': float(track.time_since_update_seconds),
                'consecutive_updates': int(track.number_of_successful_consecutive_updates)}

    def snapshots(self, tracks):
        return [self.snapshot(t) for t in tracks]

    def replace(self, name, method):
        self._restore[name] = (name in self.tracker.__dict__, self.tracker.__dict__.get(name))
        setattr(self.tracker, name, method)

    def __enter__(self):
        require(not self._restore, 'Lifecycle probe already attached')
        t = self.tracker
        update, predict, prune, associate, spawn = (
            t.update, t._predict_tracklets, t._prune_lost_tracks,
            t._get_associated_indices, t._spawn_new_tracks)

        def observed_predict(tracks, timing):
            require(not timing.uses_elapsed_time and not timing.skip_predict, 'Fixed-step timing required')
            self.last['before_predict'] = self.snapshots(tracks)
            result = predict(tracks, timing)
            self.last['predicted'] = self.snapshots(tracks)
            return result

        def observed_prune(timing):
            before = self.snapshots(t.tracks)
            result = prune(timing)
            after = self.snapshots(t.tracks)
            require(before == after, 'Pinned fixed-step pre-association prune must be a no-op')
            self.last['after_budget_prune'] = after
            return result

        def observed_association(similarity, gate):
            index = len(self.last['stages'])
            require(index < 2, 'Unexpected pinned association stage')
            refs = list(t.tracks) if index == 0 else self._remaining
            indices = self._high if index == 0 else self._weak
            copied = np.array(similarity, copy=True)
            require(copied.shape == (len(refs), len(indices)) and np.all(np.isfinite(copied)),
                    'Association geometry shape differs')
            states = self.snapshots(refs)
            result = associate(similarity, gate)
            matched, rows, cols = result
            self.last['stages'].append({'name': 'high_all' if index == 0 else 'weak_remaining',
                'gate': float(gate), 'tracks': states, 'detection_indices': list(indices),
                'similarity': copied.tolist(), 'matched': [[int(r), int(c)] for r,c in matched],
                'unmatched_rows': [int(r) for r in rows], 'unmatched_columns': [int(c) for c in cols]})
            if index == 0:
                self._remaining = [refs[r] for r in rows]
            return result

        def observed_spawn(boxes, confidences, unmatched, high_indices, out_indices, out_ids):
            before = list(t.tracks)
            candidates = [{'detection_index': int(high_indices[c]),
                           'confidence': float(confidences[int(high_indices[c])]),
                           'eligible': bool(float(confidences[int(high_indices[c])]) >= t.track_activation_threshold)}
                          for c in unmatched]
            result = spawn(boxes, confidences, unmatched, high_indices, out_indices, out_ids)
            require(all(a is b for a,b in zip(before, t.tracks)) and len(t.tracks) >= len(before),
                    'Native spawn changed existing ownership')
            born = t.tracks[len(before):]
            eligible = [c for c in candidates if c['eligible']]
            require(len(born) == len(eligible), 'Birth candidate count differs')
            self.last['birth_candidates'] = candidates
            self.last['births'] = [{'detection_index': c['detection_index'], 'state': self.snapshot(track),
                                   'reason': 'unmatched_high_above_activation'}
                                  for c,track in zip(eligible,born)]
            self.last['before_lifecycle_prune'] = self.snapshots(t.tracks)
            return result

        def observed_update(detections, frame=None, timestamp=None):
            require(timestamp is None, 'Lifecycle diagnosis requires fixed-step input')
            self.frame += 1
            scores = detections.confidence if detections.confidence is not None else np.ones(len(detections))
            self._high = np.flatnonzero(scores >= t.high_conf_det_threshold).tolist()
            self._weak = np.flatnonzero(scores < t.high_conf_det_threshold).tolist()
            self.last = {'frame': self.frame, 'input_boxes': np.array(detections.xyxy, copy=True).tolist(),
                'input_confidences': np.array(scores, copy=True).tolist(),
                'high_indices': self._high, 'weak_indices': self._weak,
                'before_update': self.snapshots(t.tracks), 'before_predict': [], 'predicted': [],
                'after_budget_prune': [], 'stages': [], 'birth_candidates': [], 'births': [],
                'before_lifecycle_prune': [], 'after_update': [], 'removals': []}
            result = update(detections, frame=frame, timestamp=timestamp)
            after = self.snapshots(t.tracks)
            self.last['after_update'] = after
            survivors = {s['token'] for s in after}
            for state in self.last['before_lifecycle_prune']:
                reason = lifecycle_reason(state, t)
                require((state['token'] in survivors) == (reason == 'kept'), 'Lifecycle predicate differs')
                if reason != 'kept':
                    self.last['removals'].append({'state': state, 'reason': reason})
            return result

        for name, method in (('_predict_tracklets', observed_predict), ('_prune_lost_tracks', observed_prune),
                             ('_get_associated_indices', observed_association), ('_spawn_new_tracks', observed_spawn),
                             ('update', observed_update)):
            self.replace(name, method)
        return self

    def __exit__(self, exc_type, exc, tb):
        for name,(owned,value) in self._restore.items():
            if owned:
                setattr(self.tracker, name, value)
            else:
                delattr(self.tracker, name)
        self._restore.clear()
