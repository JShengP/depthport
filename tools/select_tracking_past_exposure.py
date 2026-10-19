#!/usr/bin/env python3
# SPDX-License-Identifier: AGPL-3.0-only
"""Frozen same-rule GT-free discovery and untouched reserved confirmation.

No accuracy evaluator, GT input, source download, tuning or public raw output.
One tracker/history per full source and arm, continuously across cache shards.
"""
from __future__ import annotations
import argparse
from collections import Counter
from concurrent.futures import ProcessPoolExecutor, as_completed
from contextlib import ExitStack
from datetime import datetime, timezone
import hashlib
import importlib.metadata
import inspect
import json
import multiprocessing
from pathlib import Path
import subprocess
import sys
ROOT = Path(__file__).resolve().parents[1]; sys.path.insert(0, str(ROOT))
from depthport.tracking_past_support_control import ARMS, PastSupportDeferral
from depthport.tracking_past_exposure import COUNTS, counts, canonical, select, confirm, manifest, source_metadata
from depthport.tracking_exposure import iter_caches
from depthport.tracking_recovery_control import PARAMETERS, MARGIN
from depthport.tracking_association_probe import AssociationProbe
from depthport.video_tracking_benchmark import make_tracker, _one_step, sha256_file

FILES = ('depthport/tracking_past_support_control.py', 'depthport/tracking_past_exposure.py',
         'tools/select_tracking_past_exposure.py', 'tests/test_tracking_past_exposure.py',
         'depthport/tracking_recovery_control.py', 'depthport/tracking_exposure.py',
         'depthport/tracking_association_probe.py', 'depthport/video_tracking_benchmark.py')


def require(ok, message):
    if not ok:
        raise ValueError(message)


def local(path):
    path = Path(path)
    require(not path.is_symlink() and path.resolve().is_relative_to(ROOT/'artifacts'), 'Local ignored artifacts required')
    return path.resolve()


def run_sequence(seq, detector, arm, trace_path=None):
    import cv2
    from itertools import chain
    chunks = iter_caches(seq, detector); first = next(chunks)
    tracker = make_tracker('bytetrack', fps=first['fps'], parameters=PARAMETERS)
    cap = cv2.VideoCapture(seq['video']); digest = hashlib.sha256(); totals = Counter(); frames = []; index = 0
    file = Path(trace_path).open('w') if trace_path else None
    try:
        require(cap.isOpened(), 'Cannot decode source')
        with ExitStack() as stack:
            if arm is not None:
                control = stack.enter_context(PastSupportDeferral(tracker, arm))
                probe = stack.enter_context(AssociationProbe(tracker, 'bytetrack'))
            for cache in chain([first], chunks):
                for item in cache['frames']:
                    index += 1; ok, frame = cap.read()
                    require(ok and frame.shape[:2] == (cache['height'], cache['width']), 'Dense source coverage differs')
                    objects, _, _, _ = _one_step('bytetrack', tracker, {}, 1, item['detections'], frame, index)
                    frames.append({'index': index, 'objects': objects})
                    if arm is not None:
                        probe.last['deferred'] = control.last; probe.last['past_support_audit'] = control.audit
                        totals.update(counts(probe.last))
                        line = json.dumps(probe.last, sort_keys=True, separators=(',', ':'), allow_nan=False)+'\n'
                        digest.update(line.encode())
                        if file:
                            file.write(line)
            require(not cap.read()[0], 'Source truncated by shards')
    finally:
        cap.release()
        if file:
            file.close()
    return {'prediction_sha256': hashlib.sha256(canonical(frames).encode()).hexdigest(),
            'trace_sha256': digest.hexdigest(), 'counts': {k: totals[k] for k in COUNTS}}, frames


