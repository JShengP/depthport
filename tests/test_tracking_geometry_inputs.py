# SPDX-License-Identifier: AGPL-3.0-only
import copy
import pytest
from tools.validate_tracking_geometry import validate_new_manifest,validate_cache_schema


def source(name):return {'name':name,'video':'local.mkv','caches':['cache.json'],'video_sha256':'a'*64,'cache_sha256':['b'*64]}


@pytest.mark.parametrize('location',['top','source'])
def test_manifest_rejects_gt_or_unknown_fields_before_source_loading(location):
    m={'format':'depthport.geometry-inputs.v1','sequences':[source('KITTI-0006'),source('KITTI-0007')]}
    assert validate_new_manifest(m,['KITTI-0006','KITTI-0007'])==m
    (m if location=='top' else m['sequences'][0])['gt']='forbidden'
    with pytest.raises(ValueError,match='GT-free'):validate_new_manifest(m,['KITTI-0006','KITTI-0007'])


def test_complete_order_and_shard_uniqueness_required():
    m={'format':'depthport.geometry-inputs.v1','sequences':[source('KITTI-0007'),source('KITTI-0006')]}
    with pytest.raises(ValueError,match='order'):validate_new_manifest(m,['KITTI-0006','KITTI-0007'])
    m['sequences'].reverse();m['sequences'][0]['caches']*=2;m['sequences'][0]['cache_sha256']*=2
    with pytest.raises(ValueError,match='Unique'):validate_new_manifest(m,['KITTI-0006','KITTI-0007'])


@pytest.mark.parametrize('level',['top','detector','frame','object'])
def test_cache_unknown_label_or_score_fields_rejected_at_every_level(level):
    settings={'confidence':.1};cache={'format':'depthport.video-detections.v1','video_sha256':'a'*64,
        'width':100,'height':100,'fps':10,'detector':{'confidence':.1,'frames_at_detection_cap':0},
        'frames':[{'index':1,'detections':[{'bbox':[0,0,10,10],'confidence':.2,'class_id':0}]}]}
    validate_cache_schema(cache,settings)
    target={'top':cache,'detector':cache['detector'],'frame':cache['frames'][0],'object':cache['frames'][0]['detections'][0]}[level]
    target['annotations']=[]
    with pytest.raises(ValueError,match='fields'):validate_cache_schema(cache,settings)
