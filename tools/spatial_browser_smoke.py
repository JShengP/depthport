# SPDX-License-Identifier: AGPL-3.0-only
"""DepthPort v0.2 browser/UI smoke. Explicit fake AI + in-memory TestClient bridge.
No real model, GPU, RTSP, full HTTP browser route or field metric accuracy.
"""
from __future__ import annotations
import base64
import json
import os
from pathlib import Path
import re
import sys
import time
os.environ.update(RTSP_URL='', CAMERA_INTRINSICS_FILE='', DEPTH_ENGINE='yolo26',
                  DEPTHPORT_ALLOWED_HOSTS='127.0.0.1,localhost,testserver',
                  DEPTH_DEVICE='cpu', DA3_CONF_PERCENTILE='0', DA3_EXCLUDE_SKY='1')
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT))
import cv2
import numpy as np
from fastapi.testclient import TestClient
from playwright.sync_api import sync_playwright
import depthport.api as backend
from tests.helpers import FakeEngine

html=(ROOT/'static/spatial.html').read_text(encoding='utf-8')
for file in ('spatial.css',):
    html=html.replace(f'<link rel="stylesheet" href="/static/{file}"/>',
                      '<style>'+(ROOT/'static'/file).read_text(encoding='utf-8')+'</style>')
for file in ('i18n.js','viewer.js','spatial.js'):
    html=html.replace(f'<script src="/static/{file}"></script>',
                      '<script>'+(ROOT/'static'/file).read_text(encoding='utf-8')+'</script>')
bridge=r'''<script>
window.fetch=async function(url,opts={}) {
 const req={url:String(url),method:opts.method||'GET',headers:opts.headers||{},body:opts.body?String(opts.body):null};
 const answer=await window.__localApi(req);
 const raw=atob(answer.data),bytes=new Uint8Array(raw.length);
 for(let i=0;i<raw.length;i++)bytes[i]=raw.charCodeAt(i);
 return new Response(answer.status===204?null:bytes,{status:answer.status,headers:answer.headers});
};
</script>'''
html=html.replace('<script>'+ (ROOT/'static/spatial.js').read_text(encoding='utf-8')+'</script>',bridge+'<script>'+ (ROOT/'static/spatial.js').read_text(encoding='utf-8')+'</script>')
backend.make_engine=lambda key:FakeEngine(key)
# Explicit fake object demo only. NOT real Ultralytics inference.
def semantic_fake(bgr,depth_result,mode,device,confidence):
    overlay=bgr.copy()
    cv2.rectangle(overlay,(20,30),(150,110),(70,160,200),2)
    ok,png=cv2.imencode('.png',overlay)
    assert ok
    from depthport.semantic import fuse_instances
    mask=np.zeros(depth_result.depth.shape,bool)
    mask[30:110,20:150]=True
    obj={'class_id':0,'label':'TEST MASK (NOT AI)','confidence':.9,
         'bbox':[20,30,150,110],'mask':mask,'mask_kind':'instance_mask','mask_resized':False}
    entries,_=fuse_instances(depth_result,[obj])
    return {'mode':mode,'model':'EXPLICIT_FAKE_SEMANTIC_NOT_AI','objects':entries,
            'overlay_png_b64':base64.b64encode(png).decode('ascii'),'is_trained_model':False}
backend.run_ultralytics_semantic=semantic_fake
results={'data_source':'EXPLICIT_FAKE_DEPTH_AND_SEMANTIC (NOT AI)',
         'transport':'FastAPI TestClient inline bridge (NOT browser HTTP)',
         'real_models':'NOT TESTED','rtsp':'NOT TESTED'}
