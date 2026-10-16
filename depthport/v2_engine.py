# SPDX-License-Identifier: AGPL-3.0-only
"""Depth Anything V2 Small: original DepthPort relative-depth baseline.

The pretrained output is a relative nearness/inverse-depth score, NOT metric Z.
For compatibility with v0.1, display Z uses per-frame p5/p95 -> virtual 1..5.
Raw aligned floats are retained separately; no missing-data or AI fallback.
"""
from __future__ import annotations
import os
import time
from typing import Any
import cv2
import numpy as np
from depthport.config import flag
from depthport.engines import DepthResult, model_location, release_cache
from depthport.yolo_engine import choose_device


def relative_to_virtual(raw: np.ndarray) -> tuple[np.ndarray, dict[str, Any]]:
    """Reproduce the original viewer's mapping; only finite pixels become points.

    This monotonic mapping preserves near/far ordering, NOT physical shape/scale.
    Outlier tails saturate at virtual 1/5 as in the original PoC. Never use this
    geometry for metric measurements or cross-frame fusion.
    """
    values = np.asarray(raw, dtype=np.float32)
    if values.ndim != 2 or not values.size:
        raise ValueError('V2 requires a non-empty HxW relative depth map.')
    finite = np.isfinite(values)
    if not finite.any():
        raise RuntimeError('V2 produced no finite values; no substitute depth is generated.')
    lo, hi = [float(x) for x in np.percentile(values[finite], [5., 95.])]
    flat = hi - lo < 1e-6
    # float64 intermediary avoids overflow for corrupt-but-finite extreme scores.
    nearness = np.full(values.shape, np.nan, dtype=np.float64)
    if flat:
        nearness[finite] = .5
    else:
        nearness[finite] = np.clip((values[finite].astype(np.float64) - lo) / (hi-lo), 0., 1.)
    z = np.ascontiguousarray(1. + (1. - nearness) * 4., dtype=np.float32)
    info = {
        'raw_depth_units': 'relative_nearness_larger_is_nearer',
        'raw_to_output_scale': None,  # NOT a multiplicative unit conversion
        'conversion': 'n=clip((raw-p5)/(p95-p5),0,1); Z_virtual=1+(1-n)*4; flat->3',
        'geometry_kind': 'display_only_2_5d',
        'mapping_id': 'v0.1_legacy_percentile_1_5',
        'per_frame_geometry_normalization': True,
        'mapping_percentiles': [5., 95.], 'mapping_raw_percentile_values': [lo, hi],
        'virtual_near': 1., 'virtual_far': 5., 'flat_prediction': flat,
        'invalid_raw_pixels': int((~finite).sum()),
        'warning': 'V2 display-only virtual units; NOT meters. Per-frame mapping can change geometry/scale; no fusion or measurement.',
    }
    return z, info


