# SPDX-License-Identifier: AGPL-3.0-only
"""Exact synthetic assignment mechanisms, without SciPy/data/model installs."""
import itertools
import json
import numpy as np
import pytest
from tools.diagnose_tracking_competition import describe, summarize, verify_hash, changed_component


def assignment(cost):
    n, m = cost.shape
    if n > m:
        c, r = assignment(cost.T)
        return r, c
    best = min(itertools.permutations(range(m), n), key=lambda cols: sum(cost[i, j] for i, j in enumerate(cols)))
    return np.arange(n), np.asarray(best, dtype=int)


def case(similarity, gate=.1, row=0, col=0, competitor=1):
    s = np.asarray(similarity, dtype=float)
    rr, cc = assignment(-s)
    matched = [(int(r), int(c)) for r, c in zip(rr, cc) if s[r, c] >= gate]
    rows = [i for i in range(len(s)) if i != competitor]
    cols = [j for j in range(s.shape[1]) if j != col]
    a, b = assignment(-s[np.ix_(rows, cols)])
    pairs = [(competitor, col)] + [(rows[i], cols[j]) for i, j in zip(a, b)]
    loss = float(s[rr, cc].sum() - sum(s[i, j] for i, j in pairs))
    delta = int(sum(s[i, j] >= gate for i, j in pairs)) - len(matched)
    stage = {'similarity': s.tolist(), 'tracks': [{}] * len(s),
             'detection_indices': list(range(s.shape[1])), 'gate': gate, 'matched': matched}
    edge = {'row': row, 'column': col}
    other = {'row': competitor, 'assigned_elsewhere': competitor in dict(matched),
             'similarity_sum_loss': loss, 'admissible_pair_change': delta,
             'equivalent': loss <= 1e-12 and delta >= 0}
    return stage, edge, other


def test_better_same_column_competitor_has_large_global_opportunity_cost():
    d = describe(*case([[.4, .1], [.6, .9]]), assignment)
    assert d['column_gap'] == pytest.approx(-.2)
    assert d['objective_loss'] == pytest.approx(.6)
    assert d['other_assignment_cost'] == pytest.approx(.8)
    assert d['component_kind'] == 'cycle' and d['component_rows'] == 2
    assert d['selected_row_updated_after'] and d['accepted_count_change'] == 0


def test_equal_cardinality_can_replace_updated_hypothesis_and_uses_subgate_cost():
    d = describe(*case([[.4, .01], [.38, .02]]), assignment)
    assert not d['occupied'] and d['competitor_in_full_assignment']
    assert d['objective_loss'] == pytest.approx(.03)
    assert d['accepted_objective_loss'] == pytest.approx(.02)
    assert d['rejected_objective_loss'] == pytest.approx(.01)
    assert d['accepted_count_change'] == 0 and not d['selected_row_updated_after']
    assert d['lost_updated_rows'] == d['gained_updated_rows'] == 1
    assert summarize([d])['equal_count_different_updated_rows'] == 1


def test_rectangular_unmatched_competitor_creates_path_not_cycle():
    d = describe(*case([[.4], [.39]]), assignment)
    assert d['component_kind'] == 'path' and d['component_rows'] == 2
    assert not d['competitor_in_full_assignment'] and not d['occupied']
    assert d['objective_loss'] == pytest.approx(.01)


def test_three_row_cycle_is_not_counted_as_independent_two_row_swap():
    d = describe(*case([[.5, 0, .45], [.55, .8, 0], [0, .7, .8]]), assignment)
    assert d['component_kind'] == 'cycle' and d['component_rows'] == 3
    assert d['changed_rows'] == 3 and d['changed_update_rows'] == 3
    assert d['objective_loss'] == pytest.approx(.4)


def test_equal_objective_can_still_lose_gate_admissible_pair():
    d = describe(*case([[.5, 0], [.6, .1]], gate=.1), assignment)
    assert d['objective_loss'] == pytest.approx(0.)
    assert d['accepted_count_change'] == -1
    assert not d['selected_row_updated_after']


def test_unrelated_tie_component_excluded_from_target_component():
    old = {0: 0, 1: 1, 2: 2, 3: 3}
    new = {0: 1, 1: 0, 2: 3, 3: 2}
    nodes, kind = changed_component(old, new, 0)
    assert kind == 'cycle' and nodes == {('r', 0), ('r', 1), ('c', 0), ('c', 1)}


def test_residual_solver_tie_changes_do_not_enlarge_target_exchange():
    def tied_solver(cost):
        if cost.shape == (3, 3):
            return np.arange(3), np.array([0, 2, 1])
        return assignment(cost)
    matrix = [[.4, .1, 0, 0], [.6, .9, 0, 0],
              [0, 0, .02, .02], [0, 0, .02, .02]]
    d = describe(*case(matrix), tied_solver)
    assert d['changed_rows'] == 4 and d['outside_changed_rows'] == 2
    assert d['component_rows'] == 2 and d['outside_objective_loss'] == pytest.approx(0.)
    assert d['component_objective_loss'] == pytest.approx(d['objective_loss'])


@pytest.mark.parametrize('field,value,message', [
    ('similarity_sum_loss', .123, 'cost'), ('admissible_pair_change', 12, 'count'),
    ('assigned_elsewhere', False, 'Occupancy'), ('equivalent', True, 'Equivalence')])
def test_frozen_alternative_mismatch_fails_closed(field, value, message):
    stage, edge, other = case([[.4, .1], [.6, .9]])
    other[field] = value
    with pytest.raises(ValueError, match=message):
        describe(stage, edge, other, assignment)


def test_original_assignment_and_matrix_must_reconcile():
    stage, edge, other = case([[.4, .1], [.6, .9]])
    stage['matched'] = [(0, 1), (1, 0)]
    with pytest.raises(ValueError, match='Original'):
        describe(stage, edge, other, assignment)
    stage['similarity'][0][0] = float('nan')
    with pytest.raises(ValueError, match='Invalid similarity'):
        describe(stage, edge, other, assignment)


def test_hash_verification_and_fixed_summary_cannot_export_private_fields(tmp_path):
    path = tmp_path / 'trace.local.jsonl'; path.write_text('private sentinel')
    with pytest.raises(ValueError, match='hash differs'):
        verify_hash(path, '0' * 64)
    d = describe(*case([[.4], [.39]]), assignment)
    d.update(frame=1234567, scene='private sentinel', token='private sentinel', matrix='private sentinel')
    public = json.dumps(summarize([d]))
    assert 'private sentinel' not in public and '1234567' not in public
    assert summarize([])['distributions']['objective_loss'] is None


def test_random_small_assignments_conserve_cost_and_update_count():
    rng = np.random.default_rng(42)
    for n, m in [(2, 2), (3, 2), (2, 3), (4, 4)]:
        for _ in range(8):
            s = rng.uniform(.01, .99, (n, m)); rr, cc = assignment(-s)
            r, c = int(rr[0]), int(cc[0]); q = (r + 1) % n
            d = describe(*case(s, row=r, col=c, competitor=q), assignment)
            assert d['objective_loss'] == pytest.approx(d['column_gap'] + d['other_assignment_cost'])
            assert d['objective_loss'] == pytest.approx(d['accepted_objective_loss'] + d['rejected_objective_loss'])
            assert d['accepted_count_change'] == d['gained_updated_rows'] - d['lost_updated_rows']
