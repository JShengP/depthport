# SPDX-License-Identifier: AGPL-3.0-only
"""V2 adapter/geometry contracts with a FAKE HF API and real CPU tensors.

No pretrained network or checkpoint is loaded by these tests.
"""
import json
import sys
import types
import numpy as np
import pytest
from depthport.engines import make_engine, PRESETS
from depthport.v2_engine import relative_to_virtual, V2Adapter
from depthport.cloud import CameraGeometry, make_cloud, export_binary_ply


def test_v2_uses_original_checkpoint_and_separate_relative_preset(monkeypatch):
    monkeypatch.delenv('DA2_SMALL_MODEL', raising=False)
    engine = make_engine('da2-small')
    assert isinstance(engine, V2Adapter)
    assert engine.model_id == 'depth-anything/Depth-Anything-V2-Small-hf'
    assert PRESETS['da2-small']['units'] == 'relative'
    assert set(PRESETS) == {'yolo26', 'da2-small', 'da3-small', 'da3-metric'}


def test_virtual_mapping_matches_original_for_finite_data():
    raw = np.tile(np.linspace(3, 9, 100, dtype=np.float32), (60, 1))
    original = raw.copy()
    z, info = relative_to_virtual(raw)
    lo, hi = np.percentile(raw, [5, 95])
    expected = 1 + (1-np.clip((raw-lo)/(hi-lo), 0, 1))*4
    np.testing.assert_allclose(z, expected, atol=1e-6)
    np.testing.assert_array_equal(raw, original)
    assert np.all(z[:, 0] == 5) and np.all(z[:, -1] == 1)
    assert np.all(np.diff(z, axis=1) <= 0)  # larger raw -> nearer
    assert info['raw_to_output_scale'] is None
    assert info['per_frame_geometry_normalization'] is True
    assert info['geometry_kind'] == 'display_only_2_5d'
    json.dumps(info, allow_nan=False)


def test_flat_prediction_is_plane_not_invented_shape():
    z, info = relative_to_virtual(np.full((20, 40), 2.5, np.float32))
    assert np.all(z == 3.) and info['flat_prediction']


def test_invalid_predictions_remain_invalid_not_filled_with_fake_depth():
    raw = np.array([[1., 2., 3., np.nan, np.inf, -np.inf]], np.float32)
    z, info = relative_to_virtual(raw)
    assert np.isnan(z[0, 3:]).all() and info['invalid_raw_pixels'] == 3
    assert z[0, 0] > z[0, 1] > z[0, 2]


@pytest.mark.parametrize('raw', [np.full((4, 8), np.nan), np.full((4, 8), np.inf)])
def test_no_finite_prediction_is_error(raw):
    with pytest.raises(RuntimeError, match='no finite'):
        relative_to_virtual(raw)


@pytest.mark.parametrize('raw', [np.ones(5), np.ones((1, 2, 3)), np.ones((0, 2))])
def test_wrong_mapping_shape_is_error(raw):
    with pytest.raises(ValueError):
        relative_to_virtual(raw)


def test_v2_ply_is_virtual_relative_not_metric():
    bgr = np.zeros((20, 40, 3), np.uint8)
    z, _ = relative_to_virtual(np.tile(np.linspace(1, 7, 40), (20, 1)))
    c = make_cloud(bgr, z, units='relative', min_depth=1e-6, max_depth=1e6, color_min=1., color_max=5.)
    assert c['units'] == 'relative' and c['scene_scale_verified'] is False
    assert np.min(c['points_raw']['z']) == -5
    assert np.max(c['points_raw']['z']) == -1
    ply = export_binary_ply(c['points_raw'], engine='da2-small', units='relative')
    header = ply.split(b'end_header')[0]
    assert b'V2 display-only' in header and b'NOT meters' in header and b'units relative' in header


@pytest.fixture
def hf_fake(monkeypatch):
    torch = pytest.importorskip('torch')
    for key in ('DA2_SMALL_MODEL', 'DA2_INPUT_SIZE', 'DA2_HALF', 'DA2_HF_REVISION', 'MODEL_OFFLINE'):
        monkeypatch.delenv(key, raising=False)
    monkeypatch.setenv('DEPTH_DEVICE', 'cpu')
    calls = {}
    state = {'raw': np.tile(np.linspace(1, 9, 40, dtype=np.float32), (24, 1)),
             'metric': False, 'model_type': 'depth_anything', 'missing_output': False}
    class Batch(dict):
        def to(self, device):
            calls['batch_device'] = device
            return self
    class Processor:
        @classmethod
        def from_pretrained(cls, model_id, **kwargs):
            calls['processor_model'] = model_id
            calls['processor_kwargs'] = kwargs
            return cls()
        def __call__(self, **kwargs):
            calls['prepare'] = kwargs
            return Batch(pixel_values=torch.zeros(1, 3, 28, 42))
        def post_process_depth_estimation(self, outputs, target_sizes):
            calls['target_sizes'] = target_sizes
            return [{'predicted_depth': torch.tensor(state['raw'])}]
    class Model:
        def __init__(self):
            self.config = types.SimpleNamespace(model_type=state['model_type'],
                depth_estimation_type='metric' if state['metric'] else 'relative', _commit_hash='TEST-COMMIT')
        @classmethod
        def from_pretrained(cls, model_id, **kwargs):
            calls['model_id'] = model_id
            calls['model_kwargs'] = kwargs
            return cls()
        def to(self, **kwargs): calls['model_to'] = kwargs; return self
        def eval(self): calls['eval'] = True; return self
        def __call__(self, **kwargs):
            calls['forward'] = kwargs
            return types.SimpleNamespace(predicted_depth=None if state['missing_output'] else torch.ones(1, 28, 42))
    module = types.ModuleType('transformers')
    module.__version__ = 'EXPLICIT-FAKE-HF'
    module.AutoImageProcessor, module.AutoModelForDepthEstimation = Processor, Model
    monkeypatch.setitem(sys.modules, 'transformers', module)
    return calls, state


