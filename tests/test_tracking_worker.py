# SPDX-License-Identifier: AGPL-3.0-only
"""Real subprocess contract tests; synthetic association tests need no RF packages."""
import importlib.util
import json
from pathlib import Path
import subprocess
import sys
import time
from types import SimpleNamespace

import cv2
import numpy as np
import pytest
from fastapi.testclient import TestClient

import depthport.api as api
import depthport.tracking as tracking
import depthport.tracking_worker as ipc
from depthport.tracking_protocol import PROTOCOL, VERSIONS, MAX_REPLY
from tests.test_tracking import new_store, moving_detector


@pytest.fixture
def stub(monkeypatch, tmp_path):
    real_popen = subprocess.Popen
    created = []
    def install(body):
        script = tmp_path / 'stub.py'
        script.write_text('import sys,json,time\nfrom pathlib import Path\n' +
            f'PROTOCOL={PROTOCOL!r}\nVERSIONS={VERSIONS!r}\n' + body, encoding='utf-8')
        def start(args, **kwargs):
            assert args[1:3] == ['-I', '-u']
            assert Path(args[3]).name == 'tracking_worker.py'
            assert 'RTSP_URL' not in kwargs['env'] and 'PYTHONPATH' not in kwargs['env']
            child = real_popen([args[0], '-I', '-u', str(script)], **kwargs)
            created.append(child)
            return child
        monkeypatch.setenv('TRACKING_WORKER_PYTHON', sys.executable)
        monkeypatch.setenv('RTSP_URL', 'private-source-placeholder')
        monkeypatch.setenv('PYTHONPATH', 'private-path-placeholder')
        monkeypatch.setattr(ipc.subprocess, 'Popen', start)
        return created
    yield install
    ipc.close_tracking_workers()
    assert all(child.poll() is not None for child in created)


READY = "q=json.loads(sys.stdin.readline())\nprint(json.dumps(dict(protocol=PROTOCOL,seq=q['seq'],ok=True,runtime=VERSIONS)),flush=True)\n"


def test_real_pipes_preserve_original_detection_data_and_shutdown(stub):
    children = stub(READY + "q=json.loads(sys.stdin.readline())\nprint(json.dumps(dict(protocol=PROTOCOL,seq=q['seq'],ok=True,matches=[dict(index=1,object_id='obj-0042')],unassociated_detections=1)),flush=True)\ntime.sleep(20)\n")
    mask = np.ones((20, 24), bool)
    detections = [dict(bbox=[1, 2, 6, 9], class_id=0, confidence=.9),
                  dict(bbox=[1, 2, 6, 9], class_id=0, confidence=.8, mask=mask, depth_median=3.25)]
    worker = ipc.TrackingWorker(timeout=2)
    objects, dropped = worker.step(np.zeros((20, 24, 3), np.uint8), detections)
    assert dropped == 1 and objects[0]['bbox'] == detections[1]['bbox']
    assert objects[0]['mask'] is mask and objects[0]['depth_median'] == 3.25
    assert 'object_id' not in detections[1]
    ipc.close_tracking_workers()
    assert children[0].poll() is not None and not ipc._active


@pytest.mark.parametrize('body,message', [
    ("print('not json',flush=True)\n", 'Invalid tracking worker response'),
    ("print('x'*70000,flush=True)\n", 'Invalid tracking worker response'),
    ("sys.exit(1)\n", 'Invalid tracking worker response'),
    ("time.sleep(20)\n", 'timed out'),
    ("q=json.loads(sys.stdin.readline())\nprint(json.dumps(dict(protocol=PROTOCOL,seq=q['seq'],ok=False,error='dependencies',detail='PRIVATE LOG')),flush=True)\n", 'dependencies'),
    ("q=json.loads(sys.stdin.readline())\nprint(json.dumps(dict(protocol=PROTOCOL,seq=q['seq']+1,ok=True,runtime=VERSIONS)),flush=True)\n", 'Invalid tracking worker response'),
])
def test_worker_failures_are_bounded_and_sanitized(stub, body, message):
    stub(body)
    start = time.monotonic()
    with pytest.raises(ipc.TrackingWorkerError, match=message) as err:
        ipc.TrackingWorker(timeout=1)
    assert 'PRIVATE' not in str(err.value) and time.monotonic() - start < 7
    assert not ipc._active


