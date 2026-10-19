# SPDX-License-Identifier: AGPL-3.0-only
"""Offline synthetic video protocol tests; no accuracy claims, no pretrained weights."""
import json
import sys
import types
from pathlib import Path

import cv2
import numpy as np
import pytest

from depthport.video_tracking_benchmark import (
    CACHE_FORMAT, VideoBenchmarkError, benchmark, make_tracker, read_cache,
    run_video_tracker, sha256_file,
)
from depthport.tracking_eval import evaluate, GT_FORMAT


def fixture_video(tmp_path, boxes=None):
    video=tmp_path/'synthetic.avi'
    writer=cv2.VideoWriter(str(video),cv2.VideoWriter_fourcc(*'MJPG'),10.0,(128,96))
    assert writer.isOpened(), 'MJPEG video fixture codec unavailable'
    for i in range(4):
        frame=np.zeros((96,128,3),dtype=np.uint8)
        cv2.rectangle(frame,(10+i*2,10),(35+i*2,35),(255,255,255),-1)
        writer.write(frame)
    writer.release()
    items=boxes or [[{'bbox':[float(10+i*2),10.,float(35+i*2),35.], 'confidence':.9,'class_id':0}] for i in range(4)]
    cache={'format':CACHE_FORMAT,'video_sha256':sha256_file(video),'width':128,'height':96,'fps':10.0,
           'detector':{'model':'synthetic-not-yolo'},
           'frames':[{'index':i+1,'detections':d} for i,d in enumerate(items)]}
    path=tmp_path/'detections.json';path.write_text(json.dumps(cache),encoding='utf-8')
    return video,path,cache


def test_baseline_offline_video_and_dense_evaluator(tmp_path):
    video,p,raw=fixture_video(tmp_path)
    data=read_cache(p)
    preds,meta=run_video_tracker(video,data,'baseline')
    assert len(preds['frames'])==4 and all(f['objects'][0]['object_id']=='obj-0001' for f in preds['frames'])
    assert meta['tracker_update']['p50_ms']>=0 and meta['frames']==4
    gt={'format':GT_FORMAT,'session_id':preds['session_id'],'sampling':'dense_video',
        'frames':[{'index':i+1,'objects':[{'gt_id':'A','class_id':0,'bbox':[10+i*2,10,35+i*2,35]}]} for i in range(4)]}
    result=benchmark(video,raw,methods=['baseline'],gt=gt)
    assert result['trackers']['baseline']['metadata']['evaluation']['summary']['id_switches']==0
    assert result['trackers']['baseline']['metadata']['evaluation']['summary']['recall']==1.


def test_cache_rejects_modified_video_and_invalid_metadata(tmp_path):
    video,p,raw=fixture_video(tmp_path)
    video.write_bytes(video.read_bytes()+b'corrupted')
    with pytest.raises(VideoBenchmarkError,match='SHA-256'):
        run_video_tracker(video,raw,'baseline')
    raw['frames'][1]['index']=4
    p.write_text(json.dumps(raw))
    with pytest.raises(VideoBenchmarkError,match='dense'):
        read_cache(p)


def test_read_cache_rejects_bad_dimensions_confidence_or_bbox(tmp_path):
    _,p,d=fixture_video(tmp_path)
    for field,value in [('width',0),('fps',float('nan'))]:
        bad=dict(d);bad[field]=value;p.write_text(json.dumps(bad))
        with pytest.raises(VideoBenchmarkError):read_cache(p)
    d['frames'][0]['detections'][0]['bbox']=[1,1,900,5];p.write_text(json.dumps(d))
    with pytest.raises(VideoBenchmarkError,match='bbox'):read_cache(p)
    d['frames'][0]['detections'][0]['bbox']=[1.,1.,8.,8.]
    d['frames'][0]['detections'][0]['confidence']=float('nan');p.write_text(json.dumps(d))
    with pytest.raises(VideoBenchmarkError,match='confidence'):read_cache(p)


def test_gt_eval_24_limit_remains_default_but_dense_video_can_extend():
    pred={'format':'depthport.semantic-tracking.v1','session_id':'video-a','frames':[{'index':i,'objects':[]} for i in range(1,27)]}
    gt={'format':GT_FORMAT,'session_id':'video-a','sampling':'dense_video','frames':[{'index':i,'objects':[]} for i in range(1,27)]}
    from depthport.tracking_eval import TrackingEvaluationError
    with pytest.raises(TrackingEvaluationError):evaluate(pred,gt)
    assert evaluate(pred,gt,max_frames=26)['evaluated_frames']==26
    with pytest.raises(TrackingEvaluationError):evaluate(pred,gt,max_frames=20000)


