# SPDX-License-Identifier: AGPL-3.0-only
"""Generated image/cache end-to-end seals, without source media or inference."""
import json
import os
from pathlib import Path
import pytest


@pytest.mark.skipif(os.getenv('RUN_TRACKERS_CONTRACTS')!='1',reason='Optional generated native replay/FFV1')
def test_complete_native_pickle_trace_input_and_arm_repeat_contract(tmp_path):
    import cv2
    import numpy as np
    from depthport.video_tracking_benchmark import CACHE_FORMAT, sha256_file
    from tools.validate_tracking_handoff_controls import replay, native_replay, load_ledger
    detector={'source':'generated'}
    video=tmp_path/'source.mkv';writer=cv2.VideoWriter(str(video),cv2.VideoWriter_fourcc(*'FFV1'),10,(32,32))
    assert writer.isOpened()
    for _ in range(4):writer.write(np.zeros((32,32,3),dtype=np.uint8))
    writer.release();video_sha=sha256_file(video)
    cache=tmp_path/'cache.json';frames=[]
    for i,score in enumerate((.9,.9,.2,.9),1):frames.append({'index':i,'detections':[{'bbox':[1.,2.,11.,22.],'confidence':score,'class_id':0}]})
    cache.write_text(json.dumps({'format':CACHE_FORMAT,'video_sha256':video_sha,'width':32,'height':32,'fps':10,
        'detector':dict(detector,frames_at_detection_cap=0),'frames':frames}))
    seq={'name':'generated','video':str(video),'video_sha256':video_sha,'caches':[str(cache)],'cache_sha256':[sha256_file(cache)]}
    spec={'name':'generated','frames':4,'fps':10}
    native=native_replay(seq,spec,detector,tmp_path/'native','native')
    obs=replay(seq,spec,detector,tmp_path/'observed','observed_native')
    for name in ('predictions.local.json','native-output.local.json','final-state.local.pickle'):
        assert native['sha256'][name]==obs['sha256'][name]
    for arm in ('projection','birth_continuation','past_competition_handoff'):
        first=replay(seq,spec,detector,tmp_path/(arm+'-0'),arm)
        second=replay(seq,spec,detector,tmp_path/(arm+'-1'),arm)
        assert first==second
        ledger=load_ledger(tmp_path/(arm+'-0'),first['accepted_summary'])
        assert ledger.summary()==first['accepted_summary'] and first['counts']['actions']==0
