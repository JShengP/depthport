# SPDX-License-Identifier: AGPL-3.0-only
"""DepthPort multi-model PoC: one worker, one model, one shared source.

Image upload and model switches enqueue local jobs (HTTP 202). No model work in
HTTP handlers. Generation tokens discard stale results after any source/switch.
"""
from __future__ import annotations
import base64
import hashlib
import io
import ipaddress
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
from depthport.spatial import pixel_inspection, depth_distribution, distance_between, fit_plane, empirical_validation
from depthport.comparison import compact_card, status_card
from depthport.semantic import run_ultralytics_semantic
from depthport.sessions import SessionStore, SessionError, SessionIntegrity, SessionNotFound, SessionLimit
from depthport.tracking import analyse_session, MAX_TRACK_FRAMES

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
        self.analysis_job = None
        self.compare_status = {'state': 'idle', 'items': []}
        self.compare_cards = []
        self.compare_snapshots = []
        self.semantic_status = {'state': 'idle'}
        self.semantic_result = None
        self.scale_anchor = None
        self.validation_checks = []
        self.plane_result = None
        self.last_publish_time = self.update_hz = None
        self.worker = threading.Thread(target=self._work, name='depthport-model-worker', daemon=True)
        self.worker.start()

    def _clear(self):
        self.analysis_job = None
        self.compare_status = {'state': 'idle', 'items': []}
        self.compare_cards = []
        self.compare_snapshots = []
        self.semantic_status = {'state': 'idle'}
        self.semantic_result = None
        self.scale_anchor = None
        self.validation_checks = []
        self.plane_result = None
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
                with self.lock:
                    analysis_job, self.analysis_job = self.analysis_job, None
                if analysis_job is not None:
                    self._perform_analysis(analysis_job)
                    continue
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

    # Spatial jobs share the SAME model worker as live inference, avoiding
    # simultaneous depth+comparison+segmentation GPU work and mixed generations.
    def request_comparison(self, engines: list[str]) -> str:
        if not engines or len(engines)>4 or len(set(engines))!=len(engines) or any(k not in PRESETS for k in engines):
            raise ValueError('Provide 1–4 distinct known engines')
        with self.lock:
            if self.mode!='image' or self.still_image is None:
                raise ValueError('Comparison requires a retained still image')
            if (self.compare_status.get('state') in ('queued','running') or
                    self.semantic_status.get('state') in ('queued','running')):
                raise ValueError('An analysis job is already active')
            job_id = uuid.uuid4().hex[:12]
            self.compare_status = {'id':job_id,'state':'queued','engines':list(engines),
                'source_sha256':self.source_hash,'done':0,'total':len(engines),'items':[]}
            self.compare_cards = []
            self.compare_snapshots = []
            self.analysis_job=('compare', job_id, self.generation, list(engines),self.still_image.copy(),self.source_hash)
        self.wake.set()
        return job_id

    def request_semantic(self, mode:str, confidence:float) -> str:
        if mode not in ('detect','segment') or not .05<=confidence<=.95:
            raise ValueError('Invalid semantic mode/confidence')
        with self.lock:
            if self.latest is None or self.result is None: raise ValueError('Process an image/frame first')
            if (self.compare_status.get('state') in ('queued','running') or
                    self.semantic_status.get('state') in ('queued','running')):
                raise ValueError('An analysis job is already active')
            job_id=uuid.uuid4().hex[:12]
            fid=self.latest['frame_id']
            self.semantic_status={'id':job_id,'state':'queued','mode':mode,'frame_id':fid}
            self.semantic_result=None
            self.analysis_job=('semantic',job_id,self.generation,mode,confidence,fid,self.result)
        self.wake.set()
        return job_id

    def _analysis_still_current(self, gen:int, job_id:str, kind:str) -> bool:
        status = self.compare_status if kind=='compare' else self.semantic_status
        return self.generation==gen and status.get('id')==job_id

    def _perform_analysis(self,job):
        kind, job_id, gen = job[:3]
        with self.lock:
            if not self._analysis_still_current(gen,job_id,kind):return
            target = self.compare_status if kind=='compare' else self.semantic_status
            target['state']='running'
        # Unload active depth engine before loading other weights. Restore it
        # later in the normal work loop rather than keeping all models in VRAM.
        if self.engine is not None:
            try:self.engine.unload()
            except Exception:pass
        with self.lock:
            self.engine=None; self.engine_key=None
        try:
            if kind=='compare':
                _,_,_,keys,image,source_sha=job
                for key in keys:
                    with self.lock:
                        if not self._analysis_still_current(gen,job_id,kind):return
                    model=None
                    try:
                        model=self.engine_factory(key)
                        load_ms=model.load() or 0
                        started=time.perf_counter()
                        prepared, intr=self.geometry.prepare(image,CFG.max_width)
                        result=model.predict(prepared,intr)
                        cloud,filters=prepare_cloud(result)
                        wall=(time.perf_counter()-started)*1000
                        card=compact_card(cloud,result,engine=key,model=model.model_id,
                            source_sha256=source_sha,load_ms=load_ms,wall_ms=wall)
                        card['filter_info']=filters
                        records=cloud['points_raw']
                        entry={'engine':key,'state':'done','pipeline_wall_ms':round(wall,2),'units':result.units,
                               'point_count':int(cloud['count'])}
                        with self.lock:
                            if not self._analysis_still_current(gen,job_id,kind):return
                            self.compare_cards.append(card)
                            self.compare_snapshots.append((card,records,result))
                    except Exception as exc:
                        entry={'engine':key,'state':'error','error':safe_error(exc)}
                    finally:
                        if model is not None:
                            try:model.unload()
                            except Exception:pass
                    with self.lock:
                        if not self._analysis_still_current(gen,job_id,kind):return
                        self.compare_status['items'].append(entry)
                        self.compare_status['done']+=1
                with self.lock:
                    if self._analysis_still_current(gen,job_id,kind):
                        self.compare_status['state']='completed'
            else:
                _,_,_,mode,confidence,fid,result=job
                started=time.perf_counter()
                active_device=getattr(self.engine,'device_name',None) or os.getenv('DEPTH_DEVICE','auto')
                if active_device=='auto':
                    try:
                        import torch
                        active_device='cuda:0' if torch.cuda.is_available() else 'cpu'
                    except ImportError: active_device='cpu'
                semantic=run_ultralytics_semantic(result.bgr,result,mode,active_device,confidence)
                semantic['inference_wall_ms']=round((time.perf_counter()-started)*1000,2)
                semantic['source_frame_id']=fid
                with self.lock:
                    if self._analysis_still_current(gen,job_id,kind):
                        self.semantic_result=semantic
                        self.semantic_status.update({'state':'completed','objects':len(semantic['objects']),
                                                     'model':semantic['model'],'inference_wall_ms':semantic['inference_wall_ms']})
        except Exception as exc:
            with self.lock:
                if self._analysis_still_current(gen,job_id,kind):
                    (self.compare_status if kind=='compare' else self.semantic_status).update({'state':'error','error':safe_error(exc)})
        finally:
            with self.lock:
                # Re-load selected depth engine on next loop to resume RTSP or
                # new image requests; keep prior completed frame available.
                self.load_requested=True; self.handled_request=-1
                self.model_state='queued'
            self.wake.set()

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
    # Explicit opt-in. No silent RTSP archival, default storage is disabled.
    app.state.session_store = (SessionStore(ROOT / 'outputs' / 'sessions')
                               if os.getenv('ENABLE_SESSION_STORAGE', '0') == '1' else None)
    app.state.tracking_lock = threading.RLock()
    app.state.tracking_job = {'state':'idle'}
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
@app.get('/spatial')
def spatial_index(): return FileResponse(ROOT/'static/spatial.html')
@app.get('/sessions')
def session_index(): return FileResponse(ROOT/'static/sessions.html')
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