def inspect_source(spec, seq, locked, detector, folder):
    """Independent process, no shared RNG, no cross-source or cross-arm history."""
    import cv2
    cv2.setNumThreads(1); folder = Path(folder); folder.mkdir(parents=True)
    record = {'name': spec['name'], 'phase': spec['phase'], 'prior_use': spec['prior_use'],
              'frames': spec['frames'], 'status': 'failed', 'arms': {}}
    try:
        actual = source_metadata(seq, spec, detector)
        require(actual == locked, 'Phase input lock differs')
        record.update({k: actual[k] for k in ('cached_detections', 'capped_frames', 'cache_shards')})
        first = {}
        for trial in range(3):
            order = ARMS[trial % 4:] + ARMS[:trial % 4]
            for arm in order:
                cv2.setRNGSeed(0)
                result, frames = run_sequence(seq, detector, arm, folder/(arm+'-trace.local.jsonl') if trial == 0 else None)
                require(result['counts']['frames'] == spec['frames'], 'Trace coverage differs')
                if trial == 0:
                    first[arm] = result; (folder/(arm+'-predictions.local.json')).write_text(json.dumps(frames)+'\n')
                else:
                    require(result == first[arm], 'Repeated predictions/full trace/counts differ')
            print(spec['name']+' repeat '+str(trial+1)+' complete', flush=True)
        reference, _ = run_sequence(seq, detector, None)
        require(reference['prediction_sha256'] == first[ARMS[0]]['prediction_sha256'], 'Unhooked reference differs')
        if spec.get('historical_reference_sha256'):
            require(reference['prediction_sha256'] == spec['historical_reference_sha256'], 'Prior frozen reference differs')
        record.update(status='completed', unhooked_reference_equal=True,
                      historical_reference_equal=bool(spec.get('historical_reference_sha256')),
                      arms={a: {**r, 'repeat_equal': True} for a, r in first.items()})
    except Exception as exc:
        (folder/'failure.local.txt').write_text(repr(exc)+'\n')
        record.update(reason='source_integrity_execution_or_repeat_contract_failed', arms={})
    return record


