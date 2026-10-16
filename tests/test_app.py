# SPDX-License-Identifier: AGPL-3.0-only
import base64
import io
import json
import threading
import time
import zipfile
import cv2
import numpy as np
import pytest
from fastapi.testclient import TestClient
import depthport.api as backend
from depthport.api import Service
from tests.helpers import FakeEngine, wait_for, fixture_image


@pytest.fixture
def client(monkeypatch):
    events=[]
    monkeypatch.setattr(backend,'make_engine',lambda key:FakeEngine(key,events))
    with TestClient(backend.app) as c:
        c.events=events
        yield c


def upload(c):
    ok,encoded=cv2.imencode('.png',fixture_image());assert ok
    return c.post('/api/image',files={'file':('test.png',encoded.tobytes(),'image/png')})


def result(c):
    def poll():
        r=c.get('/api/latest');return r.json() if r.status_code==200 else None
    return wait_for(poll)


def test_initially_no_model_download(client):
    s=client.get('/api/status').json()
    assert not s['model_loaded'] and not s['has_result']
    assert client.events==[]
    assert client.get('/api/latest').status_code==204
    assert len(client.get('/api/models').json()['models'])==4
    assert client.get('/').status_code==200


def test_uploaded_image_is_async_and_model_can_switch_without_reupload(client):
    assert upload(client).status_code==202
    a=result(client);assert a['engine']=='yolo26' and a['units']=='estimated_m'
    digest=a['source_sha256']
    assert client.post('/api/model',json={'engine':'da3-small'}).status_code==202
    b=result(client);assert b['engine']=='da3-small' and b['units']=='relative'
    assert b['source_sha256']==digest and b['frame_id']>a['frame_id']
    assert 'depth_stats_m' not in b and b['depth_stats']['median']==4.
    client.post('/api/model',json={'engine':'da3-metric'})
    c=result(client);assert c['engine']=='da3-metric' and c['units']=='estimated_m'
    assert c['source_sha256']==digest
    ev=client.events
    assert ev.index(('unload','yolo26'))<ev.index(('load','da3-small'))
    assert ev.index(('unload','da3-small'))<ev.index(('load','da3-metric'))


@pytest.mark.parametrize('key,unit',[('yolo26','estimated_m'),('da2-small','relative'),('da3-small','relative'),('da3-metric','estimated_m')])
def test_unit_correct_atomic_exports(client,key,unit):
    client.post('/api/model',json={'engine':key});upload(client);f=result(client)
    r=client.get('/api/export.zip');assert r.status_code==200
    z=zipfile.ZipFile(io.BytesIO(r.content))
    meta=json.loads(z.read('frame.json'));assert meta['engine']==key and meta['units']==unit
    depth=np.load(io.BytesIO(z.read(f'depth_{unit}.npy')),allow_pickle=False)
    raw=np.load(io.BytesIO(z.read('model_raw_depth.npy')),allow_pickle=False)
    assert depth.shape==(32,64)
    if key=='da3-metric': np.testing.assert_array_equal(depth,2*raw)
    elif key=='da2-small':
        from depthport.v2_engine import relative_to_virtual
        np.testing.assert_array_equal(depth,relative_to_virtual(raw)[0])
        assert meta['depth_info']['per_frame_geometry_normalization'] is True
        assert meta['depth_info']['geometry_kind']=='display_only_2_5d'
        assert meta['depth_info']['raw_to_output_scale'] is None
    else:np.testing.assert_array_equal(depth,raw)
    ply=z.read(f'pointcloud_{unit}.ply');header=ply.split(b'end_header\n')[0]
    assert f'units {unit}'.encode() in header
    assert f'frame_id {f["frame_id"]}'.encode() in header
    assert 'rgb_aligned.png' in z.namelist()
    assert 'points' not in meta
    assert unit in client.get('/api/depth.npy').headers['content-disposition']


def test_stop_removes_retained_image_and_exports(client):
    upload(client);result(client)
    client.post('/api/source/stop')
    assert client.get('/api/latest').status_code==204
    assert client.get('/api/export.zip').status_code==404
    assert not client.get('/api/status').json()['image_retained']
    assert client.post('/api/reprocess').status_code==409


def test_reprocess_same_image_keeps_source_hash(client):
    upload(client);a=result(client)
    assert client.post('/api/reprocess').status_code==202
    b=result(client);assert b['frame_id']>a['frame_id'] and b['source_sha256']==a['source_sha256']


@pytest.mark.parametrize('key',['typo','../weights.pt','depth-anything/DA3-LARGE',''])
def test_switch_api_is_fixed_allowlist(client,key):
    assert client.post('/api/model',json={'engine':key}).status_code==422
    assert client.events==[]


