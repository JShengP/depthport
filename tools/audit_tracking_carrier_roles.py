#!/usr/bin/env python3
# SPDX-License-Identifier: AGPL-3.0-only
"""Freeze and read existing carriers/histories without tracking, media or GT."""
import argparse
from datetime import datetime, timezone
import gzip
import hashlib
import importlib.metadata
import json
from pathlib import Path
import subprocess
import sys
from zoneinfo import ZoneInfo
ROOT = Path(__file__).resolve().parents[1]; sys.path.insert(0,str(ROOT))
from depthport.tracking_carrier_role_audit import RoleAudit, carrier_audit, strict_json, encoded
from depthport.tracking_lifecycle_probe import require
from tools.diagnose_tracking_upstream import hashes, local
from tools.audit_tracking_estimator_shadow import internals

PREVIOUS = 'docs/validation/v0.3-geometry-exposure-'
FILES = ('depthport/tracking_carrier_role_audit.py','tools/audit_tracking_carrier_roles.py',
         'tests/test_tracking_carrier_roles.py')
RECORDS = tuple(PREVIOUS+n+'.json' for n in ('protocol','discovery','discovery-references',
    'archive-compatibility','confirmation','confirmation-references','preparation','pre-inference'))
PROTOCOL = 'docs/validation/v0.3-carrier-role-audit-protocol.json'


def digest(path):
    h=hashlib.sha256()
    with path.open('rb') as file:
        for chunk in iter(lambda:file.read(1024*1024),b''):h.update(chunk)
    return h.hexdigest()


def write(path,value):
    path.parent.mkdir(parents=True,exist_ok=True)
    path.write_text(json.dumps(value,indent=2,allow_nan=False)+'\n')


def prior():
    return {phase:strict_json((ROOT/(PREVIOUS+phase+'.json')).read_bytes()) for phase in ('discovery','confirmation')}


def paths(records):
    result={}
    for phase,record in records.items():
        for scene in record['ledger']:
            for arm,value in scene['passes'].items():
                base=ROOT/'artifacts/tracking-geometry-exposure'/phase/scene['name']/arm
                for name in value['sha256']:
                    result[phase+'/'+scene['name']+'/'+arm+'/'+name]=base/name
                if arm!='native':
                    require(scene['status']=='completed','Unknown partial observed history must not enter role audit')
                    result[phase+'/'+scene['name']+'/'+arm+'/trace.local.jsonl.gz']=base/'trace.local.jsonl.gz'
    for i in range(4):
        name=f'KITTI-{i:04d}'
        result['historical-carrier/'+name]=ROOT/'artifacts/tracking-past-support/run'/name/'activation_control-predictions.local.json'
    return result


def runtime_check(p):
    require({n:importlib.metadata.version(n) for n in p['runtime']}==p['runtime']
        and hashes()==p['upstream_sha256'] and internals()==p['numerical_modules_sha256'], 'Original pinned runtime/source required')