def freeze(intent_path, reserved_path, output, seal):
    require(not output.exists() and not seal.exists(), 'Do not overwrite frozen protocol/seal')
    intent = json.loads(local(intent_path).read_text()); reserved = json.loads(local(reserved_path).read_text())
    old_path = ROOT/'docs/validation/v0.3-exposure-selection-protocol.json'; old = json.loads(old_path.read_text())
    causal_path = ROOT/'docs/validation/v0.3-past-support-protocol.json'; causal = json.loads(causal_path.read_text())
    require(sha256_file(ROOT/'depthport/tracking_past_support_control.py') == causal['implementation_sha256']['depthport/tracking_past_support_control.py'], 'Same causal control required')
    prior = []
    for name in ('discovery', 'confirmation'):
        prior.extend(json.loads((ROOT/f'docs/validation/v0.3-exposure-{name}.json').read_text())['ledger'])
    by_name = {r['name']: r for r in prior}
    require(intent['discovery'] == [s['name'] for s in old['sequences']], 'Complete prior cohort order required')
    require(intent['confirmation'] == [s['name'] for s in reserved] == ['KITTI-0004', 'KITTI-0005'], 'Reserved cohort differs')
    require(all(s['frames'] > 0 and s['fps'] == 10 and 'video_sha256' not in s for s in reserved), 'Original source directory metadata only at freeze')
    sequences = [{**s, 'phase': 'discovery', 'prior_use': 'Previously inspected under older controls; some historical GT scores known. Discovery only.',
                  'historical_reference_sha256': by_name[s['name']]['arms']['activation_control']['prediction_sha256']} for s in old['sequences']]
    sequences += [{**s, 'phase': 'confirmation', 'source_family': 'kitti-driving', 'prior_use': 'No prior project tracking/inference/GT-member read; reserved before new output.'} for s in reserved]
    terms = []
    for dataset, page, attribution in [('MOT17', 'https://motchallenge.net/data/MOT17/', 'MOTChallenge / Milan, Leal-Taixe, Reid, Roth, Schindler; MOT16, arXiv:1603.00831'),
        ('MOT20', 'https://motchallenge.net/data/MOT20/', 'MOTChallenge / Dendorfer et al.; MOT20, arXiv:2003.09003'),
        ('KITTI', 'https://www.cvlibs.net/datasets/kitti/', 'Geiger, Lenz, Urtasun; Are we ready for Autonomous Driving? CVPR2012')]:
        terms.append({'dataset': dataset, 'page': page, 'license': 'CC BY-NC-SA 3.0', 'attribution': attribution,
                      'retrieved_page_sha256': sha256_file(ROOT/f'artifacts/tracking-past-exposure/{dataset}-terms.local.html')})
    protocol = {'format': 'depthport.past-exposure-protocol.v1', 'frozen_at_utc': datetime.now(timezone.utc).isoformat(),
        'base_commit': subprocess.check_output(['git','rev-parse','HEAD'],cwd=ROOT,text=True).strip(),
        'status': 'Local prospective freeze after synthetic/pinned contracts and fixed source directory metadata, before new inference or tracking; source-only downloads may still be ongoing. Prior diagnostic outcomes known; not external preregistration.',
        'same_causal_protocol_sha256': sha256_file(causal_path), 'same_causal_rules': causal['rules'],
        'previous_exposure_protocol_sha256': sha256_file(old_path), 'source_intent_sha256': sha256_file(intent_path),
        'sequences': sequences, 'arms': list(ARMS), 'repeats': 3, 'source_processes': 4,
        'parameters': PARAMETERS, 'margin': MARGIN, 'detector_settings': old['detector_settings'],
        'runtime': old['runtime'], 'upstream_bytetrack_class_sha256': old['upstream_bytetrack_class_sha256'],
        'implementation_sha256': {p: sha256_file(ROOT/p) for p in FILES},
        'selection': {'order': intent['selection'],
            'eligibility': 'Per treatment independently: first completed full discovery source in fixed order with >=1 actual veto and >=1 veto frame on its own continuous history; three canonical/full-trace/count repeats equal, unhooked reference equal and zero detection-cap frames. No reference opportunities or per-frame favourable selection. Inspect every scheduled source even after a choice.',
            'failures': 'Keep all zero/failed sources with safe reason codes; local full exceptions. Failed source is unknown, not zero. Select first qualifying completed source but mark search incomplete; any discovery or reserved failure blocks replication. No retries, replacements or count/threshold loosening from outcomes.',
            'separation': 'Complete and seal ordered discovery ledger/hash/selections before any reserved detector or tracker output. Build separate hashed confirmation input lock only afterwards; reserve both full sources regardless discovery selection. No reserved scene may fill a discovery slot.',
            'confirmation_gate': 'Each treatment requires a discovery selection, every scheduled discovery and reserved source completed, and >=1 actual own-arm veto in BOTH reserved full sources with equal three repeats/unhooked references/zero cap frames. Otherwise false; no-exposure discovery selection remains null. This confirms mechanism exposure only, never accuracy/physical identity/quality or release acceptance.',
            'forbidden': 'No GT/labels/evaluator/FP/FN/IDSW/Identity/HOTA or accuracy ranking. No new parameters, windows, frame sampling, source substitution or defaults. Existing known GT outcomes not input features; no newly loaded scores.',
            'independence': 'Reserved KITTI IDs unseen to this project and separate dataset/source-family from prior MOT discovery. Shared pretrained model/runtime, non-random source group and two vehicle sequences do not establish independent sites/participants or statistical power. Current KITTI0000–0003 are already seen and excluded prospectively; prior negative record retained.'},
        'execution': {'inputs': 'Phase-local strict schema accepts only full source video/cache paths and hashes; no GT/evaluator/score keys at any level. Per-source input integrity failure remains in ledger. All original source frames, unchanged cache limits, continuous tracker/observation ownership across shards.',
            'history': 'Fresh tracker/control/probe per source/arm/repeat; independent per-arm accepted observation histories, no cross-ID joins or transferred reference history. Source processes isolated; OpenCV one thread/seed0; rotated arm order. Additional unhooked references. No throughput claim.',
            'source_timing': 'MOT original compressed previews retain original source FPS. KITTI originals lossless FFV1 BGR/pixel-verified10Hz. Buffer30 unchanged: nominal1–1.2s on MOT versus3s on KITTI; no FPS normalisation or tuning.',
            'weak_continuation': 'Original weak inputs, active weak continuation, uncontested recovery, upstream activation/high/buffer/confirmation, same causal rule and app/worker defaults unchanged.'},
        'source_terms': terms, 'public_scope': 'Program/synthetic contracts, source hashes, all ordered scene counts/reasons/selections and aggregate numeric figure only. Images, labels, matrices, frame locations/IDs, raw predictions/traces and paths remain ignored local artifacts. Local noncommercial research; no media redistribution, leaderboard submission or dataset relicensing.'}
    output.parent.mkdir(parents=True, exist_ok=True); output.write_text(json.dumps(protocol,indent=2)+'\n')
    local(seal).write_text(json.dumps({'protocol_sha256': sha256_file(output), 'frozen_at_utc': protocol['frozen_at_utc']},indent=2)+'\n')
    print(json.dumps({'protocol_sha256': sha256_file(output), 'new_inference_tracking_gt_started': False}))