def test_two_backend_interfaces_and_uncertified_ids(monkeypatch,tmp_path):
    video,p,raw=fixture_video(tmp_path)
    class Detections:
        def __init__(self,xyxy,confidence,class_id):
            self.xyxy=xyxy;self.confidence=confidence;self.class_id=class_id
            self.tracker_id=None
    class FakeTracker:
        def __init__(self,frame_rate):self.idx=0;self.frame_rate=frame_rate
        def update(self,detections,frame=None):
            self.idx+=1
            if isinstance(self,BoTSORTTracker):assert frame is not None and frame.shape == (96,128,3)
            else:assert frame is None
            detections.tracker_id=np.array([101 for _ in detections.xyxy],dtype=int)
            return detections
    class ByteTrackTracker(FakeTracker):pass
    class BoTSORTTracker(FakeTracker):pass
    fake=types.SimpleNamespace(ByteTrackTracker=ByteTrackTracker,BoTSORTTracker=BoTSORTTracker)
    monkeypatch.setitem(sys.modules,'trackers',fake)
    monkeypatch.setitem(sys.modules,'supervision',types.SimpleNamespace(Detections=Detections))
    monkeypatch.setattr('importlib.metadata.version', lambda name:'2.6.1')
    result=benchmark(video,raw,methods=['bytetrack','botsort'])
    assert list(result['trackers'])==['bytetrack','botsort']
    assert result['trackers']['bytetrack']['predictions']['frames'][0]['objects'][0]['object_id']=='bytetrack-101'
    assert result['trackers']['botsort']['predictions']['frames'][0]['objects'][0]['object_id']=='botsort-101'
    assert result['trackers']['botsort']['metadata']['tracker_update']['p95_ms']>=0


def test_dependency_version_rejected(monkeypatch):
    mod=types.SimpleNamespace(ByteTrackTracker=lambda **kw:None,BoTSORTTracker=lambda **kw:None)
    monkeypatch.setitem(sys.modules,'trackers',mod)
    monkeypatch.setitem(sys.modules,'supervision',types.SimpleNamespace())
    monkeypatch.setattr('importlib.metadata.version', lambda name:'9.9.9')
    with pytest.raises(VideoBenchmarkError,match='2.6.1'):make_tracker('bytetrack',fps=30.)


def test_cache_cli_freezes_detector_contract_caps_results_and_omits_local_weight_path(monkeypatch,tmp_path):
    from tools.cache_video_detections import main
    import hashlib
    video,_,_=fixture_video(tmp_path);weight=tmp_path/'weights.pt';weight.write_bytes(b'synthetic checkpoint')
    class Tensor:
        def __init__(self,x):self.x=np.array(x)
        def cpu(self):return self
        def numpy(self):return self.x
    class Boxes:
        xyxy=Tensor([[1,1,10,20],[20,20,30,40],[40,40,50,60]])
        conf=Tensor([.9,.8,.7]);cls=Tensor([0,0,0])
        def __len__(self):return 3
    calls=[]
    class Model:
        def __init__(self,path):self.ckpt_path=path
        def predict(self,frame,**kwargs):calls.append(kwargs);return [types.SimpleNamespace(boxes=Boxes())]
    monkeypatch.setitem(sys.modules,'ultralytics',types.SimpleNamespace(YOLO=Model))
    monkeypatch.setattr('importlib.metadata.version',lambda name:'synthetic-test')
    output=tmp_path/'cache.json'
    assert main(['--video',str(video),'--model',str(weight),'--output',str(output),'--classes','0','--max-detections','2','--device','cpu','--nms-iou','.7'])==0
    d=read_cache(output);meta=d['detector']
    assert meta['model']=='weights.pt' and str(tmp_path) not in json.dumps(meta)
    assert meta['weight_sha256']==hashlib.sha256(weight.read_bytes()).hexdigest()
    assert meta['frames_at_detection_cap']==4 and all(len(x['detections'])==2 for x in d['frames'])
    assert all(c['classes']==[0] and c['max_det']==2 and c['device']=='cpu' and c['iou']==.7 for c in calls)
    for extra in [['--max-detections','65'],['--nms-iou','nan'],['--classes','-1']]:
        with pytest.raises(SystemExit):main(['--video',str(video),'--model',str(weight),'--output',str(output),*extra])