class V2Adapter:
    key = 'da2-small'

    def __init__(self):
        self.model_id = model_location(self.key)
        self.imgsz = int(os.getenv('DA2_INPUT_SIZE', '518'))
        if not 140 <= self.imgsz <= 1036 or self.imgsz % 14:
            raise ValueError('DA2_INPUT_SIZE must be a multiple of 14 in 140..1036.')
        self.device_name, self.version = 'not loaded', None
        self._model = self._processor = self._torch = None
        self.last_timings: dict = {}
        self.half = flag('DA2_HALF', False)
        self.hf_commit = None

    @property
    def loaded(self) -> bool:
        return self._model is not None

    def load(self) -> float:
        if self.loaded:
            return 0.
        start = time.perf_counter()
        try:
            import torch
            import transformers
            from transformers import AutoImageProcessor, AutoModelForDepthEstimation
        except Exception as exc:
            raise RuntimeError('Depth Anything V2 runtime import failed. Run INSTALL_ALL_WINDOWS.bat '
                               'or bash INSTALL_ALL_UBUNTU.sh (optionally --v2-only). '
                               f'Original error: {type(exc).__name__}: {exc}') from exc
        _, device = choose_device(torch, os.getenv('DEPTH_DEVICE', 'auto'))
        if self.half and not device.startswith('cuda:'):
            raise ValueError('DA2_HALF=1 requires CUDA; keep DA2_HALF=0 on CPU/MPS.')
        kwargs: dict[str, Any] = {'local_files_only': flag('MODEL_OFFLINE'),
                                 'trust_remote_code': False}
        revision = os.getenv('DA2_HF_REVISION', '').strip()
        if revision:
            kwargs['revision'] = revision
        # Explicit slow processor follows the original PoC/official DPT path.
        processor = AutoImageProcessor.from_pretrained(self.model_id, use_fast=False, **kwargs)
        model = AutoModelForDepthEstimation.from_pretrained(self.model_id, use_safetensors=True, **kwargs)
        config = getattr(model, 'config', None)
        if getattr(config, 'model_type', None) != 'depth_anything' or \
                getattr(config, 'depth_estimation_type', None) != 'relative':
            raise RuntimeError('DA2_SMALL_MODEL must be a Transformers Depth Anything relative checkpoint. '
                               'Metric or other architectures are rejected to prevent wrong depth semantics.')
        if not callable(getattr(processor, 'post_process_depth_estimation', None)):
            raise RuntimeError('V2 processor lacks post_process_depth_estimation; install requirements-v2.txt.')
        dtype = torch.float16 if self.half else torch.float32
        model = model.to(device=device, dtype=dtype).eval()
        self._model, self._processor, self._torch = model, processor, torch
        self.device_name, self.version = device, transformers.__version__
        self.hf_commit = getattr(config, '_commit_hash', None)
        return round((time.perf_counter()-start)*1000, 2)

    def _sync(self):
        if self.device_name.startswith('cuda:'):
            self._torch.cuda.synchronize(self.device_name)
        elif self.device_name == 'mps':
            self._torch.mps.synchronize()

    def predict(self, bgr: np.ndarray, intrinsics: dict) -> DepthResult:
        if not self.loaded:
            self.load()
        if bgr.ndim != 3 or bgr.shape[2] != 3 or bgr.dtype != np.uint8:
            raise ValueError('V2 expects uint8 HxWx3 BGR input.')
        from PIL import Image
        started = time.perf_counter()
        h, w = bgr.shape[:2]
        rgb = Image.fromarray(cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB))
        inputs = self._processor(images=rgb, return_tensors='pt',
                                 size={'height': self.imgsz, 'width': self.imgsz},
                                 keep_aspect_ratio=True, ensure_multiple_of=14, do_pad=False)
        inputs = inputs.to(self.device_name)
        if self.half:
            inputs['pixel_values'] = inputs['pixel_values'].to(dtype=self._torch.float16)
        input_hw = [int(v) for v in inputs['pixel_values'].shape[-2:]]
        self._sync()
        forward_start = time.perf_counter()
        with self._torch.inference_mode():
            outputs = self._model(**inputs)
            if getattr(outputs, 'predicted_depth', None) is None:
                raise RuntimeError('V2 returned no predicted_depth; refusing fabricated output.')
            # Restore to the prepared image BEFORE applying its camera intrinsics.
            processed = self._processor.post_process_depth_estimation(outputs, target_sizes=[(h, w)])
            if not isinstance(processed, (list, tuple)) or len(processed) != 1:
                raise RuntimeError('V2 postprocessor returned an invalid batch.')
            if 'predicted_depth' not in processed[0]:
                raise RuntimeError('V2 postprocessor returned no predicted_depth.')
            tensor = processed[0]['predicted_depth']
            if not hasattr(tensor, 'detach'):
                raise RuntimeError('V2 postprocessor must return a floating tensor.')
            raw = np.array(tensor.detach().float().cpu().numpy(), dtype=np.float32, order='C', copy=True)
        self._sync()
        model_post_ms = (time.perf_counter()-forward_start)*1000
        if raw.shape != (h, w):
            raise RuntimeError(f'V2 output shape {raw.shape} != aligned RGB {(h,w)}; refusing misaligned geometry.')
        z, info = relative_to_virtual(raw)
        info.update({'precision': 'fp16' if self.half else 'fp32',
                     'hf_commit': self.hf_commit, 'network_input_hw': input_hw,
                     'preprocessor': 'DPT slow; full-frame resize, no crop/pad; output resized back to prepared RGB',
                     'intrinsics_policy': 'prepared RGB camera K retained; no virtual/meter calibration implied'})
        self.last_timings = {
            'predict_wall_ms': round((time.perf_counter()-started)*1000, 2),
            'v2_model_postprocess_ms': round(model_post_ms, 2), 'inference_ms': None,
            'inference_note': 'V2 wall time includes processor/model/resize/CPU transfer; NOT isolated GPU kernel time.',
        }
        return DepthResult(bgr, z, raw, intrinsics, 'relative', info=info)

    def unload(self):
        self._model = self._processor = self._torch = None
        self.last_timings = {}
        release_cache()
