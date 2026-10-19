#!/usr/bin/env python3
# SPDX-License-Identifier: AGPL-3.0-only
"""Describe frozen reference alternatives, without tracking, GT or new gates.

Reconcile every input hash and assignment before emitting numeric aggregates.
Per-alternative details are written only to the required ignored local path.
The changed-edge component, not incidental solver ties elsewhere, is the unit
of structural diagnosis. This is post-selection analysis, not preregistration.
"""
from __future__ import annotations

import argparse
from collections import Counter
import importlib.metadata
import json
from pathlib import Path
import sys

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from depthport.tracking_exclusive_control import OBJECTIVE_ATOL
from depthport.tracking_recovery_control import MARGIN
from depthport.video_tracking_benchmark import sha256_file


def require(ok, message):
    if not ok:
        raise ValueError(message)


def close(a, b):
    return abs(a - b) <= OBJECTIVE_ATOL


def changed_component(old, new, column):
    """Symmetric difference of two matchings is disjoint paths/cycles."""
    edges = set(old.items()) ^ set(new.items())
    graph = {}
    for r, c in edges:
        a, b = ('r', r), ('c', c)
        graph.setdefault(a, set()).add(b)
        graph.setdefault(b, set()).add(a)
    pending = [('c', column)]; seen = set()
    while pending:
        node = pending.pop()
        if node not in seen:
            seen.add(node); pending.extend(graph.get(node, ()))
    require(len(seen) > 1, 'Forced target must change matching')
    require(all(1 <= len(graph[n]) <= 2 for n in seen), 'Invalid matching graph')
    kind = 'cycle' if all(len(graph[n]) == 2 for n in seen) else 'path'
    return seen, kind


def describe(stage, edge, competitor, assign=None):
    """Private scalar diagnosis of one forced competitor/target association.

    assign accepts a minimum-cost matrix, for NumPy-only synthetic tests.
    Below-gate solver pairs contribute to the objective but never update rows.
    """
    if assign is None:
        from scipy.optimize import linear_sum_assignment
        def assign(cost):
            return linear_sum_assignment(-cost, maximize=True)
    s = np.asarray(stage['similarity'], dtype=float).reshape(
        len(stage['tracks']), len(stage['detection_indices']))
    require(np.isfinite(s).all() and np.all((s >= 0) & (s <= 1)), 'Invalid similarity')
    gate = stage['gate']; r, c, q = edge['row'], edge['column'], competitor['row']
    require(r != q and 0 <= r < s.shape[0] and 0 <= q < s.shape[0]
            and 0 <= c < s.shape[1], 'Invalid alternative indices')
    rr, cc = assign(-s)
    old = dict(zip(map(int, rr), map(int, cc)))
    accepted = {i: j for i, j in old.items() if s[i, j] >= gate}
    require(set(accepted.items()) == set(map(tuple, stage['matched'])), 'Original assignment differs')
    require(accepted.get(r) == c, 'Candidate is not the selected accepted edge')
    require(bool(competitor['assigned_elsewhere']) == (q in accepted), 'Occupancy differs')
    rows = [i for i in range(s.shape[0]) if i != q]
    cols = [i for i in range(s.shape[1]) if i != c]
    rr, cc = assign(-s[np.ix_(rows, cols)])
    new = {q: c, **{rows[int(i)]: cols[int(j)] for i, j in zip(rr, cc)}}
    after = {i: j for i, j in new.items() if s[i, j] >= gate}
    cost = float(sum(s[i, j] for i, j in old.items()) - sum(s[i, j] for i, j in new.items()))
    delta = float(s[r, c] - s[q, c])
    require(cost >= -OBJECTIVE_ATOL and close(cost, competitor['similarity_sum_loss']), 'Alternative cost differs')
    gate_delta = len(after) - len(accepted)
    require(gate_delta == competitor['admissible_pair_change'], 'Accepted count differs')
    require(bool(competitor['equivalent']) == (cost <= OBJECTIVE_ATOL and gate_delta >= 0), 'Equivalence differs')
    nodes, kind = changed_component(old, new, c)
    component_rows = {i for t, i in nodes if t == 'r'}
    component_cost = float(sum(s[i, j] for i, j in old.items() if i in component_rows)
                           - sum(s[i, j] for i, j in new.items() if i in component_rows))
    changed = {i for i in set(old) | set(new) if old.get(i) != new.get(i)}
    accepted_cost = float(sum(s[i, j] for i, j in accepted.items())
                          - sum(s[i, j] for i, j in after.items()))
    # C = same-column delta + all other reassignment contributions.
    residual = float(sum(s[i, j] for i, j in old.items() if (i, j) != (r, c))
                     - sum(s[i, j] for i, j in new.items() if (i, j) != (q, c)))
    require(close(cost, delta + residual), 'Cost decomposition differs')
    outside_cost = cost - component_cost
    require(close(outside_cost, 0.), 'Unforced component changed objective')
    return {
        'column_gap': delta, 'objective_loss': cost, 'other_assignment_cost': residual,
        'component_objective_loss': component_cost, 'outside_objective_loss': outside_cost,
        'accepted_objective_loss': accepted_cost, 'rejected_objective_loss': cost - accepted_cost,
        'occupied': q in accepted, 'competitor_in_full_assignment': q in old,
        'component_kind': kind, 'component_rows': len(component_rows),
        'outside_changed_rows': len(changed - component_rows), 'changed_rows': len(changed),
        'accepted_count_change': gate_delta, 'selected_row_updated_after': r in after,
        'lost_updated_rows': len(set(accepted) - set(after)),
        'gained_updated_rows': len(set(after) - set(accepted)),
        'changed_update_rows': len({i for i in set(accepted) | set(after)
                                    if accepted.get(i) != after.get(i)}),
    }