@app.get('/api/spatial/frame')
def spatial_frame(after:int=0):
    with app.state.service.lock: frame=app.state.service.latest
    return Response(status_code=204) if frame is None or frame['frame_id']<=after else JSONResponse({k:v for k,v in frame.items() if k!='points'})


@app.get('/api/spatial/inspect')
def spatial_inspect(u:int, v:int, frame_id:int):
    frame, _, result = app.state.service.snapshot()
    if frame['frame_id'] != frame_id:
        raise HTTPException(409, 'Frame changed. Refresh the displayed frame and click again.')
    try: return pixel_inspection(result,frame,u,v)
    except ValueError as exc: raise HTTPException(422,str(exc)) from exc


class PixelPair(BaseModel):
    frame_id: int = Field(ge=1)
    a: tuple[int,int]
    b: tuple[int,int]


@app.post('/api/spatial/measure')
def spatial_measure(body:PixelPair):
    frame, _, result = app.state.service.snapshot()
    if frame['frame_id']!=body.frame_id: raise HTTPException(409,'Frame changed; select two points on current frame')
    try:
        anchor=app.state.service.scale_anchor
        # Anchor must refer to the same single still frame, not a different
        # RTSP time or model/geometry. No global physical-unit conversion.
        calibrated=bool(anchor and anchor['frame_id']==frame['frame_id'])
        answer=distance_between(result,body.a,body.b,scale=anchor['factor'] if calibrated else 1.)
    except ValueError as exc:raise HTTPException(422,str(exc)) from exc
    checks = app.state.service.validation_checks if calibrated else []
    answer.update({'frame_id':frame['frame_id'],'engine':frame['engine'],
                   'units_label':'estimated_m' if result.units=='estimated_m' else 'relative_not_meters',
                   'scale_anchor_applied':calibrated,
                   'measurement_status':('relative_not_measurable_in_m' if result.units!='estimated_m' else
                                         'scale_anchored_not_validated' if calibrated else 'unverified_model_estimate'),
                   'uncertainty_m':None,
                   'empirical_validation_mae_m':round(sum(c['absolute_error_m'] for c in checks)/len(checks),6) if checks else None,
                   'validation_sample_count':len(checks),
                   'warning':'Empirical validation MAE, if present, is NOT a guaranteed uncertainty bound or confidence interval.'})
    return answer


