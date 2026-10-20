#!/usr/bin/env python3
# SPDX-License-Identifier: AGPL-3.0-only
"""Freeze and validate one GT-free geometry control; no app integration."""
import argparse
from concurrent.futures import ProcessPoolExecutor
from contextlib import ExitStack
from datetime import datetime,timezone
import importlib.metadata
import json
import multiprocessing
from pathlib import Path
import pickle
import subprocess
import sys
from zoneinfo import ZoneInfo
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT))
from depthport.tracking_lifecycle_probe import LifecycleProbe,require
from depthport.tracking_estimator_shadow import EstimatorShadow
from depthport.tracking_geometry_control import GeometryProjection
from depthport.tracking_geometry_validation import summarize,compare
from depthport.tracking_exposure import iter_caches
from depthport.tracking_past_exposure import manifest,source_metadata
from depthport.video_tracking_benchmark import make_tracker,_one_step,sha256_file
from depthport.tracking_recovery_control import PARAMETERS
from tools.diagnose_tracking_upstream import local,hashes,SOURCE,LOCK
from tools.audit_tracking_estimator_shadow import internals
from tools.prepare_tracking_geometry import metadata,NEW

PROTOCOL='docs/validation/v0.3-geometry-validity-protocol.json'
FILES=('depthport/tracking_geometry_control.py','depthport/tracking_geometry_validation.py',
    'tools/validate_tracking_geometry.py','tools/prepare_tracking_geometry.py','tests/test_tracking_geometry_control.py',
    'tests/test_tracking_geometry_inputs.py','tools/cache_video_detections.py')
RECORDS=('docs/validation/v0.3-estimator-shadow-protocol.json','docs/validation/v0.3-estimator-shadow.json',
    'docs/validation/v0.3-state-observation-health-protocol.json','docs/validation/v0.3-state-observation-health.json',
    'docs/validation/v0.3-upstream-lifecycle-protocol.json','docs/validation/v0.3-upstream-lifecycle.json',SOURCE,LOCK)


