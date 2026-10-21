#!/usr/bin/env python3
# SPDX-License-Identifier: AGPL-3.0-only
"""Prospectively freeze a finite GT-free discovery/reserved-source ledger.

Same immutable candidate/replay/screen code as the prior two-source study.
No scoring, source replacement, partial windows, retries or tuning.
"""
import argparse
from concurrent.futures import ProcessPoolExecutor
from datetime import datetime, timezone
import json
import multiprocessing as mp
from pathlib import Path
import subprocess
import sys
import zipfile
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT))
from depthport.tracking_handoff_selection import GROUPS, exposure, select, confirmation
from tools import validate_tracking_handoff_controls as old
from tools.audit_tracking_accepted_events import digest, write
from tools.prepare_tracking_geometry import RemoteImages, URL, members, member_digest
from tools.diagnose_tracking_upstream import local
require=old.require
PARENT='docs/validation/v0.3-handoff-controls-protocol.json'
PREFIX='docs/validation/v0.3-handoff-exposure-'
IMPLEMENTATION=('depthport/tracking_handoff_selection.py','tools/select_tracking_handoff_exposure.py',
                'tools/prepare_tracking_handoff_exposure.py','tests/test_tracking_handoff_selection.py')
SOURCES={'discovery':[f'KITTI-{i:04d}' for i in range(12,17)],
         'confirmation':['KITTI-0017','KITTI-0018']}


def read(path):return json.loads(Path(path).read_bytes())


def metadata():
    remote=RemoteImages()
    with zipfile.ZipFile(remote) as z:
        infos=sorted(z.infolist(),key=lambda i:i.header_offset)
        ends={i.header_offset:(infos[n+1].header_offset if n+1<len(infos) else z.start_dir) for n,i in enumerate(infos)}
        specs=[]
        for phase,names in SOURCES.items():
            for name in names:
                values=members(z,name)
                specs.append(dict(name=name,phase=phase,fps=10,frames=len(values),member_manifest_sha256=member_digest(values),
                    byte_start=min(i.header_offset for i in values),byte_end=max(ends[i.header_offset] for i in values)))
        return dict(url=URL,etag=remote.etag,size=remote.size,central_start=z.start_dir,sequences=specs)


def raw_inventory(previous):
    paths={}
    for directory in ('run','prepared'):
        for p in (previous/directory).rglob('*'):
            if p.is_file():
                # Lock original raw research, not mutable logging/config/runtime environments.
                if directory=='prepared' and not (p.suffix in ('.png','.mkv') or p.name in ('detections.local.json','images.local.json','inputs.local.json','preparation.local.json')):continue
                require(not p.is_symlink(),'No symlink original evidence')
                paths[p.relative_to(previous).as_posix()]=digest(p)
    require(paths and len(paths)>667,'Complete prior raw input/output inventory required')
    return paths


def verify(a):
    p=old.verify(a.protocol,a.seal)
    prior=read(ROOT/PARENT)
    require(p['parameters']==prior['parameters'] and p['margin']==prior['margin'] and p['detector_settings']==prior['detector_settings']
        and p['rule_sha256']==prior['rule_sha256'],'Original frozen rules/settings required')
    old.original_seal(a.archive_root)
    seal=read(local(a.seal));previous=local(a.previous)
    for path,sha in seal['prior_raw_sha256'].items():require(digest(previous/path)==sha,'Prior raw evidence changed')
    return p


