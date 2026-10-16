# SPDX-License-Identifier: AGPL-3.0-only
"""YOLO26 Depth adapter. Real model only; no synthetic fallback on model failure.

Official contract: result.depth.data is a float (H, W) map, metric-scaled
for released checkpoints. These are estimated metres, NOT measured distances.
NumPy input to Ultralytics is uint8 BGR; Ultralytics handles preprocessing.
"""
from __future__ import annotations
import os
import threading
import time
import numpy as np
from depthport.config import flag  # also loads the optional project .env

PINNED_ULTRALYTICS = '8.4.115'


def choose_device(torch, requested: str) -> tuple[str | int, str]:
    value = requested.strip().lower()
    if value == 'auto':
        if torch.cuda.is_available():
            return 0, 'cuda:0'
        mps = getattr(torch.backends, 'mps', None)
        if mps is not None and mps.is_available():
            return 'mps', 'mps'
        return 'cpu', 'cpu'
    if value == 'cpu':
        return 'cpu', 'cpu'
    if value == 'mps':
        mps = getattr(torch.backends, 'mps', None)
        if mps is None or not mps.is_available():
            raise RuntimeError('DEPTH_DEVICE=mps requested but MPS is unavailable.')
        return 'mps', 'mps'
    if value == 'cuda':
        value = '0'
    elif value.startswith('cuda:'):
        value = value[5:]
    if value.isdigit():
        index = int(value)
        if not torch.cuda.is_available() or index >= torch.cuda.device_count():
            raise RuntimeError('Requested CUDA device is unavailable. Install a matching CUDA-enabled '
                               'PyTorch build, or explicitly set DEPTH_DEVICE=cpu.')
        return index, f'cuda:{index}'
    raise ValueError('DEPTH_DEVICE must be auto, cpu, mps, cuda, cuda:N or a GPU index.')


class DepthEngine:
    def __init__(self, model_id: str | None = None) -> None:
        self.model_id = model_id or os.getenv('DEPTH_MODEL', 'yolo26n-depth.pt').strip()
        if 'depth-anything' in self.model_id.lower() or self.model_id.endswith(('.yaml', '.yml')):
            raise ValueError('Use trained YOLO26 Depth weights, e.g. yolo26n-depth.pt, '
                             'not the old Hugging Face model ID or an untrained YAML.')
        self.imgsz = int(os.getenv('DEPTH_IMGSZ', '768'))
        if not 128 <= self.imgsz <= 1536 or self.imgsz % 32:
            raise ValueError('DEPTH_IMGSZ must be a multiple of 32 in 128..1536.')
        self.requested_device = os.getenv('DEPTH_DEVICE', 'auto')
        self.half = flag('DEPTH_HALF')
        self.device_name = 'not loaded'
        self.version = None
        self.loading = False
        self.last_timings: dict = {}
        self._model = None
        self._torch = None
        self._device = None
        self._lock = threading.RLock()

    @property
    def loaded(self) -> bool:
        return self._model is not None

    def load(self) -> float:
        """Return load/download time (ms), or zero for an already-loaded model."""
        with self._lock:
            if self.loaded:
                return 0.0
            self.loading = True
            started = time.perf_counter()
            try:
                try:
                    import torch
                    import ultralytics
                    from ultralytics import YOLO
                    from ultralytics.models.yolo.depth import DepthPredictor  # noqa: F401
                except (ImportError, ModuleNotFoundError) as exc:
                    raise RuntimeError(
                        f'YOLO Depth API is unavailable. In THIS venv run: python -m pip install '
                        f'-r requirements.txt (reference ultralytics=={PINNED_ULTRALYTICS}). '
                        'Do not reuse the old Depth Anything environment.'
                    ) from exc
                self.version = ultralytics.__version__
                device, device_name = choose_device(torch, self.requested_device)
                if self.half and not device_name.startswith('cuda:'):
                    raise ValueError('DEPTH_HALF=1 requires CUDA; use DEPTH_HALF=0 for CPU/MPS.')
                model = YOLO(self.model_id, task='depth')
                if getattr(model, 'task', None) != 'depth':
                    raise RuntimeError('Loaded weights are NOT task=depth. '
                                       'Use yolo26n-depth.pt, not yolo26n.pt.')
                self._torch, self._device = torch, device
                self._model = model
                self.device_name = device_name
                return round((time.perf_counter() - started) * 1000, 2)
            finally:
                self.loading = False

    def predict(self, bgr: np.ndarray) -> np.ndarray:
        """Return aligned float32 estimated Z-depth. Larger positive values are farther.

        The model's preprocessing and output resizing are not implemented a second
        time here. Do NOT normalize, invert, exponentiate or recalibrate this output.
        """
        if not isinstance(bgr, np.ndarray) or bgr.dtype != np.uint8 or bgr.ndim != 3 or bgr.shape[2] != 3:
            raise ValueError('Expected an HxWx3 uint8 BGR image.')
        with self._lock:
            load_ms = self.load()
            started = time.perf_counter()
            with self._torch.inference_mode():
                results = self._model.predict(
                    source=np.ascontiguousarray(bgr), task='depth',
                    imgsz=self.imgsz, device=self._device, half=self.half,
                    rect=False, verbose=False, save=False, stream=False,
                )
                if len(results) != 1 or getattr(results[0], 'depth', None) is None:
                    raise RuntimeError('YOLO did not return result.depth; check task, weights and package version.')
                data = results[0].depth.data
                if hasattr(data, 'detach'):
                    data = data.detach().float().cpu().numpy()
                depth = np.asarray(data, dtype=np.float32)
                # Accept singleton batch/channel wrappers without destroying H=1 or W=1.
                while depth.ndim > 2 and depth.shape[0] == 1:
                    depth = depth[0]
                if depth.shape != bgr.shape[:2]:
                    raise RuntimeError(f'Depth shape {depth.shape} does not match RGB {bgr.shape[:2]}; '
                                       'refusing misaligned point cloud.')
                if not np.any(np.isfinite(depth) & (depth > 0)):
                    raise RuntimeError('Model produced no valid positive depth values.')
                depth = np.array(depth, dtype=np.float32, order='C', copy=True)
            wall_ms = round((time.perf_counter() - started) * 1000, 2)
            speed = getattr(results[0], 'speed', {}) or {}
            self.last_timings = {'model_load_ms': load_ms, 'predict_wall_ms': wall_ms}
            for key in ('preprocess', 'inference', 'postprocess'):
                val = speed.get(key)
                if val is not None and np.isfinite(val):
                    self.last_timings[key + '_ms'] = round(float(val), 2)
            return depth