errors=[]
with TestClient(backend.app) as client:
    # Preview uses a constructed simple test pattern; NOT a camera scene.
    bgr=np.zeros((180,320,3),dtype=np.uint8)
    bgr[:]=(35,80,130)
    cv2.rectangle(bgr,(20,30),(150,110),(75,135,190),-1)
    cv2.putText(bgr,'FAKE TEST DATA',(20,140),cv2.FONT_HERSHEY_SIMPLEX,.55,(255,255,255),2)
    ok,png=cv2.imencode('.png',bgr)
    response=client.post('/api/image',files={'file':('synthetic_fixture.png',png.tobytes(),'image/png')})
    assert response.status_code==202
    end=time.monotonic()+5
    while time.monotonic()<end:
        if client.get('/api/status').json()['has_result']:break
        time.sleep(.04)
    assert client.get('/api/status').json()['has_result']
    def bridge_api(req):
        r=client.request(req['method'],req['url'],headers=req['headers'],content=req['body'])
        return {'status':r.status_code,'headers':dict(r.headers),'data':base64.b64encode(r.content).decode('ascii')}
    with sync_playwright() as p:
        browser=p.chromium.launch(executable_path=os.getenv('CHROMIUM_PATH') or '/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
        page=browser.new_page(viewport={'width':1500,'height':1150},device_scale_factor=1)
        page.expose_function('__localApi',bridge_api)
        page.on('pageerror',lambda error:errors.append(str(error)))
        page.set_content(html,wait_until='load')
        page.wait_for_function("document.getElementById('rgbImage').complete && document.getElementById('rgbImage').naturalWidth>0",timeout=10000)
        assert page.locator('#frameId').inner_text()=='#1'
        assert page.locator('#compareCards .empty').count()==1
        rgb=page.locator('#rgbImage')
        rgb.click(position={'x':50,'y':50})
        page.wait_for_function("document.getElementById('pixelXY').textContent.includes('(')",timeout=5000)
        assert 'test_intrinsics' not in page.locator('#pixelK').inner_text()
        assert 'hfov_estimate' in page.locator('#pixelK').inner_text()
        page.locator('#setPointA').click()
        rgb.click(position={'x':100,'y':90})
        page.locator('#setPointB').click()
        page.locator('#measureBtn').click()
        page.wait_for_function("document.getElementById('measurementResult').textContent.includes('unverified_model_estimate')",timeout=5000)
        results['point_inspector_and_measurement']='PASS (fake depth, unverified estimate)'
        page.locator('#compareBtn').click()
        page.wait_for_function("document.getElementById('compareStatus').textContent.includes('completed 4/4')",timeout=15000)
        page.wait_for_function("document.querySelectorAll('#compareCards article.card').length===4",timeout=5000)
        assert page.locator('#compareCards .cloudmini').count()==4
        assert page.locator('#compareDownload').is_enabled()
        results['four_model_comparison']='PASS (sequential fake backends; no weights)'
        page.locator('#semanticBtn').click()
        page.wait_for_function("document.getElementById('semanticStatus').textContent.includes('completed')",timeout=12000)
        page.wait_for_function("document.querySelectorAll('#semanticObjects button').length===1",timeout=5000)
        assert 'NOT AI' in page.locator('#objectInfo').inner_text()
        results['semantic_mask_to_points']='PASS (explicit fake mask; no YOLO)'
        page.locator('#fitPlane').click()
        page.wait_for_function("document.getElementById('planeResult').textContent.includes('candidate_plane')",timeout=5000)
        results['candidate_plane']='PASS (fake flat depth)'
        page.locator('#languageSelect').select_option('zh-TW')
        assert '空間分析工作台' in page.locator('h1').inner_text()
        assert '量測' in page.locator('#calibration h2').inner_text()
        results['traditional_chinese']='PASS'
        (ROOT/'artifacts/spatial').mkdir(exist_ok=True,parents=True)
        page.screenshot(path=str(ROOT/'artifacts/spatial/spatial-preview.zh-TW.png'),full_page=True)
        page.locator('#languageSelect').select_option('en')
        assert 'Spatial Analysis Lab' in page.locator('h1').inner_text()
        page.screenshot(path=str(ROOT/'artifacts/spatial/spatial-preview.en.png'),full_page=True)
        results['english']='PASS'
        page.set_viewport_size({'width':390,'height':900})
        page.wait_for_timeout(200)
        w=page.evaluate('document.documentElement.scrollWidth');width=page.evaluate('document.documentElement.clientWidth')
        results['mobile_horizontal_scroll']=w-width
        assert w<=width+2
        browser.close()
results['javascript_errors']=errors
assert not errors,errors
(ROOT/'artifacts/spatial/v0.2-browser-smoke.json').write_text(json.dumps(results,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps(results,ensure_ascii=False,indent=2))
