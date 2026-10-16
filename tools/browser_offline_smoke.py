# SPDX-License-Identifier: AGPL-3.0-only
"""Offline UI test, explicit FakeEngine + FastAPI TestClient transport bridge.
No model is downloaded. This is NOT an end-to-end browser-to-network test.
Requires test dependencies and Playwright; see tools/README.md.
"""
import base64
import io
import json
import os
import re
from pathlib import Path
import sys
import zipfile

os.environ.update(RTSP_URL='', CAMERA_INTRINSICS_FILE='', DEPTH_ENGINE='yolo26',
                  DEPTHPORT_ALLOWED_HOSTS='127.0.0.1,localhost,testserver',
                  DEPTH_DEVICE='cpu', DA3_CONF_PERCENTILE='0', DA3_EXCLUDE_SKY='1')
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
import cv2
import numpy as np
from fastapi.testclient import TestClient
from playwright.sync_api import sync_playwright
import depthport.api as backend
from tests.helpers import FakeEngine

viewer = (ROOT/'static/viewer.js').read_text(encoding='utf-8')
main = (ROOT/'static/main.js').read_text(encoding='utf-8')
html = (ROOT/'static/index.html').read_text(encoding='utf-8')
html = re.sub(r'<link[^>]*href="/static/style.css"[^>]*>',
              lambda _: '<style>'+(ROOT/'static/style.css').read_text(encoding='utf-8')+'</style>', html)
for script in ('i18n.js','viewer.js','main.js'):
    html = html.replace(f'<script src="/static/{script}"></script>',
                        '<script>'+(ROOT/'static'/script).read_text(encoding='utf-8')+'</script>')
