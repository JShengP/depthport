# SPDX-License-Identifier: AGPL-3.0-only
"""DepthPort multi-model PoC: one worker, one model, one shared source.

Image upload and model switches enqueue local jobs (HTTP 202). No model work in
HTTP handlers. Generation tokens discard stale results after any source/switch.
"""
from __future__ import annotations
import base64
import hashlib
import io
import json
import os
import re
import threading
import time
import uuid
import zipfile
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Literal
from urllib.parse import urlsplit
import cv2
import numpy as np
from fastapi import FastAPI, File, HTTPException, UploadFile, Request
from fastapi.responses import FileResponse, Response, JSONResponse
from fastapi.exceptions import RequestValidationError
from fastapi.staticfiles import StaticFiles
from starlette.middleware.trustedhost import TrustedHostMiddleware
from depthport import __version__
from depthport.source_archive import source_bytes
from pydantic import BaseModel, Field
from starlette.concurrency import run_in_threadpool
from depthport.config import CFG, ROOT
from depthport.cloud import CameraGeometry, make_cloud, export_binary_ply
from depthport.engines import PRESETS, DepthResult, catalog, make_engine, model_location
from depthport.capture import CaptureWorker

MAX_UPLOAD = 12 * 1024 * 1024


def safe_error(exc: Exception, limit: int = 700) -> str:
    text = re.sub(r'rtsps?://[^\s\'"<>]+', 'rtsp://[REDACTED]', str(exc), flags=re.I)
    return f'{type(exc).__name__}: {text}'[:limit]


def prepare_cloud(result: DepthResult) -> tuple[dict, dict]:
    """Confidence/sky alter point validity, never raw depths or metric scale."""
    mask = np.ones(result.depth.shape, dtype=bool)
    filter_info = {'confidence_available': result.confidence is not None,
                   'confidence_percentile': CFG.confidence_percentile,
                   'sky_available': result.sky is not None,
                   'exclude_sky': CFG.exclude_sky}
    if result.confidence is not None and CFG.confidence_percentile > 0:
        conf = result.confidence
        finite = np.isfinite(conf)
        if not finite.any():
            mask[:] = False
            filter_info['confidence_threshold'] = None
        else:
            threshold = float(np.percentile(conf[finite], CFG.confidence_percentile))
            mask &= finite & (conf >= threshold)
            filter_info['confidence_threshold'] = threshold
    if result.sky is not None and CFG.exclude_sky:
        mask &= ~result.sky
    if result.units == 'estimated_m':
        lo, hi, cmin, cmax = CFG.min_depth, CFG.max_depth, CFG.color_min, CFG.color_max
        color_mode = 'fixed'
    elif result.info.get('mapping_id') == 'v0.1_legacy_percentile_1_5':
        lo, hi = CFG.relative_min, CFG.relative_max
        cmin, cmax, color_mode = 1., 5., 'fixed'
    else:
        lo, hi = CFG.relative_min, CFG.relative_max
        values = result.depth[np.isfinite(result.depth) & (result.depth > 0) & mask]
        if values.size == 0:
            values = result.depth[np.isfinite(result.depth) & (result.depth > 0)]
        if values.size == 0: raise ValueError('No valid positive depth')
        cmin, cmax = (float(x) for x in np.percentile(values, [2, 98]))
        if cmax <= cmin: cmax = cmin + max(abs(cmin)*.01, .000001)
        color_mode = 'per_frame_percentile_colors_only'
    cloud = make_cloud(result.bgr, result.depth, intrinsics=result.intrinsics,
                       grid_max_width=CFG.grid_width, min_depth=lo, max_depth=hi,
                       color_min=cmin, color_max=cmax, units=result.units,
                       valid_mask=mask, color_mode=color_mode)
    return cloud, filter_info


