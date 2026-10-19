# SPDX-License-Identifier: AGPL-3.0-only
import os
import numpy as np
import pytest
from depthport.tracking_exclusive_control import competition_decisions, ExclusiveDeferral, ARMS
from tests.test_tracking_recovery_control import tracks, FakeByte
from tests.test_tracking_diagnostics import assignment


def decide(s, matched, mode, states=((0,3),(1,1))):
    return competition_decisions(s,.1,tracks(*states),matched,mode,assignment)


def test_occupied_competitor_is_not_available_or_equivalent_when_costly():
    s = np.array([[.7,0.],[.69,.8]]); original = s.copy()
    for arm,expected in zip(ARMS,[0,1,0,0]):
        veto,audit = decide(s,[(0,0),(1,1)],arm)
        assert len(veto) == expected
        assert audit[0]['competitors'][0]['assigned_elsewhere']
        assert not audit[0]['competitors'][0]['equivalent']
    np.testing.assert_array_equal(s,original)


def test_available_and_equivalent_are_separate_ablations():
    # Free but a nonzero loss: availability vetoes; equivalent assignment does not.
    s = [[.7],[.69]]
    assert decide(s,[(0,0)],ARMS[2])[0]
    assert not decide(s,[(0,0)],ARMS[3])[0]
    # Occupied but equal objective and pair count: equivalent vetoes, availability does not.
    s = [[.7,.8],[.7,.8]]
    assert not decide(s,[(0,0),(1,1)],ARMS[2])[0]
    assert decide(s,[(0,0),(1,1)],ARMS[3])[0]
    assert decide([[.7],[.7]],[(0,0)],ARMS[3])[0]


def test_gate_pair_loss_disallows_equal_objective_replacement():
    # Equal objective, but forcing the competitor loses one gate-admissible pair.
    s = [[.1,.09],[.11,.1]]
    veto,audit=decide(s,[(0,0),(1,1)],ARMS[3])
    assert not veto
    assert audit[0]['competitors'][0]['admissible_pair_change'] == -1
    assert not decide([[.7],[.09]],[(0,0)],ARMS[2])[0]
    assert not decide([[.7],[.69]],[(0,0)],ARMS[2],((0,1),(1,1)))[0]


@pytest.mark.parametrize('fail',[False,True])
def test_instance_hook_restores_and_keeps_other_edges_and_input(fail):
    # Inject exact assignment helper; base tests need no optional SciPy.
    import depthport.tracking_exclusive_control as module
    original = module.alternative_context
    from unittest.mock import patch
    with patch.object(module,'alternative_context',lambda s,g,r,c,m,a=None:original(s,g,r,c,m,assignment)):
        t=FakeByte(fail)
        with ExclusiveDeferral(t,ARMS[2]) as control:
            if fail:
                with pytest.raises(RuntimeError): t.update('unchanged')
            else: assert t.update('unchanged') == 'unchanged'
            assert t.weak_result == ([(0,0),(1,1)],[],[])
            assert control.last == [] and control.audit
        assert 'update' not in t.__dict__ and '_get_associated_indices' not in t.__dict__


@pytest.mark.skipif(os.getenv('RUN_TRACKERS_CONTRACTS')!='1',reason='Optional pinned NumPy 2 trackers')
@pytest.mark.parametrize('arm',ARMS)
def test_real_weak_continuation_and_uncontested_recovery(arm):
    import supervision as sv
    from depthport.video_tracking_benchmark import make_tracker
    from depthport.tracking_recovery_control import PARAMETERS
    t=make_tracker('bytetrack',fps=30,parameters=PARAMETERS)
    def step(scores):
        d=sv.Detections(xyxy=np.array([[10,10,30,40]]*len(scores),dtype=np.float32).reshape(-1,4),
            confidence=np.array(scores,dtype=np.float32),class_id=np.zeros(len(scores),dtype=int))
        before=d.xyxy.copy();result=t.update(d)
        np.testing.assert_array_equal(d.xyxy,before)
        assert len(result)==len(d)
        return result.tracker_id
    with ExclusiveDeferral(t,arm):
        step([.9]); tid=int(step([.9])[0])
        assert int(step([.2])[0])==tid
        step([])
        assert int(step([.2])[0])==tid
