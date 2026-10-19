#!/usr/bin/env python3
# SPDX-License-Identifier: AGPL-3.0-only
"""Cache an entire licensed source in bounded dense shards; no tracking or GT.

Same per-frame inference as cache_video_detections.py. No clipping/resampling or
video re-encoding. Original per-cache limits remain; tracking must keep state
across shard boundaries. Outputs contain raw observations: local storage only.
"""
from __future__ import annotations
import argparse
import importlib.metadata
import json
from pathlib import Path
import sys
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT))
from depthport.video_tracking_benchmark import CACHE_FORMAT,MAX_VIDEO_FRAMES,MAX_OBJECTS,MAX_CACHE_BYTES,sha256_file


def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--video',type=Path,required=True)
    p.add_argument('--model',type=Path,required=True)
    p.add_argument('--output-dir',type=Path,required=True)
    a=p.parse_args()
    if a.video.is_symlink() or a.output_dir.is_symlink() or not a.video.is_file():
        p.error('Regular local source and output required')
    a.output_dir.mkdir(parents=True,exist_ok=True)
    if list(a.output_dir.glob('cache-*.json')):
        p.error('Refuse to overwrite existing shards')
    import cv2
    from ultralytics import YOLO
    model=YOLO(str(a.model));cap=cv2.VideoCapture(str(a.video))
    if not cap.isOpened():p.error('Cannot open source')
    fps=float(cap.get(cv2.CAP_PROP_FPS));w=int(cap.get(cv2.CAP_PROP_FRAME_WIDTH));h=int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    if not 0<fps<=240 or not 0<w<=8192 or not 0<h<=8192:p.error('Invalid source metadata')
    detector={'model':a.model.name,'confidence':.1,'imgsz':640,'source':'ultralytics','device':'cpu',
        'classes':[0],'max_det':64,'nms_iou':.7,'ultralytics':importlib.metadata.version('ultralytics'),
        'weight_sha256':sha256_file(a.model)}
    video_hash=sha256_file(a.video);rows=[];total=0;cap_frames=0;start=1;parts=[]
    def flush():
        nonlocal rows,cap_frames,start
        payload={'format':CACHE_FORMAT,'video_sha256':video_hash,'width':w,'height':h,'fps':fps,
            'source_start_frame':start,'detector':{**detector,'frames_at_detection_cap':cap_frames},'frames':rows}
        data=(json.dumps(payload,indent=2,allow_nan=False)+'\n').encode()
        if len(data)>MAX_CACHE_BYTES:raise ValueError('Shard exceeds unchanged cache byte limit')
        dest=a.output_dir/('cache-'+str(len(parts)+1)+'.json');dest.write_bytes(data)
        parts.append({'name':dest.name,'sha256':sha256_file(dest),'source_start_frame':start,'frames':len(rows)})
        start+=len(rows);rows=[];cap_frames=0
    try:
        while True:
            ok,frame=cap.read()
            if not ok:break
            if frame.shape[:2]!=(h,w):raise ValueError('Source size changed')
            pred=model.predict(frame,conf=.1,imgsz=640,verbose=False,device='cpu',classes=[0],max_det=64,iou=.7)
            if len(pred)!=1:raise ValueError('Detector result cardinality changed')
            boxes=pred[0].boxes;detections=[]
            if boxes is not None:
                cap_frames+=int(len(boxes)>=64)
                for xyxy,confidence,class_id in zip(boxes.xyxy.cpu().numpy(),boxes.conf.cpu().numpy(),boxes.cls.cpu().numpy()):
                    if len(detections)>=MAX_OBJECTS:break
                    x0,y0,x1,y1=[float(v) for v in xyxy]
                    x0=max(0.,min(x0,w));x1=max(0.,min(x1,w));y0=max(0.,min(y0,h));y1=max(0.,min(y1,h))
                    if x0<x1 and y0<y1:detections.append({'bbox':[x0,y0,x1,y1],'class_id':int(class_id),'confidence':float(confidence)})
            rows.append({'index':len(rows)+1,'detections':detections});total+=1
            if len(rows)==MAX_VIDEO_FRAMES:flush()
            if total%300==0:print('Cached '+str(total)+' source frames',flush=True)
        if rows:flush()
    finally:cap.release()
    if not total:p.error('No frames')
    (a.output_dir/'shards.local.json').write_text(json.dumps({'video_sha256':video_hash,'frames':total,'parts':parts},indent=2)+'\n')
    print('Full source cached: '+str(total)+' frames; no source frame omitted or tracker run.',flush=True)


if __name__=='__main__':main()