def freeze(output,seal):
    import requests
    require(not output.exists() and not seal.exists(),'Refuse overwrite freeze')
    old=json.loads((ROOT/RECORDS[0]).read_text());runtime={n:importlib.metadata.version(n) for n in old['runtime']}
    require(runtime==old['runtime'] and hashes()==old['upstream_sha256'] and internals()==old['numerical_modules_sha256'],'Original runtime required')
    image=metadata();require([s['frames'] for s in image['sequences']]==[270,800],'Fixed complete source metadata differs')
    destination=local(seal).parent;destination.mkdir(parents=True,exist_ok=True)
    terms=requests.get('https://www.cvlibs.net/datasets/kitti/',timeout=45);terms.raise_for_status()
    require('Attribution-NonCommercial-ShareAlike 3.0' in terms.text,'Official terms must be reviewed')
    termpath=destination/'terms.local.html';termpath.write_bytes(terms.content)
    source=json.loads((ROOT/SOURCE).read_text());helpers={}
    for name in (RECORDS[0],RECORDS[2],RECORDS[4]):helpers.update(json.loads((ROOT/name).read_text())['implementation_sha256'])
    for n,sha in helpers.items():require(sha256_file(ROOT/n)==sha,'Original frozen helper differs: '+n)
    p={'format':'depthport.geometry-validity-protocol.v1','frozen_at_utc':datetime.now(timezone.utc).isoformat(),
        'report_date_local':datetime.now(ZoneInfo('Asia/Taipei')).date().isoformat(),'report_timezone':'Asia/Taipei',
        'base_commit':subprocess.check_output(['git','rev-parse','HEAD'],cwd=ROOT,text=True).strip(),
        'status':'Local freeze after synthetic/native contracts and image-directory metadata only, before new image-member reads, detector outputs or control execution. Known four old numerical failures/five old assignment cases disclosed. Not external preregistration.',
        'runtime':runtime,'upstream_sha256':hashes(),'numerical_modules_sha256':internals(),
        'implementation_sha256':{n:sha256_file(ROOT/n) for n in FILES},'frozen_helpers_sha256':helpers,
        'source_records_sha256':{n:sha256_file(ROOT/n) for n in RECORDS},
        'parameters':PARAMETERS,'detector_settings':source['detector_settings'],
        'image_archive':{k:v for k,v in image.items() if k!='sequences'},'new_sources':image['sequences'],
        'known_sources':[{'name':'KITTI-0004','frames':314},{'name':'KITTI-0005','frames':297}],
        'old_reference_bytes_sha256':old['original_prediction_bytes_sha256'],
        'definitions':{
          'selection':'Next two KITTI training IDs in lexical order after all previously used0000-0005, fixed0006/0007 full270/800 original frames. No new output inspected before freeze.0004/0005 are seen mechanism checks only, never independent confirmation. New IDs are source-held-out relative to rule design, same dataset/camera family; no independent site/person/randomized sample claim. Inspect every scheduled source, keep zeros/failures, no replacements/windows/retries or favourable selection.',
          'preparation':'Official image-only archive, immutable ETag/ranges, full ordered PNG CRC/member manifest, SHA256 and FFV1 bgr0 pixel equality at original10Hz. All frames, no resize/crop/resampling. Frozen YOLO26n/8.4.176 CPU person cache at confidence.1,640px,max64,NMS.7; original weights hash, no tuning. Reject cap frames for acceptance but retain counts/source. No labels archive/member/GT/evaluator is accepted by schemas or read.',
          'rule':'At each native fixed-step predict, compute prospective mean F(1)*x on positive finite XYXY prestate. If prospective width<=0 or height<=0, independently project the two affected corner velocities to their arithmetic average: T is I8 except both corresponding velocity rows contain .5 in those two velocity columns. x_projected=T*x; P_projected=T*P*T.T including all cross terms, then call unchanged native predict with original F/Q/H/R. No position clamp, epsilon, fitted duration, detector/input/solver/gate/lifetime change. No change when no axis triggers. Both axes can trigger once. The conditional linear projection propagates moments for the selected T; it does not calibrate uncertainty over branch selection.',
          'state_consistency':'Apply identical projection to live estimator and persistent detached shadow before original predict. Original shadow checks every dtype/shape/value/byte-hash before/after every native predict and accepted update, exact F*x/F*P*F.T+Q, P/Q/R symmetry/PSD screens fixed1e-10. Keep state_post/P_post as last actual accepted update; native predict writes new state_prior/P_prior; no rewriting historical posterior, motion/noise caches or clocks. Unsupported nonpositive prestate in treatment fails, never repaired; reference allows native invalid means. Finite failures retained as failure, not exclusion.',
          'accepted_and_roles':'All tentative/confirmed hypotheses use the same guard, active pre-predict time_since_update0 versus retained>0 separately counted. No waiting/maturity change. Original high/weak association and Kalman measurement update execute unchanged, once with original measurement. Never project, clip, reject or reroute an accepted update or rewrite its posterior. A nonpositive accepted posterior fails the scene screen. Preserve all weak inputs, weak-stage execution, native births/confirmation and expiry. Effects on actual accepted observations are measured, not assumed unchanged.',
          'reference_seal':'Before ANY control execution, run unhooked native reference on every source and seal complete prediction JSON/native-output/final-state hashes plus immutable input locks. Old0004/0005 JSON bytes/native outputs/final-state equal original archive; new0006/0007 native references are newly sealed, not historical originals. Two full observed reference passes/source must equal those native byte/state seals, old lifecycle also equals original seal. Two control passes/source must equal each other in complete output, final state, lifecycle, numerical and projection histories and event sets. Fresh isolated process per pass, OpenCV one thread/seed0, no inference during tracking.',
          'proxy_harm_per_scene':'No pooling across scenes. Every treatment must have zero numerical-screen failures, zero nonpositive predicted/accepted posterior rows, zero lost baseline weak accepted input events(frame,input-index), zero lost baseline confirmed-output input events, zero lost baseline active accepted update pairs(frame,birth-frame,birth-input-index,current-input-index,stage), and zero new birth events(frame,input-index). Lineage is shared input birth key, not transfer/equality of native ID numbers. Lost/new sets, not only count differences. Additional confirmed input events recorded as unverified, not benefits/false positives. Treatment failure or reference mismatch blocks acceptance. These conservative observable proxies cannot establish FP/FN/IDSW/HOTA, correct identity or true harm without GT.',
          'exposure_gate':'Each of BOTH new full sources must complete all passes, have >=1 actual projected row and strictly fewer nonpositive prediction rows than its own native reference, no detection-cap frames and every per-scene proxy-harm gate true. A zero-trigger source has no effective exposure; it cannot pass replication by equality. Mechanism checks reported separately; no source may compensate another. Even passing this gate is geometry/proxy acceptance only; tracking quality/harm remains unverified and defaults stay unchanged.',
          'publication':'Only fixed source-level aggregate counts, each scene gate/result including zeros/failures and whole-source input/output/code/runtime hashes. Raw states/covariances/matrices, selected axes per case, frame/IDs/birth keys/events, costs, paths, media, labels and diagnostics stay in ignored local artifacts. No inference caches, source images, private data or model weights in public manifest.'},
        'terms':{'page':'https://www.cvlibs.net/datasets/kitti/','license':'CC BY-NC-SA 3.0','terms_page_sha256':sha256_file(termpath),
            'attribution':'Andreas Geiger, Philip Lenz, Raquel Urtasun. Are we ready for Autonomous Driving? The KITTI Vision Benchmark Suite. CVPR2012.',
            'scope':'Local noncommercial research, reviewed aggregate publication only; no media/GT/raw redistribution or dataset relicensing.'},
        'forbidden':'No GT/labels/accuracy evaluator or accuracy-score-based selection, no tuning, source substitution, clip selection, input filtering, inference during tracking or app/worker/default integration.'}
    output.parent.mkdir(parents=True,exist_ok=True);output.write_text(json.dumps(p,indent=2)+'\n')
    seal.write_text(json.dumps({'protocol_sha256':sha256_file(output),'frozen_at_utc':p['frozen_at_utc']},indent=2)+'\n')
    print(json.dumps({'protocol_sha256':sha256_file(output),'new_image_member_reads':False,'control_started':False}))


