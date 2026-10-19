#!/usr/bin/env python3
# SPDX-License-Identifier: AGPL-3.0-only
"""Freeze then observe KITTI reference lifecycle on sealed caches; never read GT.

No model inference, control, input filtering, tuning or app integration.
All geometry/frame/token records must stay in ignored local artifacts.
"""
import argparse
from contextlib import nullcontext
from datetime import datetime, timezone
import hashlib
import importlib.metadata
import inspect
import json
from pathlib import Path
import subprocess
import sys
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT))
from depthport.tracking_lifecycle_probe import LifecycleProbe, require
from depthport.tracking_upstream_diagnostics import UpstreamLedger, COUNT_KEYS
from depthport.tracking_past_exposure import manifest, source_metadata, canonical
from depthport.tracking_exposure import iter_caches
from depthport.tracking_recovery_control import PARAMETERS
from depthport.video_tracking_benchmark import make_tracker, _one_step, sha256_file

SOURCE='docs/validation/v0.3-past-exposure-protocol.json'
PRIOR='docs/validation/v0.3-past-exposure-confirmation.json'
LOCK='docs/validation/v0.3-past-exposure-confirmation-inputs.json'
FILES=('depthport/tracking_lifecycle_probe.py','depthport/tracking_upstream_diagnostics.py',
    'tools/diagnose_tracking_upstream.py','tests/test_tracking_lifecycle_probe.py',
    'depthport/video_tracking_benchmark.py','depthport/tracking_past_exposure.py',
    'depthport/tracking_exposure.py','depthport/tracking_recovery_control.py')
RECORDS=(SOURCE,PRIOR,LOCK,'docs/validation/v0.3-exposure-gap.json')


def local(path):
    path=Path(path)
    require(not path.is_symlink() and path.resolve().is_relative_to(ROOT/'artifacts'), 'Ignored local artifacts required')
    return path.resolve()


def hashes():
    import trackers.core.bytetrack.tracker as module
    from trackers.core.base import BaseTracker, BaseTracklet
    from trackers.utils.iou import IoU
    import supervision as sv
    classes={'tracker':module.ByteTrackTracker,'tracklet':module.ByteTrackTracklet,
        'base_tracker':BaseTracker,'base_tracklet':BaseTracklet,'alive':module._get_alive_tracklets,
        'estimator':module.XYXYStateEstimator,'iou':IoU.compute,'box_iou':sv.box_iou_batch}
    return {name:hashlib.sha256(inspect.getsource(obj).encode()).hexdigest() for name,obj in classes.items()}


