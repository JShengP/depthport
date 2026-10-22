#!/usr/bin/env python3
# SPDX-License-Identifier: AGPL-3.0-only
"""Freeze, hash and read original seven-source candidate histories; no reruns."""
import argparse
from datetime import datetime, timezone
import gzip
import hashlib
import importlib.metadata
from pathlib import Path
import platform
import subprocess
import sys
from types import SimpleNamespace
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT))
from depthport.tracking_accepted_events import strict_json,encoded,require
from depthport.tracking_handoff_reachability import ReachabilityAudit, ROW_BITS, BIRTH_STEPS, HANDOFF_STEPS, ROLES
from tools.audit_tracking_accepted_events import digest,write
from tools.diagnose_tracking_upstream import local

PARENT='docs/validation/v0.3-handoff-exposure-protocol.json'
PREFIX='docs/validation/v0.3-handoff-exposure-'
PROTOCOL=ROOT/'docs/validation/v0.3-handoff-reachability-protocol.json'
RESULT=ROOT/'docs/validation/v0.3-handoff-reachability.json'
WORK=ROOT/'artifacts/tracking-handoff-reachability'
FILES=('depthport/tracking_handoff_reachability.py','tools/audit_tracking_handoff_reachability.py','tests/test_tracking_handoff_reachability.py')
ARMS=('birth_continuation','past_competition_handoff')


def read(path):return strict_json(Path(path).read_bytes())


def reports():return {phase:read(ROOT/(PREFIX+phase+'.json')) for phase in ('discovery','confirmation')}


def prior(a):
    # Runtime/code/434 original +772 earlier raw-file verification only. No
    # previous preparation, tracking, cache parsing or numerical replay call.
    from tools.select_tracking_handoff_exposure import verify as original_verify
    return original_verify(SimpleNamespace(protocol=ROOT/PARENT,seal=local(a.source_root)/'seal.local.json',
        previous=local(a.previous),archive_root=a.archive_root))


def original_new_files(source_root):
    values={}
    for directory in ('discovery-run','confirmation-run','discovery-prepared','confirmation-prepared'):
        for path in (source_root/directory).rglob('*'):
            if not path.is_file():continue
            if directory.endswith('prepared') and not (path.suffix in ('.png','.mkv') or path.name in
                ('detections.local.json','images.local.json','inputs.local.json','preparation.local.json')):continue
            require(not path.is_symlink(),'No symlink archive inputs')
            values[path.relative_to(source_root).as_posix()]=digest(path)
    require(len(values)>1593,'Complete seven-source raw input/output inventory required')
    return values


def check_public_receipts(root):
    for phase,report in reports().items():
        for row in report['ledger']:
            require(row['status']=='completed','Fixed prior completed source required')
            folder=root/(phase+'-run')/row['name']
            for arm,value in row['passes'].items():
                for name,sha in value['sha256'].items():require(digest(folder/arm/name)==sha,'Original candidate/native repeat file differs')
            for name,sha in row['native_reference']['sha256'].items():require(digest(folder/'native'/name)==sha,'Unhooked native archive differs')
            prepared=root/(phase+'-prepared')/row['name'];lock=row['source_lock']
            require(digest(prepared/'source.mkv')==lock['video_sha256'] and len(lock['cache_sha256'])==1
                and digest(prepared/'detections.local.json')==lock['cache_sha256'][0], 'Original video/cache byte receipt differs')


