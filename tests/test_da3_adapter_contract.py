# SPDX-License-Identifier: AGPL-3.0-only
"""Exercise adapter calls using a fabricated DA3 API and real CPU tensor primitives.
This does NOT run DA3 weights or verify DA3 package installation.
"""
from types import ModuleType, SimpleNamespace
import sys
import numpy as np
import pytest
import torch
from depthport.engines import DA3Adapter, DepthResult
from depthport.cloud import CameraGeometry


@pytest.mark.parametrize('key,expected_name,units', [
    ('da3-small','da3-small','relative'),
    ('da3-metric','da3metric-large','estimated_m'),
])
def test_api_contract_rgb_precision_local_mode_and_output(monkeypatch,key,expected_name,units):
    calls={}
    class Network(torch.nn.Module):
        def forward(self,image,*args):
            calls['tensor_dtype']=image.dtype
            return torch.full(image.shape[-2:],3.,device=image.device)
    class FakeAPI(torch.nn.Module):
        def __init__(self):
            super().__init__();self.model_name=expected_name;self.model=Network();self.device=None
        @classmethod
        def from_pretrained(cls,model_id,**kw):
            calls['load']=(model_id,kw);return cls()
        def inference(self,**kw):
            calls['predict']=kw
            rgb=kw['image'][0]
            tensor=torch.from_numpy(rgb.copy()).permute(2,0,1).float()[None,None]
            depth=self.forward(tensor).numpy()[None]
            return SimpleNamespace(depth=depth,processed_images=rgb[None],is_metric=False)
    module=ModuleType('depth_anything_3.api');module.DepthAnything3=FakeAPI
    parent=ModuleType('depth_anything_3');parent.api=module
    monkeypatch.setitem(sys.modules,'depth_anything_3',parent)
    monkeypatch.setitem(sys.modules,'depth_anything_3.api',module)
    monkeypatch.setenv('DEPTH_DEVICE','cpu');monkeypatch.setenv('DA3_PROCESS_RES','140')
    monkeypatch.setenv('DA3_PRECISION','auto');monkeypatch.setenv('MODEL_OFFLINE','1')
    monkeypatch.delenv('DA3_HF_REVISION',raising=False)
    engine=DA3Adapter(key)
    assert engine.load()>=0
    assert calls['load'][1]=={'local_files_only':True}
    bgr=np.full((28,56,3),(10,20,30),np.uint8);k=CameraGeometry().intrinsics(56,28)
    result=engine.predict(bgr,k)
    assert result.units==units and result.depth.shape==(70,140)
    assert calls['predict']['process_res']==140
    assert calls['predict']['process_res_method']=='upper_bound_resize'
    assert calls['predict']['infer_gs'] is False and calls['predict']['export_dir'] is None
    assert calls['predict']['image'][0][0,0].tolist()==[30,20,10]
    assert 'intrinsics' not in calls['predict']  # Own aligned shared K, no pose-scale alignment.
    assert calls['tensor_dtype']==torch.float32 and engine.precision=='fp32'
    np.testing.assert_array_equal(result.raw_depth,3.)
    factor=((result.intrinsics['fx']+result.intrinsics['fy'])/2/300) if units=='estimated_m' else 1
    np.testing.assert_allclose(result.depth,3*factor)
    assert engine.last_timings['inference_ms'] is None
    engine.unload();assert not engine.loaded


def test_confidence_sky_filter_does_not_modify_raw_or_depth(monkeypatch):
    import depthport.api as app
    from dataclasses import replace
    monkeypatch.setattr(app,'CFG',replace(app.CFG,confidence_percentile=50,exclude_sky=True))
    bgr=np.zeros((16,16,3),np.uint8);depth=np.full((16,16),3,np.float32)
    conf=np.arange(256,dtype=np.float32).reshape(16,16)
    sky=np.zeros((16,16),bool);sky[-1,:]=True
    result=DepthResult(bgr,depth,depth.copy(),CameraGeometry().intrinsics(16,16),'relative',conf,sky)
    cloud,info=app.prepare_cloud(result)
    assert cloud['count']==112  # 128 upper-half confidence values minus 16 sky pixels.
    assert cloud['units']=='relative'
    np.testing.assert_array_equal(result.depth,3.)
    np.testing.assert_array_equal(result.raw_depth,3.)


def test_relative_depth_color_rescale_changes_no_geometry():
    import depthport.api as app
    bgr=np.zeros((16,16,3),np.uint8);raw=np.linspace(1,256,256,dtype=np.float32).reshape(16,16)
    result=DepthResult(bgr,raw,raw.copy(),CameraGeometry().intrinsics(16,16),'relative')
    cloud,_=app.prepare_cloud(result)
    np.testing.assert_array_equal(-cloud['points_raw']['z'],raw.reshape(-1))
    assert cloud['color_mode']=='per_frame_percentile_colors_only'
