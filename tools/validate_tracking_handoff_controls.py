#!/usr/bin/env python3
# SPDX-License-Identifier: AGPL-3.0-only
"""Freeze separate causal candidates; validate untouched image-only sources."""
import argparse
from collections import Counter
from concurrent.futures import ProcessPoolExecutor
from contextlib import ExitStack
from datetime import datetime, timezone
import gzip
import hashlib
import importlib.metadata
import json
import multiprocessing as mp
from pathlib import Path
import pickle
import platform
import subprocess
import sys
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT))
from depthport.tracking_accepted_events import AcceptedLedger, encoded, require, strict_json
from depthport.tracking_handoff_control import HandoffCandidate, ARMS
from depthport.tracking_handoff_screen import screen
from depthport.tracking_lifecycle_probe import LifecycleProbe
from depthport.tracking_estimator_shadow import EstimatorShadow
from depthport.tracking_geometry_control import GeometryProjection
from depthport.tracking_recovery_control import PARAMETERS, MARGIN
from depthport.video_tracking_benchmark import make_tracker, _one_step
from depthport.tracking_exposure import iter_caches
from depthport.tracking_past_exposure import source_metadata
from tools.validate_tracking_geometry import replay as native_replay, validate_cache_schema, validate_new_manifest
from tools.diagnose_tracking_upstream import hashes, local
from tools.audit_tracking_estimator_shadow import internals
from tools.audit_tracking_accepted_events import digest, write, input_paths, check_inputs, records

STUDY='docs/validation/v0.3-handoff-controls-protocol.json'
RULES={'birth_continuation':'docs/validation/v0.3-birth-continuation-rule.json',
       'past_competition_handoff':'docs/validation/v0.3-past-handoff-rule.json'}
FILES=('depthport/tracking_handoff_control.py','depthport/tracking_handoff_screen.py',
       'tools/validate_tracking_handoff_controls.py','tools/prepare_handoff_controls.py',
       'tests/test_tracking_handoff_control.py','tests/test_tracking_handoff_screen.py','tests/test_tracking_handoff_controls_replay.py')
HELPERS=('tools/prepare_tracking_geometry.py','tools/prepare_tracking_geometry_exposure.py',
 'tools/validate_tracking_geometry.py','tools/diagnose_tracking_upstream.py','tools/audit_tracking_estimator_shadow.py',
 'depthport/tracking_geometry_control.py','depthport/tracking_geometry_validation.py','depthport/tracking_estimator_shadow.py',
 'depthport/tracking_exposure.py','depthport/tracking_past_exposure.py','depthport/video_tracking_benchmark.py')


def read(path):return strict_json((ROOT/path).read_bytes())


def original_seal(archive_root):
    paths=input_paths(archive_root,records());check_inputs(paths,read('docs/validation/v0.3-accepted-events-protocol.json')['local_input_sha256'])
    return len(paths)


