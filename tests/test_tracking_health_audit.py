# SPDX-License-Identifier: AGPL-3.0-only
"""Synthetic ordering/censoring/integrity contracts; no public-sequence input."""
import copy
import os
import numpy as np
import pytest
from depthport.tracking_health_audit import audit,dimensions,neighbours,empty_runs,COUNT_KEYS


class IoU:
    def compute(self,a,b):
        a=np.asarray(a).reshape(-1,4);b=np.asarray(b).reshape(-1,4)
        if not len(a) or not len(b):return np.empty((len(a),len(b)))
        lo=np.maximum(a[:,None,:2],b[None,:,:2]);hi=np.minimum(a[:,None,2:],b[None,:,2:])
        intersection=np.prod(np.maximum(0,hi-lo),axis=2)
        aa=np.prod(np.maximum(0,a[:,2:]-a[:,:2]),axis=1)
        bb=np.prod(np.maximum(0,b[:,2:]-b[:,:2]),axis=1)
        union=aa[:,None]+bb[None,:]-intersection
        return np.divide(intersection,union,out=np.zeros_like(intersection,dtype=float),where=union>0)


def state(box=(0.,0.,10.,10.),age=0,gap=0,tid=-1,hits=1):
    return {'token':1,'tracker_id':tid,'bbox':list(box),'age':age,'age_since_update':gap,
            'seconds_since_update':0.,'consecutive_updates':hits}


def frame(index,before=(),pred=(),pre=(),after=(),scores=(),boxes=None,match=None,birth=False,reason=None):
    boxes=boxes if boxes is not None else [[0.,0.,10.,10.] for _ in scores]
    high=[i for i,s in enumerate(scores) if s>=.6];weak=[i for i,s in enumerate(scores) if s<.6]
    stages=[]
    remaining=list(pred)
    for name,indices in (('high_all',high),('weak_remaining',weak)):
        refs=list(pred) if name=='high_all' else remaining
        matched=[[0,0]] if match==name else []
        unmatched=[i for i in range(len(refs)) if not matched or i!=0]
        stages.append({'name':name,'gate':.1,'tracks':refs,'detection_indices':indices,
            'matched':matched,'unmatched_rows':unmatched,'unmatched_columns':list(range(len(indices)))})
        if name=='high_all':remaining=[refs[i] for i in unmatched]
    return {'frame':index,'input_boxes':boxes,'input_confidences':list(scores),'high_indices':high,'weak_indices':weak,
        'before_update':list(before),'before_predict':list(before),'predicted':list(pred),'after_budget_prune':list(pred),
        'stages':stages,'before_lifecycle_prune':list(pre),'after_update':list(after),
        'births':[{'state':pre[0],'detection_index':0,'reason':'unmatched_high_above_activation'}] if birth else [],
        'removals':[{'state':pre[0],'reason':reason}] if reason else []}


def born():
    seed=state();return frame(1,pre=[seed],after=[seed],scores=[.9],birth=True)


@pytest.mark.parametrize('box,expected',[([0,0,1,1],(False,False)),([1,0,1,1],(True,False)),
    ([0,2,1,1],(False,True)),([2,2,1,1],(True,True))])
def test_exact_dimension_boundary(box,expected):assert dimensions(box)==expected


@pytest.mark.parametrize('box',[[0,0,float('nan'),1],[0,0,float('inf'),1],[0,1,2]])
def test_nonfinite_or_incomplete_snapshot_rejected(box):
    with pytest.raises(ValueError,match='Finite'):dimensions(box)


def test_strict_neighbours_do_not_treat_boundary_censor_as_observed_zero():
    assert neighbours([False,True,False,False,True],2)=={'at_event':True,'before':'censored:1','after':'observed:3'}
    assert neighbours([True],1)=={'at_event':True,'before':'censored:0','after':'censored:0'}
    assert neighbours([True,False,False],3)=={'at_event':False,'before':'observed:2','after':'censored:0'}
    assert empty_runs([False,False,True,False,True,False])=={'interior:1':1,'left:2':1,'right:1':1}
    assert empty_runs([False]*3)=={'both:3':1}
    assert empty_runs([True]*3)=={}


def test_first_invalid_prediction_uses_past_accepted_state_not_future_update():
    a=born();p2=state(age=1,gap=1);post=state(age=1,tid=0,hits=2)
    b=frame(2,before=a['after_update'],pred=[p2],pre=[post],after=[post],scores=[.9],match='high_all')
    bad=state(box=(0,0,-2,10),age=2,gap=1,tid=0,hits=2)
    c=frame(3,before=b['after_update'],pred=[bad],pre=[bad],after=[bad],scores=[.2])
    # Artificial accepted repair exercises ordering; not a native admissibility claim.
    p4=state(box=(0,0,-3,10),age=3,gap=2,tid=0,hits=0);repair=state(age=3,tid=0,hits=1)
    d=frame(4,before=c['after_update'],pred=[p4],pre=[repair],after=[repair],scores=[.2],match='weak_remaining')
    summary,raw=audit([a,b,c,d],IoU());counts=summary['counts']
    assert counts['hypotheses_ever_nonpositive']==1 and counts['nonpositive_predicted_rows']==2
    assert counts['first_prediction_with_prior_update']==1 and counts['accepted_repaired_prediction']==1
    event=raw['first_nonpositive'][0]
    assert event['phase']=='prediction' and event['prior_accepted']['frame']==2 and event['current_accepted'] is None
    assert summary['first_prior_gap_histogram']=={'accepted:1':1}
    assert summary['first_prior_posterior_health']['accepted_positive']==1
    assert summary['accepted_interupdate_gap_histogram']=={'2':1}
    assert summary['dimension_first_phase']['width:prediction']==1
    assert set(counts)==set(COUNT_KEYS)


