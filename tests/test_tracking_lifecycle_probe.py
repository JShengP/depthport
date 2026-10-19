# SPDX-License-Identifier: AGPL-3.0-only
"""No public-sequence inputs: synthetic forwarding, lifecycle and equality."""
import copy
import os
import pickle
from types import SimpleNamespace
import numpy as np
import pytest
from depthport.tracking_lifecycle_probe import LifecycleProbe, lifecycle_reason
from depthport.tracking_upstream_diagnostics import UpstreamLedger, COUNT_KEYS


@pytest.mark.parametrize('age,tid,hits,expected',[(10,1,0,'kept'),(11,1,0,'expired'),
    (1,-1,0,'immature_unmatched'),(11,-1,0,'expired_and_immature'),(0,-1,1,'kept'),(1,-1,2,'kept')])
def test_exact_inclusive_fixed_budget_and_sticky_maturity(age,tid,hits,expected):
    tracker=SimpleNamespace(maximum_frames_without_update=10,minimum_consecutive_frames=2)
    assert lifecycle_reason({'age_since_update':age,'tracker_id':tid,'consecutive_updates':hits},tracker)==expected


class FakeTracker:
    high_conf_det_threshold=.6
    maximum_frames_without_update=10
    minimum_consecutive_frames=2
    def __init__(self):self.tracks=[];self.calls=[]
    def _predict_tracklets(self,tracks,timing):self.calls.append(('predict',tracks,timing));return 'prediction'
    def _prune_lost_tracks(self,timing):return timing
    def _get_associated_indices(self,matrix,gate):return ([],[],[])
    def _spawn_new_tracks(self,*args):return args
    def update(self,detections,frame=None,timestamp=None):
        timing=SimpleNamespace(uses_elapsed_time=False,skip_predict=False)
        assert self._predict_tracklets(self.tracks,timing)=='prediction'
        assert self._prune_lost_tracks(timing) is timing
        matrix=np.empty((0,0));self._get_associated_indices(matrix,.1)
        raise RuntimeError('original failure')


def test_exception_restores_original_instance_ownership_and_forwarding():
    tracker=FakeTracker();tracker.update=tracker.update;owned=tracker.update
    data=SimpleNamespace(xyxy=np.empty((0,4)),confidence=np.array([]))
    with pytest.raises(RuntimeError,match='original failure'):
        with LifecycleProbe(tracker) as probe:
            with pytest.raises(ValueError,match='already attached'):probe.__enter__()
            tracker.update(data)
    assert tracker.update is owned
    assert not any(k.startswith('_predict') or k.startswith('_prune') or k.startswith('_get_') or k.startswith('_spawn') for k in tracker.__dict__)
    assert tracker.calls[0][1] is tracker.tracks
    with LifecycleProbe(tracker):
        with pytest.raises(ValueError,match='fixed-step'):tracker.update(data,timestamp=1.)


@pytest.mark.parametrize('positive',[False,True])
def test_geometry_partitions_reproduce_stage_and_do_not_impute_birth_as_update(positive):
    class IoU:
        def compute(self,a,b):return np.full((len(a),len(b)),.05 if positive else 0.)
    state={'token':1,'tracker_id':0,'bbox':[0.,0.,10.,10.], 'age':2,
           'age_since_update':2.,'seconds_since_update':0.,'consecutive_updates':0}
    stage={'name':'weak_remaining','gate':.1,'tracks':[state],'detection_indices':[0],
           'similarity':[[.05 if positive else 0.]],'matched':[], 'unmatched_rows':[0],'unmatched_columns':[0]}
    trace={'frame':1,'input_boxes':[[30.,30.,40.,40.]],'input_confidences':[.2],
        'high_indices':[],'weak_indices':[0],'stages':[stage],'after_budget_prune':[state],
        'birth_candidates':[],'births':[],'removals':[],'after_update':[state]}
    old=copy.deepcopy(trace);ledger=UpstreamLedger();rows=[];ledger.add(trace,old,IoU(),rows)
    assert ledger.counts['missed_rows_with_weak_input']==1
    assert ledger.counts['missed_weak_rows_positive_below_gate']==int(positive)
    assert ledger.counts['missed_weak_rows_zero_overlap']==int(not positive)
    assert ledger.counts['missed_weak_rows_without_last_accepted_update']==1
    assert set(ledger.result()['counts'])==set(COUNT_KEYS)
    assert rows[0]['last_accepted_update'] is None
    old['stages'][0]['matched']=[[0,0]]
    with pytest.raises(ValueError,match='Original association differs'):UpstreamLedger().add(trace,old,IoU(),[])


@pytest.mark.skipif(os.getenv('RUN_TRACKERS_CONTRACTS')!='1',reason='Pinned trackers / NumPy 2 research profile')
@pytest.mark.parametrize('scenario',['weak_continuation','last_chance_recovery','expiry','immature_loss','weak_only','activation_rejection'])
def test_real_native_outputs_entire_state_inputs_and_registry_unchanged(scenario):
    import supervision as sv
    from trackers import ByteTrackTracker
    from trackers.core.base import BaseTracker
    from depthport.tracking_recovery_control import PARAMETERS
    patterns={'weak_continuation':[[.9],[.9]]+[[.2]]*14,
        'last_chance_recovery':[[.9],[.9]]+[[]]*10+[[.2]],
        'expiry':[[.9],[.9]]+[[]]*12,
        'immature_loss':[[.9],[],[]], 'weak_only':[[.2]]*5,
        'activation_rejection':[[.7]]*3}
    values=patterns[scenario];parameters=dict(PARAMETERS)
    if scenario=='activation_rejection':parameters['track_activation_threshold']=.8
    def execute(observed):
        tracker=ByteTrackTracker(frame_rate=10,**parameters);outputs=[];records=[]
        from contextlib import nullcontext
        with (LifecycleProbe(tracker) if observed else nullcontext()) as probe:
            for scores in values:
                data=sv.Detections(xyxy=np.array([[10,10,30,40]]*len(scores),dtype=np.float32).reshape(-1,4),
                    confidence=np.array(scores,dtype=np.float32),class_id=np.zeros(len(scores),dtype=np.int32))
                before=pickle.dumps(data);out=tracker.update(data)
                assert pickle.dumps(data)==before
                outputs.append({k:getattr(out,k).tolist() for k in ('xyxy','confidence','class_id','tracker_id')})
                if observed:records.append(copy.deepcopy(probe.last))
        return outputs,pickle.dumps(tracker,protocol=4),records
    registry=dict(BaseTracker._registry);a=execute(False);b=execute(True)
    assert a[:2]==b[:2] and BaseTracker._registry==registry
    records=b[2];removals=[x for r in records for x in r['removals']]
    if scenario=='expiry':
        assert len(removals)==1 and removals[0]['reason']=='expired'
        assert removals[0]['state']['age_since_update']==11
    elif scenario=='last_chance_recovery':
        assert not removals and records[-1]['stages'][1]['tracks'][0]['age_since_update']==11
        assert records[-1]['stages'][1]['matched']==[[0,0]]
    elif scenario=='immature_loss':assert removals[0]['reason']=='immature_unmatched'
    elif scenario=='weak_only':assert not any(r['births'] or r['after_update'] for r in records)
    elif scenario=='activation_rejection':
        assert not any(r['births'] for r in records)
        assert all(not r['birth_candidates'][0]['eligible'] for r in records)
    else:
        assert not removals and len([r for r in records if r['stages'][1]['matched']])==14