def validate_new_manifest(value,names):
    require(set(value)=={'format','sequences'} and value['format']=='depthport.geometry-inputs.v1','Strict GT-free manifest required')
    require([s['name'] for s in value['sequences']]==names,'Complete frozen source order required')
    for s in value['sequences']:
        require(set(s)=={'name','video','caches','video_sha256','cache_sha256'},'Strict GT-free source fields required')
        require(s['caches'] and len(s['caches'])==len(s['cache_sha256']) and len(set(s['caches']))==len(s['caches']),'Unique hashed cache shards required')
    return value


def validate_cache_schema(cache,settings):
    require(set(cache)=={'format','video_sha256','width','height','fps','detector','frames'},'Strict GT-free cache fields required')
    require(set(cache['detector'])==set(settings)|{'frames_at_detection_cap'},'Strict detector fields required')
    for frame in cache['frames']:
        require(set(frame)=={'index','detections'},'Strict GT-free frame fields required')
        for obj in frame['detections']:require(set(obj)=={'bbox','confidence','class_id'},'Strict GT-free detection fields required')


def replay(seq,spec,detector,folder,arm):
    import cv2
    cv2.setNumThreads(1);cv2.setRNGSeed(0);folder.mkdir()
    tracker=make_tracker('bytetrack',fps=10,parameters=PARAMETERS);observed=arm!='native';enabled=arm=='projection'
    cap=cv2.VideoCapture(seq['video']);require(cap.isOpened(),'Source decode unavailable')
    frames=[];native=[];life=[];numbers=[];guards=[]
    try:
        with ExitStack() as stack:
            if observed:
                l=stack.enter_context(LifecycleProbe(tracker));s=stack.enter_context(EstimatorShadow(tracker,l))
                g=stack.enter_context(GeometryProjection(tracker,l,s,enabled))
            index=0
            for cache in iter_caches(seq,detector):
                validate_cache_schema(cache,detector)
                for item in cache['frames']:
                    index+=1;ok,image=cap.read();require(ok and image.shape[:2]==(cache['height'],cache['width']),'Full original decode differs')
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
                    if observed:life.append(l.last);numbers.append(s.last);guards.append(g.last)
            require(index==spec['frames'] and not cap.read()[0],'Complete source coverage differs')
    finally:cap.release()
    (folder/'predictions.local.json').write_text(json.dumps(frames)+'\n')
    (folder/'native-output.local.json').write_text(json.dumps(native,separators=(',',':'),allow_nan=False)+'\n')
    (folder/'final-state.local.pickle').write_bytes(pickle.dumps(tracker,protocol=4))
    for name,values in (('lifecycle',life),('numerical',numbers),('geometry',guards)):
        (folder/(name+'.local.jsonl')).write_text(''.join(json.dumps(v,sort_keys=True,separators=(',',':'),allow_nan=False)+'\n' for v in values))
    result={}
    if observed:
        counts,events=summarize(life,numbers,guards);result['counts']=counts
        (folder/'events.local.json').write_text(json.dumps(events,sort_keys=True,separators=(',',':'))+'\n')
        require(counts['confirmed_observations']==sum(len(f['objects']) for f in frames),'Confirmed-event/native-output count differs')
    names=['predictions.local.json','native-output.local.json','final-state.local.pickle','lifecycle.local.jsonl','numerical.local.jsonl','geometry.local.jsonl']
    if observed:names.append('events.local.json')
    result['sha256']={n:sha256_file(folder/n) for n in names};return result


