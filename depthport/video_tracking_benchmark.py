# SPDX-License-Identifier: AGPL-3.0-only
"""Opt-in offline, fixed-detection comparison of multiple 2D MOT backends.

No network, no camera URLs, no model weights, no depth re-inference.
Roboflow Trackers is an OPTIONAL dependency, preferably installed separately.
"""
from __future__ import annotations

import hashlib
import json
import math
import statistics
import time
from pathlib import Path

import cv2
import numpy as np

from depthport.tracking import associate
from depthport.tracking_eval import evaluate, GT_FORMAT, PRED_FORMAT

CACHE_FORMAT = 'depthport.video-detections.v1'
MAX_VIDEO_FRAMES = 1800
MAX_OBJECTS = 64
MAX_CACHE_BYTES = 32 * 1024 * 1024
TRACKER_OPTIONS = ('baseline', 'bytetrack', 'botsort', 'botsort-worker')


class VideoBenchmarkError(ValueError):
    pass


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open('rb') as file:
        while chunk := file.read(1024 * 1024):
            h.update(chunk)
    return h.hexdigest()


def read_cache(path: Path) -> dict:
    if path.is_symlink() or not path.is_file() or path.stat().st_size > MAX_CACHE_BYTES:
        raise VideoBenchmarkError('Cache must be a local regular JSON file <=32 MiB')
    try:
        d = json.loads(path.read_text(encoding='utf-8'))
    except (ValueError, OSError, UnicodeError) as e:
        raise VideoBenchmarkError('Invalid detection cache JSON') from e
    if not isinstance(d, dict) or d.get('format') != CACHE_FORMAT:
        raise VideoBenchmarkError('Unsupported detection cache format')
    if not isinstance(d.get('video_sha256'), str) or len(d['video_sha256']) != 64 or any(c not in '0123456789abcdef' for c in d['video_sha256']):
        raise VideoBenchmarkError('Missing/invalid video SHA-256')
    if type(d.get('width')) is not int or type(d.get('height')) is not int or not (1 <= d['width'] <= 8192 and 1 <= d['height'] <= 8192):
        raise VideoBenchmarkError('Invalid video dimensions')
    fps = d.get('fps')
    if type(fps) not in (int,float) or not math.isfinite(fps) or not (0 < fps <= 240):
        raise VideoBenchmarkError('Invalid video FPS')
    frames = d.get('frames')
    if not isinstance(frames, list) or not 1 <= len(frames) <= MAX_VIDEO_FRAMES:
        raise VideoBenchmarkError(f'Frame count must be 1..{MAX_VIDEO_FRAMES}')
    for i, frame in enumerate(frames, 1):
        if not isinstance(frame, dict) or type(frame.get('index')) is not int or frame['index'] != i:
            raise VideoBenchmarkError('Frames must be dense, sequential and 1-indexed')
        objs = frame.get('detections')
        if not isinstance(objs, list) or len(objs) > MAX_OBJECTS:
            raise VideoBenchmarkError('Too many detections per frame')
        for ob in objs:
            if not isinstance(ob, dict) or type(ob.get('class_id')) is not int or ob['class_id'] < 0:
                raise VideoBenchmarkError('Invalid class ID')
            score = ob.get('confidence')
            if type(score) not in (int, float) or not math.isfinite(score) or not 0 <= score <= 1:
                raise VideoBenchmarkError('Invalid confidence')
            b = ob.get('bbox')
            if not isinstance(b, list) or len(b) != 4 or any(type(x) not in (float,int) or not math.isfinite(x) for x in b):
                raise VideoBenchmarkError('Invalid bbox')
            x0,y0,x1,y1 = b
            if not (0 <= x0 < x1 <= d['width'] and 0 <= y0 < y1 <= d['height']):
                raise VideoBenchmarkError('Out-of-bounds bbox')
    return d