def freeze(a):
    require(not a.protocol.exists() and not a.seal.exists(),'No freeze overwrite')
    p=old.verify(ROOT/PARENT,local(a.previous)/'seal.local.json');old.original_seal(a.archive_root)
    # Read ZIP directory metadata only. No image member or detector output.
    image=metadata()
    import requests
    terms=requests.get('https://www.cvlibs.net/datasets/kitti/',timeout=45);terms.raise_for_status()
    require('Attribution-NonCommercial-ShareAlike 3.0' in terms.text,'Official KITTI terms required')
    a.seal.parent.mkdir(parents=True,exist_ok=True);(a.seal.parent/'terms.local.html').write_bytes(terms.content)
    prior_raw=raw_inventory(local(a.previous))
    pins=dict(p['source_records_sha256'])
    for path in (PARENT,*p['implementation_sha256'],*p['rule_sha256'],
            'docs/validation/v0.3-handoff-controls.json','docs/validation/v0.3-handoff-controls-references.json',
            'docs/validation/v0.3-handoff-controls-preparation.json'):
        pins[path]=digest(ROOT/path)
    plan={**p,'format':'depthport.handoff-exposure-protocol.v1','base_commit':subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip(),
        'frozen_at_utc':datetime.now(timezone.utc).isoformat(),'source_records_sha256':pins,
        'implementation_sha256':{n:digest(ROOT/n) for n in IMPLEMENTATION},
        'parent_protocol_sha256':digest(ROOT/PARENT),'image_archive':{k:v for k,v in image.items() if k!='sequences'},
        'new_sources':image['sequences'],'prior_raw_files':len(prior_raw),'prior_raw_inventory_sha256':__import__('hashlib').sha256(old.encoded(prior_raw)).hexdigest(),
        'seen_before_freeze':'All16 previously recorded MOT and KITTI0000-0011; finite next lexical KITTI0012-0016 discovery,0017-0018 reserved.0019-0020 not inspected beyond archive directory metadata and not scheduled. Same dataset/camera family, not independent sites/people/datasets or external preregistration.',
        'selection':{
            'groups':{g:list(v) for g,v in GROUPS.items()},
            'eligibility':'Complete original source, cap0, every native/observed/repeated output/state/trace seal equal as applicable. Any failure is retained with null exposure. Zeros never qualify. No GT/labels/evaluator or later pair non-repetition.',
            'discovery':'Run ALL five full sources regardless of exposure or harm. Per group select first lexical complete source with ACTUAL candidate actions in that role>0. Counts from candidate trajectory, not baseline counterfactual. Never select by harm gates, future events, identity/accuracy or favourable count. Roles are group labels, not new control conditions. Report full passes/denominators and all selections including null.',
            'reserved':'No reserved image reads/inference/tracking before full discovery report AND reference seals publicly committed and local release receipt verifies their hashes/commit. Then execute BOTH fixed reserved sources for BOTH unchanged candidates regardless of discovered exposure. If discovery has no candidate for a group, reserved measurements remain preassigned holdout attempts, not qualified independent confirmation. Never replace failed/zero sources or borrow discovery as confirmation.',
            'confirmation_gate':'Separately for each role-group: ALL scheduled discovery+reserved sources complete, discovery selection exists, BOTH reserved sources have>=1 actual role-specific action, and both same-arm per-scene observable harm gates pass. No pooling, no zero-exposure success. Legacy strict active-lineage proxy separately unchanged. Even true flags establish neither identity/accuracy/safety nor default promotion.',
            'history':'Original434 files plus prior raw two-source study inventory must match before/after each phase; prior public/code/rules pinned. Previous source failures/nulls and false replication retained. Newly sealed native reference is not an historical reference rewrite.',
            'failure':'No overwritten outputs, retries, substitutions, dropped frames, cap filtering, windows, altered settings or early stopping. Preparation failure slots remain in inputs and ledger. Exposure null on execution/integrity failure; partial raw diagnostics local. All inspected protocol sources listed even when never selected.',
            'privacy':'Reviewed whole-source aggregates/hashes only; no media, boxes, native IDs, costs, local paths, traces, pickle, source cache or exceptions published.'}}
    plan['prior_information']=plan['seen_before_freeze']
    plan['definitions']={**p['definitions'],'preparation':p['definitions']['preparation'].replace('full294+373 PNG','full phase-specific original PNG'), 'exposure':plan['selection']['confirmation_gate']}
    plan['terms']={**p['terms'],'terms_sha256':__import__('hashlib').sha256(terms.content).hexdigest()}
    write(a.protocol,plan);write(local(a.seal),{'protocol_sha256':digest(a.protocol),'prior_raw_sha256':prior_raw,'frozen_before_new_members':True})
    print(json.dumps({'protocol_sha256':digest(a.protocol),'sources':[(s['name'],s['phase'],s['frames']) for s in image['sequences']],
        'prior_raw_files':len(prior_raw),'new_image_members_read':False}),flush=True)


def released(a):
    p=verify(a);receipt=read(local(a.release));report=ROOT/(PREFIX+'discovery.json');refs=ROOT/(PREFIX+'discovery-references.json')
    require(receipt['discovery_sha256']==digest(report) and receipt['references_sha256']==digest(refs),'Discovery public release receipt differs')
    require(receipt['public_commit']==subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip(),'Public discovery commit required before reserved reads')
    return p


