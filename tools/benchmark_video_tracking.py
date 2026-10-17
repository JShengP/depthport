#!/usr/bin/env python3
# SPDX-License-Identifier: AGPL-3.0-only
"""Offline Baseline vs Roboflow ByteTrack/BoT-SORT on one immutable detection cache."""
from __future__ import annotations
import argparse
import json
from pathlib import Path
import sys
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT))
from depthport.video_tracking_benchmark import benchmark,read_cache,VideoBenchmarkError,MAX_CACHE_BYTES,MAX_VIDEO_FRAMES


def main(argv=None):
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--video',type=Path,required=True)
    p.add_argument('--detections',type=Path,required=True)
    p.add_argument('--gt',type=Path,help='Optional dense-video GT in depthport.tracking-ground-truth.v1 format')
    p.add_argument('--output',type=Path,required=True)
    p.add_argument('--methods',nargs='+',choices=['baseline','bytetrack','botsort'],default=['baseline','bytetrack','botsort'])
    p.add_argument('--iou',type=float,default=.5)
    a=p.parse_args(argv)
    if a.output.is_symlink():p.error('Refusing symlink output')
    try:
        cache=read_cache(a.detections)
        gt=None
        if a.gt is not None:
            if a.gt.is_symlink() or not a.gt.is_file() or a.gt.stat().st_size > MAX_CACHE_BYTES:
                raise VideoBenchmarkError('Ground truth must be a local JSON file <=32 MiB')
            gt=json.loads(a.gt.read_text(encoding='utf-8'))
        report=benchmark(a.video,cache,methods=a.methods,gt=gt,iou=a.iou)
    except (VideoBenchmarkError,OSError,ValueError,ImportError) as e:
        p.exit(2,f'Benchmark failed: {e}\n')
    a.output.parent.mkdir(parents=True,exist_ok=True)
    a.output.write_text(json.dumps(report,indent=2,allow_nan=False,ensure_ascii=False)+'\n',encoding='utf-8')
    for method, run in report['trackers'].items():
        meta=run['metadata']
        s=meta.get('evaluation',{}).get('summary')
        print(f'{method}: tracker P50={meta["tracker_update"]["p50_ms"]:.3f}ms P95={meta["tracker_update"]["p95_ms"]:.3f}ms; '
              + (f'IDSW={s["id_switches"]} Recall={s["recall"]} Fragmentation={s["fragmentations"]}' if s else 'NO GT — not an accuracy benchmark'))
    print(f'Offline fixed-detection report: {a.output}')
    return 0

if __name__=='__main__':raise SystemExit(main())