def freeze(a):
    require(not a.output.exists() and not a.seal.exists(),'No freeze overwrite')
    old=strict_json((ROOT/RECORDS[0]).read_bytes()); runtime_check(old)
    for name,sha in old['pinned_files_sha256'].items(): require(digest(ROOT/name)==sha,'Original pin differs: '+name)
    records=prior(); compatibility=strict_json((ROOT/(PREVIOUS+'archive-compatibility.json')).read_bytes())
    require(not records['discovery']['all_scheduled_completed'] and records['confirmation']['all_scheduled_completed'], 'Original study status differs')
    failed=[r['name'] for r in records['discovery']['ledger'] if r['status']=='failed']
    require(failed==[f'KITTI-{i:04d}' for i in range(4)],'Complete original four failures required')
    inputs=paths(records); seals={key:digest(local(path)) for key,path in inputs.items()}
    for phase,record in records.items():
        for scene in record['ledger']:
            for arm,value in scene['passes'].items():
                for name,sha in value['sha256'].items(): require(seals[phase+'/'+scene['name']+'/'+arm+'/'+name]==sha,'Original output/state bytes differ')
    for row in compatibility['ledger']:require(seals['historical-carrier/'+row['name']]==row['historical_archive_sha256'],'Original carrier bytes differ')
    p={'format':'depthport.carrier-role-audit-protocol.v1','frozen_at_utc':datetime.now(timezone.utc).isoformat(),
       'report_date_local':datetime.now(ZoneInfo('Asia/Taipei')).date().isoformat(),'report_timezone':'Asia/Taipei',
       'base_commit':subprocess.check_output(['git','rev-parse','HEAD'],cwd=ROOT,text=True).strip(),
       'status':'Prospective local definition freeze after source/synthetic contracts, before this audit extracts carriers or role cases. Prior post-failure equal-frame diagnosis and zero tentative exposure known; all sources already seen. Retrospective descriptive audit, not new independent confirmation or external preregistration.',
       'runtime':old['runtime'],'upstream_sha256':old['upstream_sha256'],'numerical_modules_sha256':old['numerical_modules_sha256'],
       'parameters':old['parameters'],'prior_pins_sha256':old['pinned_files_sha256'],
       'implementation_sha256':{name:digest(ROOT/name) for name in FILES},
       'source_records_sha256':{name:digest(ROOT/name) for name in RECORDS},
       'carrier_writer_sha256':digest(ROOT/'tools/validate_tracking_past_support.py'),
       'local_input_sha256':seals,'carriers':failed,
       'sources':[{k:s[k] for k in ('name','phase','frames','fps')} for s in old['sequences']],
       'definitions':{
          'execution':'Read only all four original Session carriers and four already sealed native frame-list outputs; do not write into original trees. Audit all four existing observed histories (reference/projection, trials0/1) for every one of22 completed sources. Keep26-source order and four blocked978-frame sources as unmeasured, not zero. Verify all434 local input file hashes before and after, including existing114 full output/native-return/final-state filesets and88 compressed histories. Hash pickles only, never load them. Two separately sealed histories per arm audited independently and exact aggregate/raw case receipts compared; stream all source frames, no sampling/retry/reselection.',
          'carrier_schema':'Strict duplicate-key/nonfinite-rejecting JSON. Session keys exactly format,session_id,sampling,tracker,source,frames. Metadata exactly depthport.semantic-tracking.v1; video- plus first24 characters of original locked video SHA256; dense_video; bytetrack; offline_video_fixed_detection_cache. No arbitrary metadata stripping, unknown GT/evaluator/extra fields, coercion, sorting, rounded coordinates, object/frame reordering or ID canonicalization. Dense frame indices1..full source; exact frame/object keys, original person class0, unique bytetrack nonnegative IDs, finite positive boxes and finite confidence[0,1]. Raw payload values/order/types retained.',
          'carrier_levels':'Report original whole-archive byte equality separately (must remain false in all four old failures). Compare ordered frame payloads with the unchanged native JSON writer encoding; require native encoded payload exactly equals sealed native bytes. Reconstruct expected Session envelope with derived metadata in original writer insertion order around the NEW sealed native payload, using original JSON recipe, only in memory/new ignored audit artifact; compare reconstructed bytes/hash to historical archive. This is a new read-only carrier compatibility contract, not an original native rerun, writer/reader integration, repaired file or retroactive gate change. Missing/schema/metadata/payload/encoding mismatch remains explicit failure; no fallback normalization.',
          'phase_roles':'Use existing geometry pre-predict roles only: active missed-age0, retained>0, native confirmed ID>=0, tentative=-1. Audit births separately after prediction/association, predicted transient tentative age1 separately from next-frame retained role, and end-of-source births as censored. Detector returns with ID-1 are not automatically owned hypotheses. Never move a post-predict snapshot into a pre-predict exposure stratum.',
          'reachability_hypothesis':'For unchanged native ByteTrack2.6.1, fixed timing, minimum_consecutive_frames2, normal positive XYXY births with zero velocities, no external state/ID injection: each seed is tentative at birth with counter1. Its next pre-predict is active, birth-only, counter1, with zero velocity and unchanged positive box, so F(1)*x has positive size and cannot trigger the frozen guard. The first accepted high OR weak match increments to2 and immediately assigns a nonnegative ID before prune; unmatched tentative age1 is immature and removed in that frame. Hence retained-tentative pre-predict is unreachable under this lifecycle; active-tentative exists but projection is structurally excluded by seed geometry. This is source-defined induction to check across all observed histories, not empirical safety/quality proof or a claim for other confirmation counts/timestamps/custom estimators/restarts/external mutations.',
          'full_history_checks':'Reconcile every frame/operation/birth and original geometry-exposure counts/rows/exposed frames to prior source+arm seals. Exact prior after_update to next before_update and full KF/motion snapshot continuity, guard projected state to native predict prestate, predict/update ordering and bbox equality. For every tentative pre-predict, require next-frame birth-only origin, no prior accepted update, active age0/counter1, positive zero-velocity seed mean, unchanged predicted mean, no candidate/projection, post-predict age1/counter1; partition high promotion, weak promotion, unmatched immature removal. Source-end unconfirmed seeds censored. Every seed resolves next frame or is explicitly end-censored; no inferred outcome for unobserved sources. All counts/case failures retained.',
          'preservation':'No source video/cache/GT/labels/accuracy report/evaluator is opened. No inference, native tracker update/predict, shadow replay, solver, tuning, parameter/default/lifetime/weak-stage/input change or new source. Read native code for the conditional induction only; synthetic native contracts run before freeze with generated boxes and unchanged settings, never real-source tracking. Original four failures, discovery completeness=false, selections and all formal replication=false flags unchanged byte-for-byte.',
          'publication':'Only complete source-level aggregate counts, check denominators/equality/failure flags, code/runtime/input/output hashes and conditional reachability explanation. Raw metadata, per-frame/token/native ID, box/state/covariance/history/case coordinates, reconstructed carriers, diagnostics/exceptions and local paths stay ignored local. No promotion/default change, new harm/quality/identity claim or retrospective acceptance.'},
       'terms':'Reuse only previously licensed MOT/KITTI immutable local artifacts; terms and attribution in pinned original exposure protocol. Local noncommercial research; no media, labels, raw result redistribution or dataset relicensing.'}
    write(a.output,p);write(local(a.seal),{'protocol_sha256':digest(a.output),'frozen_at_utc':p['frozen_at_utc']})
    print(json.dumps({'protocol_sha256':digest(a.output),'local_files_sealed':len(seals),'new_carrier_role_extraction':False}))


