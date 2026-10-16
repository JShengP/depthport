# SPDX-License-Identifier: AGPL-3.0-only
"""Adapter-contract tests with explicit fake modules. NO pretrained AI is executed."""
import contextlib
import sys
import types
import numpy as np
import pytest
from depthport.yolo_engine import DepthEngine, choose_device


def fake_torch(cuda=False):
    return types.SimpleNamespace(
        inference_mode=contextlib.nullcontext,
        cuda=types.SimpleNamespace(is_available=lambda: cuda, device_count=lambda: 2 if cuda else 0),
        backends=types.SimpleNamespace(mps=types.SimpleNamespace(is_available=lambda: False)),
    )


@pytest.fixture
def adapter(monkeypatch):
    for key in ('DEPTH_DEVICE', 'DEPTH_MODEL', 'DEPTH_IMGSZ', 'DEPTH_HALF'):
        monkeypatch.delenv(key, raising=False)
    calls = {}
    class FakeYOLO:
        task = 'depth'
        def __init__(self, model_id, task):
            calls['model_id'], calls['task'] = model_id, task
        def predict(self, **kwargs):
            calls['predict'] = kwargs
            h, w = kwargs['source'].shape[:2]
            return [types.SimpleNamespace(depth=types.SimpleNamespace(data=np.full((h,w), 2.5, np.float32)),
                                          speed=dict(preprocess=.2, inference=1., postprocess=.3))]
    fake_ultra = types.ModuleType('ultralytics')
    fake_ultra.__version__ = 'TEST-DOUBLE'
    fake_ultra.YOLO = FakeYOLO
    depth_api = types.ModuleType('ultralytics.models.yolo.depth')
    depth_api.DepthPredictor = object
    monkeypatch.setitem(sys.modules, 'torch', fake_torch())
    monkeypatch.setitem(sys.modules, 'ultralytics', fake_ultra)
    monkeypatch.setitem(sys.modules, 'ultralytics.models.yolo.depth', depth_api)
    return calls, FakeYOLO


def test_yolo_adapter_preserves_bgr_shape_and_metric_values(adapter):
    calls, _ = adapter
    engine = DepthEngine()
    image = np.full((24,40,3),(13,21,207),np.uint8)
    d = engine.predict(image)
    assert calls['model_id'] == 'yolo26n-depth.pt' and calls['task'] == 'depth'
    np.testing.assert_array_equal(calls['predict']['source'], image)
    assert calls['predict']['imgsz'] == 768 and calls['predict']['rect'] is False
    assert calls['predict']['device'] == 'cpu'
    assert d.shape == (24,40) and d.dtype == np.float32 and np.all(d == 2.5)
    assert engine.last_timings['inference_ms'] == 1.
    assert engine.load() == 0


def test_detection_weights_rejected(adapter):
    _, fake = adapter
    fake.task = 'detect'
    with pytest.raises(RuntimeError, match='NOT task=depth'):
        DepthEngine('yolo26n.pt').load()


def test_missing_depth_is_an_error_not_fake_geometry(adapter, monkeypatch):
    _, fake = adapter
    monkeypatch.setattr(fake, 'predict', lambda self, **kw: [types.SimpleNamespace(depth=None)])
    with pytest.raises(RuntimeError, match='result.depth'):
        DepthEngine().predict(np.zeros((24,40,3),np.uint8))


def test_wrong_shape_rejected(adapter, monkeypatch):
    _, fake = adapter
    monkeypatch.setattr(fake, 'predict', lambda self, **kw: [types.SimpleNamespace(depth=types.SimpleNamespace(data=np.ones((8,8))))])
    with pytest.raises(RuntimeError, match='does not match RGB'):
        DepthEngine().predict(np.zeros((24,40,3),np.uint8))


def test_half_cpu_refused(adapter, monkeypatch):
    monkeypatch.setenv('DEPTH_HALF','1')
    with pytest.raises(ValueError, match='requires CUDA'):
        DepthEngine().load()


def test_explicit_cuda_does_not_silently_fallback():
    with pytest.raises(RuntimeError, match='CUDA device is unavailable'):
        choose_device(fake_torch(), 'cuda:0')
    assert choose_device(fake_torch(True), 'cuda:1') == (1,'cuda:1')
    assert choose_device(fake_torch(True), 'auto') == (0,'cuda:0')


def test_old_huggingface_model_id_and_random_yaml_refused(monkeypatch):
    with pytest.raises(ValueError):
        DepthEngine('depth-anything/Depth-Anything-V2-Small-hf')
    with pytest.raises(ValueError):
        DepthEngine('yolo26n-depth.yaml')