def distribution(values):
    if not values:
        return None
    a = np.asarray(values, dtype=float)
    return dict(zip(('min', 'q25', 'median', 'q75', 'max'),
                    map(float, np.quantile(a, [0, .25, .5, .75, 1]))))


def counts(rows, key):
    return {str(k): v for k, v in sorted(Counter(r[key] for r in rows).items())}


def summarize(rows):
    """Fixed whitelist: private locations/tokens/row details cannot leak here."""
    return {
        'alternatives': len(rows), 'occupied': sum(r['occupied'] for r in rows),
        'available_but_solver_assigned': sum(not r['occupied'] and r['competitor_in_full_assignment'] for r in rows),
        'negative_column_gap': sum(r['column_gap'] < 0 for r in rows),
        'column_gap_below_negative_legacy_margin': sum(r['column_gap'] < -MARGIN for r in rows),
        'positive_other_assignment_cost': sum(r['other_assignment_cost'] > OBJECTIVE_ATOL for r in rows),
        'exact_objective_ties': sum(r['objective_loss'] <= OBJECTIVE_ATOL for r in rows),
        'selected_row_loses_update': sum(not r['selected_row_updated_after'] for r in rows),
        'outside_component_changes': sum(r['outside_changed_rows'] > 0 for r in rows),
        'nonzero_rejected_contribution': sum(abs(r['rejected_objective_loss']) > OBJECTIVE_ATOL for r in rows),
        'equal_count_different_updated_rows': sum(r['accepted_count_change'] == 0 and r['lost_updated_rows'] > 0 for r in rows),
        'distributions': {k: distribution([r[k] for r in rows]) for k in
            ('column_gap', 'objective_loss', 'other_assignment_cost', 'accepted_objective_loss', 'rejected_objective_loss')},
        'component_kind': counts(rows, 'component_kind'), 'component_rows': counts(rows, 'component_rows'),
        'changed_rows': counts(rows, 'changed_rows'), 'accepted_count_change': counts(rows, 'accepted_count_change'),
        'lost_updated_rows': counts(rows, 'lost_updated_rows'), 'gained_updated_rows': counts(rows, 'gained_updated_rows'),
        'changed_update_rows': counts(rows, 'changed_update_rows'),
    }


def verify_hash(path, expected):
    require(sha256_file(path) == expected, 'Frozen input or implementation hash differs: ' + path.name)


