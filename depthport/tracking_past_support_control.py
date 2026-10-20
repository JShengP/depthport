# SPDX-License-Identifier: AGPL-3.0-only
"""Offline causal support/protection ablations; no application registration.

Only recorded accepted observations BEFORE the decision qualify support. A
forced replacement checks feasibility, never installs another assignment. A
veto deliberately loses the selected missed update; scene harm gates test it.
All raw observation keys, object ownership tokens and audit details stay local.
"""
from __future__ import annotations

import numpy as np
from depthport.tracking_recovery_control import MARGIN

ARMS = ('activation_control', 'past_support_only', 'update_protection_only',
        'past_support_and_protection')


def role(track):
    if track.tracker_id < 0:
        return 'unconfirmed'
    return 'active' if track.time_since_update == 1 else 'retained'


def protect_updates(similarity, gate, selected, competitor, column, matched, assign=None):
    """Preserve EVERY other accepted row/observation pair, not just count.

    There is no global-cost cutoff or equality requirement. The intended
    selected-edge deferral is excluded from protection and remains a harm risk.
    """
    used = dict(matched)
    if competitor in used:
        return {'protected': False, 'reason': 'competitor_occupied', 'lost_other_updates': None}
    if assign is None:
        from scipy.optimize import linear_sum_assignment
        def assign(cost):
            return linear_sum_assignment(-cost, maximize=True)
    s = np.asarray(similarity, dtype=float)
    rows = [i for i in range(s.shape[0]) if i != competitor]
    cols = [j for j in range(s.shape[1]) if j != column]
    a, b = assign(-s[np.ix_(rows, cols)])
    forced = [(competitor, column)] + [(rows[int(i)], cols[int(j)]) for i, j in zip(a, b)]
    accepted = {(i, j) for i, j in forced if s[i, j] >= gate}
    other = {(i, j) for i, j in matched if i != selected}
    missing = len(other - accepted)
    safe = (competitor, column) in accepted and missing == 0 and len(accepted) >= len(matched)
    return {'protected': safe, 'reason': 'preserves_other_updates' if safe else 'displaces_other_update',
            'lost_other_updates': missing, 'alternative_accepted_count': len(accepted)}


