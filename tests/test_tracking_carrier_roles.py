# SPDX-License-Identifier: AGPL-3.0-only
import copy
import json
import os
import pytest
from depthport.tracking_carrier_role_audit import carrier_audit, encoded, strict_json, RoleAudit
from tools.audit_tracking_carrier_roles import unmeasured


def sample():
    frames=[{'index':1,'objects':[{'object_id':'bytetrack-0','class_id':0,'confidence':.2,'bbox':[0.,1.,4.,5.]}]}]
    envelope={'format':'depthport.semantic-tracking.v1','session_id':'video-'+'a'*24,
              'sampling':'dense_video','tracker':'bytetrack','source':'offline_video_fixed_detection_cache','frames':frames}
    return envelope,frames


def test_derived_carrier_compatibility_is_separate_from_original_failure():
    envelope,frames=sample(); original=encoded(envelope); native=encoded(frames)
    value,_=carrier_audit(original,native,'a'*64,1)
    assert value['carrier_contract_compatible'] and not value['whole_archive_bytes_equal']
    assert value['derived_carrier_reconstruction_exact'] and value['ordered_payload_encoding_equal']
    assert not value['original_failure_changed'] and not value['original_replication_changed']
    assert original==encoded(envelope) and native==encoded(frames)


@pytest.mark.parametrize('field',['format','session_id','sampling','tracker','source'])
def test_metadata_cannot_be_arbitrarily_stripped(field):
    envelope,frames=sample();envelope[field]='wrong'
    with pytest.raises(ValueError,match='metadata'):carrier_audit(encoded(envelope),encoded(frames),'a'*64,1)


@pytest.mark.parametrize('level',['carrier','frame','object'])
def test_no_gt_score_or_unknown_field_at_any_carrier_level(level):
    envelope,frames=sample();target={'carrier':envelope,'frame':envelope['frames'][0],'object':envelope['frames'][0]['objects'][0]}[level]
    target['gt_or_score']=[]
    with pytest.raises(ValueError):carrier_audit(encoded(envelope),encoded(frames),'a'*64,1)


@pytest.mark.parametrize('change',['id','confidence','coordinate','object_order','frame_order','numeric_type','signed_zero'])
def test_payload_values_types_order_and_native_ids_are_never_normalized(change):
    envelope,frames=sample()
    if change in ('frame_order','object_order'):
        extra=copy.deepcopy(frames[0]);extra['index']=2;frames.append(extra)
        for f in frames:f['objects'].append(dict(f['objects'][0],object_id='bytetrack-1'))
    new=copy.deepcopy(frames)
    if change=='id':new[0]['objects'][0]['object_id']='bytetrack-9'
    elif change=='confidence':new[0]['objects'][0]['confidence']=.21
    elif change=='coordinate':new[0]['objects'][0]['bbox'][2]=4.1
    elif change=='numeric_type':new[0]['objects'][0]['bbox'][0]=0
    elif change=='signed_zero':new[0]['objects'][0]['bbox'][0]=-0.0
    elif change=='object_order':new[0]['objects'].reverse()
    else:
        new.reverse()
        with pytest.raises(ValueError,match='Dense'):carrier_audit(encoded(envelope),encoded(new),'a'*64,len(frames))
        return
    value,_=carrier_audit(encoded(envelope),encoded(new),'a'*64,len(frames))
    assert not value['carrier_contract_compatible'] and not value['ordered_payload_encoding_equal']


def test_whitespace_or_key_order_is_not_silently_rewritten_to_pass():
    envelope,frames=sample();old=(json.dumps(envelope,indent=2)+'\n').encode()
    value,_=carrier_audit(old,encoded(frames),'a'*64,1)
    assert value['ordered_payload_encoding_equal'] and not value['derived_carrier_reconstruction_exact']
    assert not value['carrier_contract_compatible']