class ScaleAnchor(PixelPair):
    known_distance_m: float = Field(gt=0,le=10000)


@app.post('/api/spatial/calibration/scale')
def spatial_scale(body:ScaleAnchor):
    svc=app.state.service
    frame, _, result=svc.snapshot()
    if frame['frame_id']!=body.frame_id: raise HTTPException(409,'Frame changed; retry with current frame')
    if result.units!='estimated_m': raise HTTPException(422,'Relative/virtual depth cannot be calibrated to meters from one arbitrary pair')
    try: raw=distance_between(result,body.a,body.b)['raw_distance']
    except ValueError as exc:raise HTTPException(422,str(exc)) from exc
    if raw < 1e-5:raise HTTPException(422,'Anchor pixel separation is too small')
    if svc.geometry.calibration is None:
        # One reference cannot correct incorrect rays from an assumed HFOV.
        raise HTTPException(422,'Provide a measured camera-intrinsics JSON before metric scale anchoring')
    anchor={'frame_id':frame['frame_id'],'source_sha256':frame.get('source_sha256'),
            'engine':frame['engine'],'points_px':[list(body.a),list(body.b)],
            'known_distance_m':body.known_distance_m,'raw_distance':raw,
            'factor':float(body.known_distance_m/raw), 'status':'single_anchor_not_independent_validation',
            'applies_to_export':False}
    with svc.lock:
        if svc.latest is None or svc.latest['frame_id']!=frame['frame_id']:
            raise HTTPException(409,'Frame changed during calibration')
        svc.scale_anchor=anchor
        svc.validation_checks=[]
    return anchor


class ValidatePair(ScaleAnchor):
    pass


