# SPDX-License-Identifier: AGPL-3.0-only
"""Start the actual local HTTP server and check routes without loading any model.
This is not a browser renderer, model-inference or RTSP test.
"""
import json
import os
from pathlib import Path
import socket
import subprocess
import sys
import time
from urllib.error import URLError
from urllib.request import urlopen

ROOT = Path(__file__).resolve().parents[1]
with socket.socket() as sock:
    sock.bind(('127.0.0.1', 0))
    port = sock.getsockname()[1]
env = dict(os.environ, HOST='127.0.0.1', PORT=str(port), RTSP_URL='',
           CAMERA_INTRINSICS_FILE='', DEPTH_ENGINE='yolo26')
log_path = ROOT/'http_smoke_server.log'
report = {'transport': 'Real Uvicorn + Python HTTP client over 127.0.0.1',
          'browser_http_end_to_end': 'NOT TESTED', 'real_model_inference': 'NOT TESTED'}
with log_path.open('w') as log:
    process = subprocess.Popen([sys.executable, 'app.py'], cwd=ROOT, env=env, stdout=log, stderr=subprocess.STDOUT)
    try:
        def read(path):
            with urlopen(f'http://127.0.0.1:{port}{path}', timeout=2) as r:
                return r.read(), dict(r.headers)
        deadline = time.monotonic()+12
        while True:
            try: content,_=read('/api/status'); break
            except URLError:
                if process.poll() is not None or time.monotonic()>deadline: raise
                time.sleep(.15)
        status=json.loads(content)
        assert not status['model_loaded'] and status['model_state']=='not_loaded'
        assert status['mode']=='none'
        content,_=read('/api/models'); assert len(json.loads(content)['models'])==4
        content,_=read('/api/about'); assert json.loads(content)['license']=='AGPL-3.0-only'
        content,_=read('/api/license'); assert b'GNU AFFERO' in content
        content,headers=read('/'); assert b'DepthPort' in content
        for name in ('main.js','viewer.js','style.css','i18n.js','favicon.svg'):
            content,_=read('/static/'+name)
            assert content==(ROOT/'static'/name).read_bytes()
        report['server_start_no_model_load']='PASS'
        report['http_status_models_about_license_index_and_static_assets']='PASS'
        report['bound_to_loopback']=True
    finally:
        process.terminate()
        try: process.wait(timeout=5)
        except subprocess.TimeoutExpired: process.kill(); process.wait(timeout=5)
(ROOT/'http_smoke_report.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps(report,indent=2))
