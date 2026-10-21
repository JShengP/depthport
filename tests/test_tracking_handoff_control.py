# SPDX-License-Identifier: AGPL-3.0-only
"""Causal policy and generated operator contracts; never real-sequence tuning."""
import os
import numpy as np
import pytest
from depthport.tracking_handoff_control import birth_additions, handoff_replacements, mutual_unique, HandoffCandidate


def test_mutual_unique_rejects_both_row_and_column_competition():
    assert mutual_unique([(0, 0), (0, 1), (2, 2), (3, 3), (4, 3)]) == [(2, 2)]


@pytest.mark.parametrize('qualified,eligible,weak,expected', [
    ([True, True], {0, 1}, [False, False], [(0, 0)]),
    ([False, True], {0, 1}, [False, False], []),
    ([True, True], {1}, [False, False], []),
    ([True, True], {0, 1}, [True, False], [])])
def test_birth_requires_unmatched_eligible_past_confirmed_and_no_weak_opportunity(qualified, eligible, weak, expected):
    s = np.array([[.3, .29], [.29, 0.]])
    assert birth_additions(s, .3, [0, 1], [0, 1], qualified, eligible, weak) == expected
    assert birth_additions(s, .3, [], [0], qualified, eligible, weak) == []


def test_birth_ambiguous_eligible_edges_do_not_choose_a_winner():
    assert birth_additions(np.ones((2, 2)), .3, [0, 1], [0, 1], [True]*2, {0, 1}, [False]*2) == []


@pytest.mark.parametrize('past,weak,expected', [(True,False,[(0,0,1)]),(False,False,[]),(True,True,[])])
def test_handoff_uses_past_support_and_current_native_gate_not_future(past, weak, expected):
    s = np.array([[.31, .2], [.3, .29]])
    assert handoff_replacements(s, .3, [(0, 0)], [1], lambda r,q:past, [False,weak]) == expected


def test_occupied_and_multiple_alternatives_are_not_reassigned():
    s = np.ones((3, 2))
    assert handoff_replacements(s,.3,[(0,0)],[],lambda r,q:True,[False]*3) == []
    assert handoff_replacements(s,.3,[(0,0)],[1,2],lambda r,q:True,[False]*3) == []
    assert handoff_replacements(s,.3,[(0,0),(1,1)],[2],lambda r,q:True,[False]*3) == []


def test_gap_is_frozen_existing_margin_and_gate_still_required():
    assert handoff_replacements(np.array([[.9],[.3]]),.3,[(0,0)],[1],lambda r,q:True,[False]*2) == []
    assert handoff_replacements(np.array([[.31],[.29]]),.3,[(0,0)],[1],lambda r,q:True,[False]*2) == []


def policy():
    a = HandoffCandidate(type('Tracker',(),{})(), 'past_competition_handoff')
    a.frame=5;a._owners=[100,200];a._qualified=[True,True]
    a._pre={o:{'active':True,'confirmed':True} for o in a._owners}
    a.keys={100:[(4,0,'high')],200:[(4,1,'weak')]}
    a.contexts={100:{'frame':4,'key':(4,0,'high'),'comparisons':{200:{'active_confirmed':True,'gate':True,'gap':True}}}}
    return a


def test_previous_weak_update_can_support_an_active_competitor():
    a=policy();assert a.supported(0,1)


@pytest.mark.parametrize('field', ['current_key','future_context','retained','unconfirmed','missing_context','past_below_gate','past_gap','missing_accepted'])
def test_inadmissible_support_does_not_qualify(field):
    a=policy()
    if field=='current_key':a.keys[200]=[(5,1,'high')]
    elif field=='future_context':a.contexts[100]['frame']=6
    elif field=='retained':a._pre[200]['active']=False
    elif field=='unconfirmed':a._pre[100]['confirmed']=False
    elif field=='missing_context':a.contexts={}
    elif field=='past_below_gate':a.contexts[100]['comparisons'][200]['gate']=False
    elif field=='past_gap':a.contexts[100]['comparisons'][200]['gap']=False
    else:a.keys[200]=[]
    assert not a.supported(0,1)


