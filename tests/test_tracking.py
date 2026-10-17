# SPDX-License-Identifier: AGPL-3.0-only
"""Offline tracking tests with synthetic saved frames and explicit fake detector."""
from __future__ import annotations
import io
import zipfile
import time

import numpy as np
import pytest
from fastapi.testclient import TestClient
from depthport.tracking import associate, analyse_session
from depthport.sessions import SessionStore, SessionIntegrity
from tests.test_sessions import sample_frame
import depthport.api as api


def new_store(tmp_path, engines=None):
    store=SessionStore(tmp_path/'sessions');sid=store.create('tracking fixture')['session_id']
    for i in range(3):
        f,b=sample_frame(frame_id=i+1, engine=(engines or ['yolo26']*3)[i])
        f['timestamp']=float(i+1)
        # Maintain exported frame timestamp consistency for this synthetic bundle.
        # The SessionStore validates frame_id/model/unit and saves per-frame timestamp.
        store.capture(sid,b,f)
    return store,sid


def moving_detector(bgr):
    moving_detector.index+=1
    step=moving_detector.index
    m=np.zeros(bgr.shape[:2],bool)
    m[8:20,7+step:20+step]=True
    return [{'bbox':[7+step,8,20+step,20], 'class_id':0,'label':'person',
             'confidence':.9,'mask_kind':'instance_mask','mask':m}]


def test_object_id_remains_stable_and_3d_xyz_is_camera_local(tmp_path):
    store,sid=new_store(tmp_path)
    moving_detector.index=-1
    report=analyse_session(store,sid,detector=moving_detector)
    assert report['format']=='depthport.semantic-tracking.v1'
    assert report['track_count']==1
    assert len(report['tracks'][0]['observations'])==3
    ids={frame['objects'][0]['object_id'] for frame in report['frames']}
    assert ids=={'obj-0001'}
    for frame in report['frames']:
        assert frame['objects'][0]['depth_median']==pytest.approx(2.5)
        assert frame['objects'][0]['xyz_camera_median'][2]==pytest.approx(2.5)
    assert report['frames'][0]['units']=='estimated_m'
    assert 'NOT world XYZ' in report['note']
    store.save_tracking_report(sid,report)
    assert store.tracking_report(sid)['track_count']==1


def test_model_switch_forces_new_identity(tmp_path):
    store,sid=new_store(tmp_path,engines=['yolo26','da3-metric','yolo26'])
    moving_detector.index=-1
    report=analyse_session(store,sid,detector=moving_detector)
    assert report['track_count']==3
    assert [f['objects'][0]['object_id'] for f in report['frames']]==['obj-0001','obj-0002','obj-0003']


def test_identity_requires_class_and_spatial_match():
    prev={1:{'class_id':0,'bbox':[2,2,12,12],'step':0}}
    detections=[{'class_id':2,'bbox':[2,2,12,12]},{'class_id':0,'bbox':[50,50,60,60]}]
    res,new,next_id=associate(detections,prev,image_shape=(100,100),step=1,next_id=2)
    assert [d['object_id'] for d in res]==['obj-0002','obj-0003']
    assert next_id==4


def test_bounding_box_depth_may_contain_background(tmp_path):
    store,sid=new_store(tmp_path)
    def fake(img):
        m=np.zeros(img.shape[:2],bool);m[6:15,8:16]=True
        return [{'class_id':1,'label':'equipment','confidence':.75,'bbox':[8,6,16,15],
                 'mask_kind':'bounding_box_region_approximation','mask':m}]
    result=analyse_session(store,sid,mode='detect',detector=fake)
    assert result['frames'][0]['objects'][0]['mask_kind']=='bounding_box_region_approximation'
    assert 'background' in result['note']


def test_bad_mask_and_untrusted_model_input_fail_closed(tmp_path):
    store,sid=new_store(tmp_path)
    def bad(img):
        return [{'class_id':0,'label':'person','confidence':.9,'bbox':[1,1,10,10],
                 'mask_kind':'instance_mask','mask':np.ones((2,2),bool)}]
    with pytest.raises(SessionIntegrity):analyse_session(store,sid,detector=bad)
    with pytest.raises(ValueError):analyse_session(store,sid,detector=bad,max_frames=500)
    with pytest.raises(ValueError):analyse_session(store,sid,detector=bad,mode='foo')


def test_corrupt_bundle_rejected_and_stale_report(tmp_path):
    store,sid=new_store(tmp_path)
    moving_detector.index=-1
    report=analyse_session(store,sid,detector=moving_detector)
    store.save_tracking_report(sid,report)
    f,b=sample_frame(frame_id=4);store.capture(sid,b,f)
    with pytest.raises(SessionIntegrity, match='stale'):
        store.tracking_report(sid)
    with pytest.raises(SessionIntegrity, match='changed'):
        store.save_tracking_report(sid,report)
    path=tmp_path/'sessions'/sid/'frame-00002.zip'
    path.write_bytes(path.read_bytes()+b'damaged')
    with pytest.raises(SessionIntegrity):analyse_session(store,sid,detector=moving_detector)


def test_no_pretrained_inference_replay_only(tmp_path):
    store,sid=new_store(tmp_path)
    replay=store.replay(sid,1)
    assert replay['points'] and replay['rgb_png']
    with pytest.raises(Exception):store.tracking_report(sid)


def test_http_tracking_lifecycle(monkeypatch,tmp_path):
    store,sid=new_store(tmp_path)
    monkeypatch.setenv('ENABLE_SESSION_STORAGE','1')
    monkeypatch.setattr(api,'SessionStore',lambda root:store)
    def fake_analysis(store,sid,**kwargs):
        moving_detector.index=-1
        return analyse_session(store,sid,detector=moving_detector,**{k:v for k,v in kwargs.items() if k!='device'})
    monkeypatch.setattr(api,'analyse_session',fake_analysis)
    with TestClient(api.app,client=('127.0.0.1',4321)) as c:
        assert c.get(f'/api/sessions/{sid}/tracking/report.json').status_code==404
        resp=c.post(f'/api/sessions/{sid}/tracking',json={'mode':'segment','max_frames':3})
        assert resp.status_code==202,resp.text
        deadline=time.monotonic()+3
        while time.monotonic()<deadline:
            q=c.get(f'/api/sessions/{sid}/tracking/status').json()
            if q['state'] in ('completed','error'):break
            time.sleep(.02)
        assert q['state']=='completed',q
        r=c.get(f'/api/sessions/{sid}/tracking/report.json')
        assert r.status_code==200 and r.json()['track_count']==1
        d=c.get(f'/api/sessions/{sid}/tracking/report.json?download=true')
        assert 'attachment;' in d.headers['Content-Disposition']
        assert c.post(f'/api/sessions/{sid}/tracking',json={'mode':'segment','max_frames':50}).status_code==422
    with TestClient(api.app,client=('192.0.2.5',4321)) as c:
        assert c.get(f'/api/sessions/{sid}/tracking/status').status_code==403
