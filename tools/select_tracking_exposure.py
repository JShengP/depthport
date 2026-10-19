#!/usr/bin/env python3
# SPDX-License-Identifier: AGPL-3.0-only
"""Frozen GT-free discovery/confirmation exposure search; no accuracy scoring.

Every frozen scene is reported, including zero exposure/failures. Raw matrices,
per-frame decisions and predictions stay in ignored local storage. Shards never
reset tracker state and never omit source frames. No downloads or uploads.
"""
from __future__ import annotations
import argparse
from collections import Counter
from contextlib import ExitStack
import hashlib
import importlib.metadata
import inspect
import json
from pathlib import Path
import sys
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT))
from depthport.video_tracking_benchmark import make_tracker,sha256_file,_one_step
from depthport.tracking_association_probe import AssociationProbe
from depthport.tracking_exclusive_control import ExclusiveDeferral,OBJECTIVE_ATOL
from depthport.tracking_recovery_control import PARAMETERS,MARGIN
from depthport.tracking_exposure import SCAN_ARMS,COUNT_KEYS,exposure_counts,selection,load_inputs,iter_caches


def canonical(pred):
    ids={};out=[]
    for f in pred:
        objects=[]
        for o in f['objects']:
            tid=ids.setdefault(o['object_id'],len(ids)+1)
            objects.append([tid,o['class_id'],o['confidence'],*o['bbox']])
        out.append([f['index'],objects])
    return json.dumps(out,separators=(',',':'),allow_nan=False)


def run_sequence(seq,detector,arm,trace_path=None):
    import cv2
    chunks=iter_caches(seq,detector);first=next(chunks)
    tracker=make_tracker('bytetrack',fps=first['fps'],parameters=PARAMETERS)
    cap=cv2.VideoCapture(seq['video']);digest=hashlib.sha256();counts=Counter();pred=[];index=0
    if not cap.isOpened():raise ValueError('Cannot decode source video')
    file=Path(trace_path).open('w') if trace_path else None
    try:
        with ExitStack() as stack:
            control=stack.enter_context(ExclusiveDeferral(tracker,arm))
            probe=stack.enter_context(AssociationProbe(tracker,'bytetrack'))
            from itertools import chain
            for cache in chain([first],chunks):
                for item in cache['frames']:
                    index+=1;ok,frame=cap.read()
                    if not ok or frame.shape[:2]!=(cache['height'],cache['width']):
                        raise ValueError('Full dense video/cache coverage differs')
                    objects,_,_,_=_one_step('bytetrack',tracker,{},1,item['detections'],frame,index)
                    pred.append({'index':index,'objects':objects})
                    probe.last['deferred']=control.last;probe.last['competition_audit']=control.audit
                    counts.update(exposure_counts(probe.last))
                    line=json.dumps(probe.last,sort_keys=True,separators=(',',':'),allow_nan=False)+'\n'
                    digest.update(line.encode())
                    if file:file.write(line)
            if cap.read()[0]:raise ValueError('Source truncated by cache shards')
    finally:
        cap.release()
        if file:file.close()
    return {'prediction_sha256':hashlib.sha256(canonical(pred).encode()).hexdigest(),
        'trace_sha256':digest.hexdigest(),'counts':{k:counts[k] for k in COUNT_KEYS}},pred


