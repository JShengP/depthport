# SPDX-License-Identifier: AGPL-3.0-only
"""YOLO detection/instance-mask -> camera-space point subsets.

Bounding boxes are explicitly ROI approximations, never object silhouettes.
This adapter is optional: missing Ultralytics or weights raise errors.
"""
from __future__ import annotations
import math
import os
from pathlib import Path
import numpy as np
import cv2
from .spatial import valid_depth, backproject

PRESET = {'detect': 'yolo26n.pt', 'segment': 'yolo26n-seg.pt'}


def allowed_model(mode: str) -> str:
    if mode not in PRESET: raise ValueError('mode must be detect or segment')
    key = 'SEMANTIC_DETECT_MODEL' if mode == 'detect' else 'SEMANTIC_SEGMENT_MODEL'
    name = os.getenv(key, PRESET[mode]).strip()
    if not name: raise ValueError('Empty semantic model')
    if os.getenv('MODEL_OFFLINE') == '1' and not Path(name).is_file():
        raise RuntimeError('Offline mode requires a local semantic weight file')
    return name


def extract_instances(prediction, image_hw: tuple[int,int], mode: str,
                      confidence: float = .25, max_instances: int = 20) -> list[dict]:
    """Convert official Ultralytics Results fields to aligned masks."""
    if mode not in PRESET: raise ValueError('Unknown semantic mode')
    h, w = image_hw
    boxes = getattr(prediction, 'boxes', None)
    if boxes is None: return []
    coords = boxes.xyxy.detach().float().cpu().numpy()
    classes = boxes.cls.detach().float().cpu().numpy()
    confidences = boxes.conf.detach().float().cpu().numpy()
    names = getattr(prediction, 'names', {})
    masks_object = getattr(prediction, 'masks', None)
    masks = None
    if mode == 'segment' and masks_object is not None:
        masks = masks_object.data.detach().float().cpu().numpy()
        if len(masks) != len(coords):
            raise RuntimeError('Segmentation masks do not align with detection instances')
    objects=[]
    for i,(xyxy, cls, conf) in enumerate(zip(coords,classes,confidences)):
        if len(objects) >= max_instances:break
        if not math.isfinite(float(conf)) or conf < confidence:continue
        classid=int(cls)
        name = names.get(classid,str(classid)) if isinstance(names,dict) else (names[classid] if classid < len(names) else str(classid))
        x0,y0,x1,y1=(float(x) for x in xyxy)
        x0=max(0,min(w,int(math.floor(x0))));x1=max(0,min(w,int(math.ceil(x1))))
        y0=max(0,min(h,int(math.floor(y0))));y1=max(0,min(h,int(math.ceil(y1))))
        if x1<=x0 or y1<=y0:continue
        if masks is not None:
            mask=masks[i]
            if mask.shape != (h,w):
                # Resizing an unknown letterboxed mask can shift every 3D point.
                # With retina_masks=True we require exact aligned shape.
                raise RuntimeError('Instance-mask grid does not align with the depth image; check Ultralytics preprocessing')
            resized=False
            mask=mask > .5
            kind='instance_mask'
        else:
            mask=np.zeros((h,w),bool)
            mask[y0:y1,x0:x1]=True
            resized=False
            kind='bounding_box_region_approximation'
            if mode == 'segment':
                # Segmentation request must NOT silently become box-based semantics.
                raise RuntimeError('Segmentation produced boxes but no masks; refusing box fallback')
        objects.append({'class_id':classid,'label':str(name),'confidence':float(conf),
                        'bbox':[x0,y0,x1,y1],'mask':mask,'mask_kind':kind,'mask_resized':resized})
    return objects


def fuse_instances(result, instances: list[dict], *, max_points: int=4500) -> tuple[list[dict], list[np.ndarray]]:
    h,w=result.depth.shape
    valid=valid_depth(result.depth)
    output=[]; masks_out=[]
    for item in instances:
        mask=item['mask']
        if mask.shape != (h,w):raise ValueError('Semantic mask is not aligned to depth')
        eligible=valid & mask
        ys,xs=np.where(eligible)
        base={k:v for k,v in item.items() if k!='mask'}
        base.update({'pixels_mask':int(mask.sum()), 'pixels_valid':int(len(xs)),
                     'units':result.units,
                     'is_metric': result.units=='estimated_m',
                     'warning':'Box includes possible background' if item['mask_kind'].startswith('bounding_box') else 'AI mask and depth are estimates'})
        if len(xs):
            z=result.depth[ys,xs]
            xyz=backproject(xs,ys,z,result.intrinsics)
            base['depth_median']=float(np.median(z))
            base['xyz_camera_median'] = np.median(xyz,axis=0).tolist()
            if len(xs)>max_points:
                idx=np.linspace(0,len(xs)-1,max_points,dtype=np.int32)
                xs,ys,z,xyz=xs[idx],ys[idx],z[idx],xyz[idx]
            colors=result.bgr[ys,xs,::-1]
            records=np.empty(len(xs),dtype=[('x','<f4'),('y','<f4'),('z','<f4'),('r','u1'),('g','u1'),('b','u1'),('a','u1')])
            records['x']=xyz[:,0]; records['y']=-xyz[:,1];records['z']=-xyz[:,2]
            records['r']=colors[:,0];records['g']=colors[:,1];records['b']=colors[:,2];records['a']=255
            base['points_packed_count']=len(records)
            base['points_packed_b64']=__import__('base64').b64encode(records.tobytes()).decode('ascii')
        else:
            base.update({'depth_median':None,'xyz_camera_median':None,'points_packed_count':0,'points_packed_b64':''})
        output.append(base)
        masks_out.append(mask)
    return output,masks_out


def run_ultralytics_semantic(bgr:np.ndarray, depth_result, mode:str, device:str, confidence:float=.25) -> dict:
    from ultralytics import YOLO
    if device.startswith('cuda'):
        devicearg=device.split(':')[-1] if ':' in device else 0
    else:
        devicearg = device
    model_name=allowed_model(mode)
    model=YOLO(model_name)
    try:
        # Use ndarray BGR input as documented for Ultralytics; retinal masks full resolution.
        pred=model.predict(source=bgr,device=devicearg,imgsz=640,verbose=False,
                           retina_masks=True,conf=confidence)[0]
        objects=extract_instances(pred,depth_result.depth.shape,mode,confidence)
        entries,masks=fuse_instances(depth_result,objects)
        overlay=bgr.copy()
        for i,(obj,mask) in enumerate(zip(entries,masks)):
            bgrcolor=[(80,190,240),(70,210,120),(210,130,210),(230,170,80)][i%4]
            blend=np.array(bgrcolor,dtype=np.float32)
            overlay[mask]=(overlay[mask]*.66+blend*.34).astype('uint8')
            x0,y0,x1,y1=obj['bbox']
            cv2.rectangle(overlay,(x0,y0),(x1,y1),bgrcolor,2)
            cv2.putText(overlay,obj['label'][:30],(x0,max(16,y0-5)),cv2.FONT_HERSHEY_SIMPLEX,.48,bgrcolor,1)
        ok,buf=cv2.imencode('.png',overlay)
        if not ok:raise RuntimeError('Failed to encode semantic overlay')
        return {'objects':entries,'overlay_png_b64':__import__('base64').b64encode(buf.tobytes()).decode('ascii'),
                'mode':mode,'model':model_name,'is_trained_model':True,
                'warning':'Bounding boxes are ROIs containing background; instance masks also have prediction errors.'}
    finally:
        del model
        try:
            import torch
            if torch.cuda.is_available():torch.cuda.empty_cache()
        except ImportError:pass