def freeze(a):
    from tools.prepare_handoff_controls import metadata
    require(not a.protocol.exists() and not a.seal.exists() and not any((ROOT/p).exists() for p in RULES.values()),'No freeze overwrite/retry')
    import requests
    old=read('docs/validation/v0.3-geometry-validity-protocol.json');prior=read('docs/validation/v0.3-handoff-audit-protocol.json')
    runtime={k:importlib.metadata.version(k) for k in old['runtime']}
    require(runtime==old['runtime'] and hashes()==old['upstream_sha256'] and internals()==old['numerical_modules_sha256'],'Original runtime required')
    count=original_seal(a.archive_root)
    source_pins={**prior['source_records_sha256'],**prior['implementation_sha256']}
    for p in ('docs/validation/v0.3-handoff-audit-protocol.json','docs/validation/v0.3-handoff-audit.json',*HELPERS):source_pins[p]=digest(ROOT/p)
    for path,sha in source_pins.items():require(digest(ROOT/path)==sha,'Original helper seal differs')
    image=metadata();require([s['name'] for s in image['sequences']]==['KITTI-0010','KITTI-0011'],'Fixed source order required')
    require([s['frames'] for s in image['sequences']]==[294,373],'Complete original sources required')
    detector=read('docs/validation/v0.3-geometry-exposure-protocol.json')['detector_settings']
    require(digest(a.weights)==detector['weight_sha256'],'Original weights required')
    detector_runtime=json.loads(subprocess.check_output([str(a.detector_python),'-c',
        "import importlib.metadata as m,json;print(json.dumps({n:m.version(n) for n in ('ultralytics','torch','numpy','opencv-python')}))"],text=True))
    require(detector_runtime['ultralytics']==detector['ultralytics'],'Frozen detector version required')
    terms=requests.get('https://www.cvlibs.net/datasets/kitti/',timeout=45);terms.raise_for_status()
    require('Attribution-NonCommercial-ShareAlike 3.0' in terms.text,'Official research terms required')
    local(a.seal).parent.mkdir(parents=True,exist_ok=True);term_path=a.seal.parent/'terms.local.html';term_path.write_bytes(terms.content)
    rule_defs={
      'birth_continuation':{'rule':'After native HIGH assignment, append only mutually unique gate-eligible edges between unmatched high columns above unchanged activation threshold and unmatched PRE-confirmed owners with >=1 recorded accepted observation t<f. Predicted box must be positive. Each candidate row/column has exactly one edge in this eligible free graph. No native accepted pair is removed. No new duration/count/IoU parameter; native gate/activation reused. Native update executes once, so the input continues an existing owner rather than entering unmatched-high spawn.',
        'decision_features':'Only original current high/weak input partitions, native predicted boxes/IoU/gate/free rows+columns, frozen pre-update confirmed role and own strictly earlier accepted keys. Birth seeds do not qualify. If the candidate row has ANY native-gate-admissible current weak box, exclude it to protect weak opportunities; original weak association, inputs and updates are never intercepted.'},
      'past_competition_handoff':{'rule':'After native HIGH assignment, reassign a selected edge r,c only to its unique qualified currently unmatched high row q. Both r/q must be PRE-active, PRE-confirmed with own last accepted observation at f-1. At r last HIGH acceptance f-1, q was active-confirmed, gate-admissible and within existing margin .05, and q accepted a distinct original input in that frame (high OR weak). Current q,c must clear unchanged native gate and selected-score minus q-score<=.05. Exclude q if any current weak edge clears native gate. No q may be claimed by two selected edges; otherwise skip all such claims. Replace only intended r,c with q,c, keep all other accepted high pairs/cardinality, return r to original weak availability. Native measurement update occurs once; never force another solver assignment.',
        'decision_features':'Past contexts and accepted keys commit only after the whole frame; current/future acceptance and whether a pair repeats later are unavailable and forbidden. Current native assignment/IoU and weak boxes are known at the high-stage decision. No cross-execution graph, GT, raw ID matching, birth-only support, expiry inference, new fitted time or source-dependent parameter. No native weak result is modified.'}}
    for arm,path in RULES.items():write(ROOT/path,{'format':'depthport.causal-candidate-rule.v1','arm':arm,'report_date_local':'2026-10-22',**rule_defs[arm],
        'status':'Frozen independent hypothesis, no efficacy/identity/default claim; no combined arm.'})
    p={'format':'depthport.handoff-controls-protocol.v1','report_date_local':'2026-10-22','frozen_at_utc':datetime.now(timezone.utc).isoformat(),
       'base_commit':subprocess.check_output(['git','rev-parse','HEAD'],cwd=ROOT,text=True).strip(),
       'implementation_sha256':{f:digest(ROOT/f) for f in FILES},'source_records_sha256':source_pins,
       'rule_sha256':{f:digest(ROOT/f) for f in RULES.values()},'runtime':runtime,'audit_python':platform.python_version(),
       'upstream_sha256':hashes(),'numerical_modules_sha256':internals(),'parameters':PARAMETERS,'margin':MARGIN,
       'detector_settings':detector,'detector_runtime':detector_runtime,
       'image_archive':{k:v for k,v in image.items() if k!='sequences'},'new_sources':image['sequences'],
       'original_archive_files':count,'prior_information':'Four previously seen MOT handoff boundaries, three explicit births versus continued control ownership, one nonrepeating established pair. Known sources KITTI0000-0009 and all16 MOT sources. No new image member/detector/tracker output read before freeze; only directory metadata. New sources are next lexical KITTI IDs10/11, no favourable sequence/window/replacement selection.',
       'arms':['native','observed_native','projection','birth_continuation','past_competition_handoff'],
       'definitions':{
         'separation':'Two separately hashed rule records. Each candidate independently adds only its own high-stage rule over identical unchanged geometry-projected baseline; no joint arm or tuning. Extra observed native arm checks full instrumentation neutrality against unhooked native. Same dataset/camera family source-held-out validation, not independent sites/people/datasets or external preregistration. No leaderboard/GT-score selection.',
         'preparation':'Image-only official ZIP metadata/ETag/ranges locked, full294+373 PNG CRC/SHA manifests, native10Hz FFV1 bgr0 decoded pixel equality. Same8.4.176 YOLO26n CPU recipe confidence.1/img640/class0/cap64/NMS.7 and weight hash; no frame cropping, filtering, resampling, GT/labels archive or evaluator. All original inputs including weak remain. Cap frames fail source screen, never silently exclude frames. Raw media/cache stay local.',
         'reference':'Seal ALL full unhooked native references and input locks BEFORE any candidate execution. Two observed native repeats must equal complete native prediction JSON bytes, raw native outputs and final pickle. Two isolated repeats per projection/A/B arm require exact full output/native/final-state/trace/event receipts and aggregate equality. Fresh spawned process each pass, OpenCV1 thread seed0, no inference in tracking. Original434 files and all prior source/code records checked before/after; old pickle hash only. New native seals do not rewrite historical seals.',
         'harm_per_scene':'No cross-scene compensation. Against its own projection baseline require ZERO lost original accepted input keys(frame,index), ZERO lost weak-stage accepted input keys, ZERO lost confirmed-output input keys, ZERO new birth keys, ZERO numerical-check failures, ZERO invalid accepted posteriors, no added nonpositive predictions and ZERO lost protected OTHER high-stage pairs at each action. Current intended handoff edge change is explicit, not hidden as protection. Preserve/record complete lost/new stage/lineage sets, not just totals. Legacy strict seed-key active gate is computed UNCHANGED and reported separately; the new observable-input/protected-update screen does not pass or replace old studies. Any identity consequences remain unknown without GT.',
         'exposure':'For EACH candidate independently, both fixed new sources must complete all passes, have>=1 ACTUAL changed high assignment, cap0, repeat/native equality and every per-scene observable-input gate true. Zero trigger fails exposure and cannot pass replication by equality; no replacements, replay fitting or adjusted rules. Even a passed observable screen is NOT ID/FN/FP/HOTA/true-harm acceptance; app/worker/default promotion remains forbidden.',
         'failure':'Keep every scheduled source, zero and failure. No overwrite/retry/resume under same output; missing preparation or execution remains failed/null. Preserve prior26-source failures, incomplete discovery and false replication flags without reclassification. Test fixture errors before freeze and software failures remain dated, not erased.',
         'publication':'Only reviewed source-level aggregates, role/action/gate counts, zeros/nulls/failures and hashes. Raw frames, detections, per-input/owner/native IDs, costs, histories, full predictions/pickles/diagnostics and exceptions local ignored artifacts. Code AGPL does not relicense KITTI; no data/weights redistribution.'},
       'terms':{'url':'https://www.cvlibs.net/datasets/kitti/','license':'CC BY-NC-SA 3.0','terms_sha256':digest(term_path),
                'attribution':'Andreas Geiger, Philip Lenz, Raquel Urtasun. Are we ready for Autonomous Driving? The KITTI Vision Benchmark Suite. CVPR2012.',
                'scope':'Local noncommercial research, aggregates only; no data redistribution or relicensing.'}}
    write(a.protocol,p);write(a.seal,{'protocol_sha256':digest(a.protocol)})
    print({'protocol_sha256':digest(a.protocol),'new_image_member_reads':False,'control_started':False})


