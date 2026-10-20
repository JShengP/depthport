# SPDX-License-Identifier: AGPL-3.0-only
"""Read-only recovery lineage and evaluator-assignment diagnostics.

All identifiers, frames, matrices and correspondence anchors are local-only.
Public callers must select fixed-label aggregate counts from these results.
"""
from __future__ import annotations

from collections import defaultdict
import importlib
import numpy as np

from depthport.tracking_diagnostics import cache_index


def prediction_keys(prediction, cache, scale):
    """GT-free immutable-observation bridge; never compare IDs between arms."""
    by_key = {}; by_id = defaultdict(list)
    for frame in prediction['frames']:
        f = frame['index']
        for obj in frame['objects']:
            x, y, xx, yy = obj['bbox']
            index = cache_index([x*scale+1,y*scale+1,(xx-x)*scale,(yy-y)*scale],
                obj['confidence'],cache['frames'][f-1]['detections'],scale)
            key = (f,index); native = int(obj['object_id'].rsplit('-',1)[1])
            if key in by_key:
                raise ValueError('Duplicate immutable observation')
            by_key[key] = native; by_id[native].append(key)
    return by_key, dict(by_id)


def bridge_prefix(native, before_frame, source, target):
    """Bridge via last shared input then require equal nonempty prior histories.

    Returned native IDs belong to target only. Equality is on observation keys,
    not ID numbers or GT ownership; divergence after the anchor remains local.
    """
    keys = [key for key in source[1].get(native,[]) if key[0] < before_frame]
    if not keys:
        return None
    other = target[0].get(keys[-1])
    if other is None:
        return None
    wanted = [key for key in target[1][other] if key[0] < before_frame]
    return other if wanted == keys else None


def column_context(stage, detection_index, native=None):
    if detection_index not in stage['detection_indices']:
        return {'column_present':False}
    col = stage['detection_indices'].index(detection_index)
    refs = stage['tracks']; similarity = stage['similarity']; gate = stage['gate']
    eligible = [r for r in range(len(refs)) if similarity[r][col] >= gate]
    used_rows = {r:c for r,c in stage['matched']}
    row = next((r for r,t in enumerate(refs) if t['tracker_id'] == native),None)
    return {'column_present':True,'admissible_rows':len(eligible),
        'admissible_unmatched_rows':sum(r not in used_rows for r in eligible),
        'column_matched':any(c == col for r,c in stage['matched']),
        'target_present':row is not None,
        'target_age':refs[row]['age_since_update'] if row is not None else None,
        'target_similarity':similarity[row][col] if row is not None else None,
        'target_admissible':row is not None and similarity[row][col] >= gate,
        'target_assigned_other_column':row in used_rows and used_rows[row] != col}


def forced_competitor_cost(similarity, gate, competitor_row, column, assign=None):
    """Diagnostic full-assignment opportunity cost, never a tracking decision.

    Preserve upstream assignment-then-gate semantics. Force this row/column,
    solve the remaining one-to-one problem, then report unfiltered objective
    loss and the change in gate-admissible pairs. Not a probability/ID loss.
    """
    if assign is None:
        from scipy.optimize import linear_sum_assignment
        assign = linear_sum_assignment
    s = np.asarray(similarity,dtype=float)
    rows,cols = assign(-s)
    baseline = float(s[rows,cols].sum())
    keep_rows = [r for r in range(s.shape[0]) if r != competitor_row]
    keep_cols = [c for c in range(s.shape[1]) if c != column]
    r,c = assign(-s[np.ix_(keep_rows,keep_cols)])
    forced = [(competitor_row,column)]+[(keep_rows[i],keep_cols[j]) for i,j in zip(r,c)]
    objective = sum(s[i,j] for i,j in forced)
    return {'similarity_sum_loss':max(0.,baseline-float(objective)),
            'admissible_pair_change':int(sum(s[i,j]>=gate for i,j in forced))-int(np.sum(s[rows,cols]>=gate))}