@pytest.mark.parametrize('text',['{"frames":[],"frames":[]}','{"x":NaN}','{"x":Infinity}'])
def test_duplicate_or_nonfinite_json_rejected(text):
    with pytest.raises(ValueError):strict_json(text)


def test_missing_history_is_unknown_and_keeps_original_failure():
    row=unmeasured({'name':'KITTI-0000','frames':154,'status':'failed','reason':'native_reference_failed'})
    assert row['roles'] is None and row['status']=='unmeasured_no_observed_history'
    assert row['original_status']=='failed' and not row['original_failure_changed']


native=pytest.mark.skipif(os.getenv('RUN_TRACKERS_CONTRACTS')!='1',reason='Pinned NumPy2 native contracts on generated data only')


def generated_history(fps,arm,outcome):
    import numpy as np
    import supervision as sv
    from trackers import ByteTrackTracker
    from depthport.tracking_lifecycle_probe import LifecycleProbe
    from depthport.tracking_estimator_shadow import EstimatorShadow
    from depthport.tracking_geometry_control import GeometryProjection
    from depthport.tracking_recovery_control import PARAMETERS
    tracker=ByteTrackTracker(frame_rate=fps,**PARAMETERS); history=[]
    scores=[.9, .9 if outcome=='high' else .2 if outcome=='weak' else None]
    if outcome=='unmatched':scores.append(.9)  # a fresh terminal seed stays censored
    with LifecycleProbe(tracker) as life, EstimatorShadow(tracker,life) as shadow, GeometryProjection(tracker,life,shadow,arm=='projection') as guard:
        for score in scores:
            d=sv.Detections.empty() if score is None else sv.Detections(xyxy=np.array([[1,2,11,22]],dtype=np.float32),confidence=np.array([score],dtype=np.float32))
            tracker.update(d)
            history.append(copy.deepcopy({'lifecycle':life.last,'numerical':shadow.last,'geometry':guard.last}))
    return history


@native
@pytest.mark.parametrize('fps',[10,25,30])
@pytest.mark.parametrize('arm',['reference','projection'])
@pytest.mark.parametrize('outcome',['high','weak','unmatched'])
def test_pinned_native_seed_promotion_prune_and_censor_induction(fps,arm,outcome,monkeypatch):
    from trackers import ByteTrackTracker
    history=generated_history(fps,arm,outcome)
    def forbidden(*args,**kwargs):raise AssertionError('Audit must never run native tracking')
    monkeypatch.setattr(ByteTrackTracker,'update',forbidden)
    ledger=RoleAudit()
    for row in history:ledger.add(row)
    result,censored=ledger.result();c=result['counts']
    assert c['tentative_prediction_rows']==c['tentative_active_pre']==c['tentative_zero_velocity_pre']==1
    assert c['tentative_retained_pre']==c['tentative_applied_rows']==c['tentative_candidate_rows']==0
    assert c['tentative_after_predict_age_one']==1 and result['induction_checks_pass']
    assert not result['empirical_projection_safety_accepted']
    if outcome=='unmatched':
        assert c['tentative_unmatched_removed']==1 and c['births']==2 and len(censored)==1
    else:
        assert c['tentative_'+outcome+'_promotions']==1 and not censored
        if outcome=='weak':assert result['original_native_counts']['accepted_weak']==1


@native
@pytest.mark.parametrize('change',['counter','retained','candidate','missing_update'])
def test_induction_violations_are_failures_not_zero_exposure(change):
    rows=generated_history(10,'reference','weak');bad=rows[1]
    if change=='counter':bad['lifecycle']['before_predict'][0]['consecutive_updates']=2
    elif change=='retained':bad['lifecycle']['before_predict'][0]['age_since_update']=1
    elif change=='candidate':bad['geometry']['rows'][0]['candidate_axes']=[0]
    else:bad['numerical']['operations'].pop()
    ledger=RoleAudit();ledger.add(rows[0])
    with pytest.raises(ValueError):ledger.add(bad)