def run(a):
    p=json.loads(a.protocol.read_text());digest=sha256_file(a.protocol)
    require(json.loads(local(a.seal).read_text())['protocol_sha256']==digest,'Definition seal differs')
    for key in ('implementation_sha256','source_records_sha256','frozen_helpers_sha256'):
        for n,sha in p[key].items():require(sha256_file(ROOT/n)==sha,'Frozen file differs: '+n)
    require(hashes()==p['upstream_sha256'] and internals()==p['numerical_modules_sha256'] and
        {n:importlib.metadata.version(n) for n in p['runtime']}==p['runtime'],'Pinned runtime differs')
    oldsource=json.loads((ROOT/SOURCE).read_text());oldlock=json.loads((ROOT/LOCK).read_text())
    oldm=manifest(local(a.old_inputs),oldsource,'confirmation')
    newm=validate_new_manifest(json.loads(local(a.new_inputs).read_text()),list(NEW))
    specs=[{**s,'fps':10,'phase':'seen_mechanism'} for s in p['known_sources']]+[{**s,'fps':10,'phase':'source_held_out'} for s in p['new_sources']]
    seqs=oldm['sequences']+newm['sequences'];work=local(a.work)
    require(not work.exists() and not a.output.exists() and not a.references.exists(),'Refuse overwrite/retry');work.mkdir(parents=True)
    oldup=json.loads((ROOT/'docs/validation/v0.3-upstream-lifecycle.json').read_text())
    records=[];reference_records=[]
    with ProcessPoolExecutor(max_workers=1,mp_context=multiprocessing.get_context('spawn'),max_tasks_per_child=1) as pool:
        # Seal EVERY full native reference before any projected arm executes.
        for i,(seq,spec) in enumerate(zip(seqs,specs)):
            name=spec['name'];folder=work/name;folder.mkdir();r={'name':name,'phase':spec['phase'],'frames':spec['frames'],'status':'failed'}
            try:
                for path in (seq['video'],*seq['caches']):local(path)
                meta=source_metadata(seq,spec,p['detector_settings'])
                for path in seq['caches']:validate_cache_schema(json.loads(Path(path).read_text()),p['detector_settings'])
                if i<2:require(meta==oldlock['sequences'][i],'Old input lock differs')
                value=pool.submit(replay,seq,spec,p['detector_settings'],folder/'native','native').result()
                if i<2:
                    require(value['sha256']['predictions.local.json']==p['old_reference_bytes_sha256'][name] and
                        value['sha256']['native-output.local.json']==oldup['ledger'][i]['native_output_sha256'] and
                        value['sha256']['final-state.local.pickle']==oldup['ledger'][i]['final_state_sha256'],'Original full native archive differs')
                r.update(status='reference_sealed',source_lock=meta,native_reference=value)
            except Exception as exc:
                (folder/'reference-failure.local.txt').write_text(repr(exc)+'\n');r['reason']='reference_integrity_or_execution_failed'
            records.append(r);reference_records.append(dict(r));print(name+' '+r['status'],flush=True)
        a.references.parent.mkdir(parents=True,exist_ok=True)
        a.references.write_text(json.dumps({'format':'depthport.geometry-native-references.v1','protocol_sha256':digest,
            'sealed_before_any_control':True,'gt_read':False,'ledger':reference_records},indent=2)+'\n')
        for i,(seq,spec,r) in enumerate(zip(seqs,specs,records)):
            if r['status']!='reference_sealed':continue
            folder=work/spec['name']
            try:
                values={}
                # Alternate order, fresh process each pass; all native references
                # are already sealed. Keep reference and treatment repeats.
                for arm,trial in (('projection',0),('reference',0),('reference',1),('projection',1)):
                    value=pool.submit(replay,seq,spec,p['detector_settings'],folder/(arm+'-'+str(trial)),arm).result()
                    values[(arm,trial)]=value
                    if arm=='reference':
                        for n in ('predictions.local.json','native-output.local.json','final-state.local.pickle'):
                            require(value['sha256'][n]==r['native_reference']['sha256'][n],'Observed/native reference differs')
                        if i<2:require(value['sha256']['lifecycle.local.jsonl']==oldup['ledger'][i]['lifecycle_sha256'],'Old lifecycle seal differs')
                require(values[('reference',0)]==values[('reference',1)] and values[('projection',0)]==values[('projection',1)],'Complete arm repeats differ')
                ref=values[('reference',0)];treatment=values[('projection',0)]
                def events(arm):return json.loads((folder/(arm+'-0')/'events.local.json').read_text())
                comparison=compare(ref['counts'],treatment['counts'],events('reference'),events('projection'))
                r.update(status='completed',original_native_reference_equal=True,repeat_equal=True,reference=ref,projection=treatment,comparison=comparison)
            except Exception as exc:
                (folder/'control-failure.local.txt').write_text(repr(exc)+'\n');r.update(status='failed',reason='control_execution_or_equality_failed')
            print(spec['name']+' '+r['status'],flush=True)
    complete=all(r['status']=='completed' for r in records);new=records[2:]
    accepted=bool(complete and len(new)==2 and all(r['comparison']['all_proxy_harm_gates_pass'] and r['comparison']['geometry_reduction_exposed'] and r['source_lock']['capped_frames']==0 for r in new))
    result={'format':'depthport.geometry-validity-public.v1','protocol_sha256':digest,'references_sha256':sha256_file(a.references),
        'gt_read':False,'accuracy_scoring':False,'retuned':False,'weak_stage_changed':False,'defaults_changed':False,
        'all_scheduled_completed':complete,'held_out_geometry_proxy_gate_pass':accepted,'tracking_quality_accepted':False,'ledger':records}
    a.output.parent.mkdir(parents=True,exist_ok=True);a.output.write_text(json.dumps(result,indent=2,allow_nan=False)+'\n')
    return 0 if complete else 2


def main():
    parser=argparse.ArgumentParser(description=__doc__);sub=parser.add_subparsers(dest='command',required=True)
    f=sub.add_parser('freeze')
    for n in ('output','seal'):f.add_argument('--'+n,type=Path,required=True)
    r=sub.add_parser('run')
    for n in ('protocol','seal','old-inputs','new-inputs','work','references','output'):r.add_argument('--'+n,type=Path,required=True)
    a=parser.parse_args()
    if a.command=='freeze':freeze(a.output,a.seal);return 0
    return run(a)


if __name__=='__main__':raise SystemExit(main())