def verify(a):
    p=strict_json(a.protocol.read_bytes()); require(strict_json(local(a.seal).read_bytes())['protocol_sha256']==digest(a.protocol),'Freeze differs')
    for key in ('prior_pins_sha256','implementation_sha256','source_records_sha256'):
        for name,sha in p[key].items():require(digest(ROOT/name)==sha,'Frozen file differs: '+name)
    require(digest(ROOT/'tools/validate_tracking_past_support.py')==p['carrier_writer_sha256'],'Original carrier writer differs')
    runtime_check(p); records=prior(); inputs=paths(records)
    require(set(inputs)==set(p['local_input_sha256']),'Complete original input set required')
    for key,path in inputs.items():require(digest(local(path))==p['local_input_sha256'][key],'Sealed local input differs')
    return p,records,inputs


def unmeasured(scene):
    return {'name':scene['name'],'phase':'discovery','frames':scene['frames'],
        'status':'unmeasured_no_observed_history','original_status':scene['status'],
        'original_reason':scene.get('reason'),'roles':None,'original_failure_changed':False}


def analyze(a):
    p,records,inputs=verify(a); work=local(a.work)
    require(not work.exists() and not a.output.exists(),'No audit overwrite/retry');work.mkdir(parents=True)
    original_hashes={name:digest(ROOT/name) for name in RECORDS}; carriers=[]; roles=[]
    oldproto=strict_json((ROOT/RECORDS[0]).read_bytes())
    failed={r['name']:r for r in records['discovery']['ledger'] if r['status']=='failed'}
    for name in p['carriers']:
        row={'name':name,'status':'failed','original_status':failed[name]['status'],'original_failure_changed':False}
        try:
            old=inputs['historical-carrier/'+name]; new=inputs['discovery/'+name+'/native/predictions.local.json']
            video_sha=oldproto['discovery_inputs'][name]['video_sha256']; count=failed[name]['frames']; results=[]; raw_sha=[]
            for trial in (0,1):
                value,raw=carrier_audit(old.read_bytes(),new.read_bytes(),video_sha,count)
                path=work/(name+'-carrier-'+str(trial)+'.local.json');write(path,raw)
                results.append(value);raw_sha.append(digest(path))
            require(results[0]==results[1] and raw_sha[0]==raw_sha[1],'Independent carrier traversals differ')
            row.update(status='completed',audit=results[0],repeat_equal=True,raw_audit_sha256=raw_sha[0])
        except Exception as exc:
            (work/(name+'-carrier-failure.local.txt')).write_text(repr(exc)+'\n');row['reason']='carrier_contract_or_integrity_audit_failed'
        carriers.append(row);print(name+' carrier '+row['status'],flush=True)
    for phase,record in records.items():
        for scene in record['ledger']:
            if scene['status']!='completed':roles.append(unmeasured(scene));continue
            row={'name':scene['name'],'phase':phase,'frames':scene['frames'],'status':'failed','arms':{}}
            try:
                for arm in ('reference','projection'):
                    values=[]; case_sha=[]
                    for trial in (0,1):
                        key=phase+'/'+scene['name']+'/'+arm+'-'+str(trial)+'/trace.local.jsonl.gz'
                        history=hashlib.sha256(); ledger=RoleAudit(); dest=work/(scene['name']+'-'+arm+'-'+str(trial)+'.local.jsonl')
                        with gzip.open(inputs[key],'rb') as source, dest.open('wb') as output:
                            for line in source:
                                history.update(line)
                                for case in ledger.add(strict_json(line)):output.write(encoded(case))
                            value,censored=ledger.result()
                            for state in censored:output.write(encoded({'phase':'source_end_censored','state':state}))
                        expected=scene['passes'][arm+'-'+str(trial)]
                        require(history.hexdigest()==expected['trace_sha256'],'Original uncompressed history differs')
                        require(value['original_native_counts']==expected['counts']
                            and value['original_projection_rows']==expected['rows']
                            and value['original_exposed_frames']==expected['exposed_frames'],'Original full exposure ledger differs')
                        require(value['counts']['frames']==scene['frames'],'Complete source coverage required')
                        values.append(value);case_sha.append(digest(dest))
                    require(values[0]==values[1] and case_sha[0]==case_sha[1],'Independent original-history audits differ')
                    row['arms'][arm]={'summary':values[0],'repeat_equal':True,'raw_audit_sha256':case_sha[0]}
                row['status']='completed'
            except Exception as exc:
                (work/(scene['name']+'-role-failure.local.txt')).write_text(repr(exc)+'\n');row['reason']='history_integrity_or_role_induction_failed'
            roles.append(row);print(scene['name']+' roles '+row['status'],flush=True)
    for key,path in inputs.items():require(digest(path)==p['local_input_sha256'][key],'Read-only input changed after audit')
    require(all(digest(ROOT/name)==sha for name,sha in original_hashes.items()),'Original failure/result records changed')
    result={'format':'depthport.carrier-role-audit.v1','protocol_sha256':digest(a.protocol),
        'gt_read':False,'accuracy_scoring':False,'inference':False,'tracking_rerun':False,'retuned':False,
        'weak_stage_changed':False,'defaults_changed':False,'original_records_bytes_unchanged':True,
        'original_discovery_completed':records['discovery']['all_scheduled_completed'],
        'original_replication_flags':{k:v['replicated_in_both_reserved'] for k,v in records['confirmation']['confirmation'].items()},
        'original_failures_retained':list(failed),'sealed_local_inputs_rechecked':len(inputs),
        'all_available_audits_completed':all(r['status']=='completed' for r in carriers)
            and all(r['status'] in ('completed','unmeasured_no_observed_history') for r in roles),
        'tracking_quality_accepted':False,'carriers':carriers,'roles':roles}
    write(a.output,result)
    return 0 if result['all_available_audits_completed'] else 2


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__);sub=parser.add_subparsers(dest='command',required=True)
    f=sub.add_parser('freeze')
    for n in ('output','seal'):f.add_argument('--'+n,type=Path,required=True)
    r=sub.add_parser('analyze')
    for n in ('protocol','seal','work','output'):r.add_argument('--'+n,type=Path,required=True)
    a=parser.parse_args();freeze(a) if a.command=='freeze' else sys.exit(analyze(a))