def analyze(protocol_path, phase_inputs, assign=None, check_runtime=True):
    protocol = json.loads(protocol_path.read_text()); digest = sha256_file(protocol_path)
    for name, expected in protocol['implementation_sha256'].items():
        verify_hash(ROOT / name, expected)
    runtime = {k: importlib.metadata.version(k) for k in ('numpy', 'scipy')} if check_runtime else {}
    if check_runtime:
        require(all(runtime[k] == protocol['runtime'][k] for k in runtime), 'Use original NumPy/SciPy runtime')
    require(len(phase_inputs) == 2, 'Both complete phases required')
    all_rows = []; phases = []
    for expected_phase, (record_path, raw_dir) in zip(('discovery', 'confirmation'), phase_inputs):
        record = json.loads(record_path.read_text())
        require(record['phase'] == expected_phase and record['protocol_sha256'] == digest, 'Phase/protocol differs')
        require(record['gt_read'] is False and record['accuracy_scoring'] is False, 'GT-free records required')
        if expected_phase == 'confirmation':
            require(record['discovery_sha256'] == sha256_file(phase_inputs[0][0]), 'Discovery seal differs')
            discovery = json.loads(phase_inputs[0][0].read_text())
            require(record['input_lock_sha256'] == discovery['input_lock_sha256'], 'Input locks differ')
        expected_scenes = [s for s in protocol['sequences'] if s['phase'] == expected_phase]
        require([s['name'] for s in record['ledger']] == [s['name'] for s in expected_scenes], 'Incomplete/reordered ledger')
        scenes = []; phase_rows = []
        for scene, expected in zip(record['ledger'], expected_scenes):
            require(scene['status'] == 'completed' and scene['frames'] == expected['frames'], 'Incomplete scene')
            reference = scene['arms']['activation_control']
            path = raw_dir / scene['name'] / 'activation_control-trace.local.jsonl'
            verify_hash(path, reference['trace_sha256'])
            rows = []; candidate_edges = 0; candidate_frames = 0; nframes = 0
            with path.open() as file:
                for number, line in enumerate(file, 1):
                    frame = json.loads(line); nframes += 1
                    require(frame['frame'] == number, 'Frame sequence differs')
                    stage = frame['stages'][1]
                    require(stage['name'] == 'weak_remaining', 'Wrong weak stage')
                    require(not frame['deferred'], 'Reference must not defer')
                    candidate_frames += bool(frame['competition_audit'])
                    for edge in frame['competition_audit']:
                        candidate_edges += 1
                        for competitor in edge['competitors']:
                            row = describe(stage, edge, competitor, assign)
                            # All locations/identifiers are strictly local.
                            row.update(phase=expected_phase, scene=scene['name'], frame=number,
                                       selected_token=stage['tracks'][edge['row']]['token'],
                                       competitor_token=stage['tracks'][competitor['row']]['token'])
                            rows.append(row)
            require(nframes == scene['frames'], 'Trace length differs')
            require(candidate_edges == reference['counts']['legacy_eligible_edges']
                    and len(rows) == reference['counts']['competitor_alternatives'], 'Exposure counts differ')
            unique_pairs = {(r['selected_token'], r['competitor_token']) for r in rows}
            scenes.append({'name': scene['name'], 'frames_inspected': nframes,
                           'candidate_frames': candidate_frames, 'candidate_edges': candidate_edges,
                           'distinct_directed_hypothesis_pairs': len(unique_pairs), 'summary': summarize(rows)})
            phase_rows.extend(rows)
        phases.append({'phase': expected_phase, 'record_sha256': sha256_file(record_path),
                       'sequences': scenes, 'summary': summarize(phase_rows)})
        all_rows.extend(phase_rows)
    result = {
        'format': 'depthport.competition-structure.v1',
        'scope': 'Post-selection description of frozen reference candidates only; not global uniqueness, GT identity ambiguity or quality acceptance.',
        'protocol_sha256': digest, 'runtime': runtime, 'objective_roundoff_atol': OBJECTIVE_ATOL,
        'historical_signed_column_margin': MARGIN,
        'analysis_sha256': sha256_file(Path(__file__)),
        'tracking_rerun': False, 'retuned': False, 'gt_read': False, 'raw_details_public': False,
        'phases': phases, 'combined': summarize(all_rows),
        'by_occupancy': {name: summarize([r for r in all_rows if r['occupied'] == flag])
                         for name, flag in (('occupied', True), ('available', False))},
    }
    return result, all_rows


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--protocol', type=Path, required=True)
    p.add_argument('--phase', nargs=2, action='append', required=True, metavar=('RECORD', 'RAW_DIRECTORY'))
    p.add_argument('--output', type=Path, required=True)
    p.add_argument('--local-details', type=Path, required=True)
    a = p.parse_args()
    local = a.local_details.resolve()
    require(local.is_relative_to(ROOT / 'artifacts') and '.local.' in local.name, 'Details must stay in ignored artifacts with .local. name')
    result, details = analyze(a.protocol, [(Path(r), Path(d)) for r, d in a.phase])
    local.parent.mkdir(parents=True, exist_ok=True)
    local.write_text(json.dumps(details, indent=2, allow_nan=False) + '\n')
    a.output.write_text(json.dumps(result, indent=2, allow_nan=False) + '\n')
    print(json.dumps({'alternatives': result['combined']['alternatives'], 'phases': len(result['phases']),
                      'tracking_rerun': False, 'gt_read': False}))


if __name__ == '__main__':
    main()
