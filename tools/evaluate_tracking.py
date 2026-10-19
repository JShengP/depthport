#!/usr/bin/env python3
# SPDX-License-Identifier: AGPL-3.0-only
"""Offline tracking acceptance report: saved tracking JSON versus manually labeled GT.

No network, model load or RTSP capture. Inputs and outputs stay on the local machine.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT))
from depthport.tracking_eval import evaluate, TrackingEvaluationError

MAX_JSON_BYTES = 2 * 1024 * 1024


def read_json(path:Path):
    if path.is_symlink() or not path.is_file() or path.stat().st_size > MAX_JSON_BYTES:
        raise TrackingEvaluationError('Input must be a local JSON file <=2 MiB (not a symlink)')
    try:
        data=json.loads(path.read_text(encoding='utf-8'))
    except (OSError,UnicodeError,ValueError) as exc:
        raise TrackingEvaluationError(f'Cannot read JSON: {path.name}') from exc
    if not isinstance(data,dict):
        raise TrackingEvaluationError('Input JSON root must be an object')
    return data


def main(argv=None):
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--tracking',required=True,type=Path,help='DepthPort local tracking.json report')
    p.add_argument('--ground-truth',required=True,type=Path,help='Manually reviewed GT JSON')
    p.add_argument('--iou',type=float,default=0.5,help='Class-gated IoU threshold (default 0.50)')
    p.add_argument('--output',type=Path,help='Optional local JSON report (not Git tracked)')
    args=p.parse_args(argv)
    try:
        report=evaluate(read_json(args.tracking),read_json(args.ground_truth),iou_threshold=args.iou)
    except TrackingEvaluationError as exc:
        p.exit(2,f'Invalid tracking evaluation: {exc}\n')
    payload=json.dumps(report,indent=2,ensure_ascii=False,allow_nan=False)+'\n'
    if args.output:
        args.output.parent.mkdir(parents=True,exist_ok=True)
        if args.output.is_symlink():
            p.exit(2,'Refusing to overwrite a symlink\n')
        args.output.write_text(payload,encoding='utf-8')
        print(f'Created local report: {args.output}')
    s=report['summary']
    print(f"Frames {report['evaluated_frames']}, TP={s['tp']} FP={s['fp']} FN={s['fn']} "
          f"IDSW={s['id_switches']} Frag={s['fragmentations']} "
          f"Precision={s['precision']} Recall={s['recall']}")
    print('Experimental IoU diagnostics only; not official MOT benchmark or real-world 3D accuracy.')
    return 0

if __name__=='__main__':
    raise SystemExit(main())
