#!/usr/bin/env python3
# SPDX-License-Identifier: AGPL-3.0-only
"""Freeze numerical shadow and independent assignment definitions before replay."""
import argparse
from contextlib import ExitStack
from datetime import datetime,timezone
import hashlib
import importlib.metadata
import inspect
import json
import multiprocessing
from pathlib import Path
import pickle
import subprocess
import sys
from concurrent.futures import ProcessPoolExecutor
from zoneinfo import ZoneInfo
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT))
from depthport.tracking_lifecycle_probe import LifecycleProbe,require
from depthport.tracking_estimator_shadow import EstimatorShadow
from depthport.tracking_shadow_analysis import audit as numerical_audit
from depthport.tracking_high_assignment_audit import audit as assignment_audit
from depthport.tracking_past_exposure import manifest,source_metadata,canonical
from depthport.tracking_exposure import iter_caches
from depthport.tracking_recovery_control import PARAMETERS
from depthport.video_tracking_benchmark import make_tracker,_one_step,sha256_file
from tools.diagnose_tracking_upstream import local,hashes,SOURCE,PRIOR,LOCK
from tools.audit_tracking_health import read_predictions

UP='docs/validation/v0.3-upstream-lifecycle.json'
HP='docs/validation/v0.3-state-observation-health-protocol.json'
HEALTH='docs/validation/v0.3-state-observation-health.json'
FILES=('depthport/tracking_estimator_shadow.py','depthport/tracking_shadow_analysis.py',
    'depthport/tracking_high_assignment_audit.py','tools/audit_tracking_estimator_shadow.py',
    'tests/test_tracking_estimator_shadow.py','tests/test_tracking_high_assignment_audit.py')
RECORDS=(UP,HP,HEALTH,'docs/validation/v0.3-state-observation-health-publication.json',
    'docs/validation/v0.3-upstream-lifecycle-protocol.json',SOURCE,PRIOR,LOCK)


def internals():
    import trackers.utils.kalman_filter as k
    import trackers.utils.motion_models as m
    import trackers.utils.state_representations as s
    import scipy.optimize._lsap as solver
    return {key:sha256_file(Path(inspect.getfile(obj))) for key,obj in
        (('kalman_filter_module',k),('motion_models_module',m),('state_representations_module',s),('scipy_lsap_binary',solver))}


