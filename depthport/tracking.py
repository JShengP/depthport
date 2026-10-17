# SPDX-License-Identifier: AGPL-3.0-only
"""Explicit offline semantic tracking over manually saved Session frames.

Frame-local camera XYZ is *not* a world trajectory. Association is a
class-gated, deterministic 2D IoU/centroid heuristic and is NOT ReID.
No video is recorded and no depth inference is repeated.
"""
from __future__ import annotations

import io
import math
import time
import zipfile

import cv2
import numpy as np

from depthport.semantic import allowed_model, extract_instances
from depthport.sessions import SessionError, SessionIntegrity
from depthport.temporal import _read_depth, _grid_signature

MAX_TRACK_FRAMES = 24
MAX_INSTANCES = 20


def _iou(a, b):
    x0=max(a[0],b[0]);y0=max(a[1],b[1]);x1=min(a[2],b[2]);y1=min(a[3],b[3])
    intersection=max(0,x1-x0)*max(0,y1-y0)
    aa=max(0,a[2]-a[0])*max(0,a[3]-a[1]);bb=max(0,b[2]-b[0])*max(0,b[3]-b[1])
    return intersection/(aa+bb-intersection) if aa+bb>intersection else 0.


def _center(box):
    return [(box[0]+box[2])/2.,(box[1]+box[3])/2.]


def associate(detections: list[dict], active: dict, *, image_shape: tuple[int,int],
              step: int, next_id: int) -> tuple[list[dict],dict,int]:
    """Greedy one-to-one matching; never match across class or camera group.

    Track IDs deliberately have no identity/face inference. A gap > 1 saved
    frame starts a new ID. No interpolation across unobserved frames.
    """
    h,w=image_shape
    diagonal=math.hypot(h,w)
    candidates=[]
    for i,det in enumerate(detections):
        bbox=det['bbox'];c=_center(bbox)
        for tid,old in active.items():
            if old['class_id']!=det['class_id'] or step-old['step']>2:continue
            overlap=_iou(bbox,old['bbox'])
            dist=math.dist(c,_center(old['bbox']))/diagonal
            if overlap>=.18 or (overlap>=.02 and dist<=.075):
                candidates.append((overlap-dist,overlap,-dist,tid,i))
    used_t=set();used_d=set();new_tracks={}
    for _,_,_,tid,i in sorted(candidates,key=lambda x:(-x[0],-x[1],-x[2],x[3],x[4])):
        if tid in used_t or i in used_d:continue
        used_t.add(tid);used_d.add(i)
        detections[i]['object_id']=f'obj-{tid:04d}'
        new_tracks[tid]={'class_id':detections[i]['class_id'],'bbox':detections[i]['bbox'],'step':step}
    for i,d in enumerate(detections):
        if i not in used_d:
            tid=next_id;next_id+=1
            d['object_id']=f'obj-{tid:04d}'
            new_tracks[tid]={'class_id':d['class_id'],'bbox':d['bbox'],'step':step}
    for tid,old in active.items():
        if tid not in new_tracks and step-old['step']<=1:
            new_tracks[tid]=old
    return detections,new_tracks,next_id


def _geometry(det: dict, depth: np.ndarray, k: dict) -> dict:
    h,w=depth.shape
    mask=det.get('mask')
    if mask is None or np.shape(mask)!=(h,w):
        raise SessionIntegrity('Saved RGB/depth and object mask are not aligned')
    ys,xs=np.nonzero(mask & np.isfinite(depth) & (depth>0))
    out={'pixels_mask':int(np.count_nonzero(mask)),
         'pixels_valid':int(len(xs)),
         'depth_median':None,'xyz_camera_median':None}
    if len(xs)==0:return out
    # bounded even if a segmentation mask covers the entire image
    stride=max(1,math.ceil(len(xs)/4096))
    ys=ys[::stride];xs=xs[::stride];z=depth[ys,xs].astype(np.float64)
    xyz=np.column_stack(((xs-float(k['cx']))*z/float(k['fx']),
                         (ys-float(k['cy']))*z/float(k['fy']),z))
    med=np.median(xyz,axis=0)
    if not np.isfinite(med).all():return out
    out.update(depth_median=float(np.median(z)),xyz_camera_median=med.tolist())
    return out


