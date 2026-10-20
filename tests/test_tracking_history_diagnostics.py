# SPDX-License-Identifier: AGPL-3.0-only
import sys
from types import SimpleNamespace
import numpy as np
import pytest

from depthport.tracking_history_diagnostics import bridge_prefix, column_context, forced_competitor_cost, HOTAAssignmentProbe, hota_match_changes


def test_bridge_uses_shared_observation_history_not_equal_native_numbers():
    source = ({(1,2):7,(2,3):7},{7:[(1,2),(2,3)]})
    target = ({(1,2):99,(2,3):99},{99:[(1,2),(2,3)]})
    assert bridge_prefix(7,3,source,target) == 99
    target[1][99].insert(0,(1,1))
    assert bridge_prefix(7,3,source,target) is None
    assert bridge_prefix(8,3,source,target) is None


def test_column_separates_below_gate_from_competitors_assigned_elsewhere():
    s = {'detection_indices':[5,6], 'gate':.1, 'similarity':[[.09,.4],[.3,.8]],
         'tracks':[{'tracker_id':4,'age_since_update':8},{'tracker_id':5,'age_since_update':1}],
         'matched':[[1,1]], 'unmatched_rows':[0], 'unmatched_columns':[0]}
    c = column_context(s,5,4)
    assert c['target_present'] and c['target_age'] == 8
    assert not c['target_admissible'] and c['admissible_rows'] == 1
    assert c['admissible_unmatched_rows'] == 0 and not c['column_matched']
    other = column_context(s,5,5)
    assert other['target_admissible'] and other['target_assigned_other_column']
    assert column_context(s,8) == {'column_present':False}


def test_forcing_busy_competitor_measures_whole_assignment_not_column_margin():
    from tests.test_tracking_diagnostics import assignment
    # Row 1 slightly prefers column 0 alone but has a much better other box.
    c = forced_competitor_cost([[.7,0.],[.72,.9]],.1,1,0,assignment)
    assert c['similarity_sum_loss'] == pytest.approx(.88)
    assert c['admissible_pair_change'] == -1
    import json
    assert json.loads(json.dumps(c)) == c
    assert forced_competitor_cost([[.7,.1],[.2,.9]],.1,0,0,assignment)['similarity_sum_loss'] == 0


@pytest.mark.parametrize('failure',[False,True])
def test_hota_solver_probe_preserves_arguments_result_and_restores(monkeypatch,failure):
    module = sys.modules[__name__]
    decision = (np.array([0]),np.array([0])); seen = []
    def solver(cost,*args,**kwargs):
        seen.append((cost,args,kwargs))
        return decision
    monkeypatch.setattr(module,'linear_sum_assignment',solver,raising=False)
    class Metric:
        pass
    data = {'gt_ids':[np.array([1]),np.array([]),np.array([2])],
            'tracker_ids':[np.array([9]),np.array([]),np.array([8])],
            'similarity_scores':[np.array([[.6]]),np.empty((0,0)),np.array([[.8]])]}
    cost = np.array([[-.3]])
    try:
        with HOTAAssignmentProbe(Metric(),data) as probe:
            assert module.linear_sum_assignment(cost,tag='same') is decision
            assert module.linear_sum_assignment(cost,tag='same') is decision
            assert probe.matches(.7) == [{},{},{2:{'col':0,'tid':8}}]
            if failure:
                raise RuntimeError('metric failure')
    except RuntimeError:
        assert failure
    assert module.linear_sum_assignment is solver
    assert seen[0][0] is cost and seen[0][2] == {'tag':'same'}
    np.testing.assert_array_equal(cost,[[-.3]])


def test_hota_lost_match_can_keep_raw_support_and_same_detection():
    class Probe:
        def __init__(self,frames): self.frames = frames
        def matches(self,alpha): return self.frames
    old = Probe([{0:{'col':0,'tid':7}}]); new = Probe([{}])
    data = {'gt_ids':[np.array([0])], 'similarity_scores':[np.array([[.8]])]}
    expected = {'HOTA_TP':np.array([1]),'HOTA':np.array([.6]),'DetA':np.array([.5]),'AssA':np.array([.7])}
    candidate = {**expected,'HOTA_TP':np.array([0])}
    public, private = hota_match_changes(data,data,old,new,{(1,0):(1,4)},{(1,0):(1,4)},[.5],expected,candidate)
    assert public[0]['lost'] == 1 and public[0]['lost_reference_detection_retained'] == 1
    assert public[0]['lost_still_has_geometric_support'] == 1
    assert private[0]['reference_key'] == (1,4)
    with pytest.raises(ValueError,match='official HOTA'):
        hota_match_changes(data,data,old,new,{(1,0):(1,4)},{},[.5],candidate,candidate)