class Service:
    def __init__(self, engine_factory=None):
        self.lock = threading.RLock()
        self.wake, self.stop_event = threading.Event(), threading.Event()
        self.engine_factory = engine_factory or make_engine
        self.engine = None
        self.engine_key = None
        self.selected = os.getenv('DEPTH_ENGINE', 'yolo26').strip()
        if self.selected not in PRESETS: raise ValueError('DEPTH_ENGINE must be yolo26/da2-small/da3-small/da3-metric.')
        self.model_request = 0
        self.handled_request = -1
        self.load_requested = False
        self.model_state = 'not_loaded'
        self.model_error = None
        self.last_load_ms = None
        self.processing = False
        self.session_id = uuid.uuid4().hex
        calibration = CFG.calibration_file
        if calibration and not Path(calibration).is_absolute(): calibration = str(ROOT/calibration)
        self.geometry = CameraGeometry(CFG.hfov, calibration)
        self.reader = None
        self.still_image = None
        self.source_hash = None
        self.generation = 0
        self.mode = 'none'
        self.latest = self.records = self.result = None
        self.frame_id = 0
        self.source_error = None
        self.last_publish_time = self.update_hz = None
        self.worker = threading.Thread(target=self._work, name='depthport-model-worker', daemon=True)
        self.worker.start()

    def _clear(self):
        self.latest = self.records = self.result = None
        self.source_error = None
        self.last_publish_time = self.update_hz = None

    def request_model(self, key: str) -> int:
        if key not in PRESETS: raise ValueError('Unknown model preset')
        with self.lock:
            self.selected = key
            self.model_request += 1  # pressing apply on same model is explicit retry
            self.generation += 1
            self.load_requested = True
            self.model_state = 'queued'
            self.model_error = None
            self._clear()
            generation = self.generation
        self.wake.set()
        return generation

    def set_image(self, frame: np.ndarray, digest: str) -> int:
        with self.lock:
            old, self.reader = self.reader, None
            self.still_image = frame.copy()
            self.source_hash = digest
            self.mode = 'image'
            self.generation += 1
            self._clear()
            generation = self.generation
            self.load_requested = True
        if old: old.stop()
        self.wake.set()
        return generation

    def reprocess(self) -> int:
        with self.lock:
            if self.mode != 'image' or self.still_image is None:
                raise ValueError('No retained image; upload an image first.')
            self.generation += 1
            self._clear()
            generation = self.generation
        self.wake.set()
        return generation

    def set_source(self, url: str) -> int:
        url = url.strip()
        try:
            parts = urlsplit(url)
            valid = parts.scheme in ('rtsp', 'rtsps') and bool(parts.hostname) and (parts.port is None or parts.port > 0)
        except ValueError: valid = False
        if not valid or any(ch.isspace() for ch in url):
            raise ValueError('Enter a valid RTSP URL. URL-encode special characters in credentials.')
        reader = CaptureWorker(url)
        with self.lock:
            old, self.reader = self.reader, reader
            self.mode = 'rtsp'
            self.still_image = self.source_hash = None
            self.generation += 1
            self._clear()
            self.load_requested = True
            generation = self.generation
            reader.start()
        if old: old.stop()
        self.wake.set()
        return generation

    def stop_source(self):
        with self.lock:
            old, self.reader = self.reader, None
            self.still_image = self.source_hash = None
            self.mode = 'none'
            self.generation += 1
            self._clear()
        if old: old.stop()
        self.wake.set()

    def _load_selected(self, key: str, request_id: int):
        # Called ONLY by the worker, after any current inference returns.
        with self.lock: self.model_state = 'loading'
        try:
            if self.engine_key != key or self.engine is None:
                if self.engine is not None:
                    self.engine.unload()
                with self.lock: self.engine = None; self.engine_key = None
                new = self.engine_factory(key)
                with self.lock: self.engine = new; self.engine_key = key
            load_ms = self.engine.load()
            with self.lock:
                if request_id == self.model_request and key == self.selected:
                    self.model_state = 'ready'
                    self.model_error = None
                    self.last_load_ms = load_ms
                    self.handled_request = request_id
            return True
        except Exception as exc:
            message = safe_error(exc)
            # Failed load may hold GPU tensors. Drop it before another selection.
            if self.engine is not None:
                try: self.engine.unload()
                except Exception: pass
            with self.lock:
                self.engine = None; self.engine_key = None
                if request_id == self.model_request and key == self.selected:
                    self.model_state = 'error'; self.model_error = message
                    self.handled_request = request_id  # NO repeated download/retry loop
            return False

    def _work(self):
        processed_image_generation = None
        last_rtsp_marker = None
        next_infer_at = 0.
        try:
            while not self.stop_event.is_set():
                self.wake.wait(.08); self.wake.clear()
                if self.stop_event.is_set(): break
                with self.lock:
                    key, rid, gen = self.selected, self.model_request, self.generation
                    need = self.load_requested and self.handled_request != rid
                if need:
                    self._load_selected(key, rid)
                    continue  # refresh all source/selection tokens after model load
                with self.lock:
                    if self.model_state != 'ready' or self.engine_key != self.selected:
                        continue
                    mode, gen, rid, key = self.mode, self.generation, self.model_request, self.selected
                    reader, image, digest = self.reader, self.still_image, self.source_hash
                sequence = received = None
                if mode == 'image':
                    if image is None or processed_image_generation == gen: continue
                    frame = image  # immutable after set_image; geometry.prepare does not mutate it
                    processed_image_generation = gen
                elif mode == 'rtsp' and reader is not None:
                    if time.monotonic() < next_infer_at: continue
                    sequence, frame, received = reader.peek()
                    marker = (id(reader), gen, sequence)
                    if frame is None or marker == last_rtsp_marker: continue
                    last_rtsp_marker = marker
                    next_infer_at = time.monotonic() + 1./CFG.target_hz
                else: continue
                with self.lock: self.processing = True
                try:
                    start = time.perf_counter()
                    prepared, intr = self.geometry.prepare(frame, CFG.max_width)
                    result = self.engine.predict(prepared, intr)
                    model_end = time.perf_counter()
                    cloud, filters = prepare_cloud(result)
                    timings = dict(self.engine.last_timings)
                    timings.update({'cloud_ms': round((time.perf_counter()-model_end)*1000, 2),
                                    'pipeline_ms': round((time.perf_counter()-start)*1000, 2),
                                    'last_model_load_ms': self.last_load_ms})
                    records = cloud.pop('points_raw')
                    with self.lock:
                        if (gen, rid, key) != (self.generation, self.model_request, self.selected) or self.stop_event.is_set():
                            continue
                        now = time.time()
                        if mode == 'rtsp' and self.last_publish_time:
                            self.update_hz = round(1/max(.000001, now-self.last_publish_time), 2)
                        self.frame_id += 1
                        self.latest = {**cloud, 'frame_id': self.frame_id, 'generation': gen,
                                       'session_id': self.session_id, 'timestamp': now, 'source': mode,
                                       'engine': key, 'model': self.engine.model_id,
                                       'device': self.engine.device_name, 'model_version': self.engine.version,
                                       'model_imgsz': self.engine.imgsz, 'timings': timings,
                                       'inference_ms': timings.get('inference_ms'),
                                       'capture_sequence': sequence, 'source_sha256': digest,
                                       'source_width': frame.shape[1], 'source_height': frame.shape[0],
                                       'filter_info': filters, 'depth_info': result.info,
                                       'received_to_publish_ms': round((now-received)*1000, 2) if received else None,
                                       'received_to_publish_note': 'Host decode completion to publish; NOT exposure to browser.'}
                        self.records, self.result = records, result
                        self.last_publish_time = now
                        self.source_error = None
                except Exception as exc:
                    with self.lock:
                        if gen == self.generation and rid == self.model_request:
                            self.source_error = safe_error(exc)
                    next_infer_at = time.monotonic()+2.5
                finally:
                    with self.lock: self.processing = False
        finally:
            if self.engine is not None:
                try: self.engine.unload()
                except Exception: pass

    def status(self) -> dict:
        with self.lock:
            connected, camera_error, _ = self.reader.stats() if self.reader else (False, None, 0)
            e = self.engine
            return {'session_id': self.session_id, 'generation': self.generation,
                    'mode': self.mode, 'connected': connected, 'selected_engine': self.selected,
                    'active_engine': self.engine_key, 'model_state': self.model_state,
                    'model_loading': self.model_state in ('queued', 'loading'),
                    'model_loaded': self.model_state == 'ready', 'processing': self.processing,
                    'depth_model': model_location(self.selected),
                    'model_imgsz': getattr(e, 'imgsz', None), 'model_version': getattr(e, 'version', None),
                    'device': getattr(e, 'device_name', 'not loaded'),
                    'frame_id': self.frame_id, 'has_result': self.latest is not None,
                    'image_retained': self.still_image is not None,
                    'units': PRESETS[self.selected]['units'], 'scene_scale_verified': False,
                    'error': self.model_error or self.source_error or camera_error,
                    'target_hz': CFG.target_hz, 'publish_hz': self.update_hz,
                    'last_update_seconds': round(time.time()-self.last_publish_time, 1) if self.last_publish_time else None,
                    'last_model_load_ms': self.last_load_ms,
                    'intrinsics_source': 'provided_intrinsics' if self.geometry.calibration else 'hfov_estimate',
                    'note': 'One shared source and model. Switching unloads old weights; latest request wins.'}

    def snapshot(self):
        with self.lock:
            if self.latest is None: raise HTTPException(404, 'No completed frame for the current source/model.')
            return self.latest, self.records, self.result

    def shutdown(self):
        self.stop_event.set(); self.wake.set()
        with self.lock:
            self.generation += 1
            reader, self.reader = self.reader, None
        if reader: reader.stop()
        # Network model download / current inference cannot be forcibly cancelled in a thread.
        self.worker.join(timeout=2.)


