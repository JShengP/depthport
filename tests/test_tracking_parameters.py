# SPDX-License-Identifier: AGPL-3.0-only
"""Bounded parameter dispatch and paired diagnostics; no real-video accuracy claim."""
import os
import sys
import types

import pytest

from depthport.mot_scenarios import compare_event_recovery
from depthport.video_tracking_benchmark import make_tracker,validate_tracker_parameters,VideoBenchmarkError
from tools.validate_mot_tracking import run_configurations


def test_parameter_dispatch_preserves_backend_fps_and_rejects_silent_worker_overrides(monkeypatch):
    seen=[]
    def constructor(**kwargs):
        seen.append(kwargs)
        return object()
    monkeypatch.setitem(sys.modules,'trackers',types.SimpleNamespace(ByteTrackTracker=constructor,BoTSORTTracker=constructor))
    monkeypatch.setitem(sys.modules,'supervision',types.SimpleNamespace())
    monkeypatch.setattr('importlib.metadata.version',lambda name:'2.6.1')
    params={'track_activation_threshold':.3,'high_conf_det_threshold':.3,'lost_track_buffer':90}
    make_tracker('bytetrack',fps=14.,parameters=params)
    assert seen==[{'frame_rate':14.,**params}] and params['lost_track_buffer']==90
    make_tracker('botsort',fps=25.)
    assert seen[-1]=={'frame_rate':25.}
    for backend in ['baseline','botsort-worker']:
        with pytest.raises(VideoBenchmarkError):make_tracker(backend,fps=30.,parameters=params)


@pytest.mark.parametrize('params',[{'lost_track_buffer':-1},{'lost_track_buffer':301},{'lost_track_buffer':True},
    {'lost_track_buffer':1.5},{'track_activation_threshold':float('nan')},{'track_activation_threshold':float('inf')},
    {'track_activation_threshold':True},{'track_activation_threshold':1.1},{'high_conf_det_threshold':.1},
    {'high_conf_det_threshold':-.1},{'executable':'untrusted'},[]])
def test_invalid_parameters_fail_before_dependency_import(params):
    with pytest.raises(VideoBenchmarkError):validate_tracker_parameters('botsort',params)


def test_profiles_include_activation_floor_control_and_separate_buffer_effect():
    assert tuple(run_configurations())==('baseline','bytetrack','botsort')
    runs=run_configurations(True)
    assert len(runs)==10 and len({r['profile'] for r in runs.values()})==5
    for backend in ['bytetrack','botsort']:
        cfg=lambda name:runs[backend+'__'+name]['parameters']
        default=cfg('default');activation=cfg('activation_only');gates=cfg('lower_gates');buffer=cfg('longer_buffer')
        assert {k for k in default if default[k]!=activation[k]}=={'track_activation_threshold'}
        assert {k for k in activation if activation[k]!=gates[k]}=={'high_conf_det_threshold'}
        assert {k for k in default if default[k]!=buffer[k]}=={'lost_track_buffer'}
        assert cfg('lower_gates_longer_buffer')=={**gates,'lost_track_buffer':90}
    # A caller cannot mutate the fixed study definition through the returned mapping.
    runs['bytetrack__default']['parameters']['lost_track_buffer']=999
    assert run_configurations(True)['bytetrack__default']['parameters']['lost_track_buffer']==30


def test_paired_event_recovery_reports_gains_and_losses_without_cross_run_id_comparison():
    events=[{'ids':[i],'before':[1],'after':[3]} for i in range(1,6)]
    reference={1:{1:10,2:20,3:30,4:40},3:{1:10,2:21,3:30,4:40}}
    candidate={1:{1:99,2:80,3:70,5:60},3:{1:99,2:80,3:71,5:60}}
    result=compare_event_recovery(events,reference,candidate)
    assert result=={'subjects':5,'same_id_in_both':1,'gained_same_id_from_changed':1,
        'gained_same_id_from_missing':1,'lost_same_id_to_changed':1,'lost_same_id_to_missing':1,
        'gained_matched_endpoints':1,'lost_matched_endpoints':1}


@pytest.mark.skipif(os.getenv('RUN_TRACKERS_CONTRACTS')!='1',reason='Opt-in isolated NumPy 2 / trackers 2.6.1 environment')
@pytest.mark.parametrize('backend',['bytetrack','botsort'])
def test_real_backend_confidence_floor_and_lost_track_budget(backend):
    import numpy as np
    import supervision as sv
    import cv2
    frame=np.zeros((64,64,3),dtype=np.uint8)
    def step(tracker,score=None):
        detections=sv.Detections(xyxy=np.array([[10,10,30,40]],dtype=np.float32) if score is not None else np.empty((0,4),dtype=np.float32),
            confidence=np.array([score],dtype=np.float32) if score is not None else np.empty(0,dtype=np.float32),
            class_id=np.array([0],dtype=np.int32) if score is not None else np.empty(0,dtype=np.int32))
        result=tracker.update(detections,frame=frame if backend=='botsort' else None)
        return [int(i) for i in result.tracker_id if i>=0]
    cv2.setNumThreads(1)
    configs=run_configurations(True)
    for profile,should_activate in [('default',False),('activation_only',False),('lower_gates',True)]:
        t=make_tracker(backend,fps=30.,parameters=configs[backend+'__'+profile]['parameters'])
        for _ in range(3):ids=step(t,.4)
        assert bool(ids)==should_activate
    for profile,should_keep in [('default',False),('longer_buffer',True)]:
        t=make_tracker(backend,fps=30.,parameters=configs[backend+'__'+profile]['parameters'])
        for _ in range(3):before=step(t,.9)
        assert len(before)==1
        for _ in range(45):step(t)
        for _ in range(2):after=step(t,.9)
        assert len(after)==1 and (before==after)==should_keep
    # Reference-frame units must remain seconds when source FPS differs.
    t=make_tracker(backend,fps=14.,parameters=configs[backend+'__longer_buffer']['parameters'])
    assert t.maximum_time_without_update==3. and t.maximum_frames_without_update==42