def verify(protocol,seal):
    p=strict_json(protocol.read_bytes());require(digest(protocol)==strict_json(local(seal).read_bytes())['protocol_sha256'],'Freeze seal differs')
    for group in ('implementation_sha256','source_records_sha256','rule_sha256'):
        for path,sha in p[group].items():require(digest(ROOT/path)==sha,'Frozen source differs: '+path)
    require({k:importlib.metadata.version(k) for k in p['runtime']}==p['runtime'] and hashes()==p['upstream_sha256'] and internals()==p['numerical_modules_sha256'],'Frozen runtime differs')
    return p


def replay(seq,spec,detector,folder,arm):
    import cv2
    cv2.setNumThreads(1);cv2.setRNGSeed(0);folder.mkdir()
    t=make_tracker('bytetrack',fps=10,parameters=PARAMETERS);cap=cv2.VideoCapture(seq['video']);require(cap.isOpened(),'Decode failed')
    frames=[];native=[];ledger=AcceptedLedger();counts=Counter({k:0 for k in ('invalid_predictions','invalid_accepted_posteriors','numerical_failures',
        'protected_other_updates_lost','actions','active_birth_continuations','retained_birth_continuations','weak_blocked_rows','weak_stages','geometry_projections')})
    trace=folder/'trace.local.jsonl.gz'
    with trace.open('xb') as raw, gzip.GzipFile(filename='',mode='wb',fileobj=raw,mtime=0) as log:
        try:
            with HandoffCandidate(t,arm if arm in ARMS else 'reference') as c,LifecycleProbe(t) as l,EstimatorShadow(t,l) as s,GeometryProjection(t,l,s,arm!='observed_native') as g:
                index=0
                for cache in iter_caches(seq,detector):
                    validate_cache_schema(cache,detector)
                    for item in cache['frames']:
                        index+=1;ok,image=cap.read();require(ok and image.shape[:2]==(cache['height'],cache['width']),'Complete source decode required')
                        original=t.update
                        def capture(detections,frame=None,timestamp=None):
                            result=original(detections,frame=frame,timestamp=timestamp)
                            native.append({k:getattr(result,k).tolist() for k in ('xyxy','confidence','class_id','tracker_id')});return result
                        t.update=capture
                        try:objects,_,_,_=_one_step('bytetrack',t,{},1,item['detections'],image,index)
                        finally:t.update=original
                        frames.append({'index':index,'objects':objects})
                        record={'lifecycle':l.last,'numerical':s.last,'geometry':g.last};ledger.add(record)
                        log.write(encoded({**record,'candidate':c.last}))
                        positive=lambda b:b[2]>b[0] and b[3]>b[1]
                        counts['invalid_predictions']+=sum(not positive(v['bbox']) for v in l.last['predicted'])
                        post={v['token']:v for v in l.last['before_lifecycle_prune']}
                        for stage in l.last['stages']:
                            for r,col in stage['matched']:counts['invalid_accepted_posteriors']+=not positive(post[stage['tracks'][r]['token']]['bbox'])
                        counts['numerical_failures']+=sum(not v for o in s.last['operations'] for v in o['checks'].values())
                        for key in ('protected_other_updates_lost','weak_blocked_rows','weak_stages'):counts[key]+=c.last[key]
                        counts['actions']+=len(c.last['actions']);counts['geometry_projections']+=sum(r['applied'] for r in g.last['rows'])
                        for action in c.last['actions']:
                            if action['kind']=='birth_continuation':counts[('active' if action['active_before'] else 'retained')+'_birth_continuations']+=1
                require(index==spec['frames'] and not cap.read()[0],'Full original frame coverage required')
        finally:cap.release()
    (folder/'predictions.local.json').write_text(json.dumps(frames)+'\n')
    (folder/'native-output.local.json').write_text(json.dumps(native,separators=(',',':'),allow_nan=False)+'\n')
    (folder/'final-state.local.pickle').write_bytes(pickle.dumps(t,protocol=4))
    with (folder/'accepted.local.jsonl').open('xb') as output:
        for key in sorted(ledger.events):output.write(encoded(ledger.events[key]))
    return {'counts':dict(counts),'accepted_summary':ledger.summary(),
        'sha256':{name:digest(folder/name) for name in ('predictions.local.json','native-output.local.json','final-state.local.pickle','trace.local.jsonl.gz','accepted.local.jsonl')}}