def freeze(a):
    require(not PROTOCOL.exists() and not WORK.exists(),'No freeze overwrite/retry')
    p=prior(a);root=local(a.source_root);check_public_receipts(root)
    raw=original_new_files(root)
    sealed={**p['source_records_sha256'],**p['implementation_sha256'],**p['rule_sha256']}
    for path in (PARENT,*(PREFIX+s+'.json' for s in ('discovery','discovery-references','discovery-preparation',
        'confirmation','confirmation-references','confirmation-preparation')),'depthport/tracking_recovery_control.py',
        'tests/test_tracking_handoff_exposure_report.py'):
        sealed[path]=digest(ROOT/path)
    from trackers.core.bytetrack.tracker import ByteTrackTracker
    import inspect
    native_gate=inspect.signature(ByteTrackTracker.__init__).parameters['minimum_iou_threshold'].default
    require(type(native_gate) is float and native_gate==.1,'Pinned original default gate required')
    plan={'format':'depthport.handoff-reachability-protocol.v1','report_date_local':'2026-10-22',
        'frozen_at_utc':datetime.now(timezone.utc).isoformat(),'base_commit':subprocess.check_output(['git','rev-parse','HEAD'],cwd=ROOT,text=True).strip(),
        'audit_python':platform.python_version(),'runtime':p['runtime'],'upstream_sha256':p['upstream_sha256'],
        'parameters':p['parameters'],'margin':p['margin'],'native_gate':native_gate,
        'implementation_sha256':{f:digest(ROOT/f) for f in FILES},'source_records_sha256':sealed,
        'rule_sha256':p['rule_sha256'],'sources':[{k:s[k] for k in ('name','phase','frames','fps')} for s in p['new_sources']],
        'geometry_class_sha256':hashlib.sha256(inspect.getsource(__import__('trackers.utils.iou',fromlist=['IoU']).IoU).encode()).hexdigest(),
        'actual_candidate_arms':list(ARMS),'archived_trials':[0,1],'unique_source_frames':1593,'archived_histories':28,
        'expected_read_trace_frames':6372,'original434_files':434,'earlier_raw_files':p['prior_raw_files'],
        'seven_source_raw_files':len(raw),'seven_source_raw_inventory_sha256':hashlib.sha256(encoded(raw)).hexdigest(),
        'known_before_freeze':'Public seven-source study already reports all candidate actions0, selectionsnull, three confirmation gatesfalse,1027 accepted weak updates per arm. Those totals are prior information; new row/column/qualification/past/weak decision decomposition not extracted before this freeze. All seven are seen. This audit is descriptive, not independent confirmation or quality acceptance.',
        'definitions':{
          'scope':'Read BOTH actual candidate arms, both original trials on EACH of seven complete sources:28 histories,6372 trace frames,1593 unique source frames. No discovery/confirmation reselection, frame/window filtering, solver, tracker construction/update, prediction/numerical replay, inference, GT/labels/evaluator, media decode, cache parsing or pickle loading. All other native/observed/projection outputs and states hash-only checked against their original public seals.',
          'time':'At f, own accepted keys and high-match contexts are committed through f-1 only. Query before committing ANY current high/weak accepted observation. Birth registers ownership but never qualifies accepted history. Pre-active means before_update.age_since_update==0; stage age has already incremented1, so never derive active from stage age. Confirmed is the archived pre-update sticky ID>=0 role, not true identity. Prior high contexts may include a competitor subsequently accepted weak at f-1; require separate distinct accepted input receipts. Current/future observations, absence of later pairing, implicit expiry and cross-run native-ID equality cannot provide support.',
          'matrices':'Reuse archived original high matched/free partitions; published zero actions must match each frame before any use. Never rerun assignment. Recompute pure ORIGINAL pinned IoU on recorded float64 predicted boxes and original float32 input boxes; high matrix must match exactly. Weak matrix for original high-free rows must also match exactly. Only additionally derive full high-row versus current weak-input gate mask using same IoU, no new geometry/threshold. Per-frame broad weak-blocked count must match original candidate receipt; accepted/input/operation summary must equal original public receipt.',
          'availability':'Count high-stage calls and native empty no-stage frames separately. For calls publish high rows/columns, matched pairs, free rows/columns, activation columns and four-bit presence mask(row/high-column/free-row/free-column). Role counts active/retained x confirmed/tentative; independent3-bit row prerequisite mask confirmed/strictly-past-accepted/positive-prediction. Free-row qualification and available eligible columns are separate. Empty Cartesian universes are missing opportunities, not rejected proposals.',
          'birth_funnel':'Units are original high-free row/column edges, split active-confirmed/retained-confirmed/tentative. Ordered diagnostic conjunction free_pairs->confirmed->accepted_before->positive_prediction->activation->current_gate->no_weak. Row masks expose overlaps; diagnostic order is bookkeeping, not runtime short-circuit order or causal first cause. Current-gate-qualified edges lost at weak exclusion are PRE-PROPOSAL exclusions, not rejected formed proposals. Remaining admissible graph must be mutually unique in row AND column. Ambiguous edges are nonproposals. Only mutual-unique full-rule edges are qualified proposals; this rule has no post-proposal veto, so rejected-qualified-proposals stays0 and proposals must equal reconstructed actions.',
          'handoff_funnel':'Units are original selected high edge(r,c) x original high-free q triples. Diagnostic conjunction both positive confirmed strictly-past-accepted -> both pre-active -> both accepted at f-1 -> selected high context at f-1 keyed to its own latest accepted update -> q present -> past active-confirmed/gate/margin -> distinct previous inputs -> current gate/margin -> no weak opportunity. All original .05/native gates unchanged. Missing prerequisites are NONPROPOSALS, including missing context. Diagnostic first-nonproposal priority is not causal blame or an exclusive physical incident count. Pair-role16-way counts retain all overlaps. Weak exclusions after all other predicates are preproposal; broad blocked rows alone never count as rejected proposals.',
          'proposals':'For handoff, per-selected-edge zero alternatives and multiple alternatives are nonproposals; exactly one fully admissible alternative forms a qualified proposal. If two such proposals claim the same q, only this ORIGINAL one-to-one claim veto counts rejected qualified proposals. Count selected-edge, triple, admissible-edge, unique-proposal and conflict-proposal units separately. Never turn unconfirmed/no accepted/no prior context/no free slot/weak opportunity into rejected qualified proposals. Primary counters/actions reconcile ONLY to matching original candidate arm, not counterfactual reruns; other predicate calculator output remains local.',
          'integrity':'28 dense full reads; every accepted event and numerical update operation reconciles to immutable AcceptedLedger. Full original summary/input/event receipts, weak-stage call counts and broad weak-row totals exact. Original two archived trials yield equal new aggregate and deterministic local decision-receipt bytes. Original434 files, earlier772 raw files and complete newly frozen seven-source raw inventory verified before/after; original predictions/native outputs/final states unchanged, old pickle hash only. All prior public/code/rules pinned.',
          'failure':'Refuse output overwrite/retry. Keep all seven rows in original discovery/reserved phase order, including zero sources with zero denominators. Missing/mismatched geometry, original zero action, prefix, runtime, receipt or repeat fails source with null audit, local exception and retained trial status; never substitute0. Old four failures/nulls, incomplete historical discovery, all false replication/confirmation flags stay unchanged.',
          'publication':'Source/arm-level fixed aggregate counters, role/mask/funnel denominators, zeros/nulls, failures and hashes only. Per-frame rows/columns/inputs/native IDs/tokens, accepted keys, contexts, similarities, boxes and full decisions remain ignored local. No true ID/FP/FN/HOTA/benefit/safety/default claim. Inherit official KITTI CC BY-NC-SA3.0 local noncommercial research/attribution, no media or raw distribution/relicensing.'},
        'row_bits':list(ROW_BITS),'roles':list(ROLES),'birth_steps':list(BIRTH_STEPS),'handoff_steps':list(HANDOFF_STEPS)}
    write(PROTOCOL,plan);write(WORK/'seal.local.json',{'protocol_sha256':digest(PROTOCOL),'seven_source_raw_sha256':raw})
    print({'protocol_sha256':digest(PROTOCOL),'seven_source_raw_files':len(raw),'decision_extraction':False})


