# SPDX-License-Identifier: AGPL-3.0-only
"""v0.3 manual Session/Replay tests; fake deterministic depth, no camera or models."""
from __future__ import annotations
import hashlib
import io
import json
import re
import zipfile
from pathlib import Path
import numpy as np
import pytest
from fastapi.testclient import TestClient
from depthport.sessions import SessionStore, SessionLimit, SessionNotFound, SessionIntegrity, MAX_FRAMES, _parse_ply
from depthport.api import bundle_bytes, prepare_cloud
from depthport.engines import DepthResult
from tests.helpers import FakeEngine, fixture_image, wait_for
import depthport.api as api


def sample_frame(frame_id=1, units='estimated_m', engine='yolo26'):
    bgr=np.full((32,48,3),(12,88,160),np.uint8)
    k={'fx':55.,'fy':56.,'cx':23.5,'cy':15.5,'source':'hfov_estimate'}
    depths=np.full((32,48),2.5,np.float32)
    result=DepthResult(bgr,depths,depths.copy(),k,units,info={'fixture':True})
    cloud,_=prepare_cloud(result)
    records=cloud.pop('points_raw')
    f={**cloud,'frame_id':frame_id,'generation':1,'engine':engine,
       'model':'synthetic only','timestamp':10.5,'source':'image',
       'source_sha256':'aaa','timings':{'pipeline_ms':0.1},
       'filter_info':{}, 'depth_info':result.info}
    return f,bundle_bytes(f,records,result)


def test_store_create_capture_replay_units_and_hash(tmp_path):
    store=SessionStore(tmp_path/'outputs'/'sessions')
    item=store.create('Fixture session')
    assert len(item['session_id'])==32
    frame,bundle=sample_frame()
    row=store.capture(item['session_id'],bundle,frame)
    assert row['sha256']==hashlib.sha256(bundle).hexdigest()
    assert row['units']=='estimated_m'
    assert store.bundle(item['session_id'],1)==bundle
    replay=store.replay(item['session_id'],1)
    assert replay['units']=='estimated_m' and replay['engine']=='yolo26'
    assert replay['count']>0 and replay['points'] and replay['rgb_png'] and replay['depth_jpeg']
    trend=store.temporal_summary(item['session_id'])
    assert trend['groups']['yolo26:estimated_m'][0]['delta_from_first']==0
    assert store.list_sessions()[0]['frame_count']==1
    assert (tmp_path/'outputs'/'sessions'/item['session_id']/'frame-00001.zip').exists()


def test_relative_units_retained_and_not_mislabeled(tmp_path):
    store=SessionStore(tmp_path/'sessions')
    sid=store.create('Relative')['session_id']
    f,b=sample_frame(units='relative',engine='da3-small')
    store.capture(sid,b,f)
    assert store.replay(sid,1)['units']=='relative'
    assert 'not metres' in store.temporal_summary(sid)['interpretation']


def test_integrity_failure_and_path_traversal(tmp_path):
    store=SessionStore(tmp_path/'sessions')
    sid=store.create()['session_id']
    f,b=sample_frame()
    store.capture(sid,b,f)
    for bad in ('../outside','%2e%2e','',sid+'/nested'):
        with pytest.raises(SessionNotFound):store.frames(bad)
    path=tmp_path/'sessions'/sid/'frame-00001.zip'
    path.write_bytes(b'modified'+b)
    with pytest.raises(SessionIntegrity):store.bundle(sid,1)


def test_no_silent_capture_and_bounds(tmp_path,monkeypatch):
    store=SessionStore(tmp_path/'sessions')
    sid=store.create()['session_id']
    assert store.frames(sid)['frames']==[]
    f,b=sample_frame()
    with pytest.raises(SessionLimit):store.capture(sid,b'X'*(20*1024*1024+1),f)
    import depthport.sessions as mod
    monkeypatch.setattr(mod,'MAX_FRAMES',1)
    store.capture(sid,b,f)
    with pytest.raises(SessionLimit):store.capture(sid,b,f)


def test_rejects_wrong_provenance_and_invalid_labels(tmp_path):
    store=SessionStore(tmp_path/'sessions')
    with pytest.raises(ValueError):store.create('<script>')
    sid=store.create()['session_id']
    f,b=sample_frame()
    with pytest.raises(ValueError):store.capture(sid,b,{**f,'frame_id':999})
    with pytest.raises(ValueError):store.capture(sid,b,{**f,'units':'relative'})
    with pytest.raises(SessionNotFound):store.bundle(sid,1)


