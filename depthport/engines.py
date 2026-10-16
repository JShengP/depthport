# SPDX-License-Identifier: AGPL-3.0-only
"""Four depth backend adapters with explicit depth units and aligned camera geometry.

No synthetic fallback. The service owns one backend at a time.
DA3 source reference: ByteDance-Seed/Depth-Anything-3 @ 3d835ec.
"""
from __future__ import annotations
import gc
import importlib.util
import math
import os
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any
import cv2
import numpy as np
from depthport.config import flag, ROOT
from depthport.yolo_engine import DepthEngine as LegacyYOLO, choose_device

DA3_REVISION = '3d835ec'
PRESETS = {
    'yolo26': {'label': 'YOLO26 Depth', 'model': 'yolo26n-depth.pt',
               'env': 'YOLO_MODEL', 'module': 'ultralytics', 'units': 'estimated_m',
               'description': '估計公尺；沿用官方權重的尺度，仍需現場驗證。'},
    'da2-small': {'label': 'Depth Anything V2 Small', 'model': 'depth-anything/Depth-Anything-V2-Small-hf',
                  'env': 'DA2_SMALL_MODEL', 'module': 'transformers', 'units': 'relative',
                  'description': '原版相對深度；1～5 虛擬展示幾何，非公尺，原始輸出另存。'},
    'da3-small': {'label': 'DA3-Small', 'model': 'depth-anything/DA3-SMALL',
                  'env': 'DA3_SMALL_MODEL', 'module': 'depth_anything_3', 'units': 'relative',
                  'description': '相對深度；不代表公尺，不做逐影格幾何正規化。'},
    'da3-metric': {'label': 'DA3Metric-Large', 'model': 'depth-anything/DA3METRIC-LARGE',
                   'env': 'DA3_METRIC_MODEL', 'module': 'depth_anything_3', 'units': 'estimated_m',
                   'description': '依處理後 fx/fy 換算估計公尺；HFOV 初估不等於標定。'},
}


def model_location(key: str) -> str:
    value = os.getenv(PRESETS[key]['env'], PRESETS[key]['model']).strip()
    if not value:
        raise ValueError(f'{PRESETS[key]["env"]} cannot be empty')
    # Named HF repositories are not filesystem paths. Existing project-local paths are.
    candidate = ROOT / value
    return str(candidate.resolve()) if candidate.exists() else value


def catalog() -> list[dict]:
    result = []
    for key, p in PRESETS.items():
        try:
            available = importlib.util.find_spec(p['module']) is not None
        except (ImportError, ValueError):
            available = False
        result.append({'key': key, 'label': p['label'], 'model': model_location(key),
                       'units': p['units'], 'description': p['description'],
                       'package_detected': available,
                       'package_note': 'Module discovery only; not a real-inference validation.'})
    return result


@dataclass
class DepthResult:
    bgr: np.ndarray
    depth: np.ndarray  # final Z used for geometry, in units below
    raw_depth: np.ndarray  # unscaled MODEL output, at the same H/W
    intrinsics: dict
    units: str
    confidence: np.ndarray | None = None
    sky: np.ndarray | None = None
    info: dict = field(default_factory=dict)


def resize_da3_input(bgr: np.ndarray, intr: dict, resolution: int) -> tuple[np.ndarray, dict]:
    """Own the resize explicitly: full FoV, no crop; make BOTH sides multiples of 14.

    Passing this image to official upper_bound_resize at its exact max dimension
    produces no further resize/crop. Assert output dimensions before back-projection.
    The tiny nonuniform patch rounding is represented by separate sx/sy in K.
    """
    h, w = bgr.shape[:2]
    scale = resolution / max(h, w)
    nw, nh = max(14, round(w * scale / 14) * 14), max(14, round(h * scale / 14) * 14)
    image = cv2.resize(bgr, (nw, nh), interpolation=cv2.INTER_AREA if scale < 1 else cv2.INTER_LINEAR)
    sx, sy = nw / w, nh / h
    k = {**intr, 'fx': float(intr['fx']) * sx, 'fy': float(intr['fy']) * sy,
         'cx': (float(intr['cx']) + .5) * sx - .5, 'cy': (float(intr['cy']) + .5) * sy - .5,
         'image_width': nw, 'image_height': nh, 'adapter_resize': [sx, sy],
         'preprocessor': 'explicit_full_frame_patch14_resize_no_crop'}
    return image, k


def metric_scale(raw: np.ndarray, intr: dict) -> tuple[np.ndarray, float]:
    focal = (float(intr['fx']) + float(intr['fy'])) / 2
    if not math.isfinite(focal) or focal <= 0:
        raise ValueError('DA3Metric requires positive finite processed-image focal lengths.')
    scale = focal / 300.0
    return np.ascontiguousarray(raw * scale, dtype=np.float32), scale


