# SPDX-License-Identifier: AGPL-3.0-only
"""Explicit non-AI test doubles. Never imported by production code."""
import time
from types import SimpleNamespace
import numpy as np
from depthport.engines import DepthResult, PRESETS


class FakeEngine:
    def __init__(self,key,events=None):
        self.key=key; self.model_id='TEST-DOUBLE-'+key; self.version='NOT-AI';self.imgsz=504 if key!='yolo26' else 768
        self.device_name='test';self.loaded=False;self.last_timings={'predict_wall_ms':1.,'inference_ms':None}
        self.calls=0;self.events=events if events is not None else []
    def load(self):
        self.loaded=True;self.events.append(('load',self.key));return 1.
    def predict(self,bgr,intr):
        self.calls+=1;self.events.append(('predict',self.key))
        value=2.5 if self.key=='yolo26' else 4. if self.key=='da3-small' else 3. if self.key=='da2-small' else 6.
        depth=np.full(bgr.shape[:2],value,np.float32)
        raw=depth.copy() if self.key!='da3-metric' else depth/2
        if self.key == 'da2-small':
            from depthport.v2_engine import relative_to_virtual
            depth, info = relative_to_virtual(raw)
            info['explicit_test_double'] = True
            return DepthResult(bgr,depth,raw,intr,PRESETS[self.key]['units'],info=info)
        return DepthResult(bgr,depth,raw,intr,PRESETS[self.key]['units'],
                           info={'explicit_test_double':True,'raw_to_output_scale':2 if self.key=='da3-metric' else 1})
    def unload(self):self.loaded=False;self.events.append(('unload',self.key))


def wait_for(predicate,timeout=3.):
    end=time.monotonic()+timeout
    while time.monotonic()<end:
        value=predicate()
        if value:return value
        time.sleep(.02)
    raise AssertionError('Timed out waiting for worker condition')


def fixture_image():return np.full((32,64,3),(25,150,210),np.uint8)
