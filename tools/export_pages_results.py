# SPDX-License-Identifier: AGPL-3.0-only
"""Curate the documented bus exports and an explicitly hashed public replay.

Offline preparation only; never called by Pages. Arguments name local inputs;
paths, sessions, weights and logs are never copied into the public manifests.
"""
from __future__ import annotations
import argparse, base64, gzip, hashlib, io, json, os, subprocess, sys, zipfile
from datetime import datetime, timezone
from pathlib import Path
import cv2
import numpy as np
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
BUS = 'c02019c4979c191eb739ddd944445ef408dad5679acab6fd520ef9d434bfbc63'
VIDEO = '9b77a4264bb59290335184b77c6300ba43aa6642cb65b594550c44359fd57d4b'
ENGINES = ('yolo26','da2-small','da3-small','da3-metric')
def sha(b): return hashlib.sha256(b).hexdigest()
def write_json(p, data):
 p.parent.mkdir(parents=True, exist_ok=True)
 p.write_text(json.dumps(data, ensure_ascii=False, separators=(',', ':'), allow_nan=False)+'\n', encoding='utf-8', newline='\n')
def array(a):
 b=np.ascontiguousarray(a,dtype='<f4').tobytes()
 return {'encoding':'gzip-base64-float32-le','shape':list(a.shape),'sha256':sha(b),'data':base64.b64encode(gzip.compress(b,mtime=0)).decode()}
def read_npy(z,n): return np.load(io.BytesIO(z.read(n)),allow_pickle=False)
def rgb_read(z,n): return cv2.imdecode(np.frombuffer(z.read(n),np.uint8),cv2.IMREAD_COLOR)
def ply_records(b):
 pos=b.index(b'end_header\n')+len(b'end_header\n')
 assert b'format binary_little_endian' in b[:pos]
 return np.frombuffer(b[pos:],dtype=[('x','<f4'),('y','<f4'),('z','<f4'),('r','u1'),('g','u1'),('b','u1')])
def cloud(records):
 r=records[::max(1,int(np.ceil(len(records)/9000)))]
 out=np.empty(len(r),dtype=[('x','<f4'),('y','<f4'),('z','<f4'),('r','u1'),('g','u1'),('b','u1'),('a','u1')])
 for k in r.dtype.names: out[k]=r[k]
 out['a']=255
 return {'count':len(out),'packed':base64.b64encode(out.tobytes()).decode(),'sha256':sha(out.tobytes()),'selection':'uniform stride from original exported PLY; no geometry normalization'}
