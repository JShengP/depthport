# SPDX-License-Identifier: AGPL-3.0-only
"""Offline temporal consistency tests use synthetic arrays; no pretrained AI inference."""
from __future__ import annotations

import io
import json
import zipfile

import numpy as np
import pytest
from fastapi.testclient import TestClient

from depthport.api import bundle_bytes, prepare_cloud
from depthport.engines import DepthResult
from depthport.sessions import SessionStore, SessionIntegrity
from depthport.temporal import MAX_PAIRS, analyze_session
from tests.helpers import FakeEngine
import depthport.api as api


def snapshot(idx, depth, *, engine='yolo26', units='estimated_m',
             fx=70., source='rtsp', hashval=None):
    depth=np.asarray(depth,dtype=np.float32)
    bgr=np.full((*depth.shape,3),(50,110,200),np.uint8)
    k={'fx':fx,'fy':71.,'cx':(depth.shape[1]-1)/2,'cy':(depth.shape[0]-1)/2,
       'source':'provided_intrinsics','distortion_corrected':False}
    output=DepthResult(bgr,depth.copy(),depth.copy(),k,units,info={'synthetic_test':True})
    cloud,_=prepare_cloud(output)
    points=cloud.pop('points_raw')
    frame={**cloud,'frame_id':idx,'generation':1,'engine':engine,'model':'synthetic-checkpoint',
           'timestamp':float(idx),'source':source,'source_sha256':hashval,
           'timings':{},'filter_info':{},'depth_info':{'synthetic_test':True}}
    return frame,bundle_bytes(frame,points,output)


def capture(store,sid,idx,depth,**kw):
    f,b=snapshot(idx,depth,**kw)
    return store.capture(sid,b,f)


def test_fixed_grid_delta_and_metrics(tmp_path):
    store=SessionStore(tmp_path/'store');sid=store.create()['session_id']
    a=np.full((32,48),3,dtype=np.float32)
    b=a.copy();b[:,0]=4.0
    capture(store,sid,1,a)
    capture(store,sid,2,b)
    report=store.temporal_consistency(sid)
    assert report['evaluated_pairs']==1
    p=report['pairs'][0]
    assert p['native_units']=='unvalidated_estimated_meters'
    assert p['native_mae']==pytest.approx(1/48,abs=1e-5)
    assert p['native_rmse']==pytest.approx(np.sqrt(1/48),abs=1e-5)
    assert p['native_signed_mean']==pytest.approx(1/48,abs=1e-5)
    assert p['previous_valid_fraction']==p['current_valid_fraction']==1
    assert report['format']=='depthport.temporal-consistency.v1'
    assert 'not independently calibrated' in report['interpretation'] or 'NOT independently calibrated' in report['interpretation']


def test_invalid_pixels_are_excluded(tmp_path):
    store=SessionStore(tmp_path/'store');sid=store.create()['session_id']
    a=np.full((32,32),3,np.float32);b=a.copy()
    a[0,0]=np.nan;b[0,1]=0;b[0,2]=np.inf
    capture(store,sid,1,a);capture(store,sid,2,b)
    p=store.temporal_consistency(sid)['pairs'][0]
    assert p['overlap_fraction']==pytest.approx((32*32-3)/(32*32),abs=1e-6)
    assert p['native_mae']==0
    assert p['sampled_overlap_count']==32*32-3


def test_relative_results_are_never_mislabeled_as_metres(tmp_path):
    store=SessionStore(tmp_path/'store');sid=store.create()['session_id']
    a=np.arange(32*32,dtype=np.float32).reshape(32,32)+1
    capture(store,sid,1,a,engine='da3-small',units='relative')
    capture(store,sid,2,a*4,engine='da3-small',units='relative')
    report=store.temporal_consistency(sid)
    p=report['pairs'][0]
    assert p['native_mae'] is None and p['native_rmse'] is None
    assert p['native_units']=='relative_not_meters'
    assert p['normalized_mae']==0


def test_source_and_intrinsics_mismatch_skip_without_subtracting(tmp_path):
    store=SessionStore(tmp_path/'store');sid=store.create()['session_id']
    img=np.full((32,32),3,dtype=np.float32)
    capture(store,sid,1,img)
    capture(store,sid,2,img,fx=71)
    capture(store,sid,3,img,source='image')
    out=store.temporal_consistency(sid)
    assert out['evaluated_pairs']==0
    assert len(out['skipped_pairs'])==2
    assert all(x['reason']=='different_image_grid_or_intrinsics_or_source' for x in out['skipped_pairs'])


