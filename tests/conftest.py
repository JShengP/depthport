# SPDX-License-Identifier: AGPL-3.0-only
"""Never start a user's camera or use their calibration during default unit tests."""
import os
os.environ['RTSP_URL'] = ''
os.environ['CAMERA_INTRINSICS_FILE'] = ''
for key, value in {'MAX_IMAGE_WIDTH':'960','GRID_WIDTH':'220','TARGET_HZ':'2',
                   'CAMERA_HFOV_DEG':'65','MIN_DEPTH_M':'0.1','MAX_DEPTH_M':'80',
                   'COLOR_MIN_M':'0.1','COLOR_MAX_M':'20'}.items():
    os.environ[key] = value
if not os.getenv('DEPTHPORT_TEST_IMAGE'):
    for key, value in {'DEPTH_MODEL':'yolo26n-depth.pt','DEPTH_DEVICE':'auto',
                       'DEPTH_IMGSZ':'768','DEPTH_HALF':'0'}.items():
        os.environ[key] = value

os.environ['DEPTH_ENGINE']='yolo26'
os.environ['DEPTHPORT_ALLOWED_HOSTS']='127.0.0.1,localhost,testserver'
os.environ['DA3_CONF_PERCENTILE']='0'
os.environ['DA3_EXCLUDE_SKY']='1'