@pytest.mark.parametrize('matches', [
    [{'index': 2, 'object_id': 'obj-0001'}],
    [{'index': 0, 'object_id': 'obj-0001'}, {'index': 0, 'object_id': 'obj-0002'}],
    [{'index': 0, 'object_id': 'obj-0001'}, {'index': 1, 'object_id': 'obj-0001'}],
    [{'index': True, 'object_id': 'obj-0001'}],
    [{'index': 0, 'object_id': 'unsafe-id'}],
])
def test_invalid_association_never_enters_report(stub, matches):
    stub(READY + "q=json.loads(sys.stdin.readline())\n" +
        f"print(json.dumps(dict(protocol=PROTOCOL,seq=q['seq'],ok=True,matches={matches!r},unassociated_detections={2-len(matches)})),flush=True)\n")
    with ipc.TrackingWorker(timeout=2) as worker:
        with pytest.raises(ipc.TrackingWorkerError, match='association'):
            worker.step(np.zeros((20, 24, 3), np.uint8),
                        [dict(bbox=[1, 1, 4, 4], class_id=0, confidence=.9)] * 2)


def test_real_entry_dependency_failure_is_safe(monkeypatch):
    monkeypatch.setenv('TRACKING_WORKER_PYTHON', sys.executable)
    # Base CI intentionally contains no trackers. Do not assume an optional local install.
    import importlib.metadata
    if all(_installed(k, v) for k, v in VERSIONS.items()):
        pytest.skip('Optional real worker runtime installed')
    with pytest.raises(ipc.TrackingWorkerError, match='dependencies'):
        ipc.TrackingWorker(timeout=10)


def _installed(name, version):
    import importlib.metadata
    try:
        return importlib.metadata.version(name) == version
    except importlib.metadata.PackageNotFoundError:
        return False


def entry_module():
    spec = importlib.util.spec_from_file_location('worker_entry_fixture', Path(__file__).resolve().parents[1] / 'tools' / 'tracking_worker.py')
    module = importlib.util.module_from_spec(spec); spec.loader.exec_module(module)
    return module


def test_class_gating_empty_updates_reset_and_detection_indices():
    class Detections:
        def __init__(self, **kwargs): self.__dict__.update(kwargs)
    calls = []; trackers = []
    class Tracker:
        def __init__(self, frame_rate): self.n = 0; trackers.append(self)
        def update(self, inp, frame):
            self.n += 1; calls.append((self, inp.class_id.tolist(), len(inp.xyxy)))
            if len(inp.xyxy) == 0:
                return SimpleNamespace(xyxy=np.empty((0,4)), data={}, tracker_id=np.array([], dtype=int))
            # Deliberately reverse indices and supply unrelated Kalman boxes.
            inp.data = {k: v[::-1] for k, v in inp.data.items()}
            inp.xyxy = np.zeros_like(inp.xyxy)
            inp.tracker_id = np.ones(len(inp.xyxy), dtype=int)
            return inp
    association = entry_module().Association(np, SimpleNamespace(Detections=Detections), Tracker, 25)
    items = [dict(bbox=[1, 1, 4, 4], class_id=c, confidence=.9) for c in (0, 1)]
    frame = np.zeros((20, 24, 3), np.uint8)
    first = association.step(frame, items, False)
    assert [x['object_id'] for x in first['matches']] == ['obj-0001', 'obj-0002']
    second = association.step(frame, items[:1], False)
    assert second['matches'][0]['object_id'] == 'obj-0001'
    assert calls[-1][2] == 0  # absent class still advances lost age
    third = association.step(frame, items, True)
    assert [x['object_id'] for x in third['matches']] == ['obj-0003', 'obj-0004']
    assert len(trackers) == 4


def test_png_limits_before_decode():
    import base64, struct
    module = entry_module()
    bomb = b'\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR' + struct.pack('>II', 40000, 40000) + bytes(9)
    with pytest.raises(ValueError, match='dimensions'):
        module.decode_frame(base64.b64encode(bomb).decode(), None, None)
    ok, png = cv2.imencode('.png', np.zeros((20, 24, 3), np.uint8))
    assert module.decode_frame(base64.b64encode(png).decode(), cv2, np).shape == (20, 24, 3)