def freeze(output, seal):
    require(not output.exists() and not seal.exists(),'Refuse to overwrite freeze')
    source=json.loads((ROOT/SOURCE).read_text())
    runtime={n:importlib.metadata.version(n) for n in source['runtime']}
    require(runtime==source['runtime'] and source['parameters']==PARAMETERS,'Original runtime/config required')
    upstream=hashes();require(upstream['tracker']==source['upstream_bytetrack_class_sha256'],'Original tracker differs')
    protocol={'format':'depthport.upstream-lifecycle-protocol.v1','frozen_at_utc':datetime.now(timezone.utc).isoformat(),
        'base_commit':subprocess.check_output(['git','rev-parse','HEAD'],cwd=ROOT,text=True).strip(),
        'status':'Local definition freeze after synthetic contracts and known exposure-gap results, before new reference tracking/telemetry. Descriptive diagnosis of two already-seen sources, not independent confirmation.',
        'implementation_sha256':{p:sha256_file(ROOT/p) for p in FILES},
        'source_records_sha256':{p:sha256_file(ROOT/p) for p in RECORDS},'runtime':runtime,'upstream_sha256':upstream,
        'sources':['KITTI-0004','KITTI-0005'],'parameters':PARAMETERS,
        'execution':{'frames':611,'fps':10,'source_process':'Each source/trial isolated, OpenCV one thread/seed0; three full passes: unhooked reference, observed reference twice. Continuous ownership across original cache shards; full source video integrity/decode checked, no inference.',
            'equality':'Each pass exact canonical confirmed prediction text to original sealed reference; observed repeats raw lifecycle bytes and aggregate identical; original high/weak stage matrices, gate, matching, ownership, states and partitions identical each frame. New unfiltered native output sequence (including unconfirmed detections) and final native tracker pickle identical between unhooked and both observed passes after hook removal.',
            'failure':'All sources retained in fixed order, failures recorded, no retries/reselection or quality gating. Stop claims if equality/integrity fails; no adjusting code/definitions after new source diagnostics without a dated amendment.'},
        'definitions':{'observation':'Instance hooks forward exact original calls/results. Copy snapshots before/after native prediction, before/after fixed-step budget prune, both association stages, native unmatched-high birth candidates, before full lifecycle prune and after native update. No replacement solver, constructor, track update, birth or pruning; no global monkeypatch.',
            'birth':'Only native unmatched high-stage detections meeting original activation threshold create hypotheses; birth count separate from confirmed promotion. Weak inputs unchanged; they can update existing tentative or confirmed hypotheses but cannot seed new ones.',
            'expiry':'Mirror pinned fixed-step keep predicate from state just before native full prune: within budget age_since_update<=maximum_frames_without_update AND (sticky confirmed or consecutive maturity or just updated). Reasons expired / immature_unmatched / both kept separate, actual removals must match. Fixed10Hz buffer30 gives native10frame budget; association happens before inclusive post-update prune. Age11 can still recover if matched before prune. End-of-source retained hypotheses are censored, not expired.',
            'geometry':'Recompute original stage IoU exactly from captured predicted boxes and unchanged float32 cache boxes. For each confirmed missed age>=2 weak-stage row, partition no weak input / weak input; latter has gate support / zero overlap / positive below gate. Record invalid predicted boxes and horizontal/vertical disjointness for deterministic first best weak column locally; ties are not identity matches.',
            'past':'Only actual accepted high then weak updates record last accepted bbox; births separately indexed and never imputed as accepted match. Compare best current predicted IoU to best last accepted box IoU over same weak columns (better/equal/worse and old gate support), no added threshold. Diagnostic counterfactual geometry only, no association substitution or correctness claim.',
            'availability':'Per weak-input frame: remaining weak rows / all rows consumed high / no hypothesis ever born / all previous hypotheses removed. Count missed rows with and without weak input, unchanged raw inputs, native accepted high/weak updates, births, promotions, all removal reasons including zeros. No GT definition of miss/error.',
            'publication':'Only fixed count whitelist, removal age/gap histograms, source/input/output/code/runtime hashes and equality flags. Bboxes, per-frame indices/IDs/tokens, matrices, native state pickles and raw outputs remain local. Null/zero exposure not benefit/safety/harm acceptance.'},
        'count_keys':list(COUNT_KEYS),'forbidden':'No GT, annotation paths, scores/evaluation, inference, parameter/default/control changes, detector/input filtering, new sources/windows, tuning or app integration.',
        'terms':'Original KITTI source terms and attribution inherited from tracking-past-exposure; local noncommercial research, no media/labels/raw-output redistribution or relicensing.'}
    output.parent.mkdir(parents=True,exist_ok=True);output.write_text(json.dumps(protocol,indent=2)+'\n')
    local(seal).parent.mkdir(parents=True,exist_ok=True)
    seal.write_text(json.dumps({'protocol_sha256':sha256_file(output),'frozen_at_utc':protocol['frozen_at_utc']},indent=2)+'\n')
    print(json.dumps({'protocol_sha256':sha256_file(output),'source_tracking_started':False}))


