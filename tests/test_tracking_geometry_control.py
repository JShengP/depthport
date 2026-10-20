# SPDX-License-Identifier: AGPL-3.0-only
import copy
from contextlib import ExitStack
import os
import pickle
import numpy as np
import pytest
from depthport.tracking_geometry_control import projection,GeometryProjection
from depthport.tracking_geometry_validation import compare


@pytest.mark.parametrize('velocity,axes',[([0,0,0,0],[]),([3,0,-3,0],[0]),([0,8,0,-8],[1]),([3,8,-3,-8],[0,1])])
def test_projection_preserves_position_center_and_full_covariance(velocity,axes):
    x=np.array([0,0,4,10,*velocity],dtype=np.float64).reshape(8,1)
    a=np.arange(64,dtype=np.float64).reshape(8,8)/50;p=a@a.T+np.eye(8)
    oldx=x.copy();oldp=p.copy();got,t,mean,cov=projection(x,p)
    assert got==axes and np.array_equal(mean[:4],x[:4])
    assert np.array_equal(cov,t@p@t.T) and np.linalg.eigvalsh(cov).min()>-1e-10
    assert np.array_equal(mean[4:6]+mean[6:8],x[4:6]+x[6:8])
    assert np.array_equal(t@t,t) and np.array_equal(x,oldx) and np.array_equal(p,oldp)
    f=np.eye(8);f[np.arange(4),np.arange(4)+4]=1;pred=f@mean
    assert pred[2,0]>pred[0,0] and pred[3,0]>pred[1,0]
    if axes:assert not np.array_equal(cov,p)


def test_exact_zero_size_triggers_without_fitted_epsilon_and_invalid_posterior_rejected():
    x=np.array([0,0,4,10,2,0,-2,0],dtype=np.float64).reshape(8,1)
    assert projection(x,np.eye(8))[0]==[0]
    x[2]=0
    with pytest.raises(ValueError,match='no posterior repair'):projection(x,np.eye(8))
    x[2]=4;x[4]=np.nan
    with pytest.raises(ValueError,match='Finite'):projection(x,np.eye(8))


@pytest.mark.parametrize('lost_kind',['weak','active','confirmed','births'])
def test_scene_harm_gates_count_actual_event_membership_not_pooled_counts(lost_kind):
    baseline={'nonpositive_predictions':1};control={'applied_rows':1,'nonpositive_predictions':0,'nonpositive_accepted_posteriors':0,'numerical_failures':0}
    ref={k:[[1,1]] for k in ('weak','active','confirmed','births')};alt=copy.deepcopy(ref)
    alt[lost_kind]=[[2,2]]
    result=compare(baseline,control,ref,alt)
    assert not result['all_proxy_harm_gates_pass'] and result['geometry_reduction_exposed']
    assert not result['tracking_accuracy_accepted']


def test_zero_exposure_never_means_effective_or_accuracy_acceptance():
    c={'applied_rows':0,'nonpositive_predictions':0,'nonpositive_accepted_posteriors':0,'numerical_failures':0}
    e={k:[] for k in ('weak','active','confirmed','births')}
    r=compare(c,c,e,e)
    assert r['all_proxy_harm_gates_pass'] and not r['effective_exposure'] and not r['geometry_reduction_exposed']


native=pytest.mark.skipif(os.getenv('RUN_TRACKERS_CONTRACTS')!='1',reason='Pinned NumPy2/trackers research profile')


@native
@pytest.mark.parametrize('kind',['active_confirmed','active_tentative','retained_confirmed','retained_tentative'])
def test_all_roles_project_live_and_shadow_consistently_without_rewriting_accepted_posterior(kind):
    import supervision as sv
    from trackers import ByteTrackTracker
    from depthport.tracking_recovery_control import PARAMETERS
    from depthport.tracking_lifecycle_probe import LifecycleProbe
    from depthport.tracking_estimator_shadow import EstimatorShadow,snapshot
    t=ByteTrackTracker(frame_rate=10,**PARAMETERS)
    d=sv.Detections(xyxy=np.array([[0,0,4,10]],dtype=np.float32),confidence=np.array([.9],dtype=np.float32))
    with LifecycleProbe(t) as life,EstimatorShadow(t,life) as shadow,GeometryProjection(t,life,shadow,True) as guard:
        t.update(d);track=t.tracks[0];token=life.token(track)
        track.tracker_id=0 if kind.endswith('_confirmed') else -1
        track.time_since_update=0 if kind.startswith('active') else 1
        for e in (track.state_estimator,shadow.shadows[token]):e.kf.state[4,0]=3;e.kf.state[6,0]=-3
        accepted=track.state_estimator.kf.state_post.copy();oldcov=track.state_estimator.kf.state_covariance_post.copy()
        empty=sv.Detections.empty();t.update(empty)
        assert guard.last['rows'][0]['applied']
        assert guard.last['rows'][0]['active']==kind.startswith('active')
        assert guard.last['rows'][0]['confirmed']==kind.endswith('_confirmed')
        e=track.state_estimator
        assert e.get_state()['state'][2,0]>e.get_state()['state'][0,0]
        assert np.array_equal(e.kf.state_post,accepted) and np.array_equal(e.kf.state_covariance_post,oldcov)
        assert snapshot(e)==snapshot(shadow.shadows[token])
        assert not any(not ok for op in shadow.last['operations'] for ok in op['checks'].values())


