#!/usr/bin/env python3
# SPDX-License-Identifier: AGPL-3.0-only
"""Freeze read-only exposure funnel definitions, then traverse original seals.

Never run inference, tracking or accuracy scoring. No labels/evaluator input.
Raw row/observation diagnostics must stay in ignored local artifacts.
"""
from collections import Counter
from datetime import datetime,timezone
import argparse
import hashlib
import importlib.metadata
import inspect
import json
from pathlib import Path
import subprocess
import sys
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT))
from depthport.tracking_exposure_gap import GapLedger,COUNT_KEYS,PAST_REASONS,PROTECTION,COMPETITION,require
from depthport.tracking_past_support_control import ARMS
from depthport.tracking_past_exposure import manifest,source_metadata
from depthport.tracking_exposure import iter_caches
from depthport.video_tracking_benchmark import sha256_file

SOURCE='docs/validation/v0.3-past-exposure-protocol.json'
RECORDS=tuple(f'docs/validation/v0.3-past-exposure-{p}.json' for p in ('discovery','confirmation'))
LOCKS=tuple(f'docs/validation/v0.3-past-exposure-{p}-inputs.json' for p in ('discovery','confirmation'))
FILES=('depthport/tracking_exposure_gap.py','tools/diagnose_tracking_exposure_gap.py','tests/test_tracking_exposure_gap.py',
       'depthport/tracking_past_support_control.py','depthport/tracking_past_exposure.py',
       'depthport/tracking_association_probe.py','depthport/tracking_exposure.py',
       'depthport/tracking_recovery_control.py','depthport/video_tracking_benchmark.py')


def local(path):
    path=Path(path)
    require(not path.is_symlink() and path.resolve().is_relative_to(ROOT/'artifacts'),'Ignored local artifacts required')
    return path.resolve()


def upstream():
    from trackers import ByteTrackTracker
    from trackers.utils.iou import IoU
    import supervision as sv
    return {'bytetrack':hashlib.sha256(inspect.getsource(ByteTrackTracker).encode()).hexdigest(),
            'budget_helper':hashlib.sha256(inspect.getsource(ByteTrackTracker._compute_maximum_frames_without_update).encode()).hexdigest(),
            'iou_compute':hashlib.sha256(inspect.getsource(IoU.compute).encode()).hexdigest(),
            'box_iou_batch':hashlib.sha256(inspect.getsource(sv.box_iou_batch).encode()).hexdigest()}