def main():
    p=argparse.ArgumentParser(description=__doc__)
    for name in ('protocol','inputs','input-lock','work-dir','output'):
        p.add_argument('--'+name,type=Path,required=True)
    p.add_argument('--phase',choices=['discovery','confirmation'],required=True)
    p.add_argument('--discovery',type=Path)
    a=p.parse_args();protocol=json.loads(a.protocol.read_text());lock=json.loads(a.input_lock.read_text())
    if (protocol['parameters']!=PARAMETERS or protocol['margin']!=MARGIN
        or protocol['objective_atol']!=OBJECTIVE_ATOL or protocol['arms']!=list(SCAN_ARMS)
        or protocol['repeats']!=3):p.error('Frozen control differs')
    for name,digest in protocol['implementation_sha256'].items():
        if sha256_file(ROOT/name)!=digest:p.error('Frozen implementation changed: '+name)
    runtime={n:importlib.metadata.version(n) for n in protocol['runtime']}
    from trackers import ByteTrackTracker
    if (runtime!=protocol['runtime'] or hashlib.sha256(inspect.getsource(ByteTrackTracker).encode()).hexdigest()
        !=protocol['upstream_bytetrack_class_sha256']):p.error('Pinned runtime/upstream differs')
    if lock['protocol_sha256']!=sha256_file(a.protocol):p.error('Input lock differs from protocol')
    inputs=load_inputs(a.inputs,protocol)
    for seq,frozen in zip(inputs['sequences'],lock['sequences']):
        if any(seq[k]!=frozen[k] for k in ('name','video_sha256','cache_sha256')):p.error('Input lock mismatch')
    if [s['name'] for s in lock['sequences']]!=[s['name'] for s in protocol['sequences']]:p.error('Input lock order mismatch')
    if a.work_dir.is_symlink() or a.output.is_symlink():p.error('Non-symlink local destinations required')
    old=None
    discovery_order=[s['name'] for s in protocol['sequences'] if s['phase']=='discovery']
    if a.phase=='confirmation':
        if not a.discovery:p.error('Sealed completed discovery required')
        old=json.loads(a.discovery.read_text())
        if (old['phase']!='discovery' or old['protocol_sha256']!=sha256_file(a.protocol)
            or old['input_lock_sha256']!=sha256_file(a.input_lock)
            or old['selection']!=selection(old['ledger'],discovery_order)):
            p.error('Discovery selection does not reproduce')
        # This file is written before reading any confirmation tracking output.
        a.work_dir.mkdir(parents=True,exist_ok=True)
        seal={'discovery_sha256':sha256_file(a.discovery),'selection':old['selection']}
        seal_path=a.work_dir/'discovery-seal.local.json'
        if seal_path.exists() and json.loads(seal_path.read_text())!=seal:p.error('Discovery seal changed')
        seal_path.write_text(json.dumps(seal,sort_keys=True)+'\n')
    import cv2
    cv2.setNumThreads(1)
    ledger=[]
    for spec,seq,locked in zip(protocol['sequences'],inputs['sequences'],lock['sequences']):
        if spec['phase']!=a.phase:continue
        local=a.work_dir/spec['name'];local.mkdir(parents=True,exist_ok=True)
        record={'name':spec['name'],'phase':a.phase,'prior_use':spec['prior_use'],
                'frames':spec['frames'],'status':'completed','arms':{},
                'cached_detections':locked['cached_detections'],'capped_frames':locked['capped_frames']}
        try:
            first={}
            for trial in range(3):
                order=SCAN_ARMS[trial:]+SCAN_ARMS[:trial]
                for arm in order:
                    cv2.setRNGSeed(0)
                    result,pred=run_sequence(seq,protocol['detector_settings'],arm,
                        local/(arm+'-trace.local.jsonl') if trial==0 else None)
                    if trial==0:
                        first[arm]=result
                        (local/(arm+'-predictions.local.json')).write_text(json.dumps(pred))
                    elif result!=first[arm]:raise ValueError('Repeated counts/predictions/trace differ')
                    print(spec['name']+' '+arm+' repeat '+str(trial+1)+' complete',flush=True)
            record['arms']={arm:{**v,'repeat_equal':True} for arm,v in first.items()}
        except Exception as exc:
            # Full exception text can contain private paths: local file only.
            (local/'failure.local.txt').write_text(repr(exc)+'\n')
            record['status']='failed';record['reason']='local_execution_or_repeat_contract_failed';record['arms']={}
        ledger.append(record)
    result={'format':'depthport.exposure-selection.v1','phase':a.phase,'checked_on':protocol['checked_on'],
        'protocol_sha256':sha256_file(a.protocol),'input_lock_sha256':sha256_file(a.input_lock),
        'runtime':runtime,'gt_read':False,'accuracy_scoring':False,'repeats':3,'ledger':ledger}
    if a.phase=='discovery':result['selection']=selection(ledger,discovery_order)
    else:
        result['discovery_sha256']=sha256_file(a.discovery);result['discovery_selection']=old['selection']
        result['confirmation']={arm:{'discovery_found':old['selection'][arm] is not None,
            'exposed_scenes':[r['name'] for r in ledger if r['status']=='completed' and r['arms'][arm]['counts']['actual_vetoes']>0],
            'replicated_in_both_reserved_scenes':old['selection'][arm] is not None and len(ledger)==2
                and all(r['status']=='completed' and r['arms'][arm]['counts']['actual_vetoes']>0 for r in ledger)} for arm in SCAN_ARMS[1:]}
    a.output.parent.mkdir(parents=True,exist_ok=True)
    a.output.write_text(json.dumps(result,indent=2,allow_nan=False)+'\n')
    print('Complete '+a.phase+' ledger; no GT or accuracy score read.',flush=True)
    return 0 if all(r['status']=='completed' for r in ledger) else 2


if __name__=='__main__':raise SystemExit(main())