@asynccontextmanager
async def lifespan(app):
    service = Service(); app.state.service = service
    source = os.getenv('RTSP_URL', '').strip()
    if source:
        try: service.set_source(source)
        except ValueError as exc: service.source_error = safe_error(exc)
    try: yield
    finally: service.shutdown()


app = FastAPI(title='DepthPort', version=__version__, lifespan=lifespan)
allowed_hosts = [h.strip() for h in os.getenv(
    "DEPTHPORT_ALLOWED_HOSTS", "127.0.0.1,localhost,[::1]"
).split(",") if h.strip()]
if not allowed_hosts or "*" in allowed_hosts:
    raise ValueError("Set explicit DEPTHPORT_ALLOWED_HOSTS; a wildcard is not supported.")
app.add_middleware(TrustedHostMiddleware, allowed_hosts=allowed_hosts, www_redirect=False)
app.mount('/static', StaticFiles(directory=ROOT/'static'), name='static')


@app.middleware('http')
async def local_write_guard(request: Request, call_next):
    if request.method not in ('GET', 'HEAD', 'OPTIONS'):
        origin = request.headers.get('origin')
        if request.headers.get('sec-fetch-site') == 'cross-site' or (origin and origin != str(request.base_url).rstrip('/')):
            return JSONResponse({'detail': 'Cross-origin writes are disabled; open the UI from this server.'}, status_code=403)
    response = await call_next(request)
    response.headers['Cache-Control'] = 'no-store'
    response.headers['X-Content-Type-Options'] = 'nosniff'
    response.headers['Referrer-Policy'] = 'no-referrer'
    response.headers['X-Frame-Options'] = 'DENY'
    return response