def verify(a):
    p=read(PROTOCOL);seal=read(WORK/'seal.local.json')
    require(digest(PROTOCOL)==seal['protocol_sha256'] and platform.python_version()==p['audit_python'],'Frozen audit seal/runtime differs')
    prior(a)
    import inspect
    from trackers.utils.iou import IoU
    require(hashlib.sha256(inspect.getsource(IoU).encode()).hexdigest()==p['geometry_class_sha256'],'Pinned pure IoU class differs')
    for group in ('implementation_sha256','source_records_sha256','rule_sha256'):
        for path,sha in p[group].items():require(digest(ROOT/path)==sha,'Original frozen source differs: '+path)
    root=local(a.source_root)
    for path,sha in seal['seven_source_raw_sha256'].items():require(digest(root/path)==sha,'Original seven-source raw archive changed')
    check_public_receipts(root)
    return p


def one(path,arm,expected,frames,p,destination):
    require(digest(path)==expected['sha256']['trace.local.jsonl.gz'],'Original archived trace hash differs')
    audit=ReachabilityAudit(arm,p['parameters']['track_activation_threshold'],p['parameters']['high_conf_det_threshold'],p['native_gate'],p['margin'])
    receipt=hashlib.sha256()
    with gzip.open(path,'rb') as source,destination.open('xb') as output:
        for line in source:
            receipt.update(line);output.write(encoded(audit.add(strict_json(line))))
    outcome=audit.summary()
    require(outcome['counters']['frames']==frames and outcome['accepted_summary']==expected['accepted_summary'],'Original full accepted/input receipt differs')
    require(outcome['weak_stage_calls']==expected['counts']['weak_stages'] and
        outcome['counters']['broad_weak_blocked_rows']==expected['counts']['weak_blocked_rows'],'Original weak-stage/broad-row receipt differs')
    return {'audit':outcome,'original_trace_uncompressed_sha256':receipt.hexdigest(),'local_decisions_sha256':digest(destination)}