def freeze(output,seal):
    require(not output.exists() and not seal.exists(),'Refuse overwrite freeze')
    old=json.loads((ROOT/HP).read_text())
    require(hashes()==old['upstream_sha256'] and {n:importlib.metadata.version(n) for n in old['runtime']}==old['runtime'],'Original runtime required')
    byte_seals={}
    for name in ('KITTI-0004','KITTI-0005'):
        paths=[ROOT/'artifacts/tracking-past-exposure/confirmation'/name/'activation_control-predictions.local.json']
        paths += [ROOT/'artifacts/tracking-upstream-lifecycle/run'/name/str(i)/'predictions.local.json' for i in range(3)]
        require(len({sha256_file(path) for path in paths})==1,'Original complete reference byte seals differ')
        byte_seals[name]=sha256_file(paths[0])
    p={'format':'depthport.estimator-shadow-protocol.v1','frozen_at_utc':datetime.now(timezone.utc).isoformat(),
        'report_date_local':datetime.now(ZoneInfo('Asia/Taipei')).date().isoformat(),'report_timezone':'Asia/Taipei',
        'base_commit':subprocess.check_output(['git','rev-parse','HEAD'],cwd=ROOT,text=True).strip(),
        'status':'Local freeze after synthetic/native contracts, before new internal-state replay or assignment-case extraction. Four first prediction failures and five terminal high-gate/unaccepted row frames are already known aggregate findings. Two seen sources, retrospective diagnosis, not independent confirmation or external preregistration.',
        'runtime':old['runtime'],'upstream_sha256':hashes(),'numerical_modules_sha256':internals(),
        'implementation_sha256':{n:sha256_file(ROOT/n) for n in FILES},
        'source_records_sha256':{n:sha256_file(ROOT/n) for n in RECORDS},
        'sources':['KITTI-0004','KITTI-0005'],'frames':611,'parameters':PARAMETERS,'original_prediction_bytes_sha256':byte_seals,
        'definitions':{
            'execution':'Three full isolated processes/source, OpenCV one thread/seed0: unhooked native reference, LifecycleProbe plus numerical shadow twice. Original float32 caches, dense decoded original frames, fps10 and all settings unchanged. Pin prior frozen helpers and original source/cache locks. Complete saved confirmed JSON bytes (including IDs), complete native outputs, final native pickle hashes must equal original sealed files; observed lifecycle hashes equal original, numerical bytes and both independent audits repeat exactly. All zeros/failures retained, no retries/reselection.',
            'shadow':'Enter numerical observer after unchanged lifecycle observer. Copy native estimator at every birth; retain detached copy across all subsequent frames including misses. Before every live operation compare full kf/motion state to shadow; forward exact original arguments/result once; replay same operation on detached copy only; require complete dtype/shape/value equality of all kf arrays and motion caches before/after. Temporary instance estimator hooks removed in finally; tracker hooks restored on exit. No global patch, solver, live estimator, constructor, birth, prune or app modification.',
            'numerical':'All births, all prediction and accepted update operations, not just four cases. Exact F*x and F*P*F.T+Q reconstruction for each prediction. Finite arrays required (failure ledger if not). Covariance P/Q/R symmetry maxabs<=1e-10 and symmetrized eigenminimum>=-1e-10 are fixed diagnostic screens, never repair/acceptance tolerances. Save means, coordinate velocities, P/F/H/Q/R, prior/post, gain/innovation/S and full motion/noise caches locally. Match each known first prediction event to prior health raw seal; compare immediately previous dimensions, dimension velocity differences, last accepted update before/after velocity, unchanged missed-interval velocity and last-posterior dimensions+native-gap*velocity (absolute scalar rearrangement tolerance1e-10; native shadow remains exact). Distinguish inherited from newly introduced shrink; prediction linearity does not establish identity correctness or valid unconstrained shape.',
            'assignment':'Independent sealed-lifecycle traversal, without numerical replay output. Reproduce every high_all original whole-matrix SciPy maximize assignment then >=.1 gate and unmatched partitions exactly. Select all expired terminal row frames after last accepted/seed through removal with any high score>=.1; reconcile exactly prior health terminal exposure count (known5/0). Distinguish unassigned rectangular from raw-assigned below gate. For every gate-supported edge record raw owner unused/active(age1)/retained(age>1), confirmation and accepted update. Force that edge using reduced whole-matrix assignment with same full cardinality, original objective minus forced objective (exact signed arithmetic, no fitted tolerance), gate count change and lost accepted row membership. Retain all candidate edges; never install alternatives, infer identity, call them false tracks, or equate score loss with harm.',
            'decision':'No intervention installed. Decide whether numerical model or assignment mechanics need separately frozen causal controls only after both complete ledgers. Positive covariance/boxes and objective preference are not quality/harm acceptance. No detector, duration, threshold, representation, control/default or weak-continuation change.',
            'publication':'Only fixed aggregate counts, check denominators/failures, whole-source input/output/code/runtime seals and equality flags. No frame positions, tokens/IDs, boxes, state vectors/matrices/velocities, individual case costs, exact boundary/censor distances, accepted histories, media, labels, raw outputs/pickles or local paths. Keep complete raw records under ignored artifacts, do not project a partial case selection. Include all zero branches and failures.'},
        'forbidden':'No GT, annotation files, accuracy scores/evaluator, new inference, tuning, new sources/windows, source reselection, input filtering or app integration. Preserve weak continuation.',
        'terms':'KITTI terms/attribution inherited from original past-exposure source protocol; local noncommercial research only, no media/GT/raw redistribution or dataset relicensing.'}
    output.parent.mkdir(parents=True,exist_ok=True);output.write_text(json.dumps(p,indent=2)+'\n')
    local(seal).parent.mkdir(parents=True,exist_ok=True);seal.write_text(json.dumps({'protocol_sha256':sha256_file(output),'frozen_at_utc':p['frozen_at_utc']},indent=2)+'\n')
    print(json.dumps({'protocol_sha256':sha256_file(output),'new_internal_replay_started':False,'new_assignment_cases_extracted':False}))