bridge = r'''<script>
window.fetch=async function(url,opts={}){
 const req={url:String(url),method:opts.method||'GET',headers:opts.headers||{},body:null,files:[]};
 if(opts.body instanceof FormData){
  for(const [name,value] of opts.body.entries()){
   if(value instanceof File){const bytes=new Uint8Array(await value.arrayBuffer());let raw='';for(const v of bytes)raw+=String.fromCharCode(v);
    req.files.push({field:name,name:value.name,type:value.type,data:btoa(raw)});}
  }
 }else if(opts.body!=null){req.body=String(opts.body);}
 const r=await window.__localApi(req),raw=atob(r.data),bytes=new Uint8Array(raw.length);
 for(let i=0;i<raw.length;i++)bytes[i]=raw.charCodeAt(i);
 return new Response(r.status===204?null:bytes,{status:r.status,headers:r.headers});
};
</script>'''
html = html.replace('<script>'+viewer, bridge+'<script>'+viewer)
results = {
    'transport': 'Inline assets + explicit FastAPI TestClient bridge, NOT browser HTTP end-to-end',
    'model_backend': 'Explicit FakeEngine from tests/helpers.py, no actual weights or runtime inference',
    'real_model_inference': 'NOT TESTED', 'rtsp_camera': 'NOT TESTED',
}
errors, events = [], []
backend.make_engine = lambda key: FakeEngine(key, events)
with TestClient(backend.app) as client:
    def api(req):
        files = {f['field']: (f['name'], base64.b64decode(f['data']), f['type']) for f in req['files']} or None
        r = client.request(req['method'], req['url'], headers=req['headers'],
                           content=req['body'] if not files else None, files=files)
        return {'status': r.status_code, 'headers': dict(r.headers), 'data': base64.b64encode(r.content).decode()}
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path=os.getenv('CHROMIUM_PATH') or None,
                                  headless=True, args=['--no-sandbox', '--disable-dev-shm-usage'])
        page = browser.new_page(viewport={'width': 1600, 'height': 1160}, device_scale_factor=1)
        page.expose_function('__localApi', api)
        page.on('pageerror', lambda e: errors.append(str(e)))
        page.set_content(html, wait_until='load')
        page.wait_for_timeout(400)
        assert page.title().startswith('DepthPort | Monocular')
        assert page.locator('#engineSelect option').count() == 4
        assert page.locator('#exportBtn').is_disabled()
        assert not events, events
        results['initial_four_presets_no_model_download'] = 'PASS'

        page.locator('#inlineDemoBtn').click()
        page.wait_for_timeout(600)
        assert 'SYNTHETIC' in page.locator('#cloudTag').inner_text()
        assert 'SYNTHETIC' in page.locator('#cloudUnits').inner_text()
        assert page.locator('#exportBtn').is_disabled()
        canvas = page.locator('#cloudCanvas')
        before = canvas.screenshot()
        box = canvas.bounding_box()
        x, y = box['x']+box['width']*.5, box['y']+box['height']*.5
        page.mouse.move(x, y); page.mouse.down(); page.mouse.move(x+90, y+30, steps=12); page.mouse.up()
        page.wait_for_timeout(200)
        assert canvas.screenshot() != before
        page.mouse.wheel(0, -100); page.wait_for_timeout(150)
        page.locator('#resetBtn').click(); page.wait_for_timeout(250)
        results['synthetic_label_orbit_zoom_reset'] = 'PASS'
        results['renderer'] = page.locator('.viewer-panel .sub-tag').inner_text()
        page.wait_for_function("!document.getElementById('toast').classList.contains('show')", timeout=9000)
        (ROOT/'docs/assets').mkdir(parents=True, exist_ok=True)
        page.screenshot(path=str(ROOT/'docs/assets/preview.en.png'), full_page=True)
        # Switching language must not touch model/source state or execute inference.
        before_events = list(events)
        page.locator('#languageSelect').select_option('zh-TW')
        assert page.locator('html').get_attribute('lang') == 'zh-Hant'
        assert page.locator('#connectBtn').inner_text() == '◉ 連接相機'
        assert '合成' in page.locator('#cloudTag').inner_text()
        assert events == before_events
        page.screenshot(path=str(ROOT/'docs/assets/preview.zh-TW.png'), full_page=True)
        page.locator('#languageSelect').select_option('en')
        assert page.locator('#connectBtn').inner_text() == '◉ Connect camera'
        results['english_traditional_chinese_synthetic_ui'] = 'PASS'
        results['language_switch_does_not_infer'] = 'PASS' 

        img = np.full((180, 320, 3), (55, 140, 160), np.uint8)
        cv2.putText(img, 'TEST FIXTURE / NOT AI', (8, 90), cv2.FONT_HERSHEY_SIMPLEX, .45, (255, 255, 255), 1)
        _, buf = cv2.imencode('.png', img)
        page.locator('#fileInput').set_input_files({'name': 'fixture.png', 'mimeType': 'image/png', 'buffer': buf.tobytes()})
        page.wait_for_function("!document.getElementById('exportBtn').disabled", timeout=10000)
        assert 'TEST-DOUBLE-yolo26' in page.locator('#viewCaption').inner_text()
        first_hash = client.get('/api/frame.json').json()['source_sha256']
        results['image_upload_async_test_double'] = 'PASS'

        for key, units in [('da2-small', 'relative'), ('da3-small', 'relative'), ('da3-metric', 'estimated_m'), ('yolo26', 'estimated_m')]:
            page.locator('#engineSelect').select_option(key)
            page.locator('#applyModelBtn').click()
            page.wait_for_function("(key) => document.getElementById('viewCaption').textContent.includes('TEST-DOUBLE-'+key) && !document.getElementById('exportBtn').disabled", arg=key, timeout=10000)
            meta = client.get('/api/frame.json').json()
            assert meta['engine'] == key and meta['units'] == units
            assert meta['source_sha256'] == first_hash
            if units == 'relative':
                assert ('virtual units' if key == 'da2-small' else 'relative units') in page.locator('#depthRange').inner_text()
                assert ('VIRTUAL' if key == 'da2-small' else 'RELATIVE') in page.locator('#unitsBadge').inner_text()
            else:
                assert 'estimated m' in page.locator('#depthRange').inner_text()
            with page.expect_download() as download:
                page.locator('#bundleExportBtn').click()
            data = Path(download.value.path()).read_bytes()
            with zipfile.ZipFile(io.BytesIO(data)) as archive:
                saved = json.loads(archive.read('frame.json'))
                assert saved['engine'] == key and saved['units'] == units
                assert 'model_raw_depth.npy' in archive.namelist()
            results[f'switch_{key}_same_image_units_export'] = 'PASS'

        meta_before = client.get('/api/frame.json').json()
        events_before = list(events)
        page.locator('#languageSelect').select_option('zh-TW')
        assert '估計 m' in page.locator('#depthRange').inner_text()
        assert 'TEST-DOUBLE-yolo26' in page.locator('#viewCaption').inner_text()
        assert not page.locator('#exportBtn').is_disabled()
        assert client.get('/api/frame.json').json()['frame_id'] == meta_before['frame_id']
        assert events == events_before
        page.locator('#languageSelect').select_option('en')
        results['result_and_exports_preserved_across_language_change'] = 'PASS'
        old_id = client.get('/api/frame.json').json()['frame_id']
        page.locator('#reprocessBtn').click()
        page.wait_for_function("(old) => Number(document.getElementById('frameCount').textContent) > old && !document.getElementById('exportBtn').disabled", arg=old_id, timeout=10000)
        results['retained_image_reprocess'] = 'PASS'
        page.locator('#depthSlider').fill('1.5')
        assert 'not original geometry' in page.locator('#stretchNote').inner_text()
        page.locator('#depthMode').click(); page.locator('#rgbMode').click()
        results['color_and_view_only_stretch_controls'] = 'PASS'
        page.locator('#disconnectBtn').click(); page.wait_for_timeout(300)
        assert page.locator('#exportBtn').is_disabled()
        results['stop_clears_results'] = 'PASS'
        page.set_viewport_size({'width': 390, 'height': 844}); page.wait_for_timeout(300)
        assert page.evaluate('document.documentElement.scrollWidth <= window.innerWidth+1')
        page.locator('#languageSelect').select_option('zh-TW')
        assert page.evaluate('document.documentElement.scrollWidth <= window.innerWidth+1')
        results['mobile_390px_both_languages_no_horizontal_overflow'] = 'PASS'

        # Intentionally exercise the documented fallback renderer separately.
        fallback = browser.new_page(viewport={'width': 1366, 'height': 1040})
        fallback.expose_function('__localApi', api)
        fallback.on('pageerror', lambda e: errors.append(str(e)))
        override = '''<script>const orig=HTMLCanvasElement.prototype.getContext;
        HTMLCanvasElement.prototype.getContext=function(type,...args){
        if(type==='webgl'||type==='experimental-webgl')return null;return orig.call(this,type,...args);};</script>'''
        fallback.set_content(html.replace(bridge, override+bridge), wait_until='load')
        fallback.wait_for_timeout(200)
        assert 'CANVAS' in fallback.locator('.viewer-panel .sub-tag').inner_text()
        fallback.locator('#inlineDemoBtn').click(); fallback.wait_for_timeout(200)
        assert 'SYNTHETIC' in fallback.locator('#cloudTag').inner_text()
        results['forced_canvas2d_fallback'] = 'PASS'
        assert not errors, errors
        results['javascript_page_errors'] = errors
        results['engine_lifecycle_events'] = events
        browser.close()
(ROOT/'browser_test_report.json').write_text(json.dumps(results, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
print(json.dumps(results, ensure_ascii=False, indent=2))
