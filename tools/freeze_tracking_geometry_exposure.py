#!/usr/bin/env python3
# SPDX-License-Identifier: AGPL-3.0-only
"""Seal one complete prospective source order and unchanged geometry method."""
import argparse
from datetime import datetime, timezone
import importlib.metadata
import json
from pathlib import Path
import subprocess
import sys
ROOT = Path(__file__).resolve().parents[1]; sys.path.insert(0, str(ROOT))
from tools.select_tracking_geometry_exposure import FILES, write, validate_cache
from tools.prepare_tracking_geometry_exposure import metadata
from tools.validate_tracking_geometry import validate_new_manifest
from tools.diagnose_tracking_upstream import local, hashes
from tools.audit_tracking_estimator_shadow import internals
from depthport.tracking_geometry_exposure import GROUPS
from depthport.tracking_lifecycle_probe import require
from depthport.tracking_past_exposure import source_metadata
from depthport.tracking_recovery_control import PARAMETERS
from depthport.video_tracking_benchmark import sha256_file


def freeze(a):
    old_path = ROOT/'docs/validation/v0.3-geometry-validity-protocol.json'; old = json.loads(old_path.read_text())
    earlier = json.loads((ROOT/'docs/validation/v0.3-past-exposure-protocol.json').read_text())
    specs = [{k:s[k] for k in ('name','frames','fps')} for s in earlier['sequences'][:16]]
    specs += [dict(name=f'KITTI-{i:04d}',frames=n,fps=10) for i,n in enumerate((154,447,233,144,314,297,270,800))]
    for s in specs: s['phase']='discovery'
    inputs = validate_new_manifest(json.loads(local(a.inputs).read_text()), [s['name'] for s in specs])
    require(not a.output.exists() and not a.seal.exists(), 'No freeze overwrite')
    pins = {str(old_path.relative_to(ROOT)):sha256_file(old_path)}
    for key in ('implementation_sha256','source_records_sha256','frozen_helpers_sha256'): pins.update(old[key])
    pins.update({n:sha256_file(ROOT/n) for n in (*FILES,'tools/freeze_tracking_geometry_exposure.py',
        'depthport/tracking_exposure.py','depthport/tracking_past_exposure.py',
        'docs/validation/v0.3-geometry-validity-references.json','docs/validation/v0.3-geometry-validity.json')})
    for n,sha in pins.items(): require(sha256_file(ROOT/n)==sha,'Original frozen code differs: '+n)
    require({n:importlib.metadata.version(n) for n in old['runtime']}==old['runtime']
        and hashes()==old['upstream_sha256'] and internals()==old['numerical_modules_sha256'],'Original runtime differs')
    locks = {}
    for seq,spec in zip(inputs['sequences'],specs):
        locks[spec['name']] = source_metadata(seq,spec,old['detector_settings'])
        for path in seq['caches']: validate_cache(json.loads(local(path).read_text()),old['detector_settings'])
    historical = json.loads(local(a.historical_references).read_text())
    require(list(historical)==[s['name'] for s in specs], 'Complete ordered historical seals required')
    for value in historical.values():
        require(set(value) in ({'prediction_bytes_sha256'},{'prediction_bytes_sha256','native_sha256'}), 'Strict historical hash schema')
    image = metadata(); terms=[]; destination=local(a.seal).parent;destination.mkdir(parents=True,exist_ok=True)
    import requests
    for dataset,page in (('MOT17','https://motchallenge.net/data/MOT17/'),('MOT20','https://motchallenge.net/data/MOT20/'),('KITTI','https://www.cvlibs.net/datasets/kitti/')):
        r=requests.get(page,timeout=45);r.raise_for_status()
        require('NonCommercial-ShareAlike 3.0' in r.text or 'by-nc-sa/3.0' in r.text,'Explicit dataset terms required')
        path=destination/(dataset+'-terms.local.html');path.write_bytes(r.content)
        prior=next((t for t in earlier['source_terms'] if t['dataset']==dataset),None)
        terms.append({'dataset':dataset,'page':page,'license':'CC BY-NC-SA 3.0','page_sha256':sha256_file(path),
            'attribution':prior['attribution'],'scope':'Local noncommercial research. No media, labels, caches or raw diagnostic redistribution or relicensing.'})
    p = {'format':'depthport.geometry-exposure-protocol.v1','frozen_at_utc':datetime.now(timezone.utc).isoformat(),
        'base_commit':subprocess.check_output(['git','rev-parse','HEAD'],cwd=ROOT,text=True).strip(),
        'status':'Local prospective freeze after synthetic/native contracts and source directory/input metadata, before new geometry exposure runs or reserved image reads/inference. Seen-source prior GT outcomes known; an old aggregate report was previewed before freeze, not used as a selection feature. No new GT loaded or scored; not external preregistration.',
        'same_geometry_protocol_sha256':sha256_file(old_path),'pinned_files_sha256':pins,
        'runtime':old['runtime'],'upstream_sha256':old['upstream_sha256'],'numerical_modules_sha256':old['numerical_modules_sha256'],
        'parameters':PARAMETERS,'detector_settings':old['detector_settings'],'groups':list(GROUPS),'repeats':2,'source_processes':4,
        'sequences':specs+image['sequences'],'discovery_inputs':locks,'historical_references':historical,
        'image_archive':{k:v for k,v in image.items() if k!='sequences'},'source_terms':terms,
        'definitions':{
            'same_rule':'Exact prior x=T*x, P=T*P*T.T guard, native updates/weak stage/solver/parameters and all four role handling unchanged; pinned original source and protocol hashes. No new epsilon, duration, confidence, frame sampling or app/worker/default change.',
            'roles':'Pre-predict actual own-arm rows: active age0 vs retained age>0, confirmed ID>=0 vs tentative ID<0. Four mutually exclusive roles. Additional overlapping active/retained/unconfirmed/any groups; totals across overlapping groups must not be summed. Count projected rows and distinct source frames per group, never reference hypothetical candidates or repeated passes as new exposure.',
            'selection':'Fixed prior16 MOT order then KITTI0000-0007 lexical,24 seen sources. First completed source/group with >=1 actual projected row AND >=1 exposed source frame, two exact arm repeats, full native reference equality, zero cap frames/numerical failures/nonpositive projected predictions or accepted posteriors. No count ranking, GT/quality score or outcome-based changes. All scheduled sources inspected even after selection. No discovery match remains null.',
            'zero_failure':'Retain complete ordered ledger including zero births, zero estimator exposure, zero projections, cap frames and failures with safe reason codes/available pass counts. Failure is unknown, never zero; any scheduled failure blocks confirmation replication. No retry, replacement, amendment, source/clip substitution, early stop or threshold relaxation.',
            'separation':'Finish and seal full discovery ledger/hash/selections before ANY reserved PNG member read, inference or tracking. Prepare both full reserved0008/0009 regardless discovery selections. Write immutable pre-inference seal tied to discovery, separate native references and confirmation ledger. Reserved sources never fill discovery slots.0000-0007 now seen; every scheduled source belongs exactly once.',
            'confirmation':'Each group requires discovery selection, all scheduled discovery and two reserved sources completed, >=1 actual projection/frame in EACH reserved source, exact repeats/native seals, zero cap/numerical/invalid treatment rows. Otherwise false. Mechanism exposure only, never per-scene harm, quality, identity or release acceptance; no pooling or compensation.',
            'independence':'KITTI0008/0009 fixed next unseen training IDs before outputs, no prior project member/inference/tracker/GT read. Unseen source separation only; same KITTI camera/dataset as some discovery, shared pretrained detector/runtime and nonrandom two-source sample. Not source-family/site/person/training independence or statistical power.',
            'native_reference':'Unhooked complete prediction JSON including IDs/format must equal existing archived bytes for ALL24 discovery sources;0004-0007 native-output/final-state seals additionally equal original geometry archive. All phase native references sealed before any phase treatment. Two observed-reference passes equal native full predictions/returns/final-state bytes, two treatment repeats equal full output/state/uncompressed diagnostic histories/role counts. Every pass fresh isolated process; all source frames continuous across cache shards. Do not load pickles.',
            'timing':'Original source FPS (MOT25/30, KITTI10); tracker parameters including buffer30 unchanged, no FPS normalization. Native budget=floor(frame_rate/30*buffer), i.e.25/30/10 frames, not fixed3s. Original fixed one-frame F, no elapsed-time mode.',
            'preparation':'Official image-only ZIP metadata/ETag frozen. Only after discovery seal, four concurrent exact8MiB If-Match ranges into local sparse image-only ZIP; no network retry. Full ordered PNG CRC/SHA and FFV1 bgr0 native10Hz pixel equality. Frozen YOLO26n8.4.176 CPU person detector, weights/settings unchanged. Full390/803 reserved frames; no clipping or labels archive.',
            'scope':'All source-level counts/selections/zero/failure reasons and whole-input/output/code/runtime seals public. Streaming raw states/covariances/coordinates/case axes/matrices, frame/IDs/events, media/weights/caches, paths and exceptions stay ignored local. No GT/evaluator/FP/FN/IDSW/HOTA inputs or scoring. Weak continuation remains native and measured accepted counts may change; no claim of equal accepted events or true harm. No default promotion.'}}
    write(a.output,p);write(local(a.seal),{'protocol_sha256':sha256_file(a.output),'frozen_at_utc':p['frozen_at_utc']})
    print(json.dumps({'protocol_sha256':sha256_file(a.output),'discovery_sources':24,'reserved_sources':2,'new_tracking_started':False,'reserved_image_reads':False}))


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    for n in ('inputs','historical-references','output','seal'):parser.add_argument('--'+n,type=Path,required=True)
    freeze(parser.parse_args())