def replay(seq,spec,detector,folder,observed):
    import cv2
    cv2.setNumThreads(1);cv2.setRNGSeed(0);folder.mkdir()
    tracker=make_tracker('bytetrack',fps=spec['fps'],parameters=PARAMETERS)
    cap=cv2.VideoCapture(seq['video']);require(cap.isOpened(),'Cannot decode original source')
    frames=[];native=[];life=[];numbers=[]
    try:
        with ExitStack() as stack:
            if observed:
                probe=stack.enter_context(LifecycleProbe(tracker));shadow=stack.enter_context(EstimatorShadow(tracker,probe))
            index=0
            for cache in iter_caches(seq,detector):
                for item in cache['frames']:
                    index+=1;ok,image=cap.read();require(ok and image.shape[:2]==(cache['height'],cache['width']),'Dense decode differs')
                    original=tracker.update
                    def capture(detections,frame=None,timestamp=None):
                        result=original(detections,frame=frame,timestamp=timestamp)
                        native.append({k:getattr(result,k).tolist() for k in ('xyxy','confidence','class_id','tracker_id')});return result
                    owned='update' in vars(tracker);previous=vars(tracker).get('update');tracker.update=capture
                    try:objects,_,_,_=_one_step('bytetrack',tracker,{},1,item['detections'],image,index)
                    finally:
                        if owned:tracker.update=previous
                        else:del tracker.update
                    frames.append({'index':index,'objects':objects})
                    if observed:life.append(probe.last);numbers.append(shadow.last)
            require(index==spec['frames'] and not cap.read()[0],'Full source coverage differs')
    finally:cap.release()
    (folder/'predictions.local.json').write_text(json.dumps(frames)+'\n')
    (folder/'native-output.local.json').write_text(json.dumps(native,separators=(',',':'),allow_nan=False)+'\n')
    (folder/'final-state.local.pickle').write_bytes(pickle.dumps(tracker,protocol=4))
    for name,values in (('lifecycle',life),('numerical',numbers)):
        (folder/(name+'.local.jsonl')).write_text(''.join(json.dumps(v,sort_keys=True,separators=(',',':'),allow_nan=False)+'\n' for v in values))
    return {n:sha256_file(folder/n) for n in ('predictions.local.json','native-output.local.json','final-state.local.pickle','lifecycle.local.jsonl','numerical.local.jsonl')}


