# SPDX-License-Identifier: AGPL-3.0-only
"""Synthetic decision-available prerequisites and proposal accounting, not exposure."""
from copy import deepcopy
import numpy as np
import pytest
from depthport.tracking_handoff_reachability import inspect_stage, ReachabilityAudit


def scene(n=2,columns=1,matched=((0,0),),frame=3,weak=False):
    pre=[dict(token=i+1,tracker_id=i,bbox=[0.,0.,10.,10.],age_since_update=0) for i in range(n)]
    tracks=[dict(s,age_since_update=1) for s in pre]
    high=dict(name='high_all',gate=.1,tracks=tracks,detection_indices=list(range(columns)),similarity=np.ones((n,columns)).tolist(),
              matched=[list(x) for x in matched],unmatched_rows=sorted(set(range(n))-{r for r,c in matched}),
              unmatched_columns=sorted(set(range(columns))-{c for r,c in matched}))
    return dict(frame=frame,before_update=pre,predicted=tracks,input_boxes=[[0.,0.,10.,10.]]*(columns+int(weak)),
                input_confidences=[.9]*columns+([.2] if weak else []),high_indices=list(range(columns)),
                weak_indices=[columns] if weak else [],stages=[high])


def ones(a,b):return np.ones((len(a),len(b)))


def history(n=2):
    last={i+1:(2,i,'high' if i==0 else 'weak') for i in range(n)}
    ctx={1:dict(frame=2,key=last[1],comparisons={i+1:dict(active_confirmed=True,gate=True,gap=True) for i in range(1,n)})}
    return last,ctx


def inspect(life,last=None,contexts=None):return inspect_stage(life,last or {},contexts or {},.3,.05,ones)


def test_no_free_rows_or_columns_are_missing_opportunities_not_rejected_proposals():
    a=scene(n=1);r=inspect(a,{1:(2,0,'high')});assert not r['birth'] and not r['handoff']
    b=scene(n=2,columns=0,matched=());r=inspect(b,{1:(2,0,'high')});assert r['free_rows']==[0,1] and not r['birth'] and not r['handoff']


def test_birth_only_is_not_accepted_support_and_current_or_future_keys_fail():
    a=scene(n=1,matched=());r=inspect(a);assert r['birth'][0]['flags']==[True,True,False,True,True,True,True]
    assert not r['birth_graph'] and not r['birth_actions']
    for frame in (3,4):
        with pytest.raises(ValueError,match='Current/future'):inspect(a,{1:(frame,0,'high')})


def test_unconfirmed_and_nonpositive_rows_have_separate_masks():
    a=scene(n=2,matched=());a['before_update'][0]['tracker_id']=a['predicted'][0]['tracker_id']=-1
    a['predicted'][1]['bbox']=[0.,0.,0.,10.]
    r=inspect(a,{1:(2,0,'weak'),2:(2,1,'high')});assert [x['mask'] for x in r['rows']]==['011','110']
    assert not r['birth_graph']


def test_broad_weak_block_is_not_a_rejected_proposal_without_past_support():
    a=scene(n=1,matched=(),weak=True);r=inspect(a)
    assert r['rows'][0]['weak_blocked'] and not r['birth'][0]['flags'][2]
    assert not r['birth_graph'] and not r['birth_actions']


def test_qualified_gate_edges_weak_excluded_before_proposal():
    a=scene(n=1,matched=(),weak=True);r=inspect(a,{1:(2,0,'weak')})
    assert all(r['birth'][0]['flags'][:-1]) and not r['birth'][0]['flags'][-1]
    assert not r['birth_graph'] and not r['birth_actions']


def test_mutual_uniqueness_follows_full_admissibility_not_early_cartesian_pairs():
    a=scene(n=2,columns=2,matched=());r=inspect(a,{1:(2,0,'weak'),2:(2,1,'high')})
    assert len(r['birth_graph'])==4 and not r['birth_actions']
    a=scene(n=1,matched=());r=inspect(a,{1:(2,0,'weak')});assert r['birth_actions']==[(0,0)]


def test_previous_weak_acceptance_can_support_handoff_without_future_information():
    a=scene();last,ctx=history();before=deepcopy((a,last,ctx));r=inspect(a,last,ctx)
    assert all(r['handoff'][0]['flags']) and r['handoff_proposals']==[(0,0,1)] and r['handoff_actions']==[(0,0,1)]
    assert (a,last,ctx)==before


@pytest.mark.parametrize('missing',('accepted','confirmed','retained','previous','context','past_active','past_gate','past_margin'))
def test_missing_handoff_prerequisites_do_not_form_rejected_proposals(missing):
    a=scene();last,ctx=history()
    if missing=='accepted':del last[2]
    elif missing=='confirmed':a['before_update'][1]['tracker_id']=a['predicted'][1]['tracker_id']=-1
    elif missing=='retained':a['before_update'][1]['age_since_update']=1;a['predicted'][1]['age_since_update']=2
    elif missing=='previous':last[2]=(1,1,'weak')
    elif missing=='context':ctx={}
    elif missing=='past_active':ctx[1]['comparisons'][2]['active_confirmed']=False
    elif missing=='past_gate':ctx[1]['comparisons'][2]['gate']=False
    else:ctx[1]['comparisons'][2]['gap']=False
    r=inspect(a,last,ctx);assert not all(r['handoff'][0]['flags']) and not r['handoff_proposals'] and not r['handoff_actions']


