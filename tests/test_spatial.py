# SPDX-License-Identifier: AGPL-3.0-only
"""Spatial analysis mathematical and API contracts. No pretrained model used."""
from __future__ import annotations
import io
import json
import time
import zipfile
from types import SimpleNamespace
from pathlib import Path
import numpy as np
import cv2
import pytest
from fastapi.testclient import TestClient
from depthport.spatial import backproject, pixel_inspection, depth_distribution, distance_between, fit_plane, empirical_validation
from depthport.comparison import compact_card
from depthport.semantic import extract_instances, fuse_instances, allowed_model
from depthport.engines import DepthResult
from tests.helpers import FakeEngine, fixture_image, wait_for
import depthport.api as backend


def fake_result(shape=(32,64), value=2.0, units='estimated_m'):
    h,w=shape
    bgr=np.full((h,w,3),(20,80,210),dtype=np.uint8)
    depth=np.full((h,w),value,np.float32)
    k={'fx':100.,'fy':100.,'cx':(w-1)/2,'cy':(h-1)/2,'source':'test_intrinsics'}
    return DepthResult(bgr,depth,depth.copy(),k,units,info={'explicit_test':True})


def test_backprojection_and_pixel_inspection():
    k={'fx':100,'fy':100,'cx':10,'cy':20}
    np.testing.assert_allclose(backproject(15,10,2,k),[.1,-.2,2])
    result=fake_result((30,40));meta={'frame_id':1,'generation':5,'engine':'yolo26',
       'model':'TEST DOUBLE','timestamp':12,'units':'estimated_m','source_sha256':'abc'}
    info=pixel_inspection(result,meta,20,15)
    assert info['rgb']==[210,80,20] and info['depth']==2
    assert info['xyz_camera'][2]==2 and info['xyz_viewer'][2]==-2
    assert info['depth_interpretation']=='unvalidated_estimated_meters'
    with pytest.raises(ValueError):pixel_inspection(result,meta,999,0)
    result.depth[15,20]=np.nan
    assert pixel_inspection(result,meta,20,15)['valid_depth'] is False


def test_histogram_relabels_only_and_preserves_depth():
    raw=np.array([[1,2,3,np.inf,0],[-3,4,5,6,np.nan]],np.float32)
    original=raw.copy()
    out=depth_distribution(raw,16)
    assert out['count']==6 and sum(out['hist'])==6
    assert np.array_equal(raw,original,equal_nan=True)
    assert out['normalized_for_visualization'] is True
    with pytest.raises(ValueError):depth_distribution(raw,3)


def test_distance_scaled_not_mutating_raw():
    r=fake_result((20,30))
    raw=distance_between(r,(3,5),(13,5))
    assert raw['raw_distance']==pytest.approx(.2)
    scaled=distance_between(r,(3,5),(13,5),scale=2)
    assert scaled['distance']==pytest.approx(.4)
    assert r.depth[5,3]==2
    with pytest.raises(ValueError):distance_between(r,(3,5),(500,5))
    assert empirical_validation(.2,.42,2)['absolute_error_m']==pytest.approx(.02)


def test_planar_ransac_returns_candidate_not_ground_truth():
    h,w=120,160
    k={'fx':100.,'fy':100.,'cx':80.,'cy':60.}
    depth=np.full((h,w),np.nan,np.float32)
    for v in range(70,120): depth[v,:]=100./(v-60.)
    plane=fit_plane(depth,k,(.08,.59,.92,.98),threshold=.002,iterations=70)
    assert plane['inlier_fraction']>.99 and plane['rms_inlier']<.001
    assert abs(plane['normal_camera'][1])>.99
    assert plane['interpretation']=='candidate_plane_not_confirmed_floor'
    with pytest.raises(ValueError):fit_plane(depth,k,(.8,.8,.81,.81),.05)


def test_extract_detection_boxes_warn_background_and_segment_masks():
    import torch
    b=SimpleNamespace(xyxy=torch.tensor([[2.,3.,15.,20.]]),cls=torch.tensor([0.]),conf=torch.tensor([.8]))
    masks=SimpleNamespace(data=torch.zeros((1,32,64),dtype=torch.uint8))
    masks.data[0,6:13,6:11]=1
    pred=SimpleNamespace(boxes=b,masks=masks,names={0:'person'})
    objects=extract_instances(pred,(32,64),'segment')
    assert objects[0]['mask_kind']=='instance_mask'
    assert objects[0]['mask'].sum()==35
    entries,_=fuse_instances(fake_result(),objects)
    assert entries[0]['pixels_valid']==35 and entries[0]['points_packed_count']==35
    assert entries[0]['depth_median']==2 and entries[0]['xyz_camera_median'] is not None
    detect=extract_instances(pred,(32,64),'detect')[0]
    assert detect['mask_kind']=='bounding_box_region_approximation'
    assert detect['mask'].sum()>objects[0]['mask'].sum()
    with pytest.raises(RuntimeError):extract_instances(SimpleNamespace(boxes=b,masks=None,names={0:'person'}),(32,64),'segment')


