#!/usr/bin/env python3
# SPDX-License-Identifier: AGPL-3.0-only
"""Freeze and audit sealed KITTI state/observation health without tracking/GT."""
import argparse
from datetime import datetime,timezone
import hashlib
import importlib.metadata
import json
from pathlib import Path
import subprocess
import sys
from zoneinfo import ZoneInfo
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT))
from depthport.tracking_health_audit import audit,COUNT_KEYS,PHASES,KINDS,EVENTS
from depthport.tracking_lifecycle_probe import require
from depthport.tracking_upstream_diagnostics import UpstreamLedger
from depthport.tracking_past_exposure import manifest,source_metadata,canonical
from depthport.tracking_exposure import iter_caches
from depthport.video_tracking_benchmark import sha256_file
from tools.diagnose_tracking_upstream import hashes,local,SOURCE,PRIOR,LOCK

OLD_PROTOCOL='docs/validation/v0.3-upstream-lifecycle-protocol.json'
OLD_RESULT='docs/validation/v0.3-upstream-lifecycle.json'
FILES=('depthport/tracking_health_audit.py','tools/audit_tracking_health.py','tests/test_tracking_health_audit.py',
    'depthport/tracking_lifecycle_probe.py','depthport/tracking_upstream_diagnostics.py',
    'tools/diagnose_tracking_upstream.py','depthport/tracking_past_exposure.py',
    'depthport/tracking_exposure.py','depthport/video_tracking_benchmark.py')
RECORDS=(OLD_PROTOCOL,OLD_RESULT,SOURCE,PRIOR,LOCK)


def freeze(output,seal):
    require(not output.exists() and not seal.exists(),'Refuse to overwrite definition')
    old=json.loads((ROOT/OLD_PROTOCOL).read_text());runtime={n:importlib.metadata.version(n) for n in old['runtime']}
    require(runtime==old['runtime'] and hashes()==old['upstream_sha256'],'Original pinned runtime required')
    p={'format':'depthport.state-observation-health-protocol.v1',
       'frozen_at_utc':datetime.now(timezone.utc).isoformat(),'report_date_local':datetime.now(ZoneInfo('Asia/Taipei')).date().isoformat(),'report_timezone':'Asia/Taipei',
       'base_commit':subprocess.check_output(['git','rev-parse','HEAD'],cwd=ROOT,text=True).strip(),
       'status':'Local definition freeze after synthetic contracts, before new health extraction. Prior lifecycle results known (six invalid missed-row snapshots, ten births). Two already-seen sources; descriptive retrospective audit, not independent confirmation or external preregistration.',
       'runtime':runtime,'upstream_sha256':old['upstream_sha256'],
       'implementation_sha256':{p:sha256_file(ROOT/p) for p in FILES},
       'source_records_sha256':{p:sha256_file(ROOT/p) for p in RECORDS},
       'sources':['KITTI-0004','KITTI-0005'],'source_frames':611,
       'execution':'Read both original observed lifecycle files, require sealed hashes/bit equality, and audit each independently. Check all three previous full prediction JSON files against original reference bytes before canonicalization, native output/final pickle hashes without loading pickle. Reconcile every original stage/aggregate and immutable cache. No inference, tracking, GT, labels, scores/evaluator, new sources, windows, parameter/default/control/input changes or source reselection. Keep all zeros/failures.',
       'definitions':{
         'health':'Positive dimensions require finite xyxy, x2>x1 and y2>y1. Input boxes/confidences finite; non-positive width/height separately. Full original high>=.6 /weak<.6 partition, native IoU gate .1 unchanged. Original trace geometry is recomputed from exact cached float32 inputs by prior ledger.',
         'first':'Every born owned hypothesis, all full source frames, not only six known rows. Preserve exact posterior->next before-predict continuity, +1 native clocks, matched ownership, and prune partition. Earliest non-positive observation phase in native chronology: birth, prediction, accepted_high, accepted_weak. One first event per hypothesis plus independent first width/height phase; repeated invalid predictions are row observations, not independent objects.',
         'accepted_relation':'Actual high then weak accepted updates only; birth is a separate seed, never an accepted match. At a first prediction use only strictly earlier accepted history; at a first accepted-posterior violation record current accepted update separately from previous history. Keep stage, prior input/posterior validity, exact gap histogram and seed-only cases. Prediction/accepted transitions and repair/creation counts retain zero branches. No internal Kalman mean/covariance/noise data was recorded, so locate operation/sequence, not numerical root cause or identity correctness.',
         'gaps':'Complete source any/high/weak presence streams; histogram every maximal empty run, mark left/right/both boundary censoring. At every birth and each removal (all three reasons) or source-end survivor, count event-frame availability and nearest strictly earlier/later frames over full source; observed distances separate from censored boundary distances, including censored0. No fitted time window. Global input availability never means same-object observation.',
         'anchor':'Birth context uses its seed box; removal/end context uses last actual accepted detection box, explicitly seed-only if none. For each any/high/weak stream compute positive IoU>0 and original gate>=.1 at event/strict full-source neighbours. Fixed stale anchor geometry, no extrapolation after deletion, no ROI/threshold fit or identity claim. Future neighbours are retrospective context only, never causal support for an intervention.',
         'terminal':'Per removed/censored hypothesis, all frames after last accepted update (or separately labelled seed) through removal/source end inclusive. Count any/high/weak inputs, fixed-anchor positive/gate support and actual alive-prediction positive/gate support separately. Exact terminal-gap and accepted-interupdate/birth-to-first-update histograms; source-end is censored. Row frames may overlap across hypotheses, never pooled as independent source frames or GT misses.',
         'decision':'Describe whether first failures arise from birth, prediction, or accepted posterior, and distinguish absent inputs from geometric non-support. No safe repair, duration, detector threshold or identity claim from these data alone. Decide next separately frozen control/audit only after full ledger; no intervention or promotion in this study.',
         'public':'Only fixed aggregate counts/groups/histograms, all-source source/code/output seals and equality/failure flags. Frame positions, IDs/tokens, boxes, matrices, accepted histories, contextual cases/native states and paths remain ignored local artifacts.'},
       'count_keys':list(COUNT_KEYS),'phases':list(PHASES),'kinds':list(KINDS),'events':list(EVENTS),
       'terms':'Original KITTI attribution/terms inherited from tracking-past-exposure, local noncommercial research; no media/GT/raw output redistribution or dataset relicensing.'}
    output.parent.mkdir(parents=True,exist_ok=True);output.write_text(json.dumps(p,indent=2)+'\n')
    local(seal).parent.mkdir(parents=True,exist_ok=True);seal.write_text(json.dumps({'protocol_sha256':sha256_file(output),'frozen_at_utc':p['frozen_at_utc']},indent=2)+'\n')
    print(json.dumps({'protocol_sha256':sha256_file(output),'new_health_extraction_started':False}))


