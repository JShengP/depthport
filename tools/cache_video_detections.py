#!/usr/bin/env python3
# SPDX-License-Identifier: AGPL-3.0-only
"""Generate one fixed YOLO detection cache for comparative offline tracking.

Run with DepthPort's YOLO/NumPy 1.x environment, NOT the trackers/NumPy 2.x venv.
Never commit captured video, inference results or detector weights.
"""
import argparse
import json
from pathlib import Path
import sys
import cv2

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT))
from depthport.video_tracking_benchmark import CACHE_FORMAT,MAX_VIDEO_FRAMES,MAX_OBJECTS,sha256_file


def main(argv=None):
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--video',required=True,type=Path)
    p.add_argument('--model',default='yolo26n.pt')
    p.add_argument('--output',required=True,type=Path)
    p.add_argument('--confidence',type=float,default=.10)
    p.add_argument('--imgsz',type=int,default=640)
    a=p.parse_args(argv)
    if a.video.is_symlink() or not a.video.is_file() or a.output.is_symlink(): p.error('Local regular video and non-symlink output required')
    if not .01 <= a.confidence <= .5 or not 160 <= a.imgsz <= 2048:p.error('Invalid inference parameters')
    try:
        from ultralytics import YOLO
    except ImportError as e:
        p.error('Install Ultralytics in the main DepthPort model venv before caching: '+str(e))
    model=YOLO(a.model)
    cap=cv2.VideoCapture(str(a.video))
    if not cap.isOpened():p.error('Could not open offline video')
    fps=float(cap.get(cv2.CAP_PROP_FPS)); width=int(cap.get(cv2.CAP_PROP_FRAME_WIDTH));height=int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    if not 0 < fps <= 240 or not 0 < width <= 8192 or not 0 < height <= 8192:p.error('Invalid FPS/resolution metadata')
    rows=[]
    try:
        while True:
            ok, frame=cap.read()
            if not ok:break
            if len(rows)>=MAX_VIDEO_FRAMES:p.error('Video longer than benchmark limit; create a shorter, contiguous offline clip')
            if frame.shape[:2] != (height,width):p.error('Video frame resolution changed')
            preds=model.predict(frame,conf=a.confidence,imgsz=a.imgsz,verbose=False)
            if len(preds)!=1:p.error('Unexpected YOLO prediction cardinality')
            boxes=preds[0].boxes
            detections=[]
            if boxes is not None:
                for xyxy, confidence, class_id in zip(boxes.xyxy.cpu().numpy(),boxes.conf.cpu().numpy(),boxes.cls.cpu().numpy()):
                    if len(detections)>=MAX_OBJECTS:break
                    x0,y0,x1,y1=[float(v) for v in xyxy]
                    x0=max(0.,min(x0,width));x1=max(0.,min(x1,width))
                    y0=max(0.,min(y0,height));y1=max(0.,min(y1,height))
                    if x0<x1 and y0<y1:detections.append({'bbox':[x0,y0,x1,y1], 'class_id':int(class_id),'confidence':float(confidence)})
            rows.append({'index':len(rows)+1,'detections':detections})
    finally:
        cap.release()
    if not rows:p.error('No decodable video frames')
    payload={'format':CACHE_FORMAT,'video_sha256':sha256_file(a.video),'width':width,'height':height,'fps':fps,
             'detector':{'model':a.model,'confidence':a.confidence,'imgsz':a.imgsz,'source':'ultralytics',
                         'warning':'Check weight SHA and installed runtime before publishing measurements'},
             'frames':rows}
    a.output.parent.mkdir(parents=True,exist_ok=True)
    a.output.write_text(json.dumps(payload,indent=2,allow_nan=False)+'\n',encoding='utf-8')
    print(f'Cached {len(rows)} frames, {sum(len(f["detections"]) for f in rows)} detections at {a.output}. Not a tracking benchmark.')
    return 0

if __name__=='__main__':raise SystemExit(main())