@native
def test_no_trigger_native_bytes_state_weak_continuation_and_method_ownership_unchanged():
    import supervision as sv
    from trackers import ByteTrackTracker
    from depthport.tracking_recovery_control import PARAMETERS
    from depthport.tracking_lifecycle_probe import LifecycleProbe
    from depthport.tracking_estimator_shadow import EstimatorShadow
    from depthport.tracking_geometry_validation import summarize
    def run(observed):
        t=ByteTrackTracker(frame_rate=10,**PARAMETERS);out=[];life=[];nums=[];guards=[]
        with ExitStack() as s:
            if observed:
                l=s.enter_context(LifecycleProbe(t));n=s.enter_context(EstimatorShadow(t,l));g=s.enter_context(GeometryProjection(t,l,n,True))
            for score in [.9,.9]+[.2]*15:
                d=sv.Detections(xyxy=np.array([[10,10,30,50]],dtype=np.float32),confidence=np.array([score],dtype=np.float32))
                old=pickle.dumps(d);r=t.update(d);assert pickle.dumps(d)==old
                out.append((r.xyxy.tolist(),r.tracker_id.tolist()))
                if observed:life.append(copy.deepcopy(l.last));nums.append(copy.deepcopy(n.last));guards.append(copy.deepcopy(g.last))
        assert all(k not in vars(t) for k in ('update','_predict_tracklets','_spawn_new_tracks'))
        return out,pickle.dumps(t,protocol=4),(summarize(life,nums,guards) if observed else None)
    ref=run(False);treatment=run(True)
    assert ref[:2]==treatment[:2] and treatment[2][0]['accepted_weak']==15 and treatment[2][0]['applied_rows']==0


@native
def test_existing_invalid_reference_remains_observable_without_repair():
    import supervision as sv
    from trackers import ByteTrackTracker
    from depthport.tracking_recovery_control import PARAMETERS
    from depthport.tracking_lifecycle_probe import LifecycleProbe
    from depthport.tracking_estimator_shadow import EstimatorShadow
    t=ByteTrackTracker(frame_rate=10,**PARAMETERS)
    with LifecycleProbe(t) as l,EstimatorShadow(t,l) as s,GeometryProjection(t,l,s,False) as g:
        d=sv.Detections(xyxy=np.array([[0,0,4,10]],dtype=np.float32),confidence=np.array([.9],dtype=np.float32))
        t.update(d);e=t.tracks[0].state_estimator;shadow=s.shadows[l.token(t.tracks[0])]
        e.kf.state[2,0]=-1;shadow.kf.state[2,0]=-1
        t.update(sv.Detections.empty());assert not g.last['rows'][0]['prepositive'] and not g.last['rows'][0]['applied']


@native
def test_failure_teardown_restores_geometry_and_nested_observer_ownership():
    import supervision as sv
    from trackers import ByteTrackTracker
    from depthport.tracking_recovery_control import PARAMETERS
    from depthport.tracking_lifecycle_probe import LifecycleProbe
    from depthport.tracking_estimator_shadow import EstimatorShadow
    t=ByteTrackTracker(frame_rate=10,**PARAMETERS)
    with pytest.raises(ValueError,match='fixed-step'):
        with LifecycleProbe(t) as l,EstimatorShadow(t,l) as s,GeometryProjection(t,l,s,True):t.update(sv.Detections.empty(),timestamp=1.)
    assert all(k not in vars(t) for k in ('update','_predict_tracklets','_spawn_new_tracks'))