@app.post('/api/spatial/calibration/validate')
def spatial_validate(body:ValidatePair):
    svc=app.state.service
    frame,_,result=svc.snapshot()
    if frame['frame_id']!=body.frame_id:raise HTTPException(409,'Frame changed; retry validation')
    anchor=svc.scale_anchor
    if not anchor or anchor['frame_id']!=frame['frame_id']:
        raise HTTPException(409,'Calibrate an independent scale anchor on this frame first')
    if {tuple(body.a),tuple(body.b)} == set(map(tuple,anchor['points_px'])):
        raise HTTPException(422,'Validation must use a different pair from the calibration anchor')
    try: raw=distance_between(result,body.a,body.b)['raw_distance']
    except ValueError as exc: raise HTTPException(422,str(exc)) from exc
    check=empirical_validation(raw,body.known_distance_m,anchor['factor'])
    check['points_px']=[list(body.a),list(body.b)]
    with svc.lock:
        if svc.latest is None or svc.latest['frame_id']!=frame['frame_id']:
            raise HTTPException(409,'Frame changed during validation')
        svc.validation_checks.append(check)
    return {**check,'independent_checks':len(svc.validation_checks),
            'mean_absolute_error_m':sum(c['absolute_error_m'] for c in svc.validation_checks)/len(svc.validation_checks),
            'uncertainty_m':None,'accuracy_certified':False}


class PlaneRequest(BaseModel):
    frame_id:int=Field(ge=1)
    roi: tuple[float,float,float,float] = (.05,.55,.95,.95)
    threshold:float=Field(default=.05,gt=0,le=10000)


@app.post('/api/spatial/calibration/plane')
def spatial_plane(body:PlaneRequest):
    svc=app.state.service
    frame,_,result=svc.snapshot()
    if frame['frame_id']!=body.frame_id:raise HTTPException(409,'Frame changed; retry plane fitting')
    try: plane=fit_plane(result.depth,result.intrinsics,body.roi,body.threshold)
    except ValueError as exc:raise HTTPException(422,str(exc)) from exc
    plane.update({'frame_id':frame['frame_id'],'units':result.units,
                  'is_metric_estimate':result.units=='estimated_m',
                  'camera_height_estimate':abs(plane['d']) if result.units=='estimated_m' else None,
                  'warning':'Unlabelled candidate plane: confirm it is the floor. Residual is not physical accuracy.'})
    with svc.lock:
        if svc.latest is None or svc.latest['frame_id']!=frame['frame_id']:
            raise HTTPException(409,'Frame changed during plane fit')
        svc.plane_result=plane
    return plane


class CompareRequest(BaseModel):
    engines: list[Literal['yolo26','da2-small','da3-small','da3-metric']] = Field(default_factory=lambda:list(PRESETS))


@app.post('/api/spatial/compare', status_code=202)
def spatial_compare(body:CompareRequest):
    try: job=app.state.service.request_comparison(body.engines)
    except ValueError as exc:raise HTTPException(409,str(exc)) from exc
    return {'accepted':True,'id':job,'status_url':'/api/spatial/compare/status'}


@app.get('/api/spatial/compare/status')
def spatial_compare_status():
    with app.state.service.lock:return dict(app.state.service.compare_status)


@app.get('/api/spatial/compare/results')
def spatial_compare_results():
    svc=app.state.service
    with svc.lock:
        return {'status':dict(svc.compare_status),'cards':list(svc.compare_cards),
                'note':'Normalized histograms compare distribution shape ONLY; not absolute depth. Each model retains its native units.'}


@app.get('/api/spatial/compare/export.zip')
def spatial_compare_export():
    svc=app.state.service
    with svc.lock:
        if svc.compare_status.get('state')!='completed':
            raise HTTPException(409,'Comparison has not completed')
        entries=list(svc.compare_snapshots)
        status=dict(svc.compare_status)
    out=io.BytesIO()
    with zipfile.ZipFile(out,'w',compression=zipfile.ZIP_DEFLATED) as bundle:
        bundle.writestr('comparison.json',json.dumps(status,ensure_ascii=False,indent=2))
        for card,records,result in entries:
            folder=card['engine']+'/'
            bundle.writestr(folder+'pointcloud.ply',export_binary_ply(records,units=card['units'],engine=card['engine']))
            bundle.writestr(folder+'depth.npy',npy_bytes(result.depth))
            bundle.writestr(folder+'raw_depth.npy',npy_bytes(result.raw_depth))
            bundle.writestr(folder+'metrics.json',json.dumps(status_card(card),ensure_ascii=False,indent=2))
            ok,png=cv2.imencode('.png',result.bgr)
            if not ok:raise HTTPException(500,'Cannot encode comparison RGB')
            bundle.writestr(folder+'rgb_aligned.png',png.tobytes())
    return Response(out.getvalue(),media_type='application/zip',headers={
        'Content-Disposition':'attachment; filename="depthport_spatial_comparison.zip"'})