@app.exception_handler(RequestValidationError)
async def request_validation_error(request: Request, exc: RequestValidationError):
    # Pydantic normally includes rejected input values, possibly a secret URL.
    issues = [{"loc": list(item["loc"]), "type": item["type"], "msg": item["msg"]}
              for item in exc.errors()]
    return JSONResponse({"detail": issues}, status_code=422)


@app.get('/')
def index(): return FileResponse(ROOT/'static/index.html')
@app.get('/api/source-code.zip')
def download_source():
    try:
        payload = source_bytes(ROOT)
    except (OSError, ValueError) as exc:
        raise HTTPException(503, "Source manifest incomplete; contact the maintainer.") from exc
    return Response(payload, media_type="application/zip", headers={
        "Content-Disposition": f'attachment; filename="depthport-{__version__}-source.zip"'
    })


@app.get('/api/license')
def license_text():
    return FileResponse(ROOT / 'LICENSE', media_type='text/plain')


@app.get('/api/about')
def about():
    return {"name": "DepthPort", "version": __version__, "stage": "alpha",
            "license": "AGPL-3.0-only", "source_archive": "/api/source-code.zip",
            "shared_session": True, "distance_validated": False}


@app.get('/api/status')
def status(): return app.state.service.status()
@app.get('/api/models')
def models(): return {'models': catalog(), 'switch_policy': 'unload_previous; single_active_model'}
@app.get('/api/latest')
def latest(after: int = 0):
    with app.state.service.lock: frame = app.state.service.latest
    return Response(status_code=204) if frame is None or frame['frame_id'] <= after else JSONResponse(frame)


class ModelRequest(BaseModel):
    engine: Literal['yolo26', 'da2-small', 'da3-small', 'da3-metric']
class SourceRequest(BaseModel):
    url: str = Field(min_length=1, max_length=2048)


@app.post('/api/model', status_code=202)
def select_model(body: ModelRequest):
    gen = app.state.service.request_model(body.engine)
    return {'accepted': True, 'generation': gen, 'message': 'Queued; poll /api/status. Retained still image will rerun.'}
@app.post('/api/source', status_code=202)
def source(body: SourceRequest):
    try: gen = app.state.service.set_source(body.url)
    except ValueError as exc: raise HTTPException(422, safe_error(exc)) from exc
    return {'accepted': True, 'generation': gen}
@app.post('/api/source/stop')
def stop():
    app.state.service.stop_source()
    return {'ok': True}
@app.post('/api/reprocess', status_code=202)
def reprocess():
    try: gen = app.state.service.reprocess()
    except ValueError as exc: raise HTTPException(409, str(exc)) from exc
    return {'accepted': True, 'generation': gen}