@pytest.mark.parametrize('stage,score',[('high_all',.9),('weak_remaining',.2)])
def test_first_invalid_accepted_posterior_keeps_seed_and_current_update_separate(stage,score):
    a=born();pred=state(age=1,gap=1);bad=state(box=(0,0,10,-1),age=1,gap=0,tid=0,hits=2)
    b=frame(2,before=a['after_update'],pred=[pred],pre=[bad],after=[bad],scores=[score],match=stage)
    summary,raw=audit([a,b],IoU());event=raw['first_nonpositive'][0]
    kind='accepted_high' if stage=='high_all' else 'accepted_weak'
    assert event['phase']==kind and event['prior_accepted'] is None
    assert event['current_accepted']['frame']==2
    assert summary['counts']['accepted_created_nonpositive']==1
    assert summary['first_prior_stage']['seed_only']==1


def test_empty_source_has_complete_zero_groups_and_full_censoring():
    traces=[frame(i,scores=[.2]) for i in range(1,4)]
    summary,raw=audit(traces,IoU())
    assert summary['counts']['births']==summary['counts']['hypotheses_ever_nonpositive']==0
    assert summary['global_empty_runs']['high']=={'both:3':1}
    assert not raw['first_nonpositive'] and not raw['contexts']
    assert all(v['events']==0 for group in summary['contexts'].values() for v in group.values())


def test_birth_nonpositive_is_separate_from_prediction_and_accepted_history():
    bad=state(box=(0,0,0,10));t=frame(1,pre=[bad],after=[bad],scores=[.9],boxes=[[0,0,0,10]],birth=True)
    summary,raw=audit([t],IoU())
    assert summary['counts']['input_nonpositive']==summary['counts']['first_birth']==1
    assert raw['first_nonpositive'][0]['prior_accepted'] is None
    assert summary['first_prior_posterior_health']['seed_nonpositive']==1


def test_prediction_schema_refuses_unrelated_label_keys(tmp_path):
    import json
    from tools.audit_tracking_health import read_predictions
    p=tmp_path/'synthetic.json';p.write_text(json.dumps([{'index':1,'objects':[],'gt':[]}]))
    with pytest.raises(ValueError,match='non-prediction'):read_predictions(p)


def test_terminal_gap_seed_only_and_post_removal_context_stay_distinct():
    a=born();pred=state(age=1,gap=1)
    b=frame(2,before=a['after_update'],pred=[pred],pre=[pred],reason='immature_unmatched')
    c=frame(3,scores=[.2])
    summary,raw=audit([a,b,c],IoU());terminal=summary['terminal']['immature_unmatched']
    assert terminal['hypotheses']==terminal['seed_only']==terminal['row_frames']==1
    assert terminal['any']==0 and terminal['prediction:any:gate']==0
    assert summary['terminal_gap_histograms']['immature_unmatched']=={'1':1}
    ctx=next(x for x in raw['contexts'] if x['kind']=='immature_unmatched')
    assert ctx['anchor_origin']=='seed' and ctx['neighbours']['weak:gate']['after']=='observed:1'
    assert summary['contexts']['immature_unmatched']['weak:gate']['at_event']==0


@pytest.mark.parametrize('tamper',['continuity','partition','clock','unmatched','duplicate'])
def test_inconsistent_history_rejected_before_reporting(tamper):
    a=born();pred=state(age=1,gap=1);b=frame(2,before=a['after_update'],pred=[pred],pre=[pred],after=[pred])
    a,b=copy.deepcopy((a,b))
    if tamper=='continuity':b['before_update']=[]
    elif tamper=='partition':b['weak_indices']=[0]
    elif tamper=='clock':b['predicted'][0]['age']=4
    elif tamper=='unmatched':b['before_lifecycle_prune']=[state(age=1,gap=1,tid=5)]
    else:b['after_update']*=2
    with pytest.raises(ValueError):audit([a,b],IoU())


@pytest.mark.skipif(os.getenv('RUN_TRACKERS_CONTRACTS')!='1',reason='Pinned trackers / NumPy2 profile')
@pytest.mark.parametrize('scenario',['expiry','weak_continuation','weak_only'])
def test_real_synthetic_lifecycle_audit_preserves_outputs(scenario):
    import supervision as sv
    from trackers import ByteTrackTracker
    from trackers.utils.iou import IoU as NativeIoU
    from depthport.tracking_lifecycle_probe import LifecycleProbe
    from depthport.tracking_recovery_control import PARAMETERS
    values={'expiry':[[.9],[.9]]+[[]]*12,'weak_continuation':[[.9],[.9]]+[[.2]]*12,
            'weak_only':[[.2]]*5}[scenario]
    t=ByteTrackTracker(frame_rate=10,**PARAMETERS);traces=[]
    with LifecycleProbe(t) as probe:
        for scores in values:
            d=sv.Detections(xyxy=np.array([[0,0,10,10]]*len(scores),dtype=np.float32).reshape(-1,4),
                confidence=np.array(scores,dtype=np.float32),class_id=np.zeros(len(scores),dtype=np.int32))
            t.update(d);traces.append(copy.deepcopy(probe.last))
    before=copy.deepcopy(traces);summary,_=audit(traces,NativeIoU());assert traces==before
    if scenario=='expiry':
        assert summary['terminal']['expired']['row_frames']==11
        assert summary['terminal_gap_histograms']['expired']=={'11':1}
    elif scenario=='weak_continuation':assert summary['counts']['accepted_weak']==12
    else:assert summary['counts']['births']==0