def validate_tracker_parameters(method: str, parameters: dict | None) -> dict:
    """Only bounded, explicit direct-library overrides; worker defaults stay separate."""
    if parameters is None:
        return {}
    if method not in ('bytetrack', 'botsort') or not isinstance(parameters, dict):
        raise VideoBenchmarkError('Parameters require a direct ByteTrack/BoT-SORT backend')
    allowed = {'track_activation_threshold', 'high_conf_det_threshold', 'lost_track_buffer'}
    if set(parameters) - allowed:
        raise VideoBenchmarkError('Unsupported tracker parameter')
    for name, value in parameters.items():
        if name == 'lost_track_buffer':
            if type(value) is not int or not 0 <= value <= 300:
                raise VideoBenchmarkError('Lost track buffer must be 0..300 frames at 30 FPS')
        elif type(value) not in (int, float) or not math.isfinite(value) or not 0 <= value <= 1:
            raise VideoBenchmarkError('Tracker confidence thresholds must be finite in 0..1')
        elif name == 'high_conf_det_threshold' and value <= .1:
            raise VideoBenchmarkError('High confidence split must exceed the backend low-confidence floor .1')
    return dict(parameters)


def make_tracker(method: str, *, fps: float, parameters: dict | None = None):
    overrides = validate_tracker_parameters(method, parameters)
    if method == 'baseline':
        return None
    if method == 'botsort-worker':
        from depthport.tracking_worker import TrackingWorker
        return TrackingWorker(frame_rate=fps)
    if method not in TRACKER_OPTIONS:
        raise VideoBenchmarkError('Unsupported tracker')
    try:
        from trackers import ByteTrackTracker, BoTSORTTracker
        import supervision as sv
    except ImportError as e:
        raise VideoBenchmarkError('Install optional trackers==2.6.1 in a separate NumPy 2.x benchmark venv') from e
    cls = ByteTrackTracker if method == 'bytetrack' else BoTSORTTracker
    try:
        import importlib.metadata
        version = importlib.metadata.version('trackers')
    except Exception:
        version = 'unknown'
    # Fail loudly on other API generations until adapter contract is validated.
    if version != '2.6.1':
        raise VideoBenchmarkError(f'Expected Roboflow trackers 2.6.1, installed {version}')
    tracker = cls(frame_rate=fps, **overrides)
    return tracker


def _one_step(method: str, tracker, active: dict, next_id: int, detections: list[dict], frame, index: int):
    if method == 'baseline':
        # Deep copy: baseline association adds object_id and must not affect the other runs.
        clean = [{'bbox': list(x['bbox']), 'class_id': x['class_id'], 'confidence': x['confidence']} for x in detections]
        items, active, next_id = associate(clean, active, image_shape=frame.shape[:2], step=index, next_id=next_id)
        return items, active, next_id, 0

    if method == 'botsort-worker':
        items, dropped = tracker.step(frame, detections)
        return items, active, next_id, dropped

    import supervision as sv
    xyxy = np.array([d['bbox'] for d in detections], dtype=np.float32).reshape(-1,4)
    scores = np.array([d['confidence'] for d in detections], dtype=np.float32)
    clsids = np.array([d['class_id'] for d in detections], dtype=np.int32)
    inp = sv.Detections(xyxy=xyxy,confidence=scores,class_id=clsids)
    result = tracker.update(inp, frame=frame if method == 'botsort' else None)
    if result.tracker_id is None:
        raise VideoBenchmarkError(f'{method} did not supply tracker_id')
    items=[]; unconfirmed=0
    for box, score, cid, tid in zip(result.xyxy, result.confidence, result.class_id, result.tracker_id):
        if int(tid)<0:
            unconfirmed+=1
            continue
        items.append({'bbox':[float(v) for v in box], 'confidence':float(score),
                      'class_id':int(cid), 'object_id':f'{method}-{int(tid)}'})
    return items, active, next_id, unconfirmed