class SemanticRequest(BaseModel):
    mode:Literal['detect','segment']='segment'
    confidence:float=Field(default=.25,ge=.05,le=.95)


@app.post('/api/spatial/semantic',status_code=202)
def spatial_semantic_start(body:SemanticRequest):
    try: job=app.state.service.request_semantic(body.mode,body.confidence)
    except ValueError as exc:raise HTTPException(409,str(exc)) from exc
    return {'accepted':True,'id':job,'status_url':'/api/spatial/semantic/status'}


@app.get('/api/spatial/semantic/status')
def spatial_semantic_status():
    with app.state.service.lock:return dict(app.state.service.semantic_status)


@app.get('/api/spatial/semantic/result')
def spatial_semantic_result():
    with app.state.service.lock:
        if app.state.service.semantic_result is None:raise HTTPException(404,'No semantic result yet')
        return app.state.service.semantic_result



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


def spatial_report_for_frame(service, frame):
    with service.lock:
        anchor = service.scale_anchor
        anchor = anchor if anchor and anchor['frame_id']==frame['frame_id'] else None
        plane = service.plane_result
        plane = plane if plane and plane['frame_id']==frame['frame_id'] else None
        semantic = service.semantic_result
        semantic_meta = ({'mode':semantic['mode'],'model':semantic['model'],
                          'source_frame_id':semantic['source_frame_id'],
                          'objects':[{k:v for k,v in obj.items() if not k.startswith('points_packed')} for obj in semantic['objects']]}
                         if semantic and semantic['source_frame_id']==frame['frame_id'] else None)
        return {'frame_id':frame['frame_id'],'engine':frame['engine'],
                'units':frame['units'],'camera_intrinsics':frame['intrinsics'],
                'scale_anchor':anchor,'validation_checks':list(service.validation_checks) if anchor else [],
                'candidate_plane':plane,'semantic_objects':semantic_meta,
                'warning':'Single-view AI geometry, not a certified 3D scan or safety range sensor.'}


@app.get('/api/spatial/report.json')
def spatial_report():
    frame,_,_=app.state.service.snapshot()
    return spatial_report_for_frame(app.state.service,frame)


def bundle_bytes(frame, records, result, spatial_analysis=None):
    output = io.BytesIO()
    with zipfile.ZipFile(output, 'w', compression=zipfile.ZIP_DEFLATED) as z:
        z.writestr(f'pointcloud_{frame["units"]}.ply', export_binary_ply(records, frame_id=frame['frame_id'],
                                                                       units=frame['units'], engine=frame['engine']))
        z.writestr(f'depth_{frame["units"]}.npy', npy_bytes(result.depth))
        z.writestr('model_raw_depth.npy', npy_bytes(result.raw_depth))
        if result.confidence is not None: z.writestr('confidence.npy', npy_bytes(result.confidence))
        if result.sky is not None: z.writestr('sky_mask.npy', npy_bytes(result.sky))
        z.writestr('frame.json', json.dumps(metadata(frame), ensure_ascii=False, indent=2, allow_nan=False))
        if spatial_analysis is not None:
            z.writestr('spatial_analysis.json', json.dumps(spatial_analysis, ensure_ascii=False, indent=2, allow_nan=False))
        ok, png = cv2.imencode('.png', result.bgr)
        if not ok: raise RuntimeError('PNG encoding failed')
        z.writestr('rgb_aligned.png', png.tobytes())
        z.writestr('depth_preview.jpg', base64.b64decode(frame['depth_jpeg']))
    return output.getvalue()