def _single_map(data: Any, name: str, shape: tuple[int, int]) -> np.ndarray:
    if hasattr(data, 'detach'):
        data = data.detach().float().cpu().numpy()
    arr = np.asarray(data)
    while arr.ndim > 2 and arr.shape[0] == 1:
        arr = arr[0]
    if arr.shape != shape:
        raise RuntimeError(f'DA3 {name} shape {arr.shape} != aligned RGB {shape}; refusing misaligned geometry.')
    return np.array(arr, dtype=np.float32, order='C', copy=True)


def da3_output(prediction: Any, aligned_bgr: np.ndarray, intr: dict, metric: bool) -> DepthResult:
    """Scale exactly once, and retain raw network/API output separately for auditing."""
    shape = aligned_bgr.shape[:2]
    raw = _single_map(prediction.depth, 'depth', shape)
    if not np.any(np.isfinite(raw) & (raw > 0)):
        raise RuntimeError('DA3 produced no positive finite depth values.')
    images = getattr(prediction, 'processed_images', None)
    if images is None or np.asarray(images).shape != (1, *shape, 3):
        raise RuntimeError('DA3 processed_images is missing or unexpectedly resized; refusing mismatched RGB/K.')
    # Use the exact RGB returned by DA3's ImageNet normalization round-trip.
    rgb = np.asarray(images)[0]
    if rgb.dtype != np.uint8:
        raise RuntimeError('Expected DA3 processed_images uint8 RGB.')
    if bool(getattr(prediction, 'is_metric', False)):
        raise RuntimeError('Unexpected pre-scaled/nested DA3 output. Refusing a second metric conversion; check model preset.')
    depth, factor = metric_scale(raw, intr) if metric else (raw.copy(), 1.)
    confidence = getattr(prediction, 'conf', None)
    confidence = _single_map(confidence, 'confidence', shape) if confidence is not None else None
    sky = getattr(prediction, 'sky', None)
    sky = _single_map(sky, 'sky', shape) >= .5 if sky is not None else None
    info = {'raw_depth_units': 'canonical_focal_300' if metric else 'relative',
            'raw_to_output_scale': factor,
            'conversion': 'Z = raw * ((fx_processed + fy_processed)/2) / 300' if metric else 'identity; NOT meters',
            'processed_focal_px': (intr['fx'] + intr['fy']) / 2,
            'intrinsics_policy': 'shared camera calibration/HFOV; predicted DA3 K is NOT substituted',
            'da3_source_reference': DA3_REVISION}
    predicted_k = getattr(prediction, 'intrinsics', None)
    if predicted_k is not None:
        k = np.asarray(predicted_k)
        if k.shape == (1, 3, 3) and np.all(np.isfinite(k)):
            info['model_predicted_intrinsics_unused'] = k[0].tolist()
    return DepthResult(cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR), depth, raw, intr,
                       'estimated_m' if metric else 'relative', confidence, sky, info)


class YoloAdapter:
    key = 'yolo26'
    def __init__(self):
        self.model_id = model_location(self.key)
        self.backend = LegacyYOLO(self.model_id)
        self.last_timings: dict = {}

    @property
    def device_name(self): return self.backend.device_name
    @property
    def loaded(self): return self.backend.loaded
    @property
    def version(self): return self.backend.version
    @property
    def imgsz(self): return self.backend.imgsz
    def load(self):
        if flag('MODEL_OFFLINE') and not Path(self.model_id).is_file():
            raise RuntimeError('Offline YOLO requires YOLO_MODEL to point to an existing local .pt file.')
        return self.backend.load()
    def predict(self, bgr, intrinsics):
        depth = self.backend.predict(bgr)
        self.last_timings = dict(self.backend.last_timings)
        return DepthResult(bgr, depth, depth.copy(), intrinsics, 'estimated_m',
                           info={'raw_depth_units': 'estimated_m', 'raw_to_output_scale': 1.,
                                 'conversion': 'identity; official YOLO Depth API scale retained'})
    def unload(self):
        with self.backend._lock:
            self.backend._model = None
            self.backend._torch = None
            self.backend.last_timings = {}
        release_cache()


def release_cache():
    gc.collect()
    import sys
    torch = sys.modules.get('torch')
    if torch is not None:
        if torch.cuda.is_available():
            torch.cuda.empty_cache()
        mps = getattr(torch, 'mps', None)
        if mps is not None and getattr(torch.backends, 'mps', None) and torch.backends.mps.is_available():
            mps.empty_cache()


