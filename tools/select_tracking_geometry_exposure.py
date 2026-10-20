#!/usr/bin/env python3
# SPDX-License-Identifier: AGPL-3.0-only
"""Frozen complete geometry-exposure discovery, then unseen confirmation.

Streaming diagnostics remain local; no GT, evaluator, source ranking or tuning.
"""
import argparse
from collections import Counter
from concurrent.futures import ProcessPoolExecutor, as_completed
from contextlib import ExitStack
from datetime import datetime, timezone
import gzip
import hashlib
import importlib.metadata
import json
import multiprocessing
from pathlib import Path
import pickle
import sys
ROOT = Path(__file__).resolve().parents[1]; sys.path.insert(0, str(ROOT))
from depthport.tracking_geometry_exposure import GROUPS, frame_counts, select, confirm
from depthport.tracking_geometry_validation import COUNTS
from depthport.tracking_lifecycle_probe import LifecycleProbe, require
from depthport.tracking_estimator_shadow import EstimatorShadow
from depthport.tracking_geometry_control import GeometryProjection
from depthport.tracking_exposure import iter_caches
from depthport.tracking_past_exposure import source_metadata, canonical
from depthport.tracking_recovery_control import PARAMETERS
from depthport.video_tracking_benchmark import make_tracker, _one_step, sha256_file
from tools.validate_tracking_geometry import validate_new_manifest, validate_cache_schema
from tools.diagnose_tracking_upstream import local, hashes
from tools.audit_tracking_estimator_shadow import internals

PROTOCOL = 'docs/validation/v0.3-geometry-exposure-protocol.json'
FILES = ('depthport/tracking_geometry_exposure.py', 'tools/select_tracking_geometry_exposure.py',
         'tools/prepare_tracking_geometry_exposure.py', 'tests/test_tracking_geometry_exposure.py')


def write(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, indent=2, allow_nan=False)+'\n')


def verify(protocol, seal):
    p = json.loads(protocol.read_text())
    require(json.loads(local(seal).read_text())['protocol_sha256'] == sha256_file(protocol), 'Freeze differs')
    for name, digest in p['pinned_files_sha256'].items():
        require(sha256_file(ROOT/name) == digest, 'Frozen file differs: '+name)
    require({n: importlib.metadata.version(n) for n in p['runtime']} == p['runtime']
            and hashes() == p['upstream_sha256'] and internals() == p['numerical_modules_sha256'], 'Pinned runtime differs')
    require(p['parameters'] == PARAMETERS and p['groups'] == list(GROUPS), 'Frozen rules differ')
    return p


def validate_cache(cache, detector):
    # Explicit contiguous offsets are permitted for already frozen long sources.
    copy = dict(cache); copy.pop('source_start_frame', None)
    validate_cache_schema(copy, detector)