@pytest.mark.parametrize('url',['http://example.com','file:///etc/passwd','rtsp://','rtsp://host:99999/a','rtsp://user:bad pass@host'])
def test_invalid_rtsp_rejected_without_opening_capture(client,url):
    assert client.post('/api/source',json={'url':url}).status_code==422


def test_bad_upload_does_not_change_existing_result(client):
    upload(client);a=result(client)
    r=client.post('/api/image',files={'file':('broken.png',b'no image','image/png')})
    assert r.status_code==400
    assert client.get('/api/latest').json()['frame_id']==a['frame_id']
    r=client.post('/api/image',files={'file':('evil.txt',b'no','text/plain')});assert r.status_code==415


def test_cross_origin_writes_refused(client):
    assert client.post('/api/model',json={'engine':'da3-small'},headers={'Origin':'https://other.example'}).status_code==403
    assert client.post('/api/source/stop',headers={'Sec-Fetch-Site':'cross-site'}).status_code==403


def test_failed_load_no_fake_output_or_automatic_retry():
    events=[]
    class Broken(FakeEngine):
        def load(self):self.events.append(('attempt',self.key));raise RuntimeError('test download failed')
    service=Service(lambda key:Broken(key,events) if key=='da3-small' else FakeEngine(key,events))
    try:
        service.set_image(fixture_image(),'same');wait_for(lambda:service.latest)
        service.request_model('da3-small')
        wait_for(lambda:service.status()['model_state']=='error')
        time.sleep(.2)
        assert events.count(('attempt','da3-small'))==1
        assert service.latest is None and 'test download failed' in service.status()['error']
        service.request_model('yolo26');wait_for(lambda:service.latest)
        assert service.latest['engine']=='yolo26'
    finally:service.shutdown()


def test_switch_during_inference_cannot_publish_old_model():
    entered,release=threading.Event(),threading.Event()
    class Slow(FakeEngine):
        def predict(self,bgr,intr):entered.set();release.wait(3);return super().predict(bgr,intr)
    service=Service(lambda key:Slow(key) if key=='yolo26' else FakeEngine(key))
    try:
        service.set_image(fixture_image(),'same');assert entered.wait(2)
        service.request_model('da3-small');assert service.latest is None
        release.set();wait_for(lambda:service.latest)
        assert service.latest['engine']=='da3-small' and service.latest['frame_id']==1
    finally:release.set();service.shutdown()


def test_latest_switch_wins_while_old_model_loading():
    entered,release=threading.Event(),threading.Event();events=[]
    class SlowLoad(FakeEngine):
        def load(self):entered.set();release.wait(3);return super().load()
    service=Service(lambda key:SlowLoad(key,events) if key=='yolo26' else FakeEngine(key,events))
    try:
        service.set_image(fixture_image(),'same');assert entered.wait(2)
        service.request_model('da3-small');service.request_model('da3-metric')
        release.set();wait_for(lambda:service.latest)
        assert service.latest['engine']=='da3-metric'
        assert ('load','da3-small') not in events
        assert service.latest['frame_id']==1
    finally:release.set();service.shutdown()


def test_stop_while_inference_running_discards_result():
    entered,release=threading.Event(),threading.Event()
    class Slow(FakeEngine):
        def predict(self,bgr,intr):entered.set();release.wait(3);return super().predict(bgr,intr)
    service=Service(lambda key:Slow(key))
    try:
        service.set_image(fixture_image(),'same');assert entered.wait(2)
        service.stop_source();release.set();wait_for(lambda:not service.processing)
        assert service.latest is None and service.mode=='none'
    finally:release.set();service.shutdown()


def test_rtsp_reader_reused_on_model_switch(monkeypatch):
    class FakeCapture:
        def __init__(self,url):self.n=0;self.stopped=False
        def start(self):pass
        def stop(self):self.stopped=True
        def stats(self):return True,None,self.n
        def peek(self):self.n+=1;return self.n,fixture_image(),time.time()
    monkeypatch.setattr(backend,'CaptureWorker',FakeCapture)
    service=Service(lambda key:FakeEngine(key))
    try:
        service.set_source('rtsp://camera/stream');r=service.reader
        wait_for(lambda:service.latest)
        service.request_model('da3-small');wait_for(lambda:service.latest)
        assert service.latest['engine']=='da3-small' and service.reader is r and not r.stopped
    finally:service.shutdown()


def test_rtsp_password_error_redacted():
    assert 'secret' not in backend.safe_error(ValueError('failed rtsp://user:secret@cam/live'))