def analyse_session(store, sid: str, *, mode: str='segment', confidence: float=.25,
                    max_frames:int=12, detector=None, device:str='cpu') -> dict:
    if mode not in ('detect','segment') or not .05<=confidence<=.95:
        raise ValueError('Tracking mode or confidence out of range')
    if not 2<=max_frames<=MAX_TRACK_FRAMES:
        raise ValueError('max_frames must be 2..24')
    if detector is None and device!='cpu':
        raise ValueError('v0.3 offline tracking defaults to CPU; GPU scheduling not validated')
    rows=store.frames(sid)['frames'][-max_frames:]
    if len(rows)<2:raise SessionError('Save at least two frames before tracking')
    model_name=allowed_model(mode) if detector is None else f'test-double:{mode}'
    model=None
    if detector is None:
        from ultralytics import YOLO
        model=YOLO(model_name)
        def detector(bgr):
            return extract_instances(model.predict(source=bgr,device='cpu',imgsz=640,
                  conf=confidence,verbose=False,retina_masks=True)[0], bgr.shape[:2],mode,
                  confidence,max_instances=MAX_INSTANCES)
    all_frames=[];tracks={};active={};next_id=1;prior_group=None
    try:
        for step,row in enumerate(rows):
            payload=store.bundle(sid,row['index'])  # validates SHA-256
            depth,meta=_read_depth(payload,row)
            with zipfile.ZipFile(io.BytesIO(payload)) as z:
                img=z.read('rgb_aligned.png')
            bgr=cv2.imdecode(np.frombuffer(img,np.uint8),cv2.IMREAD_COLOR)
            if bgr is None or bgr.shape[:2]!=depth.shape:
                raise SessionIntegrity('Saved image and depth grids do not align')
            group=(row['engine'],row['model'],row['units'],_grid_signature(meta,depth.shape))
            if group!=prior_group:
                # Never carry an Object ID across different cameras, model
                # identity, spatial rays, coordinate units or source kind.
                active={}
            prior_group=group
            raw=detector(bgr)
            if not isinstance(raw,list) or len(raw)>MAX_INSTANCES:
                raise SessionError('Detector returned unexpected object count')
            objects=[]
            for item in raw:
                b=item['bbox'];cls=item['class_id']
                if (not isinstance(cls,int) or len(b)!=4 or
                    not all(isinstance(q,(int,float)) and math.isfinite(q) for q in b) or
                    not (0<=b[0]<b[2]<=depth.shape[1] and 0<=b[1]<b[3]<=depth.shape[0])):
                    raise SessionError('Detector returned invalid class/bounding box')
                row_obj={k:v for k,v in item.items() if k!='mask'}
                row_obj.update(_geometry(item,depth,meta['intrinsics']))
                objects.append(row_obj)
            objects,active,next_id=associate(objects,active,image_shape=depth.shape,step=step,next_id=next_id)
            for ob in objects:
                tid=ob['object_id']
                if tid not in tracks:
                    tracks[tid]={'object_id':tid,'label':ob['label'],'class_id':ob['class_id'],
                                 'engine':row['engine'],'model':row['model'],'units':row['units'],
                                 'observations':[]}
                tracks[tid]['observations'].append({
                    'index':row['index'],'frame_id':row['frame_id'],
                    'timestamp':row['frame_timestamp'], 'bbox':ob['bbox'],
                    'centroid_px':_center(ob['bbox']),'confidence':ob['confidence'],
                    'depth_median':ob['depth_median'],'xyz_camera_median':ob['xyz_camera_median'],
                    'pixels_valid':ob['pixels_valid']})
            all_frames.append({'index':row['index'],'source_sha256':row.get('source_sha256'),
                               'snapshot_sha256':row['sha256'],'frame_id':row['frame_id'],
                               'engine':row['engine'],'model':row['model'],'units':row['units'],
                               'timestamp':row['frame_timestamp'],'objects':objects})
        for track in tracks.values():
            obs=track['observations']
            first,last=obs[0],obs[-1]
            xyz0,xyz1=first['xyz_camera_median'],last['xyz_camera_median']
            track['observed_frames']=len(obs)
            track['centroid_displacement_px']=float(math.dist(first['centroid_px'],last['centroid_px']))
            track['camera_xyz_delta_native_units']=(np.subtract(xyz1,xyz0).tolist()
                                                   if xyz0 is not None and xyz1 is not None else None)
            track['motion_interpretation']='Uncompensated camera-frame estimate; NOT a world trajectory or speed.'
        return {'format':'depthport.semantic-tracking.v1','session_id':sid,
                'total_session_frames':len(store.frames(sid)['frames']),'mode':mode,
                'model':model_name,'device':'cpu' if model is not None else 'test_double',
                'confidence':confidence,'source':'manually_saved_snapshots_only',
                'frames_considered':len(rows),'frames':all_frames,
                'tracks':list(tracks.values()),'track_count':len(tracks),
                'note':'Heuristic 2D ID association, not person identity/ReID; occlusion, crossing and camera motion can break IDs. '
                       'Depth is unverified AI output, camera XYZ is NOT world XYZ. Relative/virtual depth is not metres. '
                       'Box ROI includes background. No automatic RTSP capture.'}
    finally:
        if model is not None:
            del model
