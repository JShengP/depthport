# SPDX-License-Identifier: AGPL-3.0-only
"""Offline-only competition ablations; no app registration or GT input.

Keep the original weak assignment, then veto selected missed-track edges only.
Availability and equivalent one-to-one replacement are separate treatments.
"""
from __future__ import annotations

import numpy as np
from depthport.tracking_recovery_control import deferred_edges


ARMS = ('activation_control', 'defer_competing_recovery',
        'defer_available_competitor', 'defer_equivalent_assignment')
# Solver roundoff allowance, not a fitted tracking threshold.
OBJECTIVE_ATOL = 1e-12


def alternative_context(similarity, gate, row, col, matched, assign=None):
    """Force one edge, solve remaining assignment, compare actual accepted count.

    Solve unfiltered matrices just like upstream; apply the gate afterwards.
    Tied optimums are not enumerated: this tests the solver-returned alternative.
    """
    if assign is None:
        from scipy.optimize import linear_sum_assignment
        def assign(cost):
            return linear_sum_assignment(-cost,maximize=True)
    s=np.asarray(similarity,dtype=float)
    rr,cc=assign(-s); objective=float(s[rr,cc].sum())
    rows=[i for i in range(s.shape[0]) if i!=row]
    cols=[i for i in range(s.shape[1]) if i!=col]
    rr,cc=assign(-s[np.ix_(rows,cols)])
    pairs=[(row,col)]+[(rows[r],cols[c]) for r,c in zip(rr,cc)]
    loss=objective-float(sum(s[r,c] for r,c in pairs))
    if loss < -OBJECTIVE_ATOL:
        raise ValueError('Forced assignment exceeds original optimum')
    return {'similarity_sum_loss':max(0.,loss),
            'admissible_pair_change':int(sum(s[r,c]>=gate for r,c in pairs))-len(matched)}


def competition_decisions(similarity, gate, tracks, matched, mode, assign=None):
    """Return local audit plus vetoes; never reassign or mutate similarities.

    Equivalent alternative: full unfiltered objective loss <= roundoff and no
    loss in gate-admissible pair count under upstream assignment-then-gate.
    The alternative is evidence only; it is NEVER installed as a new matching.
    """
    if mode not in ARMS:
        raise ValueError('Unknown exclusive-competition arm')
    used = {int(r): int(c) for r,c in matched}
    audit = []; vetoes = []
    for edge in deferred_edges(similarity, gate, tracks, matched):
        competitors = []
        for row in edge['competitor_rows']:
            cost = alternative_context(similarity, gate, row, edge['column'], matched, assign)
            competitors.append({'row':row, 'assigned_elsewhere':row in used,
                **cost, 'equivalent':cost['similarity_sum_loss'] <= OBJECTIVE_ATOL
                                     and cost['admissible_pair_change'] >= 0})
        accepted = [c['row'] for c in competitors if
                    mode == ARMS[1] or mode == ARMS[2] and not c['assigned_elsewhere']
                    or mode == ARMS[3] and c['equivalent']]
        audit.append({**edge, 'competitors':competitors, 'veto':bool(accepted)})
        if accepted:
            vetoes.append({**edge, 'competitor_rows':accepted})
    return vetoes, audit


class ExclusiveDeferral:
    """Fixed-step instance hook; restored on normal exit and exceptions."""
    def __init__(self, tracker, arm):
        if arm not in ARMS:
            raise ValueError('Unknown arm')
        self.tracker, self.arm = tracker, arm
        self.last = []; self.audit = []; self._restore = {}

    def __enter__(self):
        if self._restore:
            raise ValueError('Control already attached')
        tracker = self.tracker
        update, associate = tracker.update, tracker._get_associated_indices
        def controlled_update(detections, frame=None, timestamp=None):
            if timestamp is not None:
                raise ValueError('Research control requires fixed-step updates')
            self._stage = 0; self.last = []; self.audit = []
            return update(detections, frame=frame, timestamp=timestamp)
        def controlled_association(similarity, gate):
            result = associate(similarity, gate)
            self._stage += 1
            if self._stage == 1:
                self._remaining = [tracker.tracks[i] for i in result[1]]
                return result
            if self._stage != 2:
                raise ValueError('Unexpected pinned ByteTrack association stage')
            self.last, self.audit = competition_decisions(
                similarity, gate, self._remaining, result[0], self.arm)
            if not self.last:
                return result
            removed = {(e['row'],e['column']) for e in self.last}
            return ([(r,c) for r,c in result[0] if (r,c) not in removed],
                    sorted(set(result[1]) | {r for r,c in removed}),
                    sorted(set(result[2]) | {c for r,c in removed}))
        for name,replacement in [('update',controlled_update),
                                  ('_get_associated_indices',controlled_association)]:
            self._restore[name] = (name in tracker.__dict__,tracker.__dict__.get(name))
            setattr(tracker,name,replacement)
        return self

    def __exit__(self, exc_type, exc, tb):
        for name,(owned,value) in self._restore.items():
            if owned:
                setattr(self.tracker,name,value)
            else:
                delattr(self.tracker,name)
        self._restore.clear()