def decode_upload(data: bytes) -> np.ndarray:
    from PIL import Image
    try:
        with Image.open(io.BytesIO(data)) as header:
            w, h = header.size
            if header.format not in ('PNG', 'JPEG', 'WEBP'): raise ValueError('Unsupported image format')
        if min(w, h) < 16 or max(w, h) > 8192 or w*h > 32_000_000:
            raise HTTPException(413, 'Image must be >=16x16, <=8192 per side and <=32 MP.')
    except HTTPException: raise
    except Exception as exc: raise HTTPException(400, 'Unsupported or corrupt image.') from exc
    frame = cv2.imdecode(np.frombuffer(data, dtype=np.uint8), cv2.IMREAD_COLOR)
    if frame is None: raise HTTPException(400, 'Image decoding failed')
    return frame


@app.post('/api/image', status_code=202)
async def image(file: UploadFile = File(...)):
    if file.content_type and file.content_type not in ('image/jpeg', 'image/png', 'image/webp', 'application/octet-stream'):
        await file.close(); raise HTTPException(415, 'Upload JPG, PNG or WEBP.')
    try: data = await file.read(MAX_UPLOAD+1)
    finally: await file.close()
    if len(data) > MAX_UPLOAD: raise HTTPException(413, 'Image exceeds 12 MB.')
    frame = await run_in_threadpool(decode_upload, data)
    gen = await run_in_threadpool(app.state.service.set_image, frame, hashlib.sha256(data).hexdigest())
    return {'accepted': True, 'generation': gen, 'message': 'Queued; no AI inference success is implied by HTTP 202.'}


def metadata(frame): return {k:v for k,v in frame.items() if k not in ('points','rgb_jpeg','depth_jpeg')}
def npy_bytes(array):
    buff = io.BytesIO(); np.save(buff, array, allow_pickle=False); return buff.getvalue()
def attachment(data, filename, frame_id, media_type='application/octet-stream'):
    return Response(data, media_type=media_type, headers={'Content-Disposition': f'attachment; filename="{filename}"',
                                                           'X-DepthPort-Frame-ID': str(frame_id)})
@app.get('/api/export.ply')
def download_ply():
    f, r, _ = app.state.service.snapshot()
    return attachment(export_binary_ply(r, frame_id=f['frame_id'], units=f['units'], engine=f['engine']),
                      f'depthport_{f["engine"]}_{f["units"]}_{f["frame_id"]}.ply', f['frame_id'])
@app.get('/api/depth.npy')
def download_depth():
    f, _, result = app.state.service.snapshot()
    return attachment(npy_bytes(result.depth), f'depth_{f["engine"]}_{f["units"]}_{f["frame_id"]}.npy', f['frame_id'])
@app.get('/api/frame.json')
def download_meta():
    f, _, _ = app.state.service.snapshot(); return metadata(f)


def bundle_bytes(frame, records, result):
    output = io.BytesIO()
    with zipfile.ZipFile(output, 'w', compression=zipfile.ZIP_DEFLATED) as z:
        z.writestr(f'pointcloud_{frame["units"]}.ply', export_binary_ply(records, frame_id=frame['frame_id'],
                                                                       units=frame['units'], engine=frame['engine']))
        z.writestr(f'depth_{frame["units"]}.npy', npy_bytes(result.depth))
        z.writestr('model_raw_depth.npy', npy_bytes(result.raw_depth))
        if result.confidence is not None: z.writestr('confidence.npy', npy_bytes(result.confidence))
        if result.sky is not None: z.writestr('sky_mask.npy', npy_bytes(result.sky))
        z.writestr('frame.json', json.dumps(metadata(frame), ensure_ascii=False, indent=2, allow_nan=False))
        ok, png = cv2.imencode('.png', result.bgr)
        if not ok: raise RuntimeError('PNG encoding failed')
        z.writestr('rgb_aligned.png', png.tobytes())
        z.writestr('depth_preview.jpg', base64.b64decode(frame['depth_jpeg']))
    return output.getvalue()


@app.get('/api/export.zip')
def download_bundle():
    f, records, result = app.state.service.snapshot()
    return attachment(bundle_bytes(f, records, result), f'depthport_{f["engine"]}_frame_{f["frame_id"]}.zip', f['frame_id'], 'application/zip')


if __name__ == '__main__':
    import uvicorn
    uvicorn.run(app, host=os.getenv('HOST','127.0.0.1'), port=int(os.getenv('PORT','8000')), log_level='info')
