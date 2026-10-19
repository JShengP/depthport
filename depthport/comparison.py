# SPDX-License-Identifier: AGPL-3.0-only
"""Renderable model comparison summaries from one frozen RGB source."""
from __future__ import annotations
import base64
import numpy as np
from .spatial import depth_distribution


def compact_card(cloud:dict, result, *, engine:str, model:str, source_sha256:str,
                 load_ms:float, wall_ms:float, sample_limit:int=6500) -> dict:
    data=base64.b64decode(cloud['points'])
    count=int(cloud['count'])
    if len(data)!=count*16: raise RuntimeError('Invalid point packet length')
    if count>sample_limit:
        arr=np.frombuffer(data,dtype='V16')
        idx=np.linspace(0,count-1,sample_limit,dtype=np.int32)
        data=arr[idx].tobytes()
        count=sample_limit
    return {'engine':engine,'model':model,'source_sha256':source_sha256,
            'units':result.units,'depth_info':result.info,
            'intrinsics':result.intrinsics,'width':cloud['width'],'height':cloud['height'],
            'rgb_jpeg':cloud['rgb_jpeg'],'depth_jpeg':cloud['depth_jpeg'],
            'points':base64.b64encode(data).decode('ascii'),'count':count,
            'original_point_count':cloud['count'],'color_range':cloud['color_range'],
            'distribution':depth_distribution(result.depth),
            'load_ms':round(load_ms,2),'pipeline_wall_ms':round(wall_ms,2),
            'timing_kind':'full_adapter_plus_cloud_wall_excludes_model_download_and_decode',
            'comparison_policy':'One identical source image; engines retain their original units and independent preprocessing.'}


def status_card(card: dict) -> dict:
    return {k:v for k,v in card.items() if k not in ('points','rgb_jpeg','depth_jpeg')}