def test_semantic_local_override_and_offline_checks(monkeypatch):
    monkeypatch.setenv('SEMANTIC_SEGMENT_MODEL','local-model.pt')
    monkeypatch.setenv('MODEL_OFFLINE','1')
    with pytest.raises(RuntimeError):allowed_model('segment')
    monkeypatch.setenv('MODEL_OFFLINE','0')
    assert allowed_model('segment')=='local-model.pt'
    with pytest.raises(ValueError):allowed_model('not-semantic')


@pytest.fixture
def client(monkeypatch):
    monkeypatch.setattr(backend,'make_engine',lambda key:FakeEngine(key))
    with TestClient(backend.app) as c:yield c


def upload(c):
    ok,buf=cv2.imencode('.png',fixture_image());assert ok
    assert c.post('/api/image',files={'file':('test.png',buf.tobytes(),'image/png')}).status_code==202
    return wait_for(lambda:c.get('/api/latest').json() if c.get('/api/latest').status_code==200 else None)


def test_api_spatial_inspect_and_report_and_stale_frame(client):
    assert client.get('/spatial').status_code==200
    assert 'Spatial Analysis' in client.get('/spatial').text
    first=upload(client)
    id=first['frame_id']
    assert client.get('/api/spatial/inspect',params={'u':4,'v':5,'frame_id':id}).status_code==200
    assert client.get('/api/spatial/inspect',params={'u':4,'v':5,'frame_id':id-1}).status_code==409
    assert client.get('/api/spatial/inspect',params={'u':400,'v':5,'frame_id':id}).status_code==422
    info=client.get('/api/spatial/frame?after=0').json()
    assert 'points' not in info and 'rgb_jpeg' in info
    assert client.get('/api/spatial/frame',params={'after':id}).status_code==204
    report=client.get('/api/spatial/report.json').json()
    assert report['units']=='estimated_m' and report['scale_anchor'] is None
    z=zipfile.ZipFile(io.BytesIO(client.get('/api/export.zip').content))
    assert 'spatial_analysis.json' in z.namelist()


def test_metric_measure_and_anchor_requires_calibrated_camera(client):
    first=upload(client)
    body={'frame_id':first['frame_id'],'a':[10,10],'b':[20,10]}
    r=client.post('/api/spatial/measure',json=body)
    assert r.status_code==200 and r.json()['uncertainty_m'] is None
    assert r.json()['measurement_status']=='unverified_model_estimate'
    r=client.post('/api/spatial/calibration/scale',json={**body,'known_distance_m':1.})
    assert r.status_code==422 and 'camera-intrinsics' in r.json()['detail']
    svc=client.app.state.service
    svc.geometry.calibration={'image_width':64,'image_height':32,'fx':100,'fy':100,'cx':31.5,'cy':15.5}
    svc.geometry.calibration['camera_model']='pinhole'
    anchor=client.post('/api/spatial/calibration/scale',json={**body,'known_distance_m':1.})
    assert anchor.status_code==200
    assert anchor.json()['factor']>0
    same=client.post('/api/spatial/calibration/validate',json={**body,'known_distance_m':1.})
    assert same.status_code==422
    second=client.post('/api/spatial/calibration/validate',json={**body,'a':[10,12],'b':[20,12],'known_distance_m':1.03})
    assert second.status_code==200
    assert second.json()['accuracy_certified'] is False and second.json()['absolute_error_m']>0
    measure=client.post('/api/spatial/measure',json={**body,'a':[10,12],'b':[20,12]}).json()
    assert measure['validation_sample_count']==1 and measure['uncertainty_m'] is None
    analysis=client.get('/api/spatial/report.json').json()
    assert len(analysis['validation_checks'])==1
    client.post('/api/model',json={'engine':'da3-small'})
    wait_for(lambda:client.get('/api/latest').json() if client.get('/api/latest').status_code==200 else None)
    assert client.get('/api/spatial/report.json').json()['scale_anchor'] is None