@app.get('/api/export.zip')
def download_bundle():
    f, records, result = app.state.service.snapshot()
    analysis = spatial_report_for_frame(app.state.service, f)
    return attachment(bundle_bytes(f, records, result, analysis), f'depthport_{f["engine"]}_frame_{f["frame_id"]}.zip', f['frame_id'], 'application/zip')


# v0.3 opt-in local Session/Replay. Every write is manual; no background recorder.
# Session IDs and frame indexes are validated by the storage implementation.
def local_session_store(request: Request) -> SessionStore:
    peer = request.client.host if request.client else ''
    try:
        permitted = ipaddress.ip_address(peer).is_loopback
    except ValueError:
        permitted = False
    if not permitted:
        raise HTTPException(403, 'Session archive is only available from localhost')
    store = getattr(request.app.state, 'session_store', None)
    if store is None:
        raise HTTPException(404, 'Local session storage is disabled; set ENABLE_SESSION_STORAGE=1')
    return store


class NewSession(BaseModel):
    label: str = Field(default='', max_length=80)


def session_failure(exc: SessionError):
    if isinstance(exc, SessionNotFound): code=404
    elif isinstance(exc, SessionLimit): code=413
    elif isinstance(exc, SessionIntegrity): code=409
    else: code=422
    return HTTPException(code,str(exc))


@app.get('/api/sessions/status')
def sessions_status(request: Request):
    store=local_session_store(request)
    return {'enabled':True,'manual_capture_only':True,
            'max_frames_per_session':120,'max_sessions':20,
            'model_inference_during_replay':False}


@app.get('/api/sessions')
def sessions_list(request: Request):
    store=local_session_store(request)
    return {'sessions':store.list_sessions()}


@app.post('/api/sessions',status_code=201)
def sessions_create(request: Request, body: NewSession):
    store=local_session_store(request)
    try:return store.create(body.label)
    except SessionError as exc:raise session_failure(exc) from exc


@app.get('/api/sessions/{sid}/frames')
def sessions_frames(request: Request,sid:str):
    store=local_session_store(request)
    try:return store.frames(sid)
    except SessionError as exc:raise session_failure(exc) from exc


@app.post('/api/sessions/{sid}/capture', status_code=201)
def sessions_capture(request: Request,sid:str):
    store=local_session_store(request)
    service=app.state.service
    # Check the user-requested session before preparing a large archive.
    try:store.frames(sid)
    except SessionError as exc:raise session_failure(exc) from exc
    with service.lock:
        if service.latest is None:
            raise HTTPException(409,'No completed inference frame to capture')
        f,records,result=service.latest,service.records,service.result
        # Serialization under the lock prevents mixing results on active RTSP.
        data=bundle_bytes(f,records,result,spatial_report_for_frame(service,f))
        frame=dict(f)
    try:return store.capture(sid,data,frame)
    except SessionError as exc:raise session_failure(exc) from exc


@app.get('/api/sessions/{sid}/frames/{index}/bundle.zip')
def sessions_bundle(request: Request,sid:str,index:int):
    store=local_session_store(request)
    try:data=store.bundle(sid,index)
    except SessionError as exc:raise session_failure(exc) from exc
    return Response(content=data,media_type='application/zip',headers={
        'Content-Disposition': f'attachment; filename="depthport-session-{sid}-{index:05d}.zip"'})


@app.get('/api/sessions/{sid}/frames/{index}/replay')
def sessions_replay(request: Request,sid:str,index:int):
    store=local_session_store(request)
    try:return store.replay(sid,index)
    except (SessionError,KeyError,ValueError,zipfile.BadZipFile) as exc:
        raise session_failure(SessionIntegrity('Saved frame cannot be safely replayed')) from exc


@app.get('/api/sessions/{sid}/consistency')
def sessions_consistency(request: Request, sid: str, max_pairs: int = 32):
    store = local_session_store(request)
    try:
        return store.temporal_consistency(sid, max_pairs=max_pairs)
    except SessionError as exc:
        raise session_failure(exc) from exc
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc


