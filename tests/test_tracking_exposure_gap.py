# SPDX-License-Identifier: AGPL-3.0-only
import copy
import numpy as np
import pytest
from depthport.tracking_exposure_gap import GapLedger, ARMS, normal


def t(token,age=1,confirmed=True):
    return {'token':token,'tracker_id':token if confirmed else -1,'age_since_update':float(age),
            'successful_updates':None,'consecutive_updates':1}


def stage(name,refs,indices,scores,matched):
    return {'name':name,'gate':.1,'tracks':refs,'detection_indices':indices,
        'similarity':np.asarray(scores,dtype=np.float32).reshape(len(refs),len(indices)).tolist(),
        'matched':[list(p) for p in matched],
        'unmatched_rows':sorted(set(range(len(refs)))-{r for r,c in matched}),
        'unmatched_columns':sorted(set(range(len(indices)))-{c for r,c in matched})}


def frame(number,refs,high,weak,high_scores,weak_scores,high_match,weak_match,audit=None,deferred=None):
    remaining=[x for i,x in enumerate(refs) if i not in {r for r,c in high_match}]
    return {'frame':number,'stages':[stage('high_all',refs,high,high_scores,high_match),
        stage('weak_remaining',remaining,weak,weak_scores,weak_match)],'past_support_audit':audit or [],'deferred':deferred or []}


@pytest.mark.parametrize('arm',ARMS)
def test_causal_history_reconstructs_original_pair_and_never_accepts_vetoed_observation(arm):
    ledger=GapLedger(arm);r,q=t(1),t(2)
    ledger.frame(frame(1,[r,q],[0,1],[],[[.9,.89],[.89,.9]],np.empty((0,)),[(0,0),(1,1)],[]),[{'confidence':.9}]*2)
    ledger.frame(frame(2,[r,q],[0],[],[[0],[.9]],np.empty((0,)),[(1,0)],[]),[{'confidence':.9}])
    veto=arm!=ARMS[0]
    past={'qualified':True,'reason':'past_accepted_active_support','selected_observation':[1,0],'competitor_observation':[1,1]}
    protection={'protected':True,'reason':'preserves_other_updates','lost_other_updates':0,'alternative_accepted_count':1}
    audit=[{'row':0,'column':0,'veto':veto,'competitors':[{'row':1,'role':'active','past':past,'protection':protection,'selected':veto}]}]
    raw=frame(3,[t(1,2),t(2)],[],[0],np.empty((0,)),[[.51],[.5]],[],[] if veto else [(0,0)],audit,
              [{'row':0,'column':0,'competitor_rows':[1]}] if veto else [])
    ledger.frame(raw,[{'confidence':.2}]);s=ledger.summary()['counts']
    assert s['opportunities']==s['active_competition']==s['past_supported']==s['protection_pass']==s['joint_alternatives']==1
    assert s['actual_vetoes']==int(veto) and ledger.history[1][-1][0]==(1 if veto else 3)
    assert ledger.context[1]['key'][0]==(1 if veto else 3)


def test_weak_input_rows_partition_below_gate_unselected_and_selected_without_active_competition():
    refs=[t(i,2) for i in (1,2,3)];raw=frame(1,refs,[],[0],np.empty((0,)),[[.05],[.5],[.6]],[],[(2,0)])
    ledger=GapLedger(ARMS[0]);ledger.frame(raw,[{'confidence':.2}]);c=ledger.summary()['counts']
    assert c['missed_rows_with_weak_input']==3
    assert c['missed_rows_no_gate_column']==c['missed_rows_gate_unselected']==c['opportunities']==c['no_active_row']==1
    assert c['active_alternatives']==0


@pytest.mark.parametrize('reason,old',[
    ('past_stage_comparison_missing',None),
    ('past_competitor_without_observation',{'role':'active','accepted_key':None,'gate_supported':False,'gap_supported':False}),
    ('past_retained',{'role':'retained','accepted_key':None,'gate_supported':True,'gap_supported':True}),
    ('past_unconfirmed',{'role':'unconfirmed','accepted_key':None,'gate_supported':True,'gap_supported':True}),
    ('past_below_gate',{'role':'active','accepted_key':(1,1),'gate_supported':False,'gap_supported':False}),
    ('past_gap_not_supported',{'role':'active','accepted_key':(1,1),'gate_supported':True,'gap_supported':False}),
])
def test_missing_comparison_observation_and_observed_ineligibility_remain_distinct(reason,old):
    ledger=GapLedger(ARMS[0]);ledger.number=4;ledger.history[1]=[(1,0)];ledger.history[2]=[(1,1),(3,1)]
    ledger.context[1]={'key':(1,0),'competitors':{} if old is None else {2:old}}
    evidence=ledger.past_evidence(t(1,3),t(2))
    assert evidence=={'qualified':False,'reason':reason}


def test_unindexed_birth_history_is_unknown_and_future_or_tampered_support_fails():
    ledger=GapLedger(ARMS[0]);ledger.number=4
    assert ledger.past_evidence(t(1,3),t(2))['reason']=='missing_recorded_history'
    ledger.history[1]=[(4,0)];ledger.history[2]=[(3,1)];ledger.context[1]={'key':(4,0)}
    with pytest.raises(ValueError,match='Future'):ledger.past_evidence(t(1,3),t(2))
    ledger.history[1]=[(1,0)];ledger.context[1]={'key':(1,0),'competitors':{2:{'role':'active','accepted_key':(1,9),'gate_supported':True,'gap_supported':True}}}
    with pytest.raises(ValueError,match='Immutable'):ledger.past_evidence(t(1,3),t(2))


def test_empty_frame_is_retained_but_missing_association_with_detections_is_not_fabricated():
    empty={'frame':1,'stages':[],'deferred':[],'past_support_audit':[]}
    ledger=GapLedger(ARMS[0]);ledger.frame(empty,[])
    assert ledger.summary()['counts']['frames_without_association']==1
    with pytest.raises(ValueError,match='Missing association'):GapLedger(ARMS[0]).frame(empty,[{'confidence':.2}])


def test_corrupted_original_assignment_and_private_evidence_are_not_silently_summarized():
    raw=frame(1,[t(1,2)],[],[0],np.empty((0,)),[[.8]],[],[])
    with pytest.raises(ValueError,match='reconstruction'):GapLedger(ARMS[0]).frame(raw,[{'confidence':.2}])


def test_native_buffer_parameter_is_30hz_based_and_scales_without_running_a_tracker():
    pytest.importorskip('trackers')
    from trackers import ByteTrackTracker
    assert [ByteTrackTracker._compute_maximum_frames_without_update(30,fps) for fps in (10,25,30)]==[10,25,30]