def run(a):
    p=json.loads(a.protocol.read_text());require(json.loads(local(a.seal).read_text())['protocol_sha256']==sha256_file(a.protocol),'Freeze seal differs')
    for key in ('implementation_sha256','source_records_sha256'):
        for n,sha in p[key].items():require(sha256_file(ROOT/n)==sha,'Frozen file differs: '+n)
    for name in ('docs/validation/v0.3-upstream-lifecycle-protocol.json',HP):
        oldp=json.loads((ROOT/name).read_text())
        for key in ('implementation_sha256','source_records_sha256'):
            for n,sha in oldp[key].items():require(sha256_file(ROOT/n)==sha,'Original frozen helper differs')
    require(hashes()==p['upstream_sha256'] and internals()==p['numerical_modules_sha256'] and
        {n:importlib.metadata.version(n) for n in p['runtime']}==p['runtime'],'Pinned runtime differs')
    source=json.loads((ROOT/SOURCE).read_text());lock=json.loads((ROOT/LOCK).read_text())
    prior=json.loads((ROOT/PRIOR).read_text());require(prior['input_lock_sha256']==sha256_file(ROOT/LOCK),'Original source lock differs')
    old=json.loads((ROOT/UP).read_text());health=json.loads((ROOT/HEALTH).read_text())
    require(old['all_scheduled_completed'] and health['all_scheduled_completed'] and not old['gt_read'] and not health['gt_read'],'Original complete GT-free results required')
    m=manifest(local(a.inputs),source,'confirmation');specs=[s for s in source['sequences'] if s['phase']=='confirmation']
    require([s['name'] for s in specs]==p['sources'] and sum(s['frames'] for s in specs)==p['frames'],'Full original cohort differs')
    original=local(a.original_root);healthroot=local(a.health_root);lifecycleroot=local(a.lifecycle_root);work=local(a.work)
    require(not work.exists() and not a.output.exists(),'Refuse overwrite or retry');work.mkdir(parents=True);records=[]
    with ProcessPoolExecutor(max_workers=1,mp_context=multiprocessing.get_context('spawn'),max_tasks_per_child=1) as pool:
        for seq,spec,locked,up,h in zip(m['sequences'],specs,lock['sequences'],old['ledger'],health['ledger']):
            name=spec['name'];folder=work/name;folder.mkdir();r={'name':name,'frames':spec['frames'],'status':'failed'}
            try:
                require(name==locked['name']==up['name']==h['name'],'Source order differs')
                require(source_metadata(seq,spec,source['detector_settings'])==locked==up['source_lock'],'Original source/cache differs')
                oldpath=original/name/'activation_control-predictions.local.json'
                require(sha256_file(oldpath)==p['original_prediction_bytes_sha256'][name],'Frozen complete reference byte hash differs')
                require(hashlib.sha256(canonical(read_predictions(oldpath)).encode()).hexdigest()==up['prediction_sha256'],'Original reference seal differs')
                hp=healthroot/name/'0-health.local.json';require(sha256_file(hp)==h['raw_audit_sha256'],'Health raw seal differs')
                healthraw=json.loads(hp.read_text());passes=[];summaries=[];casehash=[]
                # Independent arm consumes only the previous sealed lifecycle,
                # never numerical replay output or a numerical case selection.
                assignments=[];assignmenthash=[]
                for trial in (1,2):
                    lp=lifecycleroot/name/str(trial)/'lifecycle.local.jsonl'
                    require(sha256_file(lp)==up['lifecycle_sha256'],'Independent original lifecycle seal differs')
                    value,cases=assignment_audit([json.loads(x) for x in lp.read_text().splitlines()],healthraw)
                    require(value['cases']==h['summary']['terminal']['expired']['prediction:high:gate'],'Prior independent exposure population differs')
                    ap=folder/('assignment-'+str(trial)+'.local.json')
                    ap.write_text(json.dumps(cases,sort_keys=True,separators=(',',':'),allow_nan=False)+'\n')
                    assignments.append(value);assignmenthash.append(sha256_file(ap))
                require(assignments[0]==assignments[1] and assignmenthash[0]==assignmenthash[1],'Independent assignment repeat differs')
                r.update(assignment_status='completed',assignment=assignments[0],raw_assignment_sha256=assignmenthash[0])
                for trial in range(3):
                    sub=folder/str(trial);value=pool.submit(replay,seq,spec,source['detector_settings'],sub,trial>0).result()
                    require((sub/'predictions.local.json').read_bytes()==oldpath.read_bytes(),'Complete original reference bytes differ')
                    require(value['native-output.local.json']==up['native_output_sha256'] and value['final-state.local.pickle']==up['final_state_sha256'],'Native original output/state differs')
                    passes.append(value)
                    if trial==0:continue
                    require(value['lifecycle.local.jsonl']==up['lifecycle_sha256'],'Original lifecycle bytes differ')
                    life=[json.loads(x) for x in (sub/'lifecycle.local.jsonl').read_text().splitlines()]
                    numbers=[json.loads(x) for x in (sub/'numerical.local.jsonl').read_text().splitlines()]
                    numerical,ncases=numerical_audit(numbers,healthraw,life)
                    require(numerical['counts']['first_cases']==h['summary']['counts']['hypotheses_ever_nonpositive'],'Prior first-case population differs')
                    summaries.append({'numerical':numerical})
                    raw=sub/'cases.local.json';raw.write_text(json.dumps({'numerical':ncases},sort_keys=True,separators=(',',':'),allow_nan=False)+'\n');casehash.append(sha256_file(raw))
                require(passes[1]==passes[2] and summaries[0]==summaries[1] and casehash[0]==casehash[1],'Observed repeat differs')
                r.update(status='completed',source_lock=locked,original_prediction_bytes_equal=True,
                    original_native_output_equal=True,original_final_state_equal=True,original_lifecycle_equal=True,
                    numerical_and_independent_assignment_repeat_equal=True,original_health_cases_reconciled=True,
                    output_sha256=passes[1],raw_cases_sha256=casehash[0],**summaries[0])
            except Exception as exc:
                (folder/'failure.local.txt').write_text(repr(exc)+'\n');r['reason']='integrity_replay_or_audit_failed'
            records.append(r);print(name+' '+r['status'],flush=True)
    result={'format':'depthport.estimator-shadow-public.v1','protocol_sha256':sha256_file(a.protocol),
        'gt_read':False,'accuracy_scoring':False,'inference':False,'retuned':False,'intervention':False,
        'weak_continuation_changed':False,'all_scheduled_completed':all(r['status']=='completed' for r in records),'ledger':records}
    a.output.parent.mkdir(parents=True,exist_ok=True);a.output.write_text(json.dumps(result,indent=2,allow_nan=False)+'\n')
    return 0 if result['all_scheduled_completed'] else 2


def main():
    parser=argparse.ArgumentParser(description=__doc__);sub=parser.add_subparsers(dest='command',required=True)
    f=sub.add_parser('freeze')
    for n in ('output','seal'):f.add_argument('--'+n,type=Path,required=True)
    r=sub.add_parser('run')
    for n in ('protocol','seal','inputs','original-root','health-root','lifecycle-root','work','output'):r.add_argument('--'+n,type=Path,required=True)
    a=parser.parse_args()
    if a.command=='freeze':freeze(a.output,a.seal);return 0
    return run(a)


if __name__=='__main__':raise SystemExit(main())