@app.get('/api/sessions/{sid}/consistency/report.json')
def sessions_consistency_export(request: Request, sid: str):
    store = local_session_store(request)
    try:
        report = store.temporal_consistency(sid)
    except SessionError as exc:
        raise session_failure(exc) from exc
    raw = (json.dumps(report, ensure_ascii=False, indent=2, allow_nan=False) + '\n').encode('utf-8')
    return Response(raw, media_type='application/json', headers={
        'Content-Disposition': f'attachment; filename="depthport-temporal-{sid}.json"'})


class TrackingRequest(BaseModel):
    mode: Literal['segment','detect']='segment'
    confidence: float = Field(default=.25, ge=.05, le=.95)
    max_frames: int = Field(default=12, ge=2, le=MAX_TRACK_FRAMES)


def _tracking_work(app: FastAPI, sid: str, job_id: str, mode: str, confidence: float, max_frames: int):
    try:
        # Isolated CPU-only offline job; does not call the live depth worker.
        store = app.state.session_store
        report = analyse_session(store,sid,mode=mode,confidence=confidence,
                                 max_frames=max_frames,device='cpu')
        store.save_tracking_report(sid,report)
        result={'state':'completed','id':job_id,'session_id':sid,
                'track_count':report['track_count'],'frames_considered':report['frames_considered']}
    except Exception as exc:
        result={'state':'error','id':job_id,'session_id':sid,'error':safe_error(exc)}
    with app.state.tracking_lock:
        if app.state.tracking_job.get('id')==job_id:
            app.state.tracking_job=result


@app.post('/api/sessions/{sid}/tracking',status_code=202)
def sessions_track(request: Request, sid: str, body: TrackingRequest):
    store=local_session_store(request)
    try:
        f=store.frames(sid)
        if len(f['frames'])<2:raise SessionError('Save two or more frames first')
    except SessionError as exc:raise session_failure(exc) from exc
    with request.app.state.tracking_lock:
        if request.app.state.tracking_job.get('state') in ('queued','running'):
            raise HTTPException(409,'One tracking job is already running')
        job_id=uuid.uuid4().hex
        request.app.state.tracking_job={'state':'running','id':job_id,'session_id':sid,
                                         'mode':body.mode}
        thread=threading.Thread(target=_tracking_work,
              args=(request.app,sid,job_id,body.mode,body.confidence,body.max_frames),
              name='depthport-offline-tracking',daemon=True)
        thread.start()
    return {'accepted':True,'id':job_id,'state':'running',
            'note':'Manual saved-frame analysis; CPU-only inference; no auto recording.'}


@app.get('/api/sessions/{sid}/tracking/status')
def sessions_track_status(request: Request, sid: str):
    store=local_session_store(request)
    try:store.frames(sid)
    except SessionError as exc:raise session_failure(exc) from exc
    with request.app.state.tracking_lock:
        job=request.app.state.tracking_job.copy()
    if job.get('session_id')!=sid:return {'state':'idle'}
    return job


@app.get('/api/sessions/{sid}/tracking/report.json')
def sessions_track_report(request: Request, sid: str, download: bool=False):
    store=local_session_store(request)
    try:report=store.tracking_report(sid)
    except SessionError as exc:raise session_failure(exc) from exc
    raw=(json.dumps(report,ensure_ascii=False,indent=2,allow_nan=False)+'\n').encode('utf-8')
    headers={'Content-Disposition':f'attachment; filename="depthport-tracking-{sid}.json"'} if download else {}
    return Response(raw,media_type='application/json',headers=headers)


@app.get('/api/sessions/{sid}/temporal')
def sessions_temporal(request: Request,sid:str):
    store=local_session_store(request)
    try:return store.temporal_summary(sid)
    except SessionError as exc:raise session_failure(exc) from exc


if __name__ == '__main__':
    import uvicorn
    uvicorn.run(app, host=os.getenv('HOST','127.0.0.1'), port=int(os.getenv('PORT','8000')), log_level='info')
