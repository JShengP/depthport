# SPDX-License-Identifier: AGPL-3.0-only
import copy
import itertools
import os
import numpy as np
import pytest
from depthport.tracking_high_assignment_audit import solve,forced,explain,audit

pytestmark=pytest.mark.skipif(os.getenv('RUN_TRACKERS_CONTRACTS')!='1',reason='Pinned SciPy research profile')


def tracks(n):return [{'token':r+1,'age_since_update':1 if r%2 else 2,'tracker_id':r-1} for r in range(n)]


@pytest.mark.parametrize('matrix,row,status',[(np.array([[.6],[.8]]),0,'unassigned_rectangular'),
    (np.array([[.11,.09],[.9,0.]]),0,'assigned_below_gate')])
def test_gate_support_is_not_global_acceptance_and_forcing_displaces(matrix,row,status):
    original=matrix.copy();value=explain(matrix,.1,row,tracks(len(matrix)))
    assert value['raw_row_status']==status and value['alternatives'][0]['owner_accepted']
    assert value['alternatives'][0]['objective_loss']>0
    assert value['alternatives'][0]['lost_accepted_rows']==[1]
    assert np.array_equal(matrix,original)


def test_maximize_then_gate_not_gated_first_cardinality():
    m=np.array([[.11,.09],[.9,0.]])
    raw,accepted=solve(m,.1)
    assert raw==[(0,1),(1,0)] and accepted==[(1,0)]


@pytest.mark.parametrize('shape',[(2,3),(3,2),(2,2),(1,3),(3,1)])
def test_forced_reduced_solver_matches_exhaustive_full_cardinality(shape):
    m=np.arange(np.prod(shape)).reshape(shape)/10
    for row in range(shape[0]):
        for col in range(shape[1]):
            pairs=forced(m,row,col)
            alternatives=[]
            for rr in itertools.combinations(range(shape[0]),min(shape)):
                for cc in itertools.permutations(range(shape[1]),min(shape)):
                    alt=list(zip(rr,cc))
                    if (row,col) in alt:alternatives.append(sum(m[r,c] for r,c in alt))
            assert len(pairs)==min(shape) and (row,col) in pairs
            assert sum(m[r,c] for r,c in pairs)==max(alternatives)


def test_equal_objective_does_not_mean_identity_and_reject_accepted_row():
    value=explain(np.ones((2,1))*.5,.1,1,tracks(2))
    assert value['alternatives'][0]['objective_loss']==0
    with pytest.raises(ValueError,match='already accepted'):explain([[.7]],.1,0,tracks(1))


def test_complete_original_high_partitions_and_zero_source():
    assert audit([],{'hypotheses':[]})[0]['cases']==0
    stage={'name':'high_all','gate':.1,'similarity':[[.6],[.8]],'tracks':tracks(2),
        'detection_indices':[0],'matched':[[1,0]],'unmatched_rows':[0],'unmatched_columns':[]}
    h={'hypotheses':[{'birth':{'frame':1,'state':{'token':1}},'accepted':[], 'end':{'kind':'expired','frame':2}}]}
    trace=[{'frame':2,'stages':[stage]}];before=copy.deepcopy(trace)
    counts,cases=audit(trace,h)
    assert counts['cases']==1 and counts['owner_active']==1 and trace==before
    stage['unmatched_rows']=[]
    with pytest.raises(ValueError,match='partitions'):audit(trace,h)
