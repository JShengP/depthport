#!/usr/bin/env python3
# SPDX-License-Identifier: AGPL-3.0-only
"""Calibrate a pinhole IP camera using public/private local checkerboard frames.

Examples:
  python tools/calibrate_camera.py --images 'samples/calib/*.jpg' \\
     --corners-x 9 --corners-y 6 --square-mm 25 \\
     --output camera_intrinsics.json

Images, calibration output and customer camera IP never belong in Git.
"""
from __future__ import annotations
import argparse
import glob
import json
import math
from pathlib import Path
import sys
import cv2
import numpy as np


def calibrate(images:list[str],corners_x:int,corners_y:int,square_mm:float,
              min_success:int=8) -> dict:
    if not 3<=corners_x<=30 or not 3<=corners_y<=30:
        raise ValueError('Inner checkerboard corners must be 3..30 per axis')
    if not math.isfinite(square_mm) or not 0<square_mm<=1000:
        raise ValueError('Checker square length must be positive and <=1000 mm')
    target=(corners_x,corners_y)
    grid=np.zeros((corners_x*corners_y,3),np.float32)
    grid[:,:2]=np.mgrid[0:corners_x,0:corners_y].T.reshape(-1,2)*float(square_mm)
    objpoints=[];imgpoints=[];dimensions=None;successful=[]
    for filepath in sorted(set(images)):
        bgr=cv2.imread(filepath)
        if bgr is None: continue
        h,w=bgr.shape[:2]
        if dimensions is None:dimensions=(w,h)
        if (w,h)!=dimensions:raise ValueError('Every calibration frame must have same size and uncropped field of view')
        mono=cv2.cvtColor(bgr,cv2.COLOR_BGR2GRAY)
        ok,corners=cv2.findChessboardCorners(mono,target,cv2.CALIB_CB_ADAPTIVE_THRESH+cv2.CALIB_CB_NORMALIZE_IMAGE)
        if not ok: continue
        refined=cv2.cornerSubPix(mono,corners,(11,11),(-1,-1),(cv2.TERM_CRITERIA_EPS+cv2.TERM_CRITERIA_MAX_ITER,40,.001))
        objpoints.append(grid.copy());imgpoints.append(refined)
        successful.append(Path(filepath).name)
    if len(objpoints)<min_success:
        raise ValueError(f'{len(objpoints)} usable checkerboards; need >= {min_success} covering varied poses and the whole image')
    rms,K,dist,rvecs,tvecs=cv2.calibrateCamera(objpoints,imgpoints,dimensions,None,None)
    if not math.isfinite(rms) or rms<=0:raise ValueError('OpenCV returned invalid reprojection RMS')
    # Baseline radial/tangential fit. The checkerboard square size sets only
    # extrinsic translation units, NOT focal calibration units (K in pixels).
    return {'camera_model':'pinhole','image_width':dimensions[0], 'image_height':dimensions[1],
            'fx':float(K[0,0]),'fy':float(K[1,1]),'cx':float(K[0,2]),'cy':float(K[1,2]),
            'dist_coeffs':[float(x) for x in dist.flatten()],
            'calibration_metadata':{'rms_reprojection_px':float(rms),
                                   'checkerboard_inner_corners':[corners_x,corners_y],
                                   'square_size_mm':square_mm,
                                   'frames_used':len(successful),
                                   'frames_submitted':len(images),
                                   'source_filenames':successful,
                                   'needs_independent_validation':True}}


def main(argv=None):
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--images',required=True,help='Local glob pattern; quote to prevent shell expansion')
    p.add_argument('--corners-x',type=int,default=9,help='Number of INNER corners horizontally')
    p.add_argument('--corners-y',type=int,default=6)
    p.add_argument('--square-mm',type=float,required=True)
    p.add_argument('--output',type=Path,default=Path('camera_intrinsics.json'))
    a=p.parse_args(argv)
    if len(glob.glob(a.images))<8: p.error('Please supply at least eight real checkerboard frames')
    try:out=calibrate(glob.glob(a.images),a.corners_x,a.corners_y,a.square_mm)
    except ValueError as exc:p.error(str(exc))
    # Avoid publishing local image filenames in the calibration JSON.
    out['calibration_metadata'].pop('source_filenames',None)
    a.output.write_text(json.dumps(out,indent=2)+'\n',encoding='utf-8')
    print(f"Saved {a.output}; {out['calibration_metadata']['frames_used']} frames; RMS={out['calibration_metadata']['rms_reprojection_px']:.3f} px")
    print('Set CAMERA_INTRINSICS_FILE to this path in your LOCAL .env; restart. RMS is not depth accuracy.')
    return 0

if __name__=='__main__':sys.exit(main())