def analyze(a):
    p=verify(a);run=WORK/'run';require(not run.exists() and not RESULT.exists(),'No audit overwrite/retry');run.mkdir()
    rows=[]
    for phase,document in reports().items():
        for source in document['ledger']:
            row={'name':source['name'],'phase':phase,'frames':source['frames'],'status':'failed','audit':None,'trials':{f'{arm}-{trial}':{'status':'not_run','scheduled_frames':source['frames']} for arm in ARMS for trial in (0,1)}}
            rows.append(row)
            try:
                results={}
                for arm in ARMS:
                    values=[]
                    for trial in (0,1):
                        key=f'{arm}-{trial}';expected=source['passes'][key]
                        trace=local(a.source_root)/(phase+'-run')/source['name']/key/'trace.local.jsonl.gz'
                        row['trials'][key]={'status':'failed','scheduled_frames':source['frames']}
                        value=one(trace,arm,expected,source['frames'],p,run/f'{source["name"]}-{key}.decisions.local.jsonl')
                        values.append(value);row['trials'][key]={'status':'completed','frames':source['frames'],
                            'original_trace_sha256':digest(trace),'original_trace_uncompressed_sha256':value['original_trace_uncompressed_sha256'],
                            'local_decisions_sha256':value['local_decisions_sha256']}
                    require(values[0]==values[1],'Archived repeats produce different diagnosis')
                    results[arm]=values[0]['audit']
                require(results[ARMS[0]]['accepted_summary']['input_receipt_sha256']==results[ARMS[1]]['accepted_summary']['input_receipt_sha256'],'Actual candidate source inputs differ')
                row.update(status='completed',audit=results,archived_repeats_equal=True)
            except Exception as exc:
                (run/(source['name']+'-failure.local.txt')).write_text(repr(exc)+'\n');row['reason']='reachability_contract_failed'
            print(row['name']+' '+row['status'],flush=True);write(run/'progress.local.json',rows)
    verify(a)
    result={'format':'depthport.handoff-reachability-results.v1','protocol_sha256':digest(PROTOCOL),
        'unique_source_frames':1593,'scheduled_histories':28,'scheduled_trace_frames':6372,
        'all_scheduled_completed':all(r['status']=='completed' for r in rows),
        'original434_unchanged':True,'earlier772_unchanged':True,'seven_source_raw_unchanged':True,
        'seven_source_raw_files':p['seven_source_raw_files'],'prior_records_unchanged':True,
        'original_failures_retained':read(ROOT/'docs/validation/v0.3-handoff-audit.json')['original_failures_retained'],
        'prior_formal_replication_flags':reports()['confirmation']['prior_formal_replication_flags'],
        'prior_candidate_replication_gates':reports()['confirmation']['prior_candidate_replication_gates'],
        'prior_confirmation_gates':reports()['confirmation']['confirmation_gates'],
        **{k:False for k in ('gt_read','accuracy_scoring','inference','tracking_rerun','solver_rerun','retuned','weak_stage_changed','defaults_changed','tracking_quality_accepted','independent_confirmation')},
        'ledger':rows}
    write(RESULT,result);return 0 if result['all_scheduled_completed'] else 2


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('command',choices=('freeze','analyze'))
    for n in ('archive-root','previous','source-root'):parser.add_argument('--'+n,type=Path,required=True)
    a=parser.parse_args()
    if a.command=='freeze':freeze(a)
    else:raise SystemExit(analyze(a))
