# SPDX-License-Identifier: AGPL-3.0-only
"""One disposable subprocess per offline analysis; no NumPy 2 imports here."""
from __future__ import annotations

import atexit
import base64
import json
import math
import os
from pathlib import Path
import queue
import re
import subprocess
import threading

from depthport.tracking_protocol import PROTOCOL, VERSIONS, MAX_LINE, MAX_REPLY, MAX_PNG, validate_detections


class TrackingWorkerError(RuntimeError):
    """Only fixed, public-safe messages cross the API boundary."""


_active = set()
_active_lock = threading.Lock()


def worker_configured():
    return bool(os.environ.get('TRACKING_WORKER_PYTHON', '').strip())


def close_tracking_workers():
    with _active_lock:
        clients = list(_active)
    for client in clients:
        client.close()


atexit.register(close_tracking_workers)


class TrackingWorker:
    def __init__(self, *, frame_rate=30., timeout=30.):
        if not math.isfinite(frame_rate) or not 0 < frame_rate <= 240 or not 0 < timeout <= 120:
            raise ValueError('Invalid worker FPS or timeout')
        executable = os.environ.get('TRACKING_WORKER_PYTHON', '').strip()
        if not executable or not Path(executable).is_absolute() or not Path(executable).is_file():
            raise TrackingWorkerError('Configure TRACKING_WORKER_PYTHON with the isolated worker Python executable')
        self.process = None
        self.sequence = 0
        self.timeout = timeout
        self.runtime = None
        # Do not pass camera URLs, API keys, model settings or PYTHONPATH to child.
        keys = ('PATH', 'SYSTEMROOT', 'WINDIR', 'TEMP', 'TMP', 'TMPDIR', 'HOME', 'USERPROFILE', 'LANG')
        env = {key: os.environ[key] for key in keys if key in os.environ}
        env.update(OMP_NUM_THREADS='1', OPENBLAS_NUM_THREADS='1', MKL_NUM_THREADS='1')
        script = Path(__file__).resolve().parents[1] / 'tools' / 'tracking_worker.py'
        try:
            self.process = subprocess.Popen([executable, '-I', '-u', str(script)],
                stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
                env=env, cwd=script.parent, bufsize=0)
            with _active_lock:
                _active.add(self)
            reply = self._exchange({'op': 'init', 'frame_rate': frame_rate})
            if reply.get('runtime') != VERSIONS:
                raise TrackingWorkerError('Tracking worker package versions do not match the validated runtime')
            self.runtime = dict(reply['runtime'])
        except TrackingWorkerError:
            self.close()
            raise
        except Exception:
            self.close()
            raise TrackingWorkerError('Could not start tracking worker') from None

    def _exchange(self, payload):
        if self.process is None or self.process.poll() is not None:
            self.close()
            raise TrackingWorkerError('Tracking worker exited')
        self.sequence += 1
        packet = dict(payload, protocol=PROTOCOL, seq=self.sequence)
        raw = (json.dumps(packet, separators=(',', ':'), allow_nan=False) + '\n').encode('utf-8')
        if len(raw) > MAX_LINE:
            self.close()
            raise TrackingWorkerError('Tracking worker request exceeds size limit')
        result = queue.Queue(maxsize=1)
        process = self.process
        def io():
            try:
                view = memoryview(raw)
                while view:
                    written = process.stdin.write(view)
                    if not written:
                        raise OSError('Closed pipe')
                    view = view[written:]
                line = process.stdout.readline(MAX_REPLY + 1)
                result.put(line)
            except Exception:
                result.put(None)
        threading.Thread(target=io, daemon=True, name='depthport-tracking-ipc').start()
        try:
            line = result.get(timeout=self.timeout)
        except queue.Empty:
            self.close()
            raise TrackingWorkerError('Tracking worker timed out') from None
        try:
            if not line or len(line) > MAX_REPLY or not line.endswith(b'\n'):
                raise ValueError()
            reply = json.loads(line)
            if (not isinstance(reply, dict) or reply.get('protocol') != PROTOCOL or
                type(reply.get('seq')) is not int or reply['seq'] != self.sequence):
                raise ValueError()
        except (ValueError, UnicodeError):
            self.close()
            raise TrackingWorkerError('Invalid tracking worker response') from None
        if reply.get('ok') is not True:
            code = reply.get('error')
            self.close()
            message = {'dependencies': 'Tracking worker dependencies are missing or incompatible',
                       'request': 'Tracking worker rejected invalid input',
                       'tracking': 'Tracking worker could not associate this frame'}.get(code, 'Tracking worker failed')
            raise TrackingWorkerError(message)
        return reply

    def step(self, frame, detections, *, reset=False):
        # Import only the application's NumPy/OpenCV; worker has its own copies.
        import cv2
        import numpy as np
        if (not isinstance(frame, np.ndarray) or frame.dtype != np.uint8 or frame.ndim != 3 or frame.shape[2] != 3):
            raise TrackingWorkerError('Tracking requires an aligned uint8 BGR frame')
        height, width = frame.shape[:2]
        clean = [{'bbox': list(x['bbox']), 'confidence': x['confidence'], 'class_id': x['class_id']} for x in detections]
        try:
            validate_detections(clean, width, height)
        except ValueError:
            raise TrackingWorkerError('Invalid tracking detections or frame dimensions') from None
        ok, png = cv2.imencode('.png', frame)
        if not ok or png.nbytes > MAX_PNG:
            raise TrackingWorkerError('Tracking frame exceeds PNG size limit')
        reply = self._exchange({'op': 'step', 'png': base64.b64encode(png).decode('ascii'),
                                'detections': clean, 'reset': bool(reset)})
        matches = reply.get('matches')
        try:
            if not isinstance(matches, list) or len(matches) > len(detections):
                raise ValueError()
            indices = set(); ids = set(); objects = []
            for match in matches:
                index = match['index']; tid = match['object_id']
                if (type(index) is not int or not 0 <= index < len(detections) or index in indices or
                    not isinstance(tid, str) or not re.fullmatch(r'obj-[0-9]{4,12}', tid) or tid in ids):
                    raise ValueError()
                indices.add(index); ids.add(tid)
                objects.append(dict(detections[index], object_id=tid))
            dropped = reply.get('unassociated_detections')
            if type(dropped) is not int or dropped != len(detections) - len(matches):
                raise ValueError()
        except (ValueError, KeyError, TypeError):
            self.close()
            raise TrackingWorkerError('Invalid tracking worker association') from None
        return objects, dropped

    def close(self):
        process = self.process
        self.process = None
        if process is not None:
            if process.poll() is None:
                process.terminate()
                try:
                    process.wait(timeout=2)
                except subprocess.TimeoutExpired:
                    process.kill()
                    process.wait(timeout=2)
            for stream in (process.stdin, process.stdout):
                if stream is not None:
                    stream.close()
        with _active_lock:
            _active.discard(self)

    def __enter__(self):
        return self

    def __exit__(self, *args):
        self.close()