def run(a):
    p=released(a) if a.phase=='confirmation' else verify(a)
    specs=[s for s in p['new_sources'] if s['phase']==a.phase]
    work=local(a.work);require(not work.exists() and not a.output.exists() and not a.references.exists(),'No run overwrite/retry')
    work.mkdir();manifest=old.validate_new_manifest(read(local(a.inputs)),[s['name'] for s in specs]);prep=read(local(a.preparation))
    require(prep['protocol_sha256']==digest(a.protocol) and [r['name'] for r in prep['ledger']]==[s['name'] for s in specs],'Full preparation ledger required')
    rows=[]
    with ProcessPoolExecutor(max_workers=1,mp_context=mp.get_context('spawn'),max_tasks_per_child=1) as pool:
        for seq,spec,prepared in zip(manifest['sequences'],specs,prep['ledger']):
            row=dict(name=spec['name'],phase=a.phase,frames=spec['frames'],status='failed',passes={},comparisons=None)
            rows.append(row);folder=work/spec['name'];folder.mkdir()
            try:
                require(prepared['status']=='completed','Preparation failed')
                meta=old.source_metadata(seq,spec,p['detector_settings']);row['source_lock']=meta
                require(meta['capped_frames']==0,'Cap exposure fails source, no filtering')
                native=pool.submit(old.native_replay,seq,spec,p['detector_settings'],folder/'native','native').result()
                row.update(status='reference_sealed',native_reference=native)
            except Exception as exc:(folder/'native-failure.local.txt').write_text(repr(exc));row['reason']='native_or_preparation_failed'
            print(row['name']+' '+row['status'],flush=True)
        write(a.references,dict(format='depthport.handoff-exposure-references.v1',protocol_sha256=digest(a.protocol),phase=a.phase,all_native_before_candidates=True,ledger=rows))
        for seq,spec,row in zip(manifest['sequences'],specs,rows):
            if row['status']!='reference_sealed':continue
            folder=work/spec['name']
            try:
                for arm in ('observed_native','projection','birth_continuation','past_competition_handoff'):
                    for trial in (0,1):
                        key=f'{arm}-{trial}';v=pool.submit(old.replay,seq,spec,p['detector_settings'],folder/key,arm).result();row['passes'][key]=v
                        if arm=='observed_native':
                            for name in ('predictions.local.json','native-output.local.json','final-state.local.pickle'):
                                require(v['sha256'][name]==row['native_reference']['sha256'][name],'Full native reference differs')
                        print(row['name']+' '+key+' sealed',flush=True)
                    require(row['passes'][arm+'-0']==row['passes'][arm+'-1'],'Complete repeats differ')
                base=row['passes']['projection-0'];ref=old.load_ledger(folder/'projection-0',base['accepted_summary']);comparisons={}
                for arm in ('birth_continuation','past_competition_handoff'):
                    v=row['passes'][arm+'-0'];other=old.load_ledger(folder/(arm+'-0'),v['accepted_summary'])
                    screen,raw=old.screen(ref,other,base['counts'],v['counts']);comparisons[arm]=screen
                    with (folder/(arm+'-differences.local.jsonl')).open('xb') as file:
                        for event in raw:file.write(old.encoded(event))
                row.update(status='completed',comparisons=comparisons,repeat_equal=True,native_instrumentation_equal=True)
            except Exception as exc:(folder/'failure.local.txt').write_text(repr(exc));row.update(status='failed',reason='execution_or_equality_failed')
            write(work/'progress.local.json',rows);print(row['name']+' '+row['status'],flush=True)
    verify(a)
    result=dict(format='depthport.handoff-exposure-results.v1',phase=a.phase,protocol_sha256=digest(a.protocol),references_sha256=digest(a.references),
        all_scheduled_completed=all(r['status']=='completed' for r in rows),unique_source_frames=sum(s['frames'] for s in specs),
        ledger=rows,role_exposures={g:[dict(name=r['name'],count=exposure(r,g)) for r in rows] for g in GROUPS},
        selected=select(rows) if a.phase=='discovery' else None,original434_unchanged=True,prior_raw_unchanged=True,
        prior_formal_replication_flags=old.read('docs/validation/v0.3-handoff-audit.json')['original_replication_flags'],
        prior_candidate_replication_gates=old.read('docs/validation/v0.3-handoff-controls.json')['candidate_replication_gates'],
        **{k:False for k in ('gt_read','accuracy_scoring','retuned','weak_stage_changed','defaults_changed','tracking_quality_accepted')})
    if a.phase=='confirmation':
        discovery=read(ROOT/(PREFIX+'discovery.json'))
        result.update(discovery_sha256=digest(ROOT/(PREFIX+'discovery.json')),discovery_selected=discovery['selected'],
            confirmation_gates=confirmation(discovery['ledger'],rows))
    write(a.output,result);return 0 if result['all_scheduled_completed'] else 2


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__);sub=parser.add_subparsers(dest='command',required=True)
    f=sub.add_parser('freeze');r=sub.add_parser('run')
    for target in (f,r):
        for n in ('protocol','seal','archive-root','previous'):target.add_argument('--'+n,type=Path,required=True)
    r.add_argument('--phase',choices=SOURCES,required=True)
    for n in ('inputs','preparation','work','output','references'):r.add_argument('--'+n,type=Path,required=True)
    r.add_argument('--release',type=Path)
    a=parser.parse_args()
    if a.command=='freeze':freeze(a)
    else:raise SystemExit(run(a))