def freeze(output,seal):
    require(not output.exists() and not seal.exists(),'Refuse to overwrite frozen definition')
    source=json.loads((ROOT/SOURCE).read_text());versions={n:importlib.metadata.version(n) for n in source['runtime']}
    require(versions==source['runtime'],'Original research runtime required')
    hashes=upstream();require(hashes['bytetrack']==source['upstream_bytetrack_class_sha256'],'Upstream differs')
    definition={'format':'depthport.exposure-gap-protocol.v1','frozen_at_utc':datetime.now(timezone.utc).isoformat(),
        'base_commit':subprocess.check_output(['git','rev-parse','HEAD'],text=True,cwd=ROOT).strip(),
        'status':'Local definition freeze after synthetic contracts, before new funnel extraction. Original exposure counts/selections known. Descriptive post-hoc mechanism diagnosis, not independent confirmation or external preregistration.',
        'source_protocol_sha256':sha256_file(ROOT/SOURCE),
        'source_records_sha256':{p:sha256_file(ROOT/p) for p in RECORDS+LOCKS},
        'implementation_sha256':{p:sha256_file(ROOT/p) for p in FILES},'runtime':versions,'upstream_sha256':hashes,
        'cohort':{'sources':18,'source_frames':18595,'arms':list(ARMS),'trace_frames':74380,
            'selection':'All original sixteen discovery and both reserved sources in original order, all four own-history first-repeat traces. No source/arm/event exclusions or reselection; keep all zero categories.'},
        'definitions':{
            'original_assignment':'For each stage verify exact native maximize(similarity) then original gate. Weak original accepted edges = observed post-veto matched UNION original deferred edges; disjoint and one-to-one. Never rerun a tracker or install an alternative.',
            'weak_input':'Unchanged cache detection confidence, cast float32 as original _one_step; high>=.6, weak<.6. No new filter. Empty stage requires empty input/no audit/no veto; count separately, never fabricate a comparison.',
            'opportunity':'Confirmed pre-update age>=2 weak-stage row with >=1 weak input. Partition rows into no column reaching original gate, gate-supported but not accepted by original one-to-one assignment, and original accepted missed-row weak update (opportunity). Count frames, rows and edges separately.',
            'active_competition':'Per original opportunity partition: no other active confirmed age1 row; active rows but none supports target above original gate; gate support but none within original signed margin; >=1 active gate+margin competitor. Retained/unconfirmed alternatives separate, never active evidence. Preserve float32 current subtraction/comparison; no new cutoff.',
            'past':'Reconstruct each arm own append-only accepted (source frame, immutable full-cache detection index) histories, using probe ownership tokens only within that trace. Record actual high then weak accepted edges, never deferred edges or birth keys. Recreate selected last-observation context and verify every recorded past reason/qualified key strictly before decision. Distinguish missing recorded history / missing stage comparison / competitor without accepted observation from observed retained/unconfirmed/below-gate/outside-margin ineligibility. Original reason precedence retained. Missing-history side separately selected/competitor/both; no imputed birth.',
            'protection':'For each active current alternative recompute unchanged frozen protection helper from original matching; verify exact recorded reason and other-update loss. Occupied competitor and displaced other update distinct. No alternative installed, no opportunity-cost threshold. Cross past supported/missing/ineligible with protected/occupied/displaced, all nine cells including zeros.',
            'units':'Opportunity edges differ from competing alternatives. Per-edge past/protected/joint counts use any qualifying competitor, conjunction on SAME competitor. Across arms histories diverge: no row/ID joins or causal subtraction. Phase sums and conditional ratios; zero denominator = null, never zero success. Per1000 frames and per minute of nominal source duration are descriptive, not FPS or independent-event rates.',
            'checks':'Consecutive full frames/cache splits; exact pre-veto assignment; remaining snapshots; accepted-history ages; all original audit/veto/competitor lists/past/protection reasons; all ten prior public exposure counts and phase/trace/cache seals. All counters fixed whitelist, raw opportunity locations local.'},
        'buffer_erratum':{'prior_text':'Earlier KITTI reports/frozen prose incorrectly described lost_track_buffer30 as30 native frames/3seconds, and MOT25Hz as1.2seconds.',
            'actual':'Pinned native helper max(1,ceil(frame_rate/30*lost_track_buffer)); parameter30 gives configured maximum_frames_without_update10/25/30 at10/25/30Hz, nominal1second in all three. maximum_time_without_update=30/30=1. Snapshot/fixed-step ages remain native frame units; equality/lifecycle boundaries are not certified physical timeouts.',
            'scope':'Documentation interpretation correction only. Original parameters, code, caches, traces, selections and their frozen hashes retained byte-for-byte. No tracking rerun, source substitution, duration fit or causal attribution to the buffer.'},
        'forbidden':'No new inference/tracking, GT/labels/scores/evaluator invocation, accuracy selection, parameter changes, source replacement, intervention or default promotion. Existing known GT scores are not inputs.',
        'public_scope':'Only source seals, all-source counts/conditional ratios/reasons and numeric chart. Original matrices, frame positions, IDs, accepted observations, cases and paths local. Original source terms/attribution and noncommercial local scope inherited unchanged.'}
    output.parent.mkdir(parents=True,exist_ok=True);output.write_text(json.dumps(definition,indent=2)+'\n')
    local(seal).write_text(json.dumps({'protocol_sha256':sha256_file(output),'frozen_at_utc':definition['frozen_at_utc']},indent=2)+'\n')
    print(json.dumps({'protocol_sha256':sha256_file(output),'funnel_extracted':False,'new_tracking_or_gt':False}))


def rates(summary,frames,duration):
    c=summary['counts']
    def ratio(n,d):return n/d if d else None
    return {'opportunities_per1000_frames':1000*ratio(c['opportunities'],frames) if frames else None,
        'opportunities_per_nominal_minute':60*ratio(c['opportunities'],duration) if duration else None,
        'accepted_fraction_missed_weak_rows':ratio(c['opportunities'],c['missed_rows_with_weak_input']),
        'active_competition_fraction_opportunities':ratio(c['active_competition'],c['opportunities']),
        'past_supported_fraction_active_alternatives':ratio(c['past_supported'],c['active_alternatives']),
        'past_missing_fraction_active_alternatives':ratio(c['past_missing'],c['active_alternatives']),
        'protection_pass_fraction_active_alternatives':ratio(c['protection_pass'],c['active_alternatives'])}


def combine(records,arm):
    keys=('counts','past_reasons','missing_history_side','protection_reasons','past_protection_cross')
    result={k:dict(Counter()) for k in keys}
    for k in keys:
        total=Counter()
        for record in records:total.update(record['arms'][arm][k])
        result[k]=dict(total)
    frames=sum(r['frames'] for r in records);duration=sum(r['frames']/r['fps'] for r in records)
    result['rates']=rates(result,frames,duration);return result