def run_pass(seq, spec, detector, old_frames, old_trace, folder, observed):
    import cv2
    import pickle
    from trackers.utils.iou import IoU
    cv2.setNumThreads(1);cv2.setRNGSeed(0)
    folder.mkdir();tracker=make_tracker('bytetrack',fps=spec['fps'],parameters=PARAMETERS)
    cap=cv2.VideoCapture(seq['video']);frames=[];native=[];ledger=UpstreamLedger();rows=[]
    require(cap.isOpened(),'Cannot decode source')
    trace_file=(folder/'lifecycle.local.jsonl').open('w')
    try:
        with (LifecycleProbe(tracker) if observed else nullcontext()) as probe:
            index=0
            for cache in iter_caches(seq,detector):
                for item in cache['frames']:
                    index+=1;ok,image=cap.read()
                    require(ok and image.shape[:2]==(cache['height'],cache['width']),'Dense source decode differs')
                    # Preserve the exact benchmark conversion and update; intercept only
                    # the native return so unconfirmed output is also equality checked.
                    original=tracker.update
                    def capture(detections, frame=None, timestamp=None):
                        result=original(detections,frame=frame,timestamp=timestamp)
                        native.append({k:getattr(result,k).tolist() for k in ('xyxy','confidence','class_id','tracker_id')})
                        return result
                    owned='update' in tracker.__dict__;previous=tracker.__dict__.get('update')
                    tracker.update=capture
                    try:
                        objects,_,_,_=_one_step('bytetrack',tracker,{},1,item['detections'],image,index)
                    finally:
                        if owned:tracker.update=previous
                        else:del tracker.update
                    frames.append({'index':index,'objects':objects})
                    if observed:
                        require(probe.last['frame']==index,'Full lifecycle coverage differs')
                        ledger.add(probe.last,old_trace[index-1],IoU(),rows)
                        trace_file.write(json.dumps(probe.last,sort_keys=True,separators=(',',':'),allow_nan=False)+'\n')
            require(index==spec['frames'] and not cap.read()[0],'Source coverage differs')
    finally:
        cap.release();trace_file.close()
    prediction=canonical(frames)
    require(prediction==canonical(old_frames),'Original sealed canonical output differs')
    (folder/'predictions.local.json').write_text(json.dumps(frames)+'\n')
    (folder/'native-output.local.json').write_text(json.dumps(native,separators=(',',':'),allow_nan=False)+'\n')
    (folder/'final-state.local.pickle').write_bytes(pickle.dumps(tracker,protocol=4))
    if observed:(folder/'missed-weak-rows.local.json').write_text(json.dumps(rows,indent=2)+'\n')
    return {'prediction_sha256':hashlib.sha256(prediction.encode()).hexdigest(),
        'native_output_sha256':sha256_file(folder/'native-output.local.json'),
        'final_state_sha256':sha256_file(folder/'final-state.local.pickle'),
        'lifecycle_sha256':sha256_file(folder/'lifecycle.local.jsonl'),
        'summary':ledger.result() if observed else None}