def test_separate_models_and_units_never_compared(tmp_path):
    store=SessionStore(tmp_path/'store');sid=store.create()['session_id']
    a=np.full((32,32),3,np.float32)
    capture(store,sid,1,a)
    capture(store,sid,2,a,engine='da3-small',units='relative')
    capture(store,sid,3,a+1)
    out=store.temporal_consistency(sid)
    assert len(out['groups'])==2
    assert len(out['pairs'])==1
    assert (out['pairs'][0]['from_index'],out['pairs'][0]['to_index'])==(1,3)


def test_report_is_bounded_and_identical_source_labeled(tmp_path):
    store=SessionStore(tmp_path/'store');sid=store.create()['session_id']
    a=np.full((32,32),3,np.float32)
    for i in range(1,5):capture(store,sid,i,a,hashval='same-sha')
    report=store.temporal_consistency(sid,max_pairs=1)
    assert len(report['pairs'])==1
    assert report['pairs'][0]['same_source_image']
    assert report['additional_pairs_not_evaluated']==2
    with pytest.raises(ValueError):store.temporal_consistency(sid,max_pairs=MAX_PAIRS+1)


def test_tampered_bundle_does_not_return_unverified_result(tmp_path):
    store=SessionStore(tmp_path/'store');sid=store.create()['session_id']
    capture(store,sid,1,np.full((32,32),3,np.float32))
    path=tmp_path/'store'/sid/'frame-00001.zip'
    path.write_bytes(path.read_bytes()+b'tamper')
    with pytest.raises(SessionIntegrity):store.temporal_consistency(sid)


def test_corrupt_depth_array_refuses_analysis(tmp_path):
    store=SessionStore(tmp_path/'store');sid=store.create()['session_id']
    capture(store,sid,1,np.full((32,32),3,np.float32))
    path=tmp_path/'store'/sid/'frame-00001.zip'
    raw=path.read_bytes()
    altered=io.BytesIO()
    with zipfile.ZipFile(io.BytesIO(raw)) as original,zipfile.ZipFile(altered,'w') as z:
        for name in original.namelist():
            data=original.read(name)
            if name.startswith('depth_') and name.endswith('.npy'):
                arr=io.BytesIO();np.save(arr,np.array([['wrong']],dtype='<U5'),allow_pickle=False);data=arr.getvalue()
            z.writestr(name,data)
    path.write_bytes(altered.getvalue())
    manifest=tmp_path/'store'/sid/'session.json'
    data=json.loads(manifest.read_text())
    import hashlib
    data['frames'][0]['sha256']=hashlib.sha256(altered.getvalue()).hexdigest()
    data['frames'][0]['bytes']=len(altered.getvalue())
    manifest.write_text(json.dumps(data))
    with pytest.raises(SessionIntegrity):store.temporal_consistency(sid)


def test_session_http_routes_and_loopback(tmp_path,monkeypatch):
    monkeypatch.setenv('ENABLE_SESSION_STORAGE','1')
    monkeypatch.setattr(api,'SessionStore',lambda _root:SessionStore(tmp_path/'store'))
    monkeypatch.setattr(api,'make_engine',lambda key:FakeEngine(key))
    with TestClient(api.app,client=('127.0.0.1',61021)) as c:
        sid=c.post('/api/sessions',json={'label':'synthetic'}).json()['session_id']
        f,b=snapshot(1,np.full((32,32),3,np.float32))
        api.app.state.session_store.capture(sid,b,f)
        q=c.get(f'/api/sessions/{sid}/consistency')
        assert q.status_code==200 and q.json()['evaluated_pairs']==0
        down=c.get(f'/api/sessions/{sid}/consistency/report.json')
        assert down.status_code==200
        assert down.headers['content-disposition'].startswith('attachment; filename=')
        assert down.json()['session_id']==sid
        assert c.get(f'/api/sessions/{sid}/consistency?max_pairs=33').status_code==422
    with TestClient(api.app,client=('192.0.2.5',61021)) as c:
        assert c.get(f'/api/sessions/{sid}/consistency').status_code==403
