# SPDX-License-Identifier: AGPL-3.0-only
"""Separate opt-in causal high-stage candidates; never app/worker defaults."""
from collections import Counter
import numpy as np
from depthport.tracking_lifecycle_probe import require
from depthport.tracking_recovery_control import MARGIN

ARMS = ('reference', 'birth_continuation', 'past_competition_handoff')


def mutual_unique(edges):
    rows = Counter(r for r, c in edges); cols = Counter(c for r, c in edges)
    return sorted((r, c) for r, c in edges if rows[r] == cols[c] == 1)


def birth_additions(similarity, gate, unmatched_rows, unmatched_columns, qualified, eligible_columns, weak_blocked):
    edges = [(r, c) for r in unmatched_rows for c in unmatched_columns
             if qualified[r] and not weak_blocked[r] and c in eligible_columns and similarity[r, c] >= gate]
    return mutual_unique(edges)


def handoff_replacements(similarity, gate, matched, unmatched_rows, supported, weak_blocked):
    candidates = []
    for r, c in matched:
        alternatives = [q for q in unmatched_rows if not weak_blocked[q] and supported(r, q)
                        and similarity[q, c] >= gate and similarity[r, c] - similarity[q, c] <= MARGIN]
        if len(alternatives) == 1: candidates.append((r, c, alternatives[0]))
    claims = Counter(q for r, c, q in candidates)
    return [(r, c, q) for r, c, q in candidates if claims[q] == 1]


