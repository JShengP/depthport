# SPDX-License-Identifier: AGPL-3.0-only
"""Synthetic event-definition tests, never real-video accuracy evidence."""
import json
from pathlib import Path
import pytest

from depthport.mot_scenarios import read_mot_gt,scenario_events,score_events
from tools.validate_mot_tracking import load_manifest,canonical_predictions,write_mot_predictions,frame_matches,source_coordinate_scale,combine_scenario_scores


def row(f,ident=1,visibility=1,x=0):
    return {'frame':f,'id':ident,'visibility':visibility,'bbox':[x,0,10,20]}


def test_long_visibility_requires_duration_and_observable_anchors():
    rows=[row(f,visibility=.2 if 4<=f<=7 else 1) for f in range(1,11)]
    events=scenario_events(rows,4)['long_low_visibility']
    assert len(events)==1 and events[0]['start']==4 and events[0]['end']==7
    assert scenario_events(rows,5)['long_low_visibility']==[]
    assert scenario_events([r for r in rows if r['frame']<8],4)['long_low_visibility']==[]
    # A missing GT frame is not proof of a continuously occluded object.
    assert scenario_events([r for r in rows if r['frame']!=5],4)['long_low_visibility']==[]


def test_crossing_requires_overlap_and_order_exchange_not_nearby_parallel_tracks():
    rows=[r for f in range(1,10) for r in [row(f,1,x=f*3),row(f,2,x=30-f*3)]]
    events=scenario_events(rows,4)['overlap_order_exchange']
    assert len(events)==1 and events[0]['ids']==[1,2]
    parallel=[r for f in range(1,10) for r in [row(f,1,x=f),row(f,2,x=f+2)]]
    assert scenario_events(parallel,4)['overlap_order_exchange']==[]


def test_event_scores_separate_switches_from_missing_endpoint_and_deduplicate_overlap():
    rows=[row(f) for f in range(1,9)]
    event={'ids':[1],'start':3,'end':6,'before':[1,2],'after':[7,8]}
    matches={1:{1:10},2:{1:10},3:{1:10},7:{1:20},8:{1:20}}
    score=score_events([event,event],matches,rows,4)
    assert score['subjects']==2 and score['changed_id']==2 and score['same_id']==0
    assert score['event_gt_observations']==4 and score['event_matched_observations']==1
    missing=score_events([event],{1:{1:10}},rows,4)
    assert missing['missing_after']==1 and missing['matched_at_both_anchors']==0
    assert missing['same_id_rate_among_both_matched'] is None
    # ID zero is valid; it must not be confused with missing.
    assert score_events([event],{1:{1:0},7:{1:0}},rows,4)['same_id']==1


def test_gt_reader_rejects_duplicate_invalid_visibility_and_filters_nonpedestrians(tmp_path):
    p=tmp_path/'gt.txt';p.write_text('1,1,0,0,10,20,1,1,.5\n1,2,0,0,10,20,1,8,1\n')
    assert len(read_mot_gt(p,3))==1
    p.write_text('1,1,0,0,10,20,1,1,.5\n'*2)
    with pytest.raises(ValueError,match='Duplicate'):read_mot_gt(p,3)
    p.write_text('1,1,0,0,10,20,1,1,1.1\n')
    with pytest.raises(ValueError):read_mot_gt(p,3)
    for fps in [0,-1,float('nan'),True]:
        with pytest.raises(ValueError):scenario_events([],fps)


def test_manifest_rejects_duplicate_sequences_and_nonofficial_urls(tmp_path):
    p=tmp_path/'manifest.json';seq={'name':'MOT17-04-DPM','camera_motion':False,'video_url':'https://motchallenge.net/sequenceVideos/MOT17-04-DPM-raw.mp4'}
    p.write_text(json.dumps({'sequences':[seq]}));assert load_manifest(p)['sequences'][0]==seq
    p.write_text(json.dumps({'sequences':[seq,seq]}))
    with pytest.raises(ValueError):load_manifest(p)
    p.write_text(json.dumps({'sequences':[seq,{**seq,'name':'MOT17-04-SDP','video_url':'https://motchallenge.net/sequenceVideos/MOT17-04-SDP-raw.mp4'}]}))
    with pytest.raises(ValueError):load_manifest(p)
    p.write_text(json.dumps({'sequences':[{**seq,'video_url':'https://example.com/private'}]}))
    with pytest.raises(ValueError):load_manifest(p)


def test_mot_output_is_one_based_and_repeat_comparison_ignores_id_spelling(tmp_path):
    obj={'object_id':'a','class_id':0,'confidence':.9,'bbox':[0,2,10,22]}
    a={'frames':[{'index':1,'objects':[obj]}]};b={'frames':[{'index':1,'objects':[{**obj,'object_id':'z'}]}]}
    assert canonical_predictions(a)==canonical_predictions(b)
    p=tmp_path/'pred.txt';write_mot_predictions(a,p)
    v=p.read_text().strip().split(',');assert v[:6]==['1','1','1.000000000','3.000000000','10.000000000','20.000000000']
    with pytest.raises(ValueError):write_mot_predictions({'frames':[{'index':1,'objects':[{**obj,'class_id':2}]}]},p)


def test_scenario_assignment_uses_full_frame_one_to_one_matching():
    pytest.importorskip('scipy',reason='Optional TrackEval/SciPy benchmark environment')
    import numpy as np
    d={'gt_ids':[np.array([0,1])],'tracker_ids':[np.array([42])],'similarity_scores':[np.array([[.6],[.9]])]}
    assert frame_matches(d,[10,11])=={1:{11:42}}
    # Scoring a selected GT must not steal the other object's assigned box.
    e={'ids':[10],'start':1,'end':1,'before':[1],'after':[1]}
    s=score_events([e],frame_matches(d,[10,11]),[row(1,10),row(1,11)],1)
    assert s['missing_before']==1 and s['event_instance_recall']==0


def test_compressed_half_resolution_predictions_are_scaled_before_mot_pixel_origin(tmp_path):
    scale=source_coordinate_scale({'width':960,'height':540},{'imWidth':'1920','imHeight':'1080'})
    assert scale==2
    p=tmp_path/'pred.txt';write_mot_predictions({'frames':[{'index':1,'objects':[{'object_id':'a','class_id':0,'confidence':.9,'bbox':[5,10,15,30]}]}]},p,scale)
    assert p.read_text().split(',')[2:6]==['11.000000000','21.000000000','20.000000000','40.000000000']
    with pytest.raises(ValueError):source_coordinate_scale({'width':960,'height':500},{'imWidth':'1920','imHeight':'1080'})


def test_combined_scenario_rates_are_recomputed_from_counts_not_averaged():
    def seq(n,same):
        c={'events':n,'subjects':n,'matched_at_both_anchors':n,'same_id':same,'changed_id':n-same,
           'missing_before':0,'missing_after':0,'event_gt_observations':n,'event_matched_observations':same,'duration_seconds_total':n}
        return {'methods':{m:{'scenarios':{k:c for k in ['long_low_visibility','overlap_order_exchange']}} for m in ['baseline','bytetrack','botsort']}}
    c=combine_scenario_scores([seq(1,1),seq(9,0)])['botsort']['long_low_visibility']
    assert c['same_id_subject_coverage']==.1 and c['event_instance_recall']==.1