def run_video_tracker(video: Path, data: dict, method: str, *, parameters: dict | None = None) -> tuple[dict,dict]:
    if method not in TRACKER_OPTIONS:
        raise VideoBenchmarkError('Unsupported tracker')
    if not video.is_file() or video.is_symlink():
        raise VideoBenchmarkError('Video must be a local regular file')
    if sha256_file(video) != data['video_sha256']:
        raise VideoBenchmarkError('Video SHA-256 differs from cached detector input')
    fps=data['fps']; tracker=make_tracker(method,fps=fps,parameters=parameters)
    cap=None
    active={};next_id=1;frames=[];timings=[];decode=[];unconfirmed=0
    try:
        cap=cv2.VideoCapture(str(video))
        if not cap.isOpened():
            raise VideoBenchmarkError('Could not open offline video')
        for item in data['frames']:
            t0=time.perf_counter()
            ok, img=cap.read()
            decode.append((time.perf_counter()-t0)*1000)
            if not ok or img.shape[:2] != (data['height'],data['width']):
                raise VideoBenchmarkError('Video decode ended or frame size changed before detection cache')
            t1=time.perf_counter()
            detections, active, next_id, ignored = _one_step(method,tracker,active,next_id,item['detections'],img,item['index'])
            ms=(time.perf_counter()-t1)*1000
            timings.append(ms);unconfirmed+=ignored
            frames.append({'index':item['index'], 'objects':detections})
        ok, _ = cap.read()
        if ok:
            raise VideoBenchmarkError('Detection cache does not cover the entire video; truncated comparison rejected')
    finally:
        if cap is not None:
            cap.release()
        if method == 'botsort-worker':
            tracker.close()
    def percentiles(xs):
        return {'mean_ms':round(statistics.mean(xs),4),
                'p50_ms':round(float(np.percentile(xs,50)),4),
                'p95_ms':round(float(np.percentile(xs,95)),4),
                'total_ms':round(sum(xs),4)}
    report={'format':PRED_FORMAT,'session_id':'video-'+data['video_sha256'][:24],
            'sampling':'dense_video', 'tracker':method,
            'source':'offline_video_fixed_detection_cache', 'frames':frames}
    meta={'method':method,'frames':len(frames),'fps_metadata':fps,
          'tracker_update':percentiles(timings), 'decode':percentiles(decode),
          'unconfirmed_detections':unconfirmed,
          'unassociated_detections':unconfirmed if method == 'botsort-worker' else None,
          'latency_scope':'association step including PNG/IPC for worker; detector/video decoding and worker startup excluded',
          'note':'No ReID or metric XYZ; BoT-SORT receives full BGR frames for camera motion compensation.'}
    if method == 'botsort-worker':
        meta['runtime']=tracker.runtime
    if parameters is not None:
        meta['parameter_overrides']=dict(parameters)
    if method in ('bytetrack','botsort'):
        fields=('track_activation_threshold','high_conf_det_threshold','maximum_frames_without_update',
                'maximum_time_without_update','minimum_consecutive_frames','enable_cmc','cmc_method')
        meta['effective_tracker_parameters']={key:getattr(tracker,key) for key in fields if hasattr(tracker,key)}
    return report,meta


def benchmark(video: Path, cache: dict, *, methods=('baseline', 'bytetrack', 'botsort'), gt=None, iou=.5) -> dict:
    if len(set(methods)) != len(methods) or not methods or any(m not in TRACKER_OPTIONS for m in methods):
        raise VideoBenchmarkError('Unique supported methods required')
    result={'format':'depthport.video-tracker-benchmark.v1',
            'video_sha256':cache['video_sha256'],'detector':cache.get('detector'),
            'frame_count':len(cache['frames']), 'fps_metadata':cache['fps'],
            'fixed_detection_cache':True,'trackers':{},
            'disclaimer':'Synthetic-only CI; observed real-video tracking accuracy requires independently annotated GT.'}
    for name in methods:
        predictions,meta=run_video_tracker(video,cache,name)
        if gt is not None:
            if gt.get('format')!=GT_FORMAT:
                raise VideoBenchmarkError('Unsupported GT format')
            score=evaluate(predictions,gt,iou_threshold=iou,max_frames=MAX_VIDEO_FRAMES)
            meta['evaluation']={'summary':score['summary'],'by_scenario':score['by_scenario'],
                                'metric_note':score['metric_note'], 'annotation_frames':score['annotation_frames']}
        result['trackers'][name]={'metadata':meta,'predictions':predictions}
    return result