class HandoffCandidate:
    """Enter BEFORE LifecycleProbe, Shadow and GeometryProjection.

    LifecycleProbe observes the final actual assignment, numerical methods execute
    once natively, and immutable accepted contexts commit only after the frame.
    """
    def __init__(self, tracker, arm):
        require(arm in ARMS, 'Unknown independent candidate')
        self.tracker = tracker; self.arm = arm; self.frame = 0; self.restore = {}
        self.refs = {}; self.keys = {}; self.contexts = {}; self.last = None

    def owner(self, track):
        key = id(track)
        if key not in self.refs: self.refs[key] = track; self.keys[key] = []
        return key

    def supported(self, r, q):
        a, b = self._owners[r], self._owners[q]
        if not self._qualified[r] or not self._qualified[q]: return False
        if not all(self._pre[o]['active'] and self._pre[o]['confirmed'] for o in (a, b)): return False
        if not all(self.keys[o] and self.keys[o][-1][0] == self.frame - 1 for o in (a, b)): return False
        context = self.contexts.get(a)
        if context is None or context['frame'] != self.frame - 1 or context['key'] != self.keys[a][-1]: return False
        other = context['comparisons'].get(b)
        return bool(other and other['active_confirmed'] and other['gate'] and other['gap']
                    and self.keys[a][-1][:2] != self.keys[b][-1][:2])

    def __enter__(self):
        require(not self.restore and not self.tracker.tracks, 'Fresh isolated tracker required')
        t = self.tracker; update = t.update; associate = t._get_associated_indices
        def observed(detections, frame=None, timestamp=None):
            require(timestamp is None, 'Fixed-step research only')
            self.frame += 1; self._stage = 0; self._pending = []; self._remaining = []
            self._owners = [self.owner(track) for track in t.tracks]
            self._pre = {self.owner(track): {'active': track.time_since_update == 0,
                'confirmed': track.tracker_id >= 0} for track in t.tracks}
            scores = detections.confidence if detections.confidence is not None else np.ones(len(detections))
            self._high = np.flatnonzero(scores >= t.high_conf_det_threshold).tolist()
            self._weak = np.flatnonzero(scores < t.high_conf_det_threshold).tolist()
            self._eligible = {i for i, index in enumerate(self._high) if float(scores[index]) >= t.track_activation_threshold}
            self._weak_boxes = detections.xyxy[self._weak].copy()
            self.last = {'frame': self.frame, 'arm': self.arm, 'actions': [], 'weak_blocked_rows': 0,
                         'weak_stages': 0, 'protected_other_updates_lost': 0}
            result = update(detections, frame=frame, timestamp=timestamp)
            # No same-frame accepted key can qualify another high-stage decision.
            for owner, key, context in self._pending:
                require(not self.keys[owner] or self.keys[owner][-1][0] < self.frame, 'Append-only one-to-one acceptance required')
                self.keys[owner].append(key)
                if context is not None: self.contexts[owner] = context
            return result
        def association(similarity, gate):
            self._stage += 1; s = np.asarray(similarity)
            native = associate(similarity, gate)
            matched = [(int(r), int(c)) for r, c in native[0]]
            rows = list(native[1]); cols = list(native[2])
            refs = list(t.tracks) if self._stage == 1 else self._remaining
            indices = self._high if self._stage == 1 else self._weak
            require(self._stage in (1, 2) and s.shape == (len(refs), len(indices)) and np.isfinite(s).all(), 'Pinned stage dimensions required')
            original = set(matched); intended = set()
            if self._stage == 1:
                require([self.owner(x) for x in refs] == self._owners, 'Predecision ownership differs')
                weak_blocked = [False] * len(refs)
                if self.arm != 'reference' and refs:
                    boxes = np.array([track.get_state_bbox() for track in refs])
                    weak = t.iou.compute(boxes.copy(), self._weak_boxes.copy())
                    require(weak.shape == (len(refs), len(self._weak)) and np.isfinite(weak).all(), 'Original weak gate geometry required')
                    weak_blocked = np.any(weak >= gate, axis=1).tolist()
                    self.last['weak_blocked_rows'] = sum(weak_blocked)
                qualified = [self._pre[o]['confirmed'] and bool(self.keys[o])
                             and self.keys[o][-1][0] < self.frame
                             and refs[i].get_state_bbox()[2] > refs[i].get_state_bbox()[0]
                             and refs[i].get_state_bbox()[3] > refs[i].get_state_bbox()[1]
                             for i, o in enumerate(self._owners)]
                self._qualified = qualified
                if self.arm == 'birth_continuation':
                    for r, c in birth_additions(s, gate, rows, cols, qualified, self._eligible, weak_blocked):
                        matched.append((r, c)); rows.remove(r); cols.remove(c)
                        self.last['actions'].append({'kind': 'birth_continuation', 'row': r, 'column': c,
                            'active_before': self._pre[self._owners[r]]['active']})
                elif self.arm == 'past_competition_handoff':
                    replacements = handoff_replacements(s, gate, matched, rows, self.supported, weak_blocked)
                    for r, c, q in replacements:
                        matched.remove((r, c)); matched.append((q, c)); rows.remove(q); rows.append(r); intended.add((r, c))
                        self.last['actions'].append({'kind': 'past_competition_handoff', 'row': r, 'column': c, 'alternative_row': q})
                missing = (original - intended) - set(matched)
                self.last['protected_other_updates_lost'] = len(missing)
                require(not missing and len({r for r, c in matched}) == len(matched)
                    and len({c for r, c in matched}) == len(matched) and len(matched) >= len(original), 'One-to-one protected high updates required')
                self._remaining = [refs[r] for r in sorted(rows)]
            else: self.last['weak_stages'] += 1  # Original native weak result remains untouched.
            for r, c in matched:
                owner = self.owner(refs[r]); key = (self.frame, int(indices[c]), 'high' if self._stage == 1 else 'weak')
                context = None
                if self._stage == 1:
                    context = {'frame': self.frame, 'key': key, 'comparisons': {
                        self.owner(track): {'active_confirmed': self._pre[self.owner(track)]['active'] and self._pre[self.owner(track)]['confirmed'],
                            'gate': bool(s[q, c] >= gate), 'gap': bool(s[r, c] - s[q, c] <= MARGIN)}
                        for q, track in enumerate(refs) if q != r}}
                self._pending.append((owner, key, context))
            return matched, sorted(rows), sorted(cols)
        for name, fn in (('update', observed), ('_get_associated_indices', association)):
            self.restore[name] = (name in vars(t), vars(t).get(name)); setattr(t, name, fn)
        return self

    def __exit__(self, *exc):
        for name, (owned, value) in self.restore.items():
            if owned: setattr(self.tracker, name, value)
            else: delattr(self.tracker, name)
        self.restore.clear()
