# SPDX-License-Identifier: AGPL-3.0-only
import copy
from contextlib import nullcontext
import os
import pickle
import numpy as np
import pytest
from depthport.tracking_estimator_shadow import serial,snapshot,numerical_checks,array,EstimatorShadow
from depthport.tracking_lifecycle_probe import LifecycleProbe


def test_serial_is_detached_preserves_dtype_and_rejects_unknown_and_nonfinite():
    a=np.array([1.,2.],dtype=np.float32);s=serial(a);a[0]=99
    assert s['dtype']=='float32' and s['shape']==[2] and s['values']==[1.,2.]
    assert serial(np.array([0.]))!=serial(np.array([-0.]))
    with pytest.raises(ValueError,match='Nonfinite'):serial(np.array([np.nan]))
    with pytest.raises(ValueError,match='Unexpected'):serial(object())


def test_numerical_screens_do_not_repair_or_accept_bad_covariance():
    def state(p):
        return {'kf':{k:serial(v) for k,v in {'state':np.ones((2,1)),'transition_mtx':np.eye(2),
            'state_covariance':p,'process_noise':np.zeros((2,2)),'measurement_noise':np.eye(2)}.items()}}
    before=state(np.eye(2));after=state(np.diag([-1.,1.]));original=copy.deepcopy(after)
    checks=numerical_checks(before,after,'predict')
    assert checks['mean_algebra_exact'] and not checks['covariance_algebra_exact']
    assert not checks['state_covariance_psd'] and after==original


native=pytest.mark.skipif(os.getenv('RUN_TRACKERS_CONTRACTS')!='1',reason='Pinned NumPy2/trackers research profile')


@native
def test_freeze_pins_numerical_modules_and_actual_solver_binary():
    from tools.audit_tracking_estimator_shadow import internals
    values=internals()
    assert set(values)=={'kalman_filter_module','motion_models_module','state_representations_module','scipy_lsap_binary'}
    assert all(len(v)==64 for v in values.values())


@native
@pytest.mark.parametrize('scenario',['weak_continuation','shrink','expiry','recovery','weak_only'])
def test_native_full_outputs_pickle_lifecycle_registry_and_shadow_equal(scenario):
    import supervision as sv
    from trackers import ByteTrackTracker
    from trackers.core.base import BaseTracker
    from depthport.tracking_recovery_control import PARAMETERS
    from depthport.tracking_health_audit import audit
    from depthport.tracking_shadow_analysis import audit as shadow_audit
    from trackers.utils.iou import IoU
    patterns={'weak_continuation':[[.9],[.9]]+[[.2]]*12,'shrink':[[.9]]*4+[[]]*12,
        'expiry':[[.9],[.9]]+[[]]*12,'recovery':[[.9],[.9]]+[[]]*10+[[.2]],'weak_only':[[.2]]*5}
    registry=dict(BaseTracker._registry)
    def execute(observed):
        tracker=ByteTrackTracker(frame_rate=10,**PARAMETERS);outputs=[];life=[];numbers=[]
        with (LifecycleProbe(tracker) if observed else nullcontext()) as probe:
            with (EstimatorShadow(tracker,probe) if observed else nullcontext()) as shadow:
                for i,scores in enumerate(patterns[scenario]):
                    width=20.-3*i if scenario=='shrink' and scores else 20.
                    data=sv.Detections(xyxy=np.array([[10,10,10+width,40]]*len(scores),dtype=np.float32).reshape(-1,4),
                        confidence=np.array(scores,dtype=np.float32),class_id=np.zeros(len(scores),dtype=np.int32))
                    inputbytes=pickle.dumps(data);result=tracker.update(data)
                    assert pickle.dumps(data)==inputbytes
                    outputs.append({k:getattr(result,k).tolist() for k in ('xyxy','confidence','class_id','tracker_id')})
                    if observed:life.append(copy.deepcopy(probe.last));numbers.append(copy.deepcopy(shadow.last))
                    assert all('predict' not in vars(t.state_estimator) and 'update' not in vars(t.state_estimator) for t in tracker.tracks)
        return outputs,pickle.dumps(tracker,protocol=4),life,numbers
    a=execute(False);b=execute(True);c=execute(True)
    assert a[:2]==b[:2]==c[:2] and b==c and BaseTracker._registry==registry
    summary,health=audit(b[2],IoU());numeric,cases=shadow_audit(b[3],health,b[2])
    assert numeric['counts']['predictions']==summary['counts']['predicted_rows']
    assert not any(numeric['numerical_check_failures'].values())
    if scenario=='shrink':
        assert numeric['counts']['first_cases']==1 and numeric['counts']['first_matches_last_posterior_linear_projection']==1
    if scenario=='weak_continuation':assert numeric['counts']['updates_weak']==12
    if scenario=='recovery':assert numeric['counts']['updates_weak']==1
    if scenario=='weak_only':assert numeric['counts']['births']==numeric['counts']['predictions']==0


@native
def test_failure_restores_estimator_and_tracker_methods():
    import supervision as sv
    from trackers import ByteTrackTracker
    from depthport.tracking_recovery_control import PARAMETERS
    t=ByteTrackTracker(frame_rate=10,**PARAMETERS)
    d=sv.Detections(xyxy=np.array([[0,0,20,30]],dtype=np.float32),confidence=np.array([.9],dtype=np.float32))
    with LifecycleProbe(t) as p:
        with pytest.raises(ValueError,match='fixed-step'):
            with EstimatorShadow(t,p):
                t.update(d);e=t.tracks[0].state_estimator;t.update(d,timestamp=1.)
        assert 'predict' not in vars(e) and 'update' not in vars(e)
    assert all(n not in vars(t) for n in ('update','_spawn_new_tracks','_predict_tracklets'))


@native
def test_shadow_detects_live_state_mutation_without_copying_it_away():
    import supervision as sv
    from trackers import ByteTrackTracker
    from depthport.tracking_recovery_control import PARAMETERS
    t=ByteTrackTracker(frame_rate=10,**PARAMETERS)
    d=sv.Detections(xyxy=np.array([[0,0,20,30]],dtype=np.float32),confidence=np.array([.9],dtype=np.float32))
    with LifecycleProbe(t) as p:
        with EstimatorShadow(t,p):
            t.update(d);t.tracks[0].state_estimator.kf.state[4,0]=1
            with pytest.raises(ValueError,match='Continuous shadow diverged'):t.update(d)
            assert 'predict' not in vars(t.tracks[0].state_estimator)