class DA3Adapter:
    def __init__(self, key: str):
        if key not in ('da3-small', 'da3-metric'):
            raise ValueError('Unsupported DA3 preset')
        self.key, self.model_id = key, model_location(key)
        self.imgsz = int(os.getenv('DA3_PROCESS_RES', '504'))
        if not 140 <= self.imgsz <= 1008 or self.imgsz % 14:
            raise ValueError('DA3_PROCESS_RES must be a multiple of 14 in 140..1008.')
        self.device_name, self.version = 'not loaded', f'source-ref-{DA3_REVISION}'
        self._model = None
        self._torch = None
        self.last_timings = {}
    @property
    def loaded(self): return self._model is not None
    def load(self):
        if self.loaded: return 0.
        start = time.perf_counter()
        try:
            import torch
            from depth_anything_3.api import DepthAnything3
        except Exception as exc:
            raise RuntimeError('DA3 runtime import failed. Run INSTALL_ALL_WINDOWS.bat or '
                               'bash INSTALL_ALL_UBUNTU.sh in this project. '
                               f'Original error: {type(exc).__name__}: {exc}') from exc
        _, self.device_name = choose_device(torch, os.getenv('DEPTH_DEVICE', 'auto'))
        device = torch.device(self.device_name)
        precision = os.getenv('DA3_PRECISION', 'auto').lower()
        if precision not in ('auto', 'fp32', 'fp16', 'bf16'):
            raise ValueError('DA3_PRECISION must be auto/fp32/fp16/bf16.')
        if device.type != 'cuda' and precision in ('fp16', 'bf16'):
            raise ValueError('This PoC uses DA3 FP32 on CPU/MPS. Use DA3_PRECISION=auto or fp32.')
        bf16_supported = False
        if device.type == 'cuda':
            with torch.cuda.device(device):
                bf16_supported = torch.cuda.is_bf16_supported()
        if precision == 'bf16' and not bf16_supported:
            raise ValueError('BF16 was requested but is not supported by this CUDA device.')
        enabled = device.type == 'cuda' and precision != 'fp32'
        dtype = torch.bfloat16 if (precision == 'bf16' or (precision == 'auto' and bf16_supported)) else torch.float16
        # Keep official preprocessing/postprocessing. Only override AMP selection:
        # upstream unconditionally requests AMP; CPU/MPS are explicit FP32 here.
        class PrecisionSafeDA3(DepthAnything3):
            def forward(self, image, extrinsics=None, intrinsics=None, export_feat_layers=None,
                        infer_gs=False, use_ray_pose=False, ref_view_strategy='saddle_balanced'):
                with torch.inference_mode(), torch.autocast(device_type=image.device.type,
                                                            dtype=dtype, enabled=enabled):
                    return self.model(image, extrinsics, intrinsics, export_feat_layers,
                                      infer_gs, use_ray_pose, ref_view_strategy)
        kwargs = {'local_files_only': flag('MODEL_OFFLINE')}
        rev = os.getenv('DA3_HF_REVISION', '').strip()
        if rev: kwargs['revision'] = rev
        model = PrecisionSafeDA3.from_pretrained(self.model_id, **kwargs)
        expected = 'da3metric-large' if self.key == 'da3-metric' else 'da3-small'
        if getattr(model, 'model_name', None) != expected:
            raise RuntimeError(f'Expected {expected} model config, got {getattr(model, "model_name", None)}; refusing wrong scale semantics.')
        model = model.to(device=device).eval()
        model.device = device  # reset cached device explicitly after moving
        self._model, self._torch = model, torch
        self.precision = 'bf16' if enabled and dtype == torch.bfloat16 else 'fp16' if enabled else 'fp32'
        self.hf_commit = getattr(model, '_commit_hash', None)
        return round((time.perf_counter()-start)*1000, 2)
    def predict(self, bgr, intrinsics):
        if not self.loaded: self.load()
        started = time.perf_counter()
        image, k = resize_da3_input(bgr, intrinsics, self.imgsz)
        rgb = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)
        self._sync()
        api_start = time.perf_counter()
        with self._torch.inference_mode():
            pred = self._model.inference(image=[rgb], process_res=max(image.shape[:2]),
                                         process_res_method='upper_bound_resize',
                                         export_dir=None, infer_gs=False)
        self._sync()
        api_ms = (time.perf_counter()-api_start)*1000
        result = da3_output(pred, image, k, metric=self.key == 'da3-metric')
        result.info.update({'precision': self.precision, 'hf_commit': self.hf_commit})
        self.last_timings = {'predict_wall_ms': round((time.perf_counter()-started)*1000, 2),
                             'da3_api_wall_ms': round(api_ms, 2),
                             'inference_ms': None,
                             'inference_note': 'DA3 API wall includes preprocess/model/postprocess; not isolated GPU kernel time.'}
        return result
    def _sync(self):
        if self.device_name.startswith('cuda:'): self._torch.cuda.synchronize(self.device_name)
        elif self.device_name == 'mps': self._torch.mps.synchronize()
    def unload(self):
        self._model = None
        self._torch = None
        release_cache()


def make_engine(key: str):
    if key not in PRESETS: raise ValueError('Unknown engine preset')
    if key == 'yolo26':
        return YoloAdapter()
    if key == 'da2-small':
        from depthport.v2_engine import V2Adapter  # lazy import; unused backends are not loaded
        return V2Adapter()
    return DA3Adapter(key)