def replay(seq, spec, detector, destination, arm):
    import cv2
    cv2.setNumThreads(1); cv2.setRNGSeed(0)
    folder = Path(destination); folder.mkdir()
    tracker = make_tracker('bytetrack', fps=spec['fps'], parameters=PARAMETERS)
    cap = cv2.VideoCapture(seq['video']); frames = []; native = []
    totals = Counter({k: 0 for k in COUNTS}); rows = Counter({k: 0 for k in GROUPS}); exposed = rows.copy()
    trace_hash = hashlib.sha256(); observed = arm != 'native'
    try:
        require(cap.isOpened() and cap.get(cv2.CAP_PROP_FPS) == spec['fps'], 'Full source timing differs')
        with ExitStack() as stack:
            # Gzip is only local storage; hash the exact uncompressed canonical trace.
            stream = stack.enter_context(gzip.open(folder/'trace.local.jsonl.gz', 'wt'))
            if observed:
                life = stack.enter_context(LifecycleProbe(tracker))
                shadow = stack.enter_context(EstimatorShadow(tracker, life))
                guard = stack.enter_context(GeometryProjection(tracker, life, shadow, arm == 'projection'))
            index = 0
            for cache in iter_caches(seq, detector):
                validate_cache(cache, detector)
                for item in cache['frames']:
                    index += 1; ok, image = cap.read()
                    require(ok and image.shape[:2] == (cache['height'], cache['width']), 'Dense full decode differs')
                    original = tracker.update
                    def capture(detections, frame=None, timestamp=None):
                        result = original(detections, frame=frame, timestamp=timestamp)
                        native.append({k: getattr(result, k).tolist() for k in ('xyxy', 'confidence', 'class_id', 'tracker_id')})
                        return result
                    owned = 'update' in vars(tracker); previous = vars(tracker).get('update'); tracker.update = capture
                    try:
                        objects, _, _, _ = _one_step('bytetrack', tracker, {}, 1, item['detections'], image, index)
                    finally:
                        if owned: tracker.update = previous
                        else: del tracker.update
                    frames.append({'index': index, 'objects': objects})
                    if observed:
                        require(life.last['frame'] == index, 'Source history reset')
                        c, r, e = frame_counts(life.last, shadow.last, guard.last)
                        totals.update(c); rows.update(r); exposed.update(e)
                        line = json.dumps({'lifecycle': life.last, 'numerical': shadow.last, 'geometry': guard.last}, sort_keys=True, separators=(',', ':'), allow_nan=False)+'\n'
                        stream.write(line); trace_hash.update(line.encode())
            require(index == spec['frames'] and not cap.read()[0], 'Full frozen coverage differs')
    finally:
        cap.release()
    (folder/'predictions.local.json').write_text(json.dumps(frames)+'\n')
    (folder/'native-output.local.json').write_text(json.dumps(native, separators=(',', ':'), allow_nan=False)+'\n')
    (folder/'final-state.local.pickle').write_bytes(pickle.dumps(tracker, protocol=4))
    result = {'sha256': {n: sha256_file(folder/n) for n in ('predictions.local.json', 'native-output.local.json', 'final-state.local.pickle')},
              'canonical_prediction_sha256': hashlib.sha256(canonical(frames).encode()).hexdigest(), 'trace_sha256': trace_hash.hexdigest()}
    if observed:
        require(totals['confirmed_observations'] == sum(len(f['objects']) for f in frames), 'Native confirmed count differs')
        result.update(counts=dict(totals), rows=dict(rows), exposed_frames=dict(exposed))
    write(folder/'receipt.local.json', result)
    return result