def read_predictions(path):
    frames=json.loads(path.read_text())
    require(isinstance(frames,list),'Reference frame array required')
    for frame in frames:
        require(set(frame)=={'index','objects'},'Reference has non-prediction keys')
        for obj in frame['objects']:
            require(set(obj)=={'bbox','confidence','class_id','object_id'},'Reference has non-prediction object keys')
    return frames


def analyze(protocol_path,seal,inputs,raw_root,original_root,work,output):
    import numpy as np
    from trackers.utils.iou import IoU
    p=json.loads(protocol_path.read_text());digest=sha256_file(protocol_path)
    require(json.loads(local(seal).read_text())['protocol_sha256']==digest,'Health definition seal differs')
    for key in ('implementation_sha256','source_records_sha256'):
        for name,sha in p[key].items():require(sha256_file(ROOT/name)==sha,'Frozen file differs: '+name)
    require({n:importlib.metadata.version(n) for n in p['runtime']}==p['runtime'] and hashes()==p['upstream_sha256'],'Pinned runtime differs')
    oldp=json.loads((ROOT/OLD_PROTOCOL).read_text());old=json.loads((ROOT/OLD_RESULT).read_text())
    require(old['protocol_sha256']==sha256_file(ROOT/OLD_PROTOCOL) and old['all_scheduled_completed'] and
        old['gt_read'] is False and old['accuracy_scoring'] is False,'Original completed GT-free lifecycle seal required')
    for key in ('implementation_sha256','source_records_sha256'):
        for name,sha in oldp[key].items():require(sha256_file(ROOT/name)==sha,'Original frozen file differs')
    source=json.loads((ROOT/SOURCE).read_text());prior=json.loads((ROOT/PRIOR).read_text());lock=json.loads((ROOT/LOCK).read_text())
    require(prior['input_lock_sha256']==sha256_file(ROOT/LOCK),'Original source lock differs')
    m=manifest(local(inputs),source,'confirmation');specs=[s for s in source['sequences'] if s['phase']=='confirmation']
    require([s['name'] for s in specs]==p['sources'] and sum(s['frames'] for s in specs)==p['source_frames'],'Complete source cohort required')
    raw_root=local(raw_root);original_root=local(original_root);work=local(work)
    require(not work.exists() and not output.exists(),'Refuse overwrite/retry')
    work.mkdir(parents=True);records=[]
    for seq,spec,locked,oldrecord,priorrecord in zip(m['sequences'],specs,lock['sequences'],old['ledger'],prior['ledger']):
        name=spec['name'];record={'name':name,'frames':spec['frames'],'status':'failed'};folder=work/name;folder.mkdir()
        try:
            require(name==oldrecord['name']==priorrecord['name']==locked['name'],'Original source order differs')
            require(source_metadata(seq,spec,source['detector_settings'])==locked==oldrecord['source_lock'],'Immutable source/cache differs')
            original=(original_root/name/'activation_control-predictions.local.json').read_bytes()
            original_frames=read_predictions(original_root/name/'activation_control-predictions.local.json')
            require(hashlib.sha256(canonical(original_frames).encode()).hexdigest()==oldrecord['prediction_sha256']==priorrecord['arms']['activation_control']['prediction_sha256'],'Original canonical reference differs')
            for trial in range(3):
                base=raw_root/name/str(trial)
                require((base/'predictions.local.json').read_bytes()==original,'Original reference prediction bytes differ')
                require(sha256_file(base/'native-output.local.json')==oldrecord['native_output_sha256'] and
                    sha256_file(base/'final-state.local.pickle')==oldrecord['final_state_sha256'],'Original native output/final state seal differs')
            trace_paths=[raw_root/name/str(t)/'lifecycle.local.jsonl' for t in (1,2)]
            require(all(sha256_file(x)==oldrecord['lifecycle_sha256'] for x in trace_paths),'Lifecycle seal differs')
            oldtracepath=original_root/name/'activation_control-trace.local.jsonl'
            require(sha256_file(oldtracepath)==oldrecord['original_trace_sha256'],'Original association trace differs')
            oldtraces=[json.loads(line) for line in oldtracepath.read_text().splitlines()]
            cached=[frame for cache in iter_caches(seq,source['detector_settings']) for frame in cache['frames']]
            summaries=[];raw_hashes=[]
            for trial,path in enumerate(trace_paths):
                traces=[json.loads(line) for line in path.read_text().splitlines()]
                require(len(traces)==len(cached)==len(oldtraces)==spec['frames'],'Full source coverage differs')
                ledger=UpstreamLedger()
                for trace,item,before in zip(traces,cached,oldtraces):
                    boxes=np.array([d['bbox'] for d in item['detections']],dtype=np.float32).reshape(-1,4)
                    scores=np.array([d['confidence'] for d in item['detections']],dtype=np.float32)
                    require(np.array_equal(boxes,np.array(trace['input_boxes']).reshape(-1,4)) and np.array_equal(scores,trace['input_confidences']),'Trace/cache input differs')
                    ledger.add(trace,before,IoU(),[])
                require(ledger.result()==oldrecord['summary'],'Original lifecycle aggregate differs')
                summary,raw=audit(traces,IoU());rawpath=folder/(str(trial)+'-health.local.json')
                rawpath.write_text(json.dumps(raw,sort_keys=True,separators=(',',':'),allow_nan=False)+'\n')
                raw_hashes.append(sha256_file(rawpath));summaries.append(summary)
            require(summaries[0]==summaries[1] and raw_hashes[0]==raw_hashes[1],'Independent sealed-history traversals differ')
            record.update(status='completed',reference_prediction_bytes_equal=True,native_seals_equal=True,
                original_stage_aggregate_equal=True,repeat_aggregate_and_raw_equal=True,
                source_lock=locked,original_lifecycle_sha256=oldrecord['lifecycle_sha256'],
                original_prediction_sha256=oldrecord['prediction_sha256'],raw_audit_sha256=raw_hashes[0],summary=summaries[0])
        except Exception as exc:
            (folder/'failure.local.txt').write_text(repr(exc)+'\n');record['reason']='integrity_continuity_or_health_audit_failed'
        records.append(record);print(name+' '+record['status'],flush=True)
    result={'format':'depthport.state-observation-health.v1','protocol_sha256':digest,
        'gt_read':False,'accuracy_scoring':False,'new_tracking':False,'inference':False,'retuned':False,
        'all_scheduled_completed':all(r['status']=='completed' for r in records),'ledger':records}
    output.parent.mkdir(parents=True,exist_ok=True);output.write_text(json.dumps(result,indent=2,allow_nan=False)+'\n')
    return 0 if result['all_scheduled_completed'] else 2


def main():
    parser=argparse.ArgumentParser(description=__doc__);sub=parser.add_subparsers(dest='command',required=True)
    f=sub.add_parser('freeze')
    for key in ('output','seal'):f.add_argument('--'+key,type=Path,required=True)
    a=sub.add_parser('analyze')
    for key in ('protocol','seal','inputs','raw-root','original-root','work','output'):a.add_argument('--'+key,type=Path,required=True)
    args=parser.parse_args()
    if args.command=='freeze':freeze(args.output,args.seal);return 0
    return analyze(args.protocol,args.seal,args.inputs,args.raw_root,args.original_root,args.work,args.output)


if __name__=='__main__':raise SystemExit(main())