def main():
 p=argparse.ArgumentParser(description=__doc__)
 for n in ('comparison','bus','video','models','worker','local'):p.add_argument('--'+n,type=Path,required=True)
 args=p.parse_args();args.local.mkdir(parents=True,exist_ok=True)
 assert sha(args.bus.read_bytes())==BUS and sha(args.video.read_bytes())==VIDEO
 os.environ['YOLO_CONFIG_DIR']=str(args.local/'yolo-config')
 import torch, ultralytics, transformers
 from ultralytics import YOLO
 from depthport.semantic import extract_instances
 from depthport.tracking import _geometry
 from depthport.tracking_worker import TrackingWorker
 from depthport.v2_engine import V2Adapter
 from depthport.cloud import CameraGeometry
 now=datetime.now(timezone.utc).isoformat()
 code=subprocess.check_output(['git','rev-parse','HEAD'],cwd=ROOT,text=True).strip()
 manifest={'format':'depthport.real-bus.v1','generated_at':now,'inference_date':'2026-10-17','code_commit':'86ddb2e7d691c599e280327e27895bc954d86fd3','curation_base_commit':code,'source':{'sha256':BUS,'width':810,'height':1080,'url':'https://github.com/ultralytics/assets/blob/53d4e2a8fd15f473c29a148c317a8477be559327/im/bus.jpg','provider':'Ultralytics Assets','license':'AGPL-3.0; third-party rights remain applicable'},'archive_sha256':sha(args.comparison.read_bytes()),'engines':[],'query_mapping':'Source pixel (u,v) -> floor((u+.5)*aligned_width/810), floor((v+.5)*aligned_height/1080), clamped; nearest aligned sample, no interpolation','camera_coordinates':'X right, Y down, Z forward; viewer uses (X,-Y,-Z)','intrinsics_notice':'65-degree HFOV estimate, not measured calibration; no physical accuracy claim','historical_notice':'Later v0.2 CUDA validation, not acceptance of historical v0.1 tag'}
 weights=json.loads((ROOT/'docs/validation/v0.2-summary.json').read_text())['weights']
 summary=json.loads((ROOT/'docs/validation/v0.2-summary.json').read_text())
 semantic={}
 with zipfile.ZipFile(args.comparison) as z:
  base_rgb=rgb_read(z,'da2-small/rgb_aligned.png')
  # Boxes alone were preserved in the original export; masks were not. Rerun
  # only missing semantic predictions, saving exact full-resolution masks locally.
  for mode,name in [('detect','yolo26n.pt'),('segment','yolo26n-seg.pt')]:
   model=YOLO(str(args.models/name))
   pred=model.predict(base_rgb,device='cpu',imgsz=640,conf=.25,retina_masks=True,verbose=False)[0]
   inst=extract_instances(pred,base_rgb.shape[:2],mode,.25)
   sem=[]
   for i,o in enumerate(inst):
    np.save(args.local/f'{mode}-mask-{i}.npy',o['mask'])
    # Lossless mask run lengths on the original semantic grid.
    flat=o['mask'].reshape(-1); borders=np.flatnonzero(np.diff(np.r_[False,flat,False]))
    sem.append({**{k:v for k,v in o.items() if k!='mask'},'runs':borders.reshape(-1,2).tolist(),'mask_sha256':sha(o['mask'].astype('uint8').tobytes())})
   semantic[mode]={'model':name,'weights_sha256':sha((args.models/name).read_bytes()),'version':ultralytics.__version__,'device':'cpu','confidence':.25,'imgsz':640,'retina_masks':True,'width':720,'height':960,'objects':sem,'generated_at':now,'code_commit':code,'provenance':'New semantic run: original archive did not preserve masks'}
   del model
  for e in ENGINES:
   m=json.loads(z.read(f'{e}/metrics.json')); raw=read_npy(z,f'{e}/raw_depth.npy');depth=read_npy(z,f'{e}/depth.npy');rgb=rgb_read(z,f'{e}/rgb_aligned.png')
   for name,data in [('depth.npy',depth),('raw_depth.npy',raw)]:
    folder=args.local/e;folder.mkdir(exist_ok=True);np.save(folder/name,data)
   for n in ('pointcloud.ply','rgb_aligned.png','metrics.json'):(folder/n).write_bytes(z.read(f'{e}/{n}'))
   source_model=Path(m['model']).name if e=='yolo26' else m['model']
   weight=next(x for x in weights if x['model']==source_model)
   public={'engine':e,'model':source_model,'weights_sha256':weight['sha256'],'source_sha256':BUS,'width':m['width'],'height':m['height'],'units':m['units'],'depth_info':m['depth_info'],'intrinsics':m['intrinsics'],'color_range':m['color_range'],'statistics':m['distribution']['stats'],'device':'cuda:0','runtime':summary['environment'],'original_depth_npy_sha256':sha(z.read(f'{e}/depth.npy')),'original_raw_npy_sha256':sha(z.read(f'{e}/raw_depth.npy')),'original_ply_sha256':sha(z.read(f'{e}/pointcloud.ply')),'aligned_rgb_sha256':sha(z.read(f'{e}/rgb_aligned.png')),'depth':array(depth),'raw_depth':array(raw) if not np.array_equal(raw,depth) else 'depth','cloud':cloud(ply_records(z.read(f'{e}/pointcloud.ply')))}
   # Preserve the exact exported aligned PNG, shared only once per grid.
   public['rgb']=('rgb-720.png' if m['width']==720 else 'rgb-378.png')
   (ROOT/'website/data/bus').mkdir(parents=True,exist_ok=True)
   (ROOT/'website/data/bus'/public['rgb']).write_bytes(z.read(f'{e}/rgb_aligned.png'))
   write_json(ROOT/f'website/data/bus/{e}.json',public)
   manifest['engines'].append({'id':e,'path':e+'.json','sha256':sha((ROOT/f'website/data/bus/{e}.json').read_bytes()),'raw_sha256':array(raw)['sha256'],'depth_sha256':array(depth)['sha256'],'units':m['units'],'model':source_model,'weights_sha256':weight['sha256']})
 write_json(ROOT/'website/data/bus/semantic.json',semantic)
 manifest['semantic']='semantic.json';write_json(ROOT/'website/data/bus/manifest.json',manifest)
 # Missing original 32..55 Session: regenerate only this exact, hash-checked clip.
 os.environ.update(DEPTH_DEVICE='cuda:0',DA2_HALF='0',DA2_INPUT_SIZE='518',MODEL_OFFLINE='1',HF_HOME=str(args.models/'huggingface'),TRACKING_WORKER_PYTHON=str(args.worker))
 adapter=V2Adapter(); adapter.load(); detector=YOLO(str(args.models/'yolo26n.pt'))
 cap=cv2.VideoCapture(str(args.video));fps=cap.get(cv2.CAP_PROP_FPS)
 frames=[];tracks={};k=CameraGeometry(65).intrinsics(960,540)
 with TrackingWorker() as worker:
  for source in range(1,56):
   ok,bgr=cap.read();assert ok
   if source<32:continue
   bgr=cv2.resize(bgr,(960,540),interpolation=cv2.INTER_AREA)
   result=adapter.predict(bgr,k);idx=source-31
   local=args.local/'replay'/f'{idx:02d}';local.mkdir(parents=True,exist_ok=True)
   np.save(local/'raw_depth.npy',result.raw_depth);np.save(local/'depth.npy',result.depth);cv2.imwrite(str(local/'rgb.png'),bgr)
   predictions=extract_instances(detector.predict(bgr,device='cpu',imgsz=640,conf=.25,retina_masks=True,verbose=False)[0],(540,960),'detect',.25)
   objects=[{**{k:v for k,v in x.items() if k!='mask'},**_geometry(x,result.depth,result.intrinsics)} for x in predictions]
   linked,dropped=worker.step(bgr,objects,reset=idx==1)
   # Preserve every detector observation; no invented ID for unmatched rows.
   for ob in objects:
    match=next((a for a in linked if a['bbox']==ob['bbox'] and a['confidence']==ob['confidence'] and a['class_id']==ob['class_id']),None)
    ob['object_id']=match['object_id'] if match else None
    if match:tracks.setdefault(match['object_id'],[]).append({'index':idx,'timestamp':(source-1)/fps,**ob})
   frame={'index':idx,'source_frame':source,'timestamp':(source-1)/fps,'width':960,'height':540,'intrinsics':k,'objects':objects,'unassociated':dropped,'raw_depth_sha256':sha(result.raw_depth.tobytes()),'depth_sha256':sha(result.depth.tobytes()),'aligned_rgb_sha256':sha((local/'rgb.png').read_bytes())}
   write_json(local/'frame.json',frame)
   frames.append(frame)
   print('saved replay frame',idx,flush=True)
 cap.release()
 write_json(args.local/'tracking-report.json',{'frames':frames,'tracks':tracks})
 # Derived documentation artwork: measured annotations + explanation + attribution,
 # not a resized standalone stock frame. Original frames never enter the site pack.
 for f in frames:
  image=cv2.imread(str(args.local/'replay'/f"{f['index']:02d}"/'rgb.png'))
  image=cv2.resize(image,(768,432),interpolation=cv2.INTER_AREA)
  art=np.full((548,768,3),(35,24,12),np.uint8);art[:432]=image
  for o in f['objects']:
   x0,y0,x1,y1=[round(v*.8) for v in o['bbox']];tid=o['object_id'];c=(160,225,70) if tid else (100,150,190)
   cv2.rectangle(art,(x0,y0),(x1,y1),c,1)
   text=f"{tid or 'unassociated'} {o['label']} {o['confidence']:.2f}"
   cv2.putText(art,text,(max(0,min(600,x0)),max(12,y0-4)),cv2.FONT_HERSHEY_SIMPLEX,.34,c,1,cv2.LINE_AA)
  lines=[f"DepthPort - real saved analysis | Session {f['index']}/24 | Source frame {f['source_frame']}","YOLO26n + BoT-SORT | Green: associated; grey: no ID | No identity ground truth", "Relative / per-frame virtual depth; HFOV estimate. Not world motion or metres.","Footage: Lukas Kosc / Pexels #34597902 | Analysis demonstration; no endorsement"]
  for i,t in enumerate(lines):cv2.putText(art,t,(12,454+i*24),cv2.FONT_HERSHEY_SIMPLEX,.40,(225,235,235),1,cv2.LINE_AA)
  name=f"previews/{f['index']:02d}.jpg";dest=ROOT/'website/data/tracking'/name;dest.parent.mkdir(parents=True,exist_ok=True);cv2.imwrite(str(dest),art,[cv2.IMWRITE_JPEG_QUALITY,80]);f['preview']=name;f['preview_sha256']=sha(dest.read_bytes())
 write_json(ROOT/'website/data/tracking/frames.json',frames);write_json(ROOT/'website/data/tracking/tracks.json',tracks)
 write_json(ROOT/'website/data/tracking/manifest.json',{'format':'depthport.real-tracking.v1','generated_at':now,'code_commit':code,'run':'New run; original published screenshot Session missing locally. Do not equate counts or IDs with the original run.','source':json.loads((ROOT/'docs/validation/v0.3-public-replay-example.json').read_text())['source'],'first_source_frame':32,'last_source_frame':55,'count':24,'width':960,'height':540,'fps':fps,'playback_fps':5,'units':'relative / per-frame virtual 1..5, not metres','depth_model':adapter.model_id,'depth_version':transformers.__version__,'depth_revision':adapter.hf_commit,'depth_weights_sha256':next(w['sha256'] for w in weights if 'V2-Small' in w['model']),'depth_device':adapter.device_name,'depth_precision':'fp32','detector':'yolo26n.pt','detector_version':ultralytics.__version__,'detector_weights_sha256':sha((args.models/'yolo26n.pt').read_bytes()),'detector_device':'cpu','detector_imgsz':640,'confidence':.25,'tracking':'Roboflow BoT-SORT, no ReID','worker_runtime':worker.runtime,'worker_frame_rate':30,'intrinsics':k,'counts':{'ids':len(tracks),'detections':sum(len(f['objects']) for f in frames),'associated':sum(len(t) for t in tracks.values()),'unassociated':sum(f['unassociated'] for f in frames)},'frames':'frames.json','tracks':'tracks.json','local_report_sha256':sha((args.local/'tracking-report.json').read_bytes()),'rights_review':{'date':now[:10],'terms':'https://www.pexels.com/terms-of-service/','sections':'5 (adaptation, non-standalone creative works), 6 (attribution), 8 (no systematic copying)','scope':'24 annotated analytical documentation artworks from 0.959s; original MP4 and standalone frames excluded. Footage is under Pexels terms, not AGPL. No endorsement or identity inference.'},'limits':['Not an accuracy benchmark or long occlusion test','Unassociated is not ground-truth FN','Source FPS, tracker time step and UI playback rate differ','Camera XYZ is not world trajectory; per-frame normalization prevents metric motion interpretation']})
 # Explicit generated-file catalog; no copying from local inputs/runtime.
 data_root=ROOT/'website/data'
 files=[{'path':f.relative_to(data_root).as_posix(),'bytes':f.stat().st_size,'sha256':sha(f.read_bytes())} for f in sorted(data_root.rglob('*')) if f.is_file() and f.name!='catalog.json']
 write_json(data_root/'catalog.json',{'format':'depthport.public-assets.v1','files':files,'bytes':sum(f['bytes'] for f in files)})
if __name__=='__main__':main()