def scan(a):
    p = verify(a.protocol, a.seal); digest = sha256_file(a.protocol)
    specs = [s for s in p['sequences'] if s['phase'] == a.phase]
    m = validate_new_manifest(json.loads(local(a.inputs).read_text()), [s['name'] for s in specs])
    work = local(a.work); require(not work.exists() and not a.output.exists() and not a.references.exists(), 'No overwrite/retry')
    discovery = None
    if a.phase == 'confirmation':
        require(a.discovery is not None and a.preparation_seal is not None, 'Sealed full discovery required')
        discovery = json.loads(a.discovery.read_text()); prep = json.loads(local(a.preparation_seal).read_text())
        require(discovery['phase'] == 'discovery' and discovery['protocol_sha256'] == digest
            and discovery['selection'] == select(discovery['ledger'], [s['name'] for s in p['sequences'] if s['phase']=='discovery'])
            and prep['discovery_sha256'] == sha256_file(a.discovery) and prep['protocol_sha256'] == digest
            and prep['selection'] == discovery['selection'] and prep['reserved_inference_started'] is False, 'Discovery/pre-inference seal differs')
    work.mkdir(parents=True); ledger = []
    # All scheduled sources have an immutable native seal before this phase's controls.
    with ProcessPoolExecutor(max_workers=4, mp_context=multiprocessing.get_context('spawn'), max_tasks_per_child=1) as pool:
        tasks = {}
        for spec, seq in zip(specs, m['sequences']):
            r = {k: spec[k] for k in ('name', 'phase', 'frames', 'fps')}; r.update(status='failed', passes={})
            ledger.append(r); folder = work/spec['name']; folder.mkdir()
            try:
                for path in (seq['video'], *seq['caches']): local(path)
                meta = source_metadata(seq, spec, p['detector_settings'])
                if a.phase == 'discovery': require(meta == p['discovery_inputs'][spec['name']], 'Archived input lock differs')
                for path in seq['caches']: validate_cache(json.loads(Path(path).read_text()), p['detector_settings'])
                r['source_lock'] = meta
                tasks[pool.submit(replay, seq, spec, p['detector_settings'], str(folder/'native'), 'native')] = (r, spec)
            except Exception as exc:
                (folder/'failure.local.txt').write_text(repr(exc)+'\n'); r['reason'] = 'source_integrity_failed'
        for future in as_completed(tasks):
            r, spec = tasks[future]
            try:
                v = future.result(); r['passes']['native'] = v
                old = p['historical_references'].get(spec['name'])
                if old:
                    require(v['sha256']['predictions.local.json'] == old['prediction_bytes_sha256'], 'Original full prediction bytes differ')
                    if 'native_sha256' in old:
                        require(v['sha256'] == old['native_sha256'], 'Original complete native seals differ')
                r['status'] = 'reference_sealed'
            except Exception as exc:
                (work/r['name']/'failure.local.txt').write_text(repr(exc)+'\n'); r['reason'] = 'native_reference_failed'
            print(r['name']+' '+r['status'], flush=True)
        write(a.references, {'format':'depthport.geometry-exposure-native.v1', 'protocol_sha256':digest, 'phase':a.phase,
                             'sealed_before_phase_control':True, 'ledger':ledger})
        for arm, trial in (('projection',0), ('reference',0), ('reference',1), ('projection',1)):
            tasks = {pool.submit(replay, seq, spec, p['detector_settings'], str(work/spec['name']/(arm+'-'+str(trial))), arm):r
                     for spec, seq, r in zip(specs, m['sequences'], ledger) if r['status']=='reference_sealed'}
            for future in as_completed(tasks):
                r = tasks[future]; key = arm+'-'+str(trial)
                try:
                    v = future.result(); r['passes'][key] = v
                    if arm == 'reference': require(v['sha256'] == r['passes']['native']['sha256'], 'Observed/native state or full bytes differ')
                    if trial: require(v == r['passes'][arm+'-0'], 'Complete output/state/history/role repeats differ')
                except Exception as exc:
                    (work/r['name']/(key+'-failure.local.txt')).write_text(repr(exc)+'\n')
                    r.update(status='failed', reason='arm_execution_or_equality_failed')
                print(r['name']+' '+key+' '+r['status'], flush=True)
    for r in ledger:
        if r['status']=='reference_sealed':
            r.update(status='completed', native_reference_equal=True, repeat_equal=True,
                     reference=r['passes']['reference-0'], projection=r['passes']['projection-0'])
    result = {'format':'depthport.geometry-exposure.v1', 'protocol_sha256':digest, 'phase':a.phase,
              'native_references_sha256':sha256_file(a.references), 'gt_read':False, 'accuracy_scoring':False,
              'retuned':False, 'weak_stage_changed':False, 'defaults_changed':False, 'tracking_quality_accepted':False,
              'all_scheduled_completed':all(r['status']=='completed' for r in ledger), 'ledger':ledger}
    if a.phase=='discovery': result['selection'] = select(ledger, [s['name'] for s in specs])
    else:
        result.update(discovery_sha256=sha256_file(a.discovery), preparation_seal_sha256=sha256_file(local(a.preparation_seal)),
                      confirmation=confirm(discovery, ledger))
    write(a.output, result)
    return 0 if result['all_scheduled_completed'] else 2


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    for n in ('protocol','seal','inputs','work','references','output'): parser.add_argument('--'+n, type=Path, required=True)
    parser.add_argument('--phase', choices=('discovery','confirmation'), required=True)
    parser.add_argument('--discovery', type=Path); parser.add_argument('--preparation-seal', type=Path)
    raise SystemExit(scan(parser.parse_args()))
