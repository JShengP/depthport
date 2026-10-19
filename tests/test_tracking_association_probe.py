# SPDX-License-Identifier: AGPL-3.0-only
"""Observe original calls/results, preserve weak association and restore hooks."""
import os
from types import SimpleNamespace

import numpy as np
import pytest

from depthport.tracking_association_probe import AssociationProbe,edge_competition


def test_competition_reports_admissible_alternatives_and_negative_margin():
    s={'gate':.2,'similarity':[[.7,.1],[.74,.8]]}
    d=edge_competition(s,0,0)
    assert d['admissible_row_alternatives']==0
    assert d['admissible_column_alternatives']==1
    assert d['best_alternative_margin']==pytest.approx(-.04)
    assert d['ambiguous'] and d['selected_cost']==pytest.approx(.3)
    assert not edge_competition({'gate':.5,'similarity':[[.7,.1]]},0,0)['ambiguous']


def test_stage_summary_uses_fixed_labels_and_does_not_double_count_competitors():
    from tools.summarize_association_stages import summarize_events
    stage={'name':'weak_remaining','gate':.1,'similarity':[[.7,.69],[.72,0.],[.7,0.]],
           'tracks':[{'token':1,'tracker_id':0,'age_since_update':4},
                     {'token':2,'tracker_id':1,'age_since_update':1},
                     {'token':3,'tracker_id':-1,'age_since_update':1}], 'matched':[[0,0]]}
    frames=[{'frame':1,'stages':[stage]}]
    events=[{'frame':1,'stage':0,'row':0,'column':0,'token':1,'kind':'recovery',
             'outcome':'fp','competition':edge_competition(stage,0,0)}]
    c=summarize_events(frames,events)
    assert c=={'weak_remaining:recovery:fp:events':1,
               'weak_remaining:recovery:fp:ambiguous':1,
               'weak_remaining:recovery:fp:active_confirmed_other_hypothesis':1,
               'weak_remaining:recovery:fp:tentative_other_hypothesis':1,
               'weak_remaining:recovery:fp:same_hypothesis_other_detection':1}
    with pytest.raises(ValueError,match='no trace frame'):
        summarize_events([],events)
    stage['matched']=[]
    with pytest.raises(ValueError,match='does not match'):
        summarize_events(frames,events)


class FakeByteTrack:
    def __init__(self, fail=False):
        self.high_conf_det_threshold=.6
        self.tracks=[SimpleNamespace(tracker_id=-1,time_since_update=1,
            number_of_successful_consecutive_updates=1)]
        self.matrix=np.array([[.8]])
        self.decision=([(0,0)],[],[])
        self.seen=[];self.fail=fail

    def _get_associated_indices(self,matrix,gate):
        self.seen.append((matrix,gate))
        return self.decision if matrix.size else ([],[],[])

    def update(self,detections,frame=None,timestamp=None):
        assert self._get_associated_indices(self.matrix,.1) is self.decision
        self.tracks[0].tracker_id=2
        self._get_associated_indices(np.empty((0,0)),.1)
        if self.fail:raise RuntimeError('original update failure')
        return detections


@pytest.mark.parametrize('fail',[False,True])
def test_probe_forwards_original_matrix_and_result_and_restores_on_failure(fail):
    t=FakeByteTrack(fail);before=set(t.__dict__)
    d=SimpleNamespace(xyxy=np.array([[1,1,5,5]]),confidence=np.array([.9]))
    with AssociationProbe(t,'bytetrack') as p:
        if fail:
            with pytest.raises(RuntimeError,match='original update failure'):t.update(d)
        else:
            assert t.update(d) is d
            assert p.last['events'][0]['kind']=='promotion'
            assert p.last['stages'][0]['similarity']==[[.8]]
            assert p.last['stages'][0]['cost_one_minus_similarity'][0][0]==pytest.approx(.2)
    assert set(t.__dict__)==before
    assert t.seen[0][0] is t.matrix and t.seen[0][1]==.1
    np.testing.assert_array_equal(t.matrix,[[.8]])


@pytest.mark.skipif(os.getenv('RUN_TRACKERS_CONTRACTS')!='1',reason='Opt-in trackers 2.6.1 / NumPy 2 environment')
@pytest.mark.parametrize('backend',['bytetrack','botsort'])
@pytest.mark.parametrize('profile',['activation_control','confirm3'])
def test_real_probe_is_observational_across_promotion_weak_continuation_and_recovery(backend,profile):
    import supervision as sv
    import cv2
    from trackers.core.base import BaseTracker
    from depthport.video_tracking_benchmark import make_tracker
    from depthport.tracking_admission import admission_configurations
    parameters=admission_configurations()[backend+'__'+profile]['parameters']
    frame=np.zeros((64,64,3),dtype=np.uint8)
    scores=[[],[.9],[.9],[.9],[.9],[.2],[],[],[.9],[.9,.8]]
    def step(t,values):
        d=sv.Detections(xyxy=np.array([[10,10,30,40]]*len(values),dtype=np.float32).reshape(-1,4),
                        confidence=np.array(values,dtype=np.float32),class_id=np.zeros(len(values),dtype=np.int32))
        before=d.xyxy.copy()
        out=t.update(d,frame=frame if backend=='botsort' else None)
        np.testing.assert_array_equal(d.xyxy,before)
        return out
    registry=dict(BaseTracker._registry)
    cv2.setNumThreads(1);cv2.setRNGSeed(0)
    control=make_tracker(backend,fps=30.,parameters=parameters)
    expected=[step(control,values) for values in scores]
    cv2.setRNGSeed(0);observed=make_tracker(backend,fps=30.,parameters=parameters)
    events=[]
    with AssociationProbe(observed,backend) as probe:
        for values,wanted in zip(scores,expected):
            got=step(observed,values);events.extend(probe.last['events'])
            for key in ['xyxy','confidence','class_id','tracker_id']:
                np.testing.assert_array_equal(getattr(got,key),getattr(wanted,key))
    assert any(e['kind']=='promotion' for e in events)
    assert any(e['kind']=='recovery' for e in events)
    assert len([i for i in expected[5].tracker_id if i>=0])==1
    assert BaseTracker._registry==registry
    assert not any(k in observed.__dict__ for k in ['update','_get_iou_matrix','_get_associated_indices'])