def test_handoff_multiple_alternatives_are_nonproposals_but_claim_conflicts_are_proposals():
    a=scene(n=3);last,ctx=history(3);r=inspect(a,last,ctx)
    assert len(r['handoff_graph'])==2 and not r['handoff_proposals']
    a=scene(n=3,columns=2,matched=((0,0),(1,1)));last,ctx=history(3)
    ctx[2]=dict(frame=2,key=last[2],comparisons={3:dict(active_confirmed=True,gate=True,gap=True)})
    r=inspect(a,last,ctx);assert len(r['handoff_proposals'])==len(r['claim_conflicts'])==2 and not r['handoff_actions']


def test_same_frame_or_future_context_cannot_repair_previous_support():
    a=scene();last,ctx=history()
    for f in (3,4):
        ctx[1]['frame']=f
        with pytest.raises(ValueError,match='Current/future'):inspect(a,last,ctx)


def full_frame(f,pre,matched=(),birth=False,weak=False):
    predicted=[dict(s,age_since_update=s['age_since_update']+1) for s in pre]
    tracks=deepcopy(predicted);high_ids=[] if weak else [0];weak_ids=[0] if weak else []
    def stage(name,ids,items):return dict(name=name,gate=.1,tracks=deepcopy(tracks),detection_indices=ids,similarity=np.ones((len(tracks),len(ids))).tolist(),matched=[list(x) for x in items],unmatched_rows=sorted(set(range(len(tracks)))-{r for r,c in items}),unmatched_columns=sorted(set(range(len(ids)))-{c for r,c in items}))
    high=stage('high_all',high_ids,() if weak else matched)
    low=stage('weak_remaining',weak_ids,matched if weak else ())
    if not weak:
        low['tracks']=[predicted[i] for i in high['unmatched_rows']];low['similarity']=[[] for _ in low['tracks']]
        low['unmatched_rows']=list(range(len(low['tracks'])))
    post=[dict(s,age_since_update=0,tracker_id=0) for s in pre] if matched else deepcopy(predicted)
    born=[]
    if birth:
        state=dict(token=1,tracker_id=-1,bbox=[0.,0.,10.,10.],age_since_update=0)
        born=[dict(detection_index=0,state=state,reason='unmatched_high_above_activation')];post=[state]
    life=dict(frame=f,input_boxes=[[0.,0.,10.,10.]],input_confidences=[.2 if weak else .9],high_indices=high_ids,weak_indices=weak_ids,
        before_update=deepcopy(pre),before_predict=deepcopy(pre),predicted=predicted,after_budget_prune=deepcopy(predicted),stages=[high,low],
        births=born,birth_candidates=[],before_lifecycle_prune=post,after_update=deepcopy(post),removals=[])
    ops=[dict(token=pre[r]['token'],phase='weak_remaining' if weak else 'high_all',operation='update') for r,c in matched]
    return dict(lifecycle=life,numerical=dict(frame=f,operations=ops),geometry=dict(frame=f),
        candidate=dict(frame=f,arm='birth_continuation',actions=[],weak_stages=1,protected_other_updates_lost=0,weak_blocked_rows=len(pre) if weak else 0))


def test_full_prefix_birth_promotion_weak_and_empty_frames_keep_original_receipts():
    a=ReachabilityAudit('birth_continuation',.3,.6,.1,.05,ones)
    records=[];pre=[]
    for f,kwargs in ((1,dict(birth=True)),(2,dict(matched=((0,0),))),(3,dict(matched=((0,0),),weak=True))):
        record=full_frame(f,pre,**kwargs);records.append(deepcopy(record));a.add(record);pre=record['lifecycle']['after_update']
    assert records[0]['lifecycle']['births'] and a.summary()['accepted_summary']['accepted_high']==1
    assert a.summary()['accepted_summary']['accepted_weak']==1 and a.last=={1:(3,0,'weak')}
    assert a.summary()['birth_by_role']['active_confirmed']['qualified_proposals']==0
    assert a.summary()['counters']['broad_weak_blocked_rows']==1


def test_original_zero_action_or_matrix_mismatch_is_failure_never_zero_substitution():
    a=ReachabilityAudit('birth_continuation',.3,.6,.1,.05,ones);r=full_frame(1,[],birth=True)
    r['candidate']['actions']=[dict(kind='unexpected')]
    with pytest.raises(ValueError,match='zero-action'):a.add(r)
    r=scene();r['stages'][0]['similarity']=[[.4],[.3]]
    with pytest.raises(ValueError,match='Exact high IoU'):inspect(r)


def test_complete_native_empty_frame_has_no_stage_and_zero_not_missing_denominators():
    a=ReachabilityAudit('past_competition_handoff',.3,.6,.1,.05,ones)
    r=full_frame(1,[])
    r['lifecycle'].update(input_boxes=[],input_confidences=[],high_indices=[],stages=[])
    r['candidate'].update(arm='past_competition_handoff',weak_stages=0)
    a.add(r);s=a.summary()
    assert s['counters']['no_high_stage_frames']==1 and s['counters']['high_stage_frames']==0
    assert sum(s['availability_masks'].values())==0 and s['accepted_summary']['accepted_inputs']==0
    assert s['handoff']['unique_alternative_proposals']==s['handoff']['claim_conflict_proposals']==0