def test_v2_adapter_original_rgb_k_and_two_depth_maps(hf_fake):
    calls, state = hf_fake
    bgr = np.full((24, 40, 3), (13, 29, 207), np.uint8)
    k = CameraGeometry().intrinsics(40, 24)
    engine = V2Adapter()
    try:
        r = engine.predict(bgr, k)
        np.testing.assert_array_equal(np.asarray(calls['prepare']['images'])[0, 0], [207, 29, 13])
        assert calls['prepare']['size'] == {'height': 518, 'width': 518}
        assert calls['prepare']['do_pad'] is False and calls['target_sizes'] == [(24, 40)]
        assert calls['processor_kwargs']['use_fast'] is False
        assert calls['model_kwargs']['trust_remote_code'] is False
        assert calls['model_kwargs']['use_safetensors'] is True
        np.testing.assert_array_equal(r.raw_depth, state['raw'])
        np.testing.assert_array_equal(r.depth, relative_to_virtual(state['raw'])[0])
        assert r.intrinsics == k and r.units == 'relative'
        assert r.info['hf_commit'] == 'TEST-COMMIT' and r.info['network_input_hw'] == [28, 42]
        assert engine.load() == 0 and engine.last_timings['inference_ms'] is None
        assert r.depth.dtype == r.raw_depth.dtype == np.float32
    finally:
        engine.unload()
    assert not engine.loaded and engine._processor is None


def test_v2_offline_revision_and_local_path_forwarded(hf_fake, monkeypatch, tmp_path):
    calls, _ = hf_fake
    monkeypatch.setenv('MODEL_OFFLINE', '1')
    monkeypatch.setenv('DA2_SMALL_MODEL', str(tmp_path))
    monkeypatch.setenv('DA2_HF_REVISION', 'commit-for-test-only')
    e = V2Adapter()
    try:
        e.load()
        for name in ('processor_kwargs', 'model_kwargs'):
            assert calls[name]['local_files_only'] is True
            assert calls[name]['revision'] == 'commit-for-test-only'
        assert calls['model_id'] == str(tmp_path)
    finally:
        e.unload()


@pytest.mark.parametrize('setting,value', [('metric', True), ('model_type', 'different_architecture')])
def test_v2_rejects_metric_or_wrong_architecture(hf_fake, setting, value):
    _, state = hf_fake
    state[setting] = value
    e = V2Adapter()
    with pytest.raises(RuntimeError, match='relative checkpoint'):
        e.load()
    assert not e.loaded


def test_v2_wrong_output_shape_refused(hf_fake):
    _, state = hf_fake
    state['raw'] = np.ones((10, 10), np.float32)
    e = V2Adapter()
    try:
        with pytest.raises(RuntimeError, match='aligned RGB'):
            e.predict(np.zeros((24, 40, 3), np.uint8), CameraGeometry().intrinsics(40,24))
    finally:
        e.unload()


def test_v2_missing_output_never_substitutes_depth(hf_fake):
    _, state = hf_fake
    state['missing_output'] = True
    e = V2Adapter()
    try:
        with pytest.raises(RuntimeError, match='no predicted_depth'):
            e.predict(np.zeros((24, 40, 3), np.uint8), CameraGeometry().intrinsics(40,24))
    finally:
        e.unload()


def test_v2_cpu_half_is_rejected(hf_fake, monkeypatch):
    monkeypatch.setenv('DA2_HALF', '1')
    with pytest.raises(ValueError, match='requires CUDA'):
        V2Adapter().load()


@pytest.mark.parametrize('size', ['0', '139', '517', '1037'])
def test_v2_invalid_input_size_rejected(monkeypatch, size):
    monkeypatch.setenv('DA2_INPUT_SIZE', size)
    with pytest.raises(ValueError, match='multiple of 14'):
        V2Adapter()
