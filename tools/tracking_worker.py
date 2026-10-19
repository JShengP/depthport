#!/usr/bin/env python3
# SPDX-License-Identifier: AGPL-3.0-only
"""Private stdio worker entry. Run with isolated Python; never imports depth models."""
from contextlib import redirect_stdout
import base64
import importlib.metadata
import json
from pathlib import Path
import struct
import sys

# -I ignores PYTHONPATH; add only this source tree for the stdlib protocol.
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from depthport.tracking_protocol import PROTOCOL, VERSIONS, MAX_LINE, MAX_PNG, MAX_PIXELS, validate_detections


class Association:
    """Per-class trackers prevent cross-class IDs; resets never reuse public IDs."""
    def __init__(self, np, sv, factory, fps):
        self.np, self.sv, self.factory, self.fps = np, sv, factory, fps
        self.trackers = {}; self.ids = {}; self.next_id = 1

    def step(self, frame, items, reset):
        if reset:
            self.trackers.clear(); self.ids.clear()
        for item in items:
            cls = item['class_id']
            if cls not in self.trackers:
                self.trackers[cls] = self.factory(frame_rate=self.fps)
        matches = []
        for cls, tracker in self.trackers.items():
            indices = [i for i, item in enumerate(items) if item['class_id'] == cls]
            selected = [items[i] for i in indices]
            inp = self.sv.Detections(
                xyxy=self.np.array([x['bbox'] for x in selected], dtype=self.np.float32).reshape(-1, 4),
                confidence=self.np.array([x['confidence'] for x in selected], dtype=self.np.float32),
                class_id=self.np.full(len(selected), cls, dtype=self.np.int32),
                data={'depthport_detection_index': self.np.array(indices, dtype=self.np.int64)})
            result = tracker.update(inp, frame=frame)
            # Upstream's empty fast path returns Detections.empty() without data.
            if len(result.xyxy) == 0:
                continue
            if result.tracker_id is None:
                raise ValueError('Missing tracker IDs')
            for index, tid in zip(result.data['depthport_detection_index'], result.tracker_id):
                if int(tid) < 0:
                    continue
                key = (cls, int(tid))
                if key not in self.ids:
                    self.ids[key] = f'obj-{self.next_id:04d}'
                    self.next_id += 1
                matches.append({'index': int(index), 'object_id': self.ids[key]})
        matches.sort(key=lambda x: x['index'])
        return {'matches': matches, 'unassociated_detections': len(items) - len(matches)}


def decode_frame(raw, cv2, np):
    if not isinstance(raw, str) or len(raw) > ((MAX_PNG + 2) // 3) * 4:
        raise ValueError('PNG limit')
    png = base64.b64decode(raw, validate=True)
    if len(png) > MAX_PNG or len(png) < 33 or png[:16] != b'\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR':
        raise ValueError('PNG header')
    width, height = struct.unpack('>II', png[16:24])
    if not 1 <= width <= 4096 or not 1 <= height <= 4096 or width * height > MAX_PIXELS:
        raise ValueError('PNG dimensions')
    frame = cv2.imdecode(np.frombuffer(png, np.uint8), cv2.IMREAD_COLOR)
    if frame is None or frame.shape != (height, width, 3):
        raise ValueError('PNG decode')
    return frame


def main():
    association = None; runtime = None
    for raw in iter(lambda: sys.stdin.buffer.readline(MAX_LINE + 1), b''):
        seq = None; fatal = False
        try:
            if len(raw) > MAX_LINE or not raw.endswith(b'\n'):
                raise ValueError()
            request = json.loads(raw)
            if (not isinstance(request, dict) or request.get('protocol') != PROTOCOL or
                type(request.get('seq')) is not int or request['seq'] < 1):
                raise ValueError()
            seq = request['seq']
            if request.get('op') == 'init' and association is None:
                fps = request.get('frame_rate')
                if type(fps) not in (float, int) or not 0 < fps <= 240:
                    raise ValueError()
                try:
                    runtime = {name: importlib.metadata.version(name) for name in VERSIONS}
                    if runtime != VERSIONS:
                        raise ImportError()
                    with redirect_stdout(sys.stderr):
                        import cv2
                        import numpy as np
                        import supervision as sv
                        from trackers import BoTSORTTracker
                    cv2.setNumThreads(1)
                    association = Association(np, sv, BoTSORTTracker, fps)
                except Exception:
                    response = {'ok': False, 'error': 'dependencies'}; fatal = True
                else:
                    response = {'ok': True, 'runtime': runtime}
            elif request.get('op') == 'step' and association is not None:
                if type(request.get('reset')) is not bool:
                    raise ValueError()
                frame = decode_frame(request.get('png'), cv2, np)
                items = request.get('detections')
                validate_detections(items, frame.shape[1], frame.shape[0])
                try:
                    with redirect_stdout(sys.stderr):
                        response = dict(association.step(frame, items, request['reset']), ok=True)
                except Exception:
                    response = {'ok': False, 'error': 'tracking'}; fatal = True
            else:
                raise ValueError()
        except Exception:
            response = {'ok': False, 'error': 'request'}; fatal = True
        response.update(protocol=PROTOCOL, seq=seq)
        sys.stdout.write(json.dumps(response, separators=(',', ':'), allow_nan=False) + '\n')
        sys.stdout.flush()
        if fatal:
            return 1
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