class FakeWorker:
    instances = []
    def __init__(self):
        self.runtime = VERSIONS; self.resets = []; self.closed = False
        self.instances.append(self)
    def step(self, bgr, objects, *, reset):
        self.resets.append(reset)
        return [dict(x, object_id=f'obj-{len(self.resets):04d}') for x in objects], 0
    def close(self): self.closed = True


def test_session_geometry_and_camera_group_resets(monkeypatch, tmp_path):
    monkeypatch.setattr(tracking, 'TrackingWorker', FakeWorker)
    store, sid = new_store(tmp_path, engines=['yolo26', 'da3-metric', 'da3-metric'])
    moving_detector.index = -1
    baseline = tracking.analyse_session(store, sid, detector=moving_detector)
    moving_detector.index = -1
    result = tracking.analyse_session(store, sid, detector=moving_detector, backend='roboflow-botsort')
    assert result['association_backend'] == 'roboflow-botsort'
    for a, b in zip(baseline['frames'], result['frames']):
        assert {k:v for k,v in a['objects'][0].items() if k != 'object_id'} == {k:v for k,v in b['objects'][0].items() if k != 'object_id'}
    assert FakeWorker.instances[-1].resets == [True, True, False]
    assert FakeWorker.instances[-1].closed
    moving_detector.index = -1
    with pytest.raises(ValueError):
        tracking.analyse_session(store, sid, detector=moving_detector, backend='arbitrary-command')


def test_api_dispatch_config_and_reject_executable_input(monkeypatch, tmp_path):
    store, sid = new_store(tmp_path)
    monkeypatch.setenv('ENABLE_SESSION_STORAGE', '1')
    monkeypatch.setenv('TRACKING_WORKER_PYTHON', sys.executable)
    monkeypatch.setattr(api, 'SessionStore', lambda root: store)
    monkeypatch.setattr(tracking, 'TrackingWorker', FakeWorker)
    def analyse(store, sid, **kwargs):
        moving_detector.index = -1
        return tracking.analyse_session(store, sid, detector=moving_detector, **kwargs)
    monkeypatch.setattr(api, 'analyse_session', analyse)
    with TestClient(api.app, client=('127.0.0.1', 4321)) as client:
        status = client.get('/api/sessions/status').json()
        assert status['tracking_worker_configured'] is True
        assert sys.executable not in json.dumps(status)
        assert client.post(f'/api/sessions/{sid}/tracking', json={'backend':'invalid'}).status_code == 422
        assert client.post(f'/api/sessions/{sid}/tracking', json={'python':'arbitrary-command'}).status_code == 422
        response = client.post(f'/api/sessions/{sid}/tracking', json={'backend':'roboflow-botsort','mode':'detect'})
        assert response.status_code == 202 and response.json()['backend'] == 'roboflow-botsort'
        for _ in range(100):
            job = client.get(f'/api/sessions/{sid}/tracking/status').json()
            if job['state'] != 'running': break
            time.sleep(.02)
        assert job['state'] == 'completed', job
        report = client.get(f'/api/sessions/{sid}/tracking/report.json').json()
        assert report['association_backend'] == 'roboflow-botsort'


def test_video_benchmark_worker_uses_cache_fps_and_closes_on_truncation(monkeypatch, tmp_path):
    from tests.test_video_tracking_benchmark import fixture_video
    from depthport.video_tracking_benchmark import run_video_tracker, VideoBenchmarkError
    video, _, cache = fixture_video(tmp_path)
    created = []
    class VideoWorker:
        runtime = VERSIONS
        def __init__(self, *, frame_rate):
            self.fps = frame_rate; self.closed = False; created.append(self)
        def step(self, frame, items):
            return [dict(x, object_id='obj-0001') for x in items], 0
        def close(self): self.closed = True
    monkeypatch.setattr(ipc, 'TrackingWorker', VideoWorker)
    report, metadata = run_video_tracker(video, cache, 'botsort-worker')
    assert len(report['frames']) == 4 and metadata['runtime'] == VERSIONS
    assert created[-1].fps == 10 and created[-1].closed
    cache['frames'] = cache['frames'][:2]
    with pytest.raises(VideoBenchmarkError, match='truncated'):
        run_video_tracker(video, cache, 'botsort-worker')
    assert created[-1].closed