def scan(protocol_path, seal, inputs_path, lock_path, phase, work, output, discovery_path=None, preparation_seal_path=None):
    protocol = json.loads(protocol_path.read_text()); digest = sha256_file(protocol_path)
    require(json.loads(local(seal).read_text())['protocol_sha256'] == digest, 'Original freeze differs')
    require(protocol['arms'] == list(ARMS) and protocol['parameters'] == PARAMETERS and protocol['margin'] == MARGIN and protocol['repeats'] == 3, 'Unchanged causal factorial required')
    for name, sha in protocol['implementation_sha256'].items():
        require(sha256_file(ROOT/name) == sha, 'Frozen implementation differs')
    runtime = {n: importlib.metadata.version(n) for n in protocol['runtime']}
    from trackers import ByteTrackTracker
    require(runtime == protocol['runtime'] and hashlib.sha256(inspect.getsource(ByteTrackTracker).encode()).hexdigest() == protocol['upstream_bytetrack_class_sha256'], 'Pinned research runtime differs')
    inputs = manifest(local(inputs_path), protocol, phase); lock = json.loads(lock_path.read_text())
    require(set(lock) == {'format','protocol_sha256','phase','discovery_sha256','preparation_seal_sha256','sequences'} and lock['format'] == 'depthport.past-exposure-lock.v1' and lock['protocol_sha256'] == digest and lock['phase'] == phase, 'Strict GT-free phase input lock required')
    specs = [s for s in protocol['sequences'] if s['phase'] == phase]
    require([s['name'] for s in lock['sequences']] == [s['name'] for s in specs], 'Complete ordered phase lock required')
    require(all(set(s) == {'name','video_sha256','cache_sha256','frames','fps','resolution','cache_shards','cached_detections','capped_frames'} for s in lock['sequences']), 'GT-free source lock schema required')
    require(not work.exists() and not output.exists(), 'Do not overwrite or retry study output')
    local(work).mkdir(parents=True)
    old = None
    if phase == 'confirmation':
        require(discovery_path is not None, 'Sealed completed discovery required')
        old = json.loads(discovery_path.read_text())
        order = [s['name'] for s in protocol['sequences'] if s['phase'] == 'discovery']
        require(old['phase'] == 'discovery' and old['protocol_sha256'] == digest and old['gt_read'] is False and old['accuracy_scoring'] is False
                and old['selection'] == select(old['ledger'], order) and old['all_scheduled_completed'] == all(r['status']=='completed' for r in old['ledger']), 'Discovery phase/selection differs')
        require(lock['discovery_sha256'] == sha256_file(discovery_path), 'Confirmation not bound to discovery seal')
        require(preparation_seal_path is not None and sha256_file(local(preparation_seal_path)) == lock['preparation_seal_sha256'], 'Pre-inference discovery seal required')
        prep = json.loads(preparation_seal_path.read_text())
        require(prep['discovery_sha256'] == sha256_file(discovery_path) and prep['protocol_sha256'] == digest and prep['selection'] == old['selection'] and prep['reserved_inference_started'] is False, 'Reserved preparation seal differs')
        (work/'discovery-seal.local.json').write_text(json.dumps({'discovery_sha256': sha256_file(discovery_path), 'selection': old['selection'], 'sealed_before_confirmation_tracking_utc': datetime.now(timezone.utc).isoformat()},indent=2)+'\n')
    else:
        require(lock['discovery_sha256'] is None and lock['preparation_seal_sha256'] is None, 'Discovery cannot depend on confirmation')
    ordered = {}
    with ProcessPoolExecutor(max_workers=protocol['source_processes'], mp_context=multiprocessing.get_context('spawn')) as pool:
        tasks = {pool.submit(inspect_source, spec, seq, locked, protocol['detector_settings'], str(work/spec['name'])): spec
                 for spec, seq, locked in zip(specs, inputs['sequences'], lock['sequences'])}
        for future in as_completed(tasks):
            spec = tasks[future]
            try:
                record = future.result()
            except Exception as exc:
                (work/(spec['name']+'-failure.local.txt')).write_text(repr(exc)+'\n')
                record = {'name': spec['name'], 'phase': phase, 'prior_use': spec['prior_use'], 'frames': spec['frames'],
                          'status':'failed', 'arms':{}, 'reason':'isolated_source_process_failed'}
            ordered[spec['name']] = record
            (work/(spec['name']+'-receipt.local.json')).write_text(json.dumps(record,indent=2)+'\n')
            print(spec['name']+' '+record['status'], flush=True)
    ledger = [ordered[s['name']] for s in specs]
    result = {'format':'depthport.past-exposure.v1', 'phase':phase, 'protocol_sha256':digest,
        'input_lock_sha256':sha256_file(lock_path), 'runtime':runtime, 'repeats':3,
        'gt_read':False, 'accuracy_scoring':False, 'retuned':False,
        'all_scheduled_completed':all(r['status']=='completed' for r in ledger), 'ledger':ledger}
    if phase == 'discovery':
        result['selection'] = select(ledger, [s['name'] for s in specs])
    else:
        result.update(discovery_sha256=sha256_file(discovery_path), discovery_selection=old['selection'], confirmation=confirm(old,ledger))
    output.parent.mkdir(parents=True, exist_ok=True); output.write_text(json.dumps(result,indent=2,allow_nan=False)+'\n')
    print('Complete '+phase+' ledger; no GT/accuracy scores read.', flush=True)
    return 0 if result['all_scheduled_completed'] else 2


def main():
    p=argparse.ArgumentParser(description=__doc__); sub=p.add_subparsers(dest='command',required=True)
    f=sub.add_parser('freeze')
    for arg in ('source-intent','reserved-spec','output','seal'):
        f.add_argument('--'+arg,type=Path,required=True)
    s=sub.add_parser('scan')
    for arg in ('protocol','seal','inputs','input-lock','work-dir','output'):
        s.add_argument('--'+arg,type=Path,required=True)
    s.add_argument('--phase',choices=['discovery','confirmation'],required=True);s.add_argument('--discovery',type=Path);s.add_argument('--preparation-seal',type=Path)
    a=p.parse_args()
    if a.command=='freeze':
        freeze(a.source_intent,a.reserved_spec,a.output,a.seal); return 0
    return scan(a.protocol,a.seal,a.inputs,a.input_lock,a.phase,a.work_dir.resolve(),a.output,a.discovery,a.preparation_seal)


if __name__=='__main__':
    raise SystemExit(main())