def test_native_ids_and_future_metadata_are_not_policy_features():
    a=policy();before=a.supported(0,1);a.future_non_repetition=True;a.native_ids=[999,-1]
    assert a.supported(0,1)==before


native=pytest.mark.skipif(os.getenv('RUN_TRACKERS_CONTRACTS')!='1',reason='Optional NumPy2 generated native contracts')


@native
@pytest.mark.parametrize('outcome',['high','weak','unmatched'])
def test_observed_reference_keeps_complete_native_generated_outputs(outcome):
    import supervision as sv
    from trackers import ByteTrackTracker
    from depthport.tracking_recovery_control import PARAMETERS
    from depthport.tracking_lifecycle_probe import LifecycleProbe
    from depthport.tracking_estimator_shadow import EstimatorShadow
    from depthport.tracking_geometry_control import GeometryProjection
    from depthport.tracking_accepted_events import AcceptedLedger
    scores=[.9,.9 if outcome=='high' else .2 if outcome=='weak' else None]
    if outcome=='unmatched':scores.append(.9)
    def detection(score):
        return sv.Detections.empty() if score is None else sv.Detections(xyxy=np.array([[1,2,11,22]],dtype=np.float32),confidence=np.array([score],dtype=np.float32),class_id=np.array([0]))
    plain=ByteTrackTracker(frame_rate=10,**PARAMETERS);expected=[]
    for score in scores:
        d=plain.update(detection(score));expected.append({k:getattr(d,k).tolist() for k in ('xyxy','confidence','class_id','tracker_id')})
    t=ByteTrackTracker(frame_rate=10,**PARAMETERS);ledger=AcceptedLedger();actual=[]
    with HandoffCandidate(t,'reference') as c,LifecycleProbe(t) as l,EstimatorShadow(t,l) as s,GeometryProjection(t,l,s,False) as g:
        for score in scores:
            d=t.update(detection(score));actual.append({k:getattr(d,k).tolist() for k in ('xyxy','confidence','class_id','tracker_id')})
            ledger.add({'lifecycle':l.last,'numerical':s.last,'geometry':g.last})
    assert actual==expected and not c.restore
    assert all(method not in vars(t) for method in ('update','_get_associated_indices'))


@native
@pytest.mark.parametrize('arm',['birth_continuation','past_competition_handoff'])
def test_artificial_matrix_operator_reachable_with_native_updates_and_shadow(arm):
    import supervision as sv
    from trackers import ByteTrackTracker
    from depthport.tracking_recovery_control import PARAMETERS
    from depthport.tracking_lifecycle_probe import LifecycleProbe
    from depthport.tracking_estimator_shadow import EstimatorShadow
    from depthport.tracking_geometry_control import GeometryProjection
    from depthport.tracking_accepted_events import AcceptedLedger
    t=ByteTrackTracker(frame_rate=10,**PARAMETERS);ledger=AcceptedLedger()
    det=sv.Detections(xyxy=np.array([[1,2,11,22],[1,2,11,22]],dtype=np.float32),confidence=np.array([.9,.9],dtype=np.float32),class_id=np.array([0,0]))
    with HandoffCandidate(t,arm) as c,LifecycleProbe(t) as l,EstimatorShadow(t,l) as s,GeometryProjection(t,l,s,True) as g:
        for _ in range(3):
            t.update(det);ledger.add({'lifecycle':l.last,'numerical':s.last,'geometry':g.last})
        original=t.iou.compute
        gate=t.minimum_iou_threshold
        matrix=np.array([[gate,gate-.01],[gate-.01,0.]]) if arm=='birth_continuation' else np.array([[gate+.01,gate-.1],[gate,gate-.01]])
        def artificial(a,b):return matrix.copy() if len(b)==2 else np.empty((len(a),len(b)))
        try:
            t.iou.compute=artificial;t.update(det)
            ledger.add({'lifecycle':l.last,'numerical':s.last,'geometry':g.last})
            assert len(c.last['actions'])==1 and c.last['protected_other_updates_lost']==0
            assert c.last['weak_stages']==1 and all(all(o['checks'].values()) for o in s.last['operations'])
        finally:delattr(t.iou,'compute')