def analyze(protocol_path,seal,inputs,raw_root,output,details):
    protocol=json.loads(protocol_path.read_text());digest=sha256_file(protocol_path)
    require(json.loads(local(seal).read_text())['protocol_sha256']==digest,'Original definition seal differs')
    for name,sha in protocol['implementation_sha256'].items():require(sha256_file(ROOT/name)==sha,'Frozen implementation differs')
    for name,sha in protocol['source_records_sha256'].items():require(sha256_file(ROOT/name)==sha,'Original source record differs')
    require(sha256_file(ROOT/SOURCE)==protocol['source_protocol_sha256'] and upstream()==protocol['upstream_sha256'],'Source/upstream differs')
    runtime={n:importlib.metadata.version(n) for n in protocol['runtime']};require(runtime==protocol['runtime'],'Original research runtime required')
    source=json.loads((ROOT/SOURCE).read_text());from trackers import ByteTrackTracker
    local(details).parent.mkdir(parents=True,exist_ok=True);records=[];raw_root=local(raw_root)
    with details.open('w') as raw:
        for phase,record_name,lock_name,input_path in zip(('discovery','confirmation'),RECORDS,LOCKS,inputs):
            prior=json.loads((ROOT/record_name).read_text());lock=json.loads((ROOT/lock_name).read_text())
            require(prior['phase']==phase and prior['gt_read'] is False and prior['accuracy_scoring'] is False and prior['all_scheduled_completed'],'Complete GT-free source ledger required')
            require(prior['input_lock_sha256']==sha256_file(ROOT/lock_name),'Original input lock differs')
            if phase=='confirmation':require(prior['discovery_sha256']==sha256_file(ROOT/RECORDS[0]),'Phase seal differs')
            specs=[s for s in source['sequences'] if s['phase']==phase];m=manifest(local(input_path),source,phase)
            require([r['name'] for r in prior['ledger']]==[s['name'] for s in specs]==[s['name'] for s in lock['sequences']],'Full source order differs')
            for spec,seq,locked,old in zip(specs,m['sequences'],lock['sequences'],prior['ledger']):
                require(source_metadata(seq,spec,source['detector_settings'])==locked,'Original source/cache differs')
                cached=[row for shard in iter_caches(seq,source['detector_settings']) for row in shard['frames']]
                record={'name':spec['name'],'phase':phase,'frames':spec['frames'],'fps':spec['fps'],
                    'configured_maximum_frames_without_update':ByteTrackTracker._compute_maximum_frames_without_update(source['parameters']['lost_track_buffer'],spec['fps']),
                    'arms':{}}
                for arm in ARMS:
                    path=raw_root/phase/spec['name']/(arm+'-trace.local.jsonl');require(sha256_file(path)==old['arms'][arm]['trace_sha256'],'Original trace differs')
                    ledger=GapLedger(arm)
                    def write(case):raw.write(json.dumps({'source':spec['name'],'arm':arm,**case},sort_keys=True)+'\n')
                    with path.open() as lines:
                        for line,item in zip(lines,cached,strict=True):ledger.frame(json.loads(line),item['detections'],write)
                    require(ledger.number==spec['frames'],'Dense source coverage differs')
                    summary=ledger.summary();c=summary['counts'];mapping={'frames':'frames','candidate_edges':'audited_candidate_edges','actual_vetoes':'actual_vetoes',
                        'frames_with_veto':'veto_frames','active_alternatives':'active_alternatives','retained_alternatives':'retained_alternatives',
                        'unconfirmed_alternatives':'unconfirmed_alternatives','past_qualified':'past_supported','protected':'protection_pass','joint':'joint_alternatives'}
                    require(all(old['arms'][arm]['counts'][k]==c[v] for k,v in mapping.items()),'Original exposure counts do not reconcile')
                    summary['rates']=rates(summary,spec['frames'],spec['frames']/spec['fps']);record['arms'][arm]=summary
                records.append(record);print(spec['name']+' four histories reconciled',flush=True)
    require(len(records)==18 and sum(r['frames'] for r in records)==18595 and sum(r['frames'] for r in records)*len(ARMS)==74380,'Frozen full cohort differs')
    result={'format':'depthport.exposure-gap.v1','protocol_sha256':digest,'source_protocol_sha256':protocol['source_protocol_sha256'],
        'runtime':runtime,'gt_read':False,'accuracy_scoring':False,'tracking_rerun':False,'inference_rerun':False,'retuned':False,
        'source_frames':18595,'trace_frames':74380,'sequences':records,'combined':{},'local_details_sha256':sha256_file(details)}
    for phase in ('discovery','confirmation'):
        rows=[r for r in records if r['phase']==phase];result['combined'][phase]={'sources':len(rows),'frames':sum(r['frames'] for r in rows),
            'nominal_seconds':sum(r['frames']/r['fps'] for r in rows),'arms':{a:combine(rows,a) for a in ARMS}}
    output.parent.mkdir(parents=True,exist_ok=True);output.write_text(json.dumps(result,indent=2,allow_nan=False)+'\n')
    print('Complete GT-free read-only funnel; raw cases local.',flush=True)


def main():
    p=argparse.ArgumentParser(description=__doc__);sub=p.add_subparsers(dest='command',required=True)
    f=sub.add_parser('freeze')
    for arg in ('output','seal'):f.add_argument('--'+arg,type=Path,required=True)
    a=sub.add_parser('analyze')
    for arg in ('protocol','seal','discovery-inputs','confirmation-inputs','raw-root','output','local-details'):a.add_argument('--'+arg,type=Path,required=True)
    args=p.parse_args()
    if args.command=='freeze':freeze(args.output,args.seal)
    else:analyze(args.protocol,args.seal,(args.discovery_inputs,args.confirmation_inputs),args.raw_root,args.output,args.local_details)


if __name__=='__main__':main()