def load_ledger(folder,summary):
    l=AcceptedLedger()
    with gzip.open(folder/'trace.local.jsonl.gz','rb') as f:
        for line in f:
            row=strict_json(line);require(set(row)=={'lifecycle','numerical','geometry','candidate'},'Exact local trace schema required')
            l.add({k:row[k] for k in ('lifecycle','numerical','geometry')})
    require(l.summary()==summary,'Complete accepted/input receipt differs')
    return l


def run(a):
    p=verify(a.protocol,a.seal);original_seal(a.archive_root)
    work=local(a.work);require(not work.exists() and not a.output.exists() and not a.references.exists(),'No overwrite/retry')
    work.mkdir();manifest=validate_new_manifest(strict_json(local(a.inputs).read_bytes()),[s['name'] for s in p['new_sources']])
    preparation=strict_json(local(a.preparation).read_bytes());require(preparation['protocol_sha256']==digest(a.protocol),'Prepared source seal differs')
    require([x['name'] for x in preparation['ledger']]==[s['name'] for s in p['new_sources']], 'Complete preparation ledger required')
    rows=[]
    with ProcessPoolExecutor(max_workers=1,mp_context=mp.get_context('spawn'),max_tasks_per_child=1) as pool:
        for seq,spec,prep in zip(manifest['sequences'],p['new_sources'],preparation['ledger']):
            row={'name':spec['name'],'frames':spec['frames'],'status':'failed','comparisons':None,'passes':{}}
            folder=work/spec['name'];folder.mkdir();rows.append(row)
            try:
                require(prep['name']==spec['name'] and prep['status']=='completed','Original preparation failed')
                meta=source_metadata(seq,spec,p['detector_settings']);row['source_lock']=meta
                require(meta['capped_frames']==0,'Cap exposure fails source')
                value=pool.submit(native_replay,seq,spec,p['detector_settings'],folder/'native','native').result()
                row.update(status='reference_sealed',source_lock=meta,native_reference=value)
            except Exception as exc:(folder/'native-failure.local.txt').write_text(repr(exc)+'\n');row['reason']='native_reference_or_preparation_failed'
            print(row['name']+' '+row['status'],flush=True)
        write(a.references,{'format':'depthport.handoff-controls-native.v1','protocol_sha256':digest(a.protocol),'all_native_before_candidates':True,'ledger':rows})
        for seq,spec,row in zip(manifest['sequences'],p['new_sources'],rows):
            if row['status']!='reference_sealed':continue
            folder=work/spec['name']
            try:
                for arm,trial in ((arm,i) for arm in ('observed_native','projection','birth_continuation','past_competition_handoff') for i in (0,1)):
                    key=f'{arm}-{trial}'
                    value=pool.submit(replay,seq,spec,p['detector_settings'],folder/key,arm).result();row['passes'][key]=value
                    if arm=='observed_native':
                        for name in ('predictions.local.json','native-output.local.json','final-state.local.pickle'):
                            require(value['sha256'][name]==row['native_reference']['sha256'][name],'Complete native/instrumented output differs')
                    print(row['name']+' '+key+' sealed',flush=True)
                for arm in ('observed_native','projection','birth_continuation','past_competition_handoff'):
                    require(row['passes'][f'{arm}-0']==row['passes'][f'{arm}-1'],'Complete arm repeat differs')
                base=row['passes']['projection-0'];r=load_ledger(folder/'projection-0',base['accepted_summary']);comparisons={}
                for arm in ARMS[1:]:
                    c=row['passes'][arm+'-0'];l=load_ledger(folder/(arm+'-0'),c['accepted_summary'])
                    value,raw=screen(r,l,base['counts'],c['counts'])
                    with (folder/(arm+'-differences.local.jsonl')).open('xb') as f:
                        for e in raw:f.write(encoded(e))
                    comparisons[arm]=value
                row.update(status='completed',repeat_equal=True,native_instrumentation_equal=True,comparisons=comparisons)
            except Exception as exc:(folder/'control-failure.local.txt').write_text(repr(exc)+'\n');row.update(status='failed',reason='control_execution_or_equality_failed')
            write(work/'progress.local.json',rows);print(row['name']+' '+row['status'],flush=True)
    verify(a.protocol,a.seal);original_seal(a.archive_root)
    complete=all(r['status']=='completed' for r in rows)
    gates={arm:bool(complete and all(r['comparisons'][arm]['effective_candidate_exposure'] and r['comparisons'][arm]['all_observable_input_gates_pass'] for r in rows)) for arm in ARMS[1:]}
    result={'format':'depthport.handoff-controls-public.v1','protocol_sha256':digest(a.protocol),'references_sha256':digest(a.references),
      'new_sources':list(s['name'] for s in p['new_sources']),'unique_source_frames':sum(s['frames'] for s in p['new_sources']),
      'all_scheduled_completed':complete,'candidate_replication_gates':gates,'sealed_original_files_rechecked':434,'prior_records_unchanged':True,
      'prior_discovery_complete':False,'prior_formal_replication_flags':read('docs/validation/v0.3-handoff-audit.json')['original_replication_flags'],
      'original_failures_retained':read('docs/validation/v0.3-handoff-audit.json')['original_failures_retained'],
      **{k:False for k in ('gt_read','accuracy_scoring','retuned','weak_stage_changed','defaults_changed','tracking_quality_accepted')},'ledger':rows}
    write(a.output,result);return 0 if complete else 2


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__);sub=parser.add_subparsers(dest='command',required=True)
    f=sub.add_parser('freeze')
    for n in ('protocol','seal','archive-root','weights','detector-python'):f.add_argument('--'+n,type=Path,required=True)
    r=sub.add_parser('run')
    for n in ('protocol','seal','archive-root','inputs','preparation','work','output','references'):r.add_argument('--'+n,type=Path,required=True)
    args=parser.parse_args()
    if args.command=='freeze':freeze(args)
    else:raise SystemExit(run(args))