def run(protocol_path, seal, inputs, raw_root, work, output):
    import multiprocessing
    from concurrent.futures import ProcessPoolExecutor
    protocol=json.loads(protocol_path.read_text());digest=sha256_file(protocol_path)
    require(json.loads(local(seal).read_text())['protocol_sha256']==digest,'Definition seal differs')
    for field in ('implementation_sha256','source_records_sha256'):
        for p,sha in protocol[field].items():require(sha256_file(ROOT/p)==sha,'Frozen file differs: '+p)
    require(hashes()==protocol['upstream_sha256'],'Pinned implementation differs')
    require({n:importlib.metadata.version(n) for n in protocol['runtime']}==protocol['runtime'],'Runtime differs')
    source=json.loads((ROOT/SOURCE).read_text());prior=json.loads((ROOT/PRIOR).read_text());lock=json.loads((ROOT/LOCK).read_text())
    require(prior['all_scheduled_completed'] and prior['gt_read'] is False and prior['accuracy_scoring'] is False and
        prior['input_lock_sha256']==sha256_file(ROOT/LOCK),'Complete original GT-free seal required')
    m=manifest(local(inputs),source,'confirmation')
    specs=[s for s in source['sequences'] if s['phase']=='confirmation']
    require([s['name'] for s in specs]==protocol['sources'],'Frozen source order differs')
    work=local(work);raw_root=local(raw_root)
    require(not work.exists() and not output.exists(),'Refuse overwrite or retry')
    work.mkdir(parents=True);records=[]
    with ProcessPoolExecutor(max_workers=1,mp_context=multiprocessing.get_context('spawn'),max_tasks_per_child=1) as pool:
        for seq,spec,locked,original in zip(m['sequences'],specs,lock['sequences'],prior['ledger']):
            record={'name':spec['name'],'frames':spec['frames'],'fps':spec['fps'],'status':'failed'}
            folder=work/spec['name'];folder.mkdir()
            try:
                require(source_metadata(seq,spec,source['detector_settings'])==locked,'Original cache/source lock differs')
                old_pred=raw_root/spec['name']/'activation_control-predictions.local.json'
                old_trace=raw_root/spec['name']/'activation_control-trace.local.jsonl'
                expected=original['arms']['activation_control']
                require(sha256_file(old_trace)==expected['trace_sha256'],'Original trace seal differs')
                old_frames=json.loads(old_pred.read_text());traces=[json.loads(line) for line in old_trace.read_text().splitlines()]
                require(hashlib.sha256(canonical(old_frames).encode()).hexdigest()==expected['prediction_sha256'],'Original prediction seal differs')
                require(len(old_frames)==len(traces)==spec['frames'],'Original full coverage differs')
                passes=[]
                for trial,observed in enumerate((False,True,True)):
                    value=pool.submit(run_pass,seq,spec,source['detector_settings'],old_frames,traces,folder/str(trial),observed).result()
                    require(value['prediction_sha256']==expected['prediction_sha256'],'Reference seal differs')
                    passes.append(value)
                require(all(passes[i][k]==passes[0][k] for i in (1,2) for k in ('prediction_sha256','native_output_sha256','final_state_sha256')),'Observation altered native outputs/state')
                require(passes[1]==passes[2],'Observed lifecycle repeat differs')
                record.update(status='completed',source_lock=locked,canonical_reference_equal=True,
                    native_output_equal=True,final_state_equal=True,observed_repeat_equal=True,
                    original_trace_sha256=expected['trace_sha256'],**passes[1])
            except Exception as exc:
                (folder/'failure.local.txt').write_text(repr(exc)+'\n')
                record['reason']='integrity_execution_or_observational_equality_failed'
            records.append(record);print(spec['name']+' '+record['status'],flush=True)
    result={'format':'depthport.upstream-lifecycle.v1','protocol_sha256':digest,'runtime':protocol['runtime'],
        'parameters':PARAMETERS,'gt_read':False,'accuracy_scoring':False,'retuned':False,'inference':False,
        'all_scheduled_completed':all(r['status']=='completed' for r in records),'ledger':records}
    output.parent.mkdir(parents=True,exist_ok=True);output.write_text(json.dumps(result,indent=2,allow_nan=False)+'\n')
    return 0 if result['all_scheduled_completed'] else 2


def main():
    p=argparse.ArgumentParser(description=__doc__);sub=p.add_subparsers(dest='command',required=True)
    f=sub.add_parser('freeze')
    for name in ('output','seal'):f.add_argument('--'+name,type=Path,required=True)
    r=sub.add_parser('run')
    for name in ('protocol','seal','inputs','raw-root','work','output'):r.add_argument('--'+name,type=Path,required=True)
    a=p.parse_args()
    if a.command=='freeze':freeze(a.output,a.seal);return 0
    return run(a.protocol,a.seal,a.inputs,a.raw_root,a.work,a.output)


if __name__=='__main__':raise SystemExit(main())