class PastSupportDeferral:
    """Instance hook with independent, append-only histories in each arm.

    Birth indices are unknown: never invent keys. Object references are kept
    alive to prevent Python-id reuse; native output IDs never join histories.
    Hooks are restored on normal exit and exceptions.
    """
    def __init__(self, tracker, arm, assign=None):
        if arm not in ARMS:
            raise ValueError('Unknown past-support arm')
        self.tracker, self.arm, self.assign = tracker, arm, assign
        self.frame = 0; self.last = []; self.audit = []; self._restore = {}
        self._refs = {}; self._keys = {}; self._contexts = {}

    def _owner(self, track):
        key = id(track)
        if key not in self._refs:
            self._refs[key] = track; self._keys[key] = []
        return key

    def past_evidence(self, selected, competitor):
        r, q = self._owner(selected), self._owner(competitor)
        if role(competitor) != 'active':
            return {'qualified': False, 'reason': 'current_' + role(competitor)}
        if not self._keys[r] or not self._keys[q]:
            return {'qualified': False, 'reason': 'missing_recorded_history'}
        context = self._contexts.get(r)
        if context is None or context['key'][0] >= self.frame:
            raise ValueError('Support must strictly precede the decision')
        old = context['competitors'].get(q)
        if old is None:
            return {'qualified': False, 'reason': 'past_stage_comparison_missing'}
        if old['role'] != 'active':
            return {'qualified': False, 'reason': 'past_' + old['role']}
        if old['accepted_key'] is None:
            return {'qualified': False, 'reason': 'past_competitor_without_observation'}
        if not old['gate_supported']:
            return {'qualified': False, 'reason': 'past_below_gate'}
        if not old['gap_supported']:
            return {'qualified': False, 'reason': 'past_gap_not_supported'}
        # Exact immutable observation ownership, not numeric native-ID equality.
        if old['accepted_key'] not in self._keys[q] or context['key'] != self._keys[r][-1]:
            raise ValueError('Immutable support history differs')
        return {'qualified': True, 'reason': 'past_accepted_active_support',
                'selected_observation': context['key'], 'competitor_observation': old['accepted_key']}

    def _record(self, similarity, gate, refs, indices, matched):
        owners = [self._owner(t) for t in refs]
        observations = {owners[r]: (self.frame, int(indices[c])) for r, c in matched}
        pending = {}
        for r, c in matched:
            context = {}
            for q, track in enumerate(refs):
                if q == r:
                    continue
                score = float(similarity[q, c])
                context[owners[q]] = {'role': role(track), 'accepted_key': observations.get(owners[q]),
                    'gate_supported': score >= gate,
                    'gap_supported': score >= gate and float(similarity[r, c])-score <= MARGIN}
            pending[owners[r]] = {'key': observations[owners[r]], 'competitors': context}
        for owner, observation in observations.items():
            if observation in self._accepted_this_frame:
                raise ValueError('Duplicate immutable observation')
            if self._keys[owner] and self._keys[owner][-1][0] >= self.frame:
                raise ValueError('Observation history must be append-only')
            self._accepted_this_frame.add(observation)
            self._keys[owner].append(observation); self._contexts[owner] = pending[owner]

    def decide(self, similarity, gate, refs, matched):
        s = np.asarray(similarity)
        if s.shape[0] != len(refs) or not np.isfinite(s).all():
            raise ValueError('Unexpected similarity matrix')
        deferred = []; audit = []
        for r, c in matched:
            r, c = int(r), int(c)
            if refs[r].tracker_id < 0 or refs[r].time_since_update < 2:
                continue
            competitors = []
            for q, track in enumerate(refs):
                if q == r or s[q, c] < gate or s[r, c]-s[q, c] > MARGIN:
                    continue
                past = self.past_evidence(refs[r], track)
                protection = (protect_updates(s, gate, r, q, c, matched, self.assign)
                              if role(track) == 'active' else {'protected': False, 'reason': 'not_active', 'lost_other_updates': None})
                eligible = role(track) == 'active'
                selected = eligible and (self.arm == ARMS[1] and past['qualified']
                    or self.arm == ARMS[2] and protection['protected']
                    or self.arm == ARMS[3] and past['qualified'] and protection['protected'])
                competitors.append({'row': q, 'role': role(track), 'past': past,
                                    'protection': protection, 'selected': selected})
            if competitors:
                chosen = [q['row'] for q in competitors if q['selected']]
                edge = {'row': r, 'column': c, 'competitors': competitors, 'veto': bool(chosen)}
                audit.append(edge)
                if chosen:
                    deferred.append({'row': r, 'column': c, 'competitor_rows': chosen})
        return deferred, audit

    def __enter__(self):
        if self._restore:
            raise ValueError('Control already attached')
        tracker = self.tracker; original_update = tracker.update; associate = tracker._get_associated_indices
        def update(detections, frame=None, timestamp=None):
            if timestamp is not None:
                raise ValueError('Research rule requires fixed-step updates')
            self.frame += 1; self._stage = 0; self.last = []; self.audit = []; self._accepted_this_frame = set()
            scores = detections.confidence if detections.confidence is not None else np.ones(len(detections))
            self._high = np.flatnonzero(scores >= tracker.high_conf_det_threshold).tolist()
            self._low = np.flatnonzero(scores < tracker.high_conf_det_threshold).tolist()
            return original_update(detections, frame=frame, timestamp=timestamp)
        def association(similarity, gate):
            self._stage += 1
            if self._stage == 1:
                refs, indices = list(tracker.tracks), self._high
            elif self._stage == 2:
                refs, indices = self._remaining, self._low
            else:
                raise ValueError('Unexpected pinned ByteTrack stage')
            if similarity.shape != (len(refs), len(indices)):
                raise ValueError('Observation column mapping differs')
            result = associate(similarity, gate)
            if self._stage == 1:
                self._remaining = [refs[r] for r in result[1]]
            else:
                self.last, self.audit = self.decide(similarity, gate, refs, result[0])
                if self.last:
                    removed = {(e['row'], e['column']) for e in self.last}
                    result = ([(r, c) for r, c in result[0] if (r, c) not in removed],
                              sorted(set(result[1]) | {r for r, c in removed}),
                              sorted(set(result[2]) | {c for r, c in removed}))
            self._record(similarity, gate, refs, indices, result[0])
            return result
        for name, replacement in [('update', update), ('_get_associated_indices', association)]:
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