class HOTAAssignmentProbe:
    """Observe the original pinned evaluator solver in an isolated process.

    No copied metric implementation or changed scores/solver arguments. Restore
    the module function on exit/failure. Not thread-safe; offline audit only.
    """
    def __init__(self, metric, data):
        self.module = importlib.import_module(type(metric).__module__)
        self.data = data; self.calls = []; self._original = None
        self.nonempty = [f for f,(g,t) in enumerate(zip(data['gt_ids'],data['tracker_ids'])) if len(g) and len(t)]

    def __enter__(self):
        if self._original is not None:
            raise ValueError('Probe already attached')
        self._original = self.module.linear_sum_assignment
        def observe(cost, *args, **kwargs):
            if len(self.calls) >= len(self.nonempty):
                raise ValueError('Unexpected evaluator assignment call')
            f = self.nonempty[len(self.calls)]
            copied = np.array(cost,copy=True)
            result = self._original(cost,*args,**kwargs)
            rows, cols = result
            self.calls.append({'frame':f+1,'cost':copied,
                'rows':np.asarray(rows).copy(),'cols':np.asarray(cols).copy()})
            return result
        self.module.linear_sum_assignment = observe
        return self

    def __exit__(self, exc_type, exc, tb):
        self.module.linear_sum_assignment = self._original
        self._original = None

    def matches(self, alpha):
        if len(self.calls) != len(self.nonempty):
            raise ValueError('Incomplete evaluator trace')
        result = [dict() for _ in self.data['gt_ids']]
        for call in self.calls:
            f = call['frame']-1
            similarity = self.data['similarity_scores'][f]
            for row,col in zip(call['rows'],call['cols']):
                if similarity[row,col] >= alpha-np.finfo(float).eps:
                    result[f][int(self.data['gt_ids'][f][row])] = {
                        'col':int(col),'tid':int(self.data['tracker_ids'][f][col])}
        return result


def hota_match_changes(reference, candidate, reference_probe, candidate_probe,
                       reference_keys, candidate_keys, alphas, expected_reference, expected_candidate):
    """Compare GT-frame detection matches, never IDs across runs."""
    records = []; private = []; retained_keys = set(candidate_keys.values())
    candidate_calls = {c['frame']:c for c in candidate_probe.calls} if hasattr(candidate_probe,'calls') else {}
    for a,alpha in enumerate(alphas):
        old = reference_probe.matches(alpha); new = candidate_probe.matches(alpha)
        old_set = {(f,g) for f,items in enumerate(old,1) for g in items}
        new_set = {(f,g) for f,items in enumerate(new,1) for g in items}
        if (len(old_set) != expected_reference['HOTA_TP'][a]
            or len(new_set) != expected_candidate['HOTA_TP'][a]):
            raise ValueError('Observed matches differ from official HOTA TP')
        lost = sorted(old_set-new_set); gained = sorted(new_set-old_set)
        counts = {'lost':len(lost),'gained':len(gained),'lost_reference_detection_retained':0,
                  'lost_reference_detection_removed':0,'lost_still_has_geometric_support':0,
                  'lost_supported_row_unselected':0,'lost_supported_selected_below_alpha':0}
        for f,g in lost:
            col = old[f-1][g]['col']; key = reference_keys[(f,col)]
            retained = key in retained_keys
            row = list(candidate['gt_ids'][f-1]).index(g)
            support = bool(np.any(candidate['similarity_scores'][f-1][row] >= alpha-np.finfo(float).eps))
            counts['lost_reference_detection_retained' if retained else 'lost_reference_detection_removed'] += 1
            counts['lost_still_has_geometric_support'] += support
            call = candidate_calls.get(f)
            selected_col = next((int(c) for r,c in zip(call['rows'],call['cols']) if r==row),None) if call else None
            if call and support:
                counts['lost_supported_row_unselected'] += selected_col is None
                counts['lost_supported_selected_below_alpha'] += selected_col is not None
            private.append({'alpha':float(alpha),'frame':f,'gt':g,'reference_key':key,
                            'reference_detection_retained':retained,'geometric_support':support,
                            'reference_iou':float(reference['similarity_scores'][f-1][list(reference['gt_ids'][f-1]).index(g),col]),
                            'candidate_selected_col':selected_col})
        records.append({'alpha':round(float(alpha),2), **counts,
            'reference_tp':len(old_set),'candidate_tp':len(new_set),
            'delta_hota':float(expected_candidate['HOTA'][a]-expected_reference['HOTA'][a]),
            'delta_deta':float(expected_candidate['DetA'][a]-expected_reference['DetA'][a]),
            'delta_assa':float(expected_candidate['AssA'][a]-expected_reference['AssA'][a])})
    return records, private