def test_comparison_is_sequential_retains_frozen_image_and_exports(client):
    first=upload(client)
    start=client.post('/api/spatial/compare',json={'engines':['yolo26','da2-small','da3-small','da3-metric']})
    assert start.status_code==202
    assert client.post('/api/spatial/compare',json={'engines':['yolo26']}).status_code==409
    svc=client.app.state.service
    wait_for(lambda:svc.compare_status['state']=='completed',timeout=5)
    answer=client.get('/api/spatial/compare/results').json()
    assert answer['status']['done']==4 and len(answer['cards'])==4
    assert all(v['source_sha256']==first['source_sha256'] for v in answer['cards'])
    assert answer['cards'][1]['units']=='relative' and answer['cards'][1]['distribution']['normalized_for_visualization']
    assert len(answer['cards'][0]['points'])>0
    bundle=client.get('/api/spatial/compare/export.zip')
    assert bundle.status_code==200
    z=zipfile.ZipFile(io.BytesIO(bundle.content))
    assert 'comparison.json' in z.namelist() and 'da2-small/raw_depth.npy' in z.namelist()
    assert 'da3-metric/depth.npy' in z.namelist()
    assert client.get('/api/latest').json()['engine']=='yolo26'


def test_comparison_partial_failure_is_transparent(client,monkeypatch):
    svc=client.app.state.service
    def factory(key):
        if key=='da3-small':
            class F(FakeEngine):
                def load(self):raise RuntimeError('EXPECTED missing weights')
            return F(key)
        return FakeEngine(key)
    svc.engine_factory=factory
    upload(client)
    assert client.post('/api/spatial/compare',json={'engines':['da3-small','da2-small']}).status_code==202
    wait_for(lambda:svc.compare_status['state']=='completed')
    d=client.get('/api/spatial/compare/status').json()
    assert len(d['items'])==2 and d['items'][0]['state']=='error'
    assert len(client.get('/api/spatial/compare/results').json()['cards'])==1


def test_semantic_async_no_fake_fallback_and_generation(client,monkeypatch):
    first=upload(client)
    def fake_semantic(bgr,depth_result,mode,device,confidence):
        assert mode=='segment'
        return {'mode':mode,'model':'EXPLICIT_TEST_DOUBLE','is_trained_model':False,
                'overlay_png_b64':'','objects':[{'class_id':0,'label':'test-person','pixels_mask':12,'pixels_valid':8}]}
    monkeypatch.setattr(backend,'run_ultralytics_semantic',fake_semantic)
    start=client.post('/api/spatial/semantic',json={'mode':'segment','confidence':.3})
    assert start.status_code==202
    wait_for(lambda:client.app.state.service.semantic_status['state']=='completed')
    out=client.get('/api/spatial/semantic/result').json()
    assert out['source_frame_id']==first['frame_id']
    report=client.get('/api/spatial/report.json').json()
    assert report['semantic_objects']['objects'][0]['label']=='test-person'
    assert 'overlay_png_b64' not in json.dumps(report)
    client.post('/api/source/stop')
    assert client.get('/api/spatial/semantic/result').status_code==404


def test_semantic_failure_no_synthetic_inference(client,monkeypatch):
    upload(client)
    def fail(*args,**kwargs):raise RuntimeError('EXPECTED model download failure')
    monkeypatch.setattr(backend,'run_ultralytics_semantic',fail)
    assert client.post('/api/spatial/semantic',json={'mode':'detect'}).status_code==202
    wait_for(lambda:client.app.state.service.semantic_status['state']=='error')
    assert client.get('/api/spatial/semantic/result').status_code==404
    assert 'EXPECTED' in client.get('/api/spatial/semantic/status').json()['error']


def test_plane_endpoint_returns_candidate_not_guarantee(client):
    frame=upload(client)
    r=client.post('/api/spatial/calibration/plane',json={'frame_id':frame['frame_id'],
      'roi':[0,.2,1,.95],'threshold':.01})
    assert r.status_code==200
    assert 'candidate' in r.json()['warning'].lower()
    assert r.json()['is_metric_estimate']
    assert r.json()['rms_inlier']<.001


def test_calibration_tool_rejects_insufficient_samples(tmp_path):
    from tools.calibrate_camera import calibrate
    with pytest.raises(ValueError):calibrate([],9,6,25)
