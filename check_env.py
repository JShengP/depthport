# SPDX-License-Identifier: AGPL-3.0-only
"""API import checks and optional real-model smoke tests. No fake inference path."""
from __future__ import annotations
import argparse
import hashlib
import json
import os
from pathlib import Path
import sys
import time
import cv2
from depthport.config import CFG, ROOT
from depthport.cloud import CameraGeometry
from depthport.engines import PRESETS, make_engine
from depthport.api import prepare_cloud, bundle_bytes, decode_upload


def api_check(key: str):
    import torch
    from depthport.yolo_engine import choose_device
    _, dev = choose_device(torch, os.getenv('DEPTH_DEVICE', 'auto'))
    print(f'Python={sys.version.split()[0]} torch={torch.__version__} device={dev}')
    if key == 'yolo26':
        import ultralytics
        from ultralytics.models.yolo.depth import DepthPredictor
        print(f'YOLO DEPTH API IMPORT: PASS (ultralytics={ultralytics.__version__})')
    elif key == 'da2-small':
        import transformers
        from transformers import AutoImageProcessor, AutoModelForDepthEstimation, DepthAnythingForDepthEstimation, DPTImageProcessor
        if not callable(getattr(DPTImageProcessor, 'post_process_depth_estimation', None)):
            raise RuntimeError('V2 processor post_process_depth_estimation API is missing.')
        print(f'V2 API IMPORT: PASS (transformers={transformers.__version__}; not pretrained inference)')
    else:
        import inspect
        from depth_anything_3.api import DepthAnything3
        params = inspect.signature(DepthAnything3.inference).parameters
        for p in ('image','process_res','process_res_method','export_dir'):
            if p not in params: raise RuntimeError(f'DA3 inference API missing {p}')
        print('DA3 API IMPORT: PASS (not a model weight or inference check)')
    return dev


def smoke(key: str, image_path: Path, output: Path):
    data = image_path.read_bytes(); frame = decode_upload(data)
    calibration = CFG.calibration_file
    if calibration and not Path(calibration).is_absolute(): calibration = str(ROOT/calibration)
    geometry = CameraGeometry(CFG.hfov, calibration)
    prepared, intr = geometry.prepare(frame, CFG.max_width)
    engine = make_engine(key)
    try:
        load_ms = engine.load()
        start = time.perf_counter()
        result = engine.predict(prepared, intr)
        middle = time.perf_counter()
        cloud, filter_info = prepare_cloud(result)
        records = cloud.pop('points_raw')
        f = {**cloud, 'frame_id':1, 'generation':0, 'engine':key,
             'model':engine.model_id,'model_version':engine.version,
             'device':engine.device_name,'model_imgsz':engine.imgsz,
             'timestamp':time.time(),'source':'smoke_image',
             'source_sha256':hashlib.sha256(data).hexdigest(),
             'source_width':frame.shape[1],'source_height':frame.shape[0],
             'depth_info':result.info,'filter_info':filter_info,
             'timings':{**engine.last_timings,'last_model_load_ms':load_ms,
                        'cloud_ms':round((time.perf_counter()-middle)*1000,2),
                        'pipeline_ms':round((time.perf_counter()-start)*1000,2)}}
        output.mkdir(parents=True,exist_ok=True)
        (output/f'{key}.zip').write_bytes(bundle_bytes(f,records,result))
        print(f'REAL_INFERENCE: PASS [{key}], {cloud["count"]} points, units={result.units}')
        print('PASS means pipeline executed, NOT validated depth accuracy or realtime performance.')
        return {'engine':key,'real_inference':'PASS','points':cloud['count'],'units':result.units,'timings':f['timings']}
    finally: engine.unload()


def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--engine',choices=list(PRESETS),default=os.getenv('DEPTH_ENGINE','yolo26'))
    p.add_argument('--all',action='store_true',help='Check all four, one after another (not concurrently).')
    p.add_argument('--image',type=Path,help='Run REAL inference on this image; may download model weights.')
    p.add_argument('--output',type=Path,default=ROOT/'outputs/smoke')
    args=p.parse_args()
    keys=list(PRESETS) if args.all else [args.engine]
    reports=[]; failed=False
    for key in keys:
        try:
            api_check(key)
            reports.append(smoke(key,args.image,args.output) if args.image else {'engine':key,'api_import':'PASS','real_inference':'NOT RUN'})
        except Exception as exc:
            failed=True;print(f'CHECK FAILED [{key}]: {type(exc).__name__}: {exc}',file=sys.stderr)
            reports.append({'engine':key,'error':f'{type(exc).__name__}: {exc}','real_inference':'FAILED' if args.image else 'NOT RUN'})
    if args.image:
        args.output.mkdir(parents=True,exist_ok=True)
        (args.output/'report.json').write_text(json.dumps(reports,indent=2,ensure_ascii=False),encoding='utf-8')
    if not args.image: print('IMPORT CHECK ONLY. No model was downloaded and no real inference was performed.')
    return 1 if failed else 0


if __name__=='__main__': raise SystemExit(main())