def test_no_symlink_frame_allowed(tmp_path):
    store=SessionStore(tmp_path/'sessions');sid=store.create()['session_id']
    f,b=sample_frame();store.capture(sid,b,f)
    target=tmp_path/'outside.zip';target.write_bytes(b)
    link=tmp_path/'sessions'/sid/'frame-00001.zip'
    link.unlink();link.symlink_to(target)
    with pytest.raises(SessionIntegrity):store.bundle(sid,1)


def test_direct_zip_replay_matches_ply_payload(tmp_path):
    store=SessionStore(tmp_path/'sessions');sid=store.create()['session_id']
    f,b=sample_frame();store.capture(sid,b,f)
    with zipfile.ZipFile(io.BytesIO(b)) as z:
        ply=z.read('pointcloud_estimated_m.ply')
    packed,count=_parse_ply(ply)
    assert count==store.replay(sid,1)['count']
    assert packed==store.replay(sid,1)['points']
    with pytest.raises(SessionIntegrity):_parse_ply(b'not a ply')


@pytest.fixture
def client_enabled(monkeypatch,tmp_path):
    monkeypatch.setenv('ENABLE_SESSION_STORAGE','1')
    monkeypatch.setattr(api,'SessionStore',lambda _root:SessionStore(tmp_path/'sessions'))
    monkeypatch.setattr(api,'make_engine',lambda key:FakeEngine(key))
    with TestClient(api.app,client=('127.0.0.1',6666)) as c:
        yield c


def test_real_http_routes_with_fake_inference(client_enabled):
    c=client_enabled
    assert c.get('/api/sessions/status').json()['manual_capture_only']
    assert c.get('/sessions').status_code==200
    a=c.post('/api/sessions',json={'label':'API test'})
    assert a.status_code==201
    sid=a.json()['session_id']
    assert c.post(f'/api/sessions/{sid}/capture').status_code==409
    image=fixture_image();ok,png=__import__('cv2').imencode('.png',image)
    assert ok
    assert c.post('/api/model',json={'engine':'yolo26'}).status_code==202
    assert c.post('/api/image',files={'file':('fixture.png',png.tobytes(),'image/png')}).status_code==202
    wait_for(lambda:c.get('/api/latest').status_code==200)
    cap=c.post(f'/api/sessions/{sid}/capture')
    assert cap.status_code==201,cap.text
    frames=c.get(f'/api/sessions/{sid}/frames').json()
    assert len(frames['frames'])==1
    replay=c.get(f'/api/sessions/{sid}/frames/1/replay')
    assert replay.status_code==200 and replay.json()['count']>0
    bundle=c.get(f'/api/sessions/{sid}/frames/1/bundle.zip')
    assert bundle.status_code==200
    with zipfile.ZipFile(io.BytesIO(bundle.content)) as z:
        assert 'frame.json' in z.namelist()
    assert len(c.get('/api/sessions').json()['sessions'])==1
    assert 'groups' in c.get(f'/api/sessions/{sid}/temporal').json()


def test_local_only_and_disabled(monkeypatch,tmp_path):
    monkeypatch.delenv('ENABLE_SESSION_STORAGE',raising=False)
    monkeypatch.setattr(api,'make_engine',lambda key:FakeEngine(key))
    with TestClient(api.app,client=('127.0.0.1',42)) as c:
        assert c.get('/api/sessions').status_code==404
        assert c.post('/api/sessions',json={}).status_code==404
    monkeypatch.setenv('ENABLE_SESSION_STORAGE','1')
    monkeypatch.setattr(api,'SessionStore',lambda _root:SessionStore(tmp_path/'local'))
    with TestClient(api.app,client=('192.0.2.11',42)) as c:
        assert c.get('/api/sessions').status_code==403
        assert c.post('/api/sessions',json={}).status_code==403


def test_test_fixture_does_not_store_source_url(tmp_path):
    store=SessionStore(tmp_path/'sessions');sid=store.create()['session_id']
    f,b=sample_frame()
    store.capture(sid,b,{**f,'source':'rtsp'})
    m=(tmp_path/'sessions'/sid/'session.json').read_text()
    assert 'rtsp://' not in m and 'password' not in m
