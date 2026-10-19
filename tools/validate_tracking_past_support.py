#!/usr/bin/env python3
# SPDX-License-Identifier: AGPL-3.0-only
"""Frozen causal support/protection factorial on a new KITTI source group.

No GT-fed tracking, tuning, automatic download, app registration or public raw
output. Freeze definitions first; lock prepared inputs before the first run.
Official KITTI label members/preprocessing are read after all predictions seal.
"""
from __future__ import annotations

import argparse
from collections import Counter
from contextlib import ExitStack
from datetime import datetime, timezone
import hashlib
import importlib.metadata
import inspect
import json
from pathlib import Path
import shutil
import subprocess
import sys
import zipfile

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from depthport.tracking_past_support_control import PastSupportDeferral, ARMS
from depthport.tracking_recovery_control import PARAMETERS, MARGIN
from depthport.tracking_exclusive_control import alternative_context, OBJECTIVE_ATOL
from depthport.tracking_association_probe import AssociationProbe
from depthport.tracking_admission import admission_error_locations, paired_error_counts
from depthport.video_tracking_benchmark import make_tracker, read_cache, sha256_file, _one_step, run_video_tracker
from depthport.tracking_eval import PRED_FORMAT
from tools.validate_mot_tracking import TRACKEVAL_COMMIT, canonical_predictions, metric_summary
from tools.diagnose_tracking_competition import describe, require, verify_hash
from tools.diagnose_tracking_temporal_support import risk_group, GROUPS

SCENES = tuple('KITTI-' + f'{i:04d}' for i in range(4))
EXPOSURE_PROTOCOL = 'docs/validation/v0.3-exposure-selection-protocol.json'
FILES = ('depthport/tracking_past_support_control.py', 'tools/validate_tracking_past_support.py',
    'tests/test_tracking_past_support_control.py', 'tests/test_tracking_past_support_validation.py',
    'depthport/tracking_recovery_control.py', 'depthport/tracking_exclusive_control.py',
    'depthport/tracking_association_probe.py', 'depthport/tracking_admission.py',
    'depthport/tracking_diagnostics.py', 'depthport/video_tracking_benchmark.py',
    'tools/validate_mot_tracking.py', 'tools/diagnose_tracking_competition.py',
    'tools/diagnose_tracking_temporal_support.py')


def local(path):
    path = path.resolve()
    require(path.is_relative_to(ROOT / 'artifacts') and not path.is_symlink(), 'Private inputs/output must stay in ignored artifacts')
    return path


def scene_screen(reference, candidate, paired, vetoes, gt_count):
    conditions = {k + '_no_increase': candidate[k] <= reference[k] for k in ('CLR_FN', 'CLR_FP', 'IDSW', 'Frag')}
    conditions.update({k + '_no_decrease': candidate[k] >= reference[k] for k in ('IDF1', 'HOTA')})
    conditions.update(no_added_fn=paired['FN']['added'] == 0, no_added_idsw=paired['IDSW']['added'] == 0)
    harm = all(conditions.values())
    improved = any(candidate[k] < reference[k] for k in ('CLR_FN', 'CLR_FP', 'IDSW')) or any(candidate[k] > reference[k] for k in ('IDF1', 'HOTA'))
    exposed = vetoes > 0 and gt_count > 0
    return {'harm_conditions': conditions, 'harm_passes': harm, 'effective_exposure': exposed,
            'strict_improvement': improved, 'passes': harm and exposed and improved,
            'identity_evaluable': gt_count > 0}


def group_screen(screens):
    harm = all(s['harm_passes'] for s in screens)
    exposed = sum(s['effective_exposure'] for s in screens)
    quality = all(s['passes'] for s in screens if s['effective_exposure']) if exposed else None
    return {'all_scene_harm_passes': harm, 'effectively_exposed_scenes': exposed,
            'all_effectively_exposed_scene_quality_passes': quality,
            'passes': harm and exposed >= 2 and quality}


def write_kitti_predictions(prediction, path):
    path.parent.mkdir(parents=True, exist_ok=True); ids = {}; lines = []
    for frame in prediction['frames']:
        for obj in frame['objects']:
            require(obj['class_id'] == 0, 'Fixed pedestrian-only input required')
            tid = ids.setdefault(obj['object_id'], len(ids))
            values = [frame['index']-1, tid, 'Pedestrian', -1, -1, -10,
                      *[f'{v:.9f}' for v in obj['bbox']], -1, -1, -1,
                      -1000, -1000, -1000, -10, f'{obj["confidence"]:.9f}']
            lines.append(' '.join(map(str, values)))
    path.write_text('\n'.join(lines)+('\n' if lines else ''))


def kitti_error_locations(data, cache):
    # Only FP-observation lookup needs MOT xywh/one-based coordinates. Official
    # data and similarity matrices stay untouched; CLEAR decisions use scores.
    import numpy as np
    copied = dict(data); boxes = []
    for array in data['tracker_dets']:
        out = np.array(array, copy=True); out[:, 2:] -= out[:, :2]; out[:, :2] += 1
        boxes.append(out)
    copied['tracker_dets'] = boxes
    return admission_error_locations(copied, cache, 1)


def audit_counts(path, reference=False, assign=None):
    counts = Counter(); reasons = Counter(); roles = Counter(); protection = Counter()
    groups = {g: Counter() for g in GROUPS}
    with path.open() as file:
        for line in file:
            frame = json.loads(line); counts['frames'] += 1
            counts['actual_vetoes'] += len(frame['deferred']); counts['frames_with_veto'] += bool(frame['deferred'])
            require(sum(e['veto'] for e in frame['past_support_audit']) == len(frame['deferred']), 'Audit decision differs')
            if len(frame['stages']) < 2:
                require(not frame['past_support_audit'] and not frame['deferred'], 'Audit requires an association stage')
                continue
            stage = frame['stages'][1]; matched = stage['matched']; used = dict(matched)
            for edge in frame['past_support_audit']:
                active = [q for q in edge['competitors'] if q['role'] == 'active']
                counts['legacy_active_edges'] += bool(active)
                for other in edge['competitors']:
                    roles[other['role']] += 1; reasons[other['past']['reason']] += 1
                    protection[other['protection']['reason']] += 1
                    if other['role'] != 'active':
                        continue
                    counts['active_alternatives'] += 1
                    past = other['past']['qualified']; safe = other['protection']['protected']
                    counts['past_qualified_alternatives'] += past
                    counts['protected_alternatives'] += safe; counts['joint_alternatives'] += past and safe
                    if reference:
                        cost = alternative_context(stage['similarity'], stage['gate'], other['row'], edge['column'], matched, assign)
                        competitor = {'row': other['row'], 'assigned_elsewhere': other['row'] in used, **cost,
                            'equivalent': cost['similarity_sum_loss'] <= OBJECTIVE_ATOL and cost['admissible_pair_change'] >= 0}
                        shape = describe(stage, edge, competitor, assign)
                        group = groups[risk_group(shape)]
                        group['alternatives'] += 1; group['past_qualified'] += past; group['protected'] += safe; group['joint'] += past and safe
    return {'counts': {k: counts[k] for k in ('frames', 'actual_vetoes', 'frames_with_veto', 'legacy_active_edges',
        'active_alternatives', 'past_qualified_alternatives', 'protected_alternatives', 'joint_alternatives')},
        'roles': dict(sorted(roles.items())), 'past_reasons': dict(sorted(reasons.items())),
        'protection_reasons': dict(sorted(protection.items())),
        'reference_risk_groups': {g: {k: c[k] for k in ('alternatives', 'past_qualified', 'protected', 'joint')}
                                  for g, c in groups.items()} if reference else None}


def run_arm(video, cache, arm, trace_path=None):
    import cv2
    require(sha256_file(video) == cache['video_sha256'], 'Video/cache mismatch')
    tracker = make_tracker('bytetrack', fps=cache['fps'], parameters=PARAMETERS)
    cap = cv2.VideoCapture(str(video)); frames = []; digest = hashlib.sha256()
    out = trace_path.open('w') if trace_path else None
    try:
        require(cap.isOpened(), 'Cannot decode source')
        with ExitStack() as stack:
            control = stack.enter_context(PastSupportDeferral(tracker, arm))
            probe = stack.enter_context(AssociationProbe(tracker, 'bytetrack'))
            for item in cache['frames']:
                ok, frame = cap.read()
                require(ok and frame.shape[:2] == (cache['height'], cache['width']), 'Dense source coverage differs')
                objects, _, _, _ = _one_step('bytetrack', tracker, {}, 1, item['detections'], frame, item['index'])
                frames.append({'index': item['index'], 'objects': objects})
                probe.last['deferred'] = control.last; probe.last['past_support_audit'] = control.audit
                line = json.dumps(probe.last, sort_keys=True, separators=(',', ':'), allow_nan=False)+'\n'
                digest.update(line.encode())
                if out:
                    out.write(line)
            require(not cap.read()[0], 'Cache truncated source')
    finally:
        cap.release()
        if out:
            out.close()
    return {'format': PRED_FORMAT, 'session_id': 'video-'+cache['video_sha256'][:24], 'sampling': 'dense_video',
            'tracker': 'bytetrack', 'source': 'offline_video_fixed_detection_cache', 'frames': frames}, digest.hexdigest()


def freeze(prepared, output, seal, source_intent):
    require(not output.exists() and not seal.exists(), 'Do not overwrite frozen protocol/seal')
    inputs = json.loads(local(prepared).read_text()); intent = json.loads(local(source_intent).read_text())
    require([s['name'] for s in inputs] == list(SCENES) == intent['sources'], 'Complete predetermined source group required')
    require(all(s['pixel_identical_frames'] == s['frames'] and s['fps'] == 10 for s in inputs), 'Verify every lossless frame before freezing')
    old = json.loads((ROOT / EXPOSURE_PROTOCOL).read_text())
    terms = ROOT / 'artifacts/tracking-past-support/terms-page.local.html'
    definitions = {
        'format': 'depthport.past-support-protocol.v1', 'frozen_at_utc': datetime.now(timezone.utc).isoformat(),
        'base_commit': subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT, text=True).strip(),
        'status': 'Locally frozen after synthetic/pinned contracts and source preparation, before new detector, tracker or GT-content evaluation. Prior MOT outcomes known. Not external preregistration.',
        'source_intent_sha256': sha256_file(source_intent),
        'selection': intent['selection'], 'sequences': inputs, 'arms': list(ARMS), 'repeats': 3,
        'source_preparation': 'Official original PNG members with ZIP CRC checks, contiguous zero-based filenames, per-image SHA256 manifest; FFV1 bgr0 at original 10Hz, all decoded frames pixel-identical to PNGs. No resize, crop, resampling or lossy encoding.',
        'parameters': PARAMETERS, 'signed_margin': MARGIN, 'detector': old['detector_settings'], 'runtime': old['runtime'],
        'upstream_bytetrack_class_sha256': old['upstream_bytetrack_class_sha256'],
        'implementation_sha256': {p: sha256_file(ROOT / p) for p in FILES},
        'evaluator_commit': TRACKEVAL_COMMIT,
        'rules': {
            'base': 'Confirmed selected weak row age>=2; same-column competitor score >= original weak gate and selected-minus-competitor <= unchanged .05. Active=confirmed and pre-update age1; retained/unconfirmed rows logged but cannot qualify.',
            'past_support': 'Both hypotheses have nonempty recorded accepted-observation histories before this decision. On selected hypothesis last accepted observation strictly before decision, competitor must be in same stage, active confirmed, AND have its own distinct accepted observation; competitor score >= that stage original gate and signed gap <=.05. Check immutable keys. Missing comparison/observation is unknown, never filled or treated as proof of either identity. Birth keys unavailable; do not invent them. No native-ID joins, GT, future +1..+30 or fitted duration.',
            'protection': 'Competitor currently has no other accepted weak update. Force it onto selected column and solve remaining unfiltered one-to-one assignment with original gate afterwards: every OTHER original accepted row/detection pair must remain and accepted count must not decrease. Selected missed-row update deliberately excluded; its deferral is tested as a harm. No opportunity-cost cutoff/equality requirement; solver-returned alternative only.',
            'action': 'Four factorial arms: no veto, past support alone, protection alone, conjunction on SAME competitor. Any qualifying competitor vetoes the selected edge once. Decisions simultaneous from unmodified original matching. Only remove selected edge, return its row/column unmatched; never install alternative or rematch. Weak input unchanged and deferred detection remains upstream output ID -1.',
            'history': 'Each arm owns its causal accepted-edge history; after decisions record only actually accepted high/weak observations (frame, original detection index). Strong object references prevent ownership reuse. No reference-history transfer after divergence.',
            'unchanged': 'Weak detections/continuation, births, lifecycle, activation .3/high .6/buffer30/confirmation2, YOLO26n 8.4.176 CPU confidence .1/imgsz640/person0/max_det64/NMS.7/weight hash, source FPS10, app/worker/defaults. Buffer30 is 3 s at source10Hz, not previous 30Hz timing.'},
        'harm_gate': {
            'per_scene': 'FN, FP, IDSW, Frag must not increase; IDF1/HOTA must not decrease (exact deterministic comparison). Added paired GT-frame FN and IDSW must BOTH be zero; improvements elsewhere cannot offset them. Zero-GT scenes retain false-positive/harm checks but cannot establish identity benefit.',
            'quality': 'Actual veto and nonzero evaluated pedestrian GT required for effective exposure; strict improvement in at least one FN/FP/IDSW/IDF1/HOTA measure with all harm conditions passing.',
            'group': 'All four scene harm gates pass; at least two distinct scenes have effective exposure; every effectively exposed scene passes strict quality gate. Report every arm/scene, all negatives and failures; aggregate cannot override a scene harm. No default promotion or release acceptance.',
            'paired_keys': 'GT-frame FN/IDSW on official preprocessed stable GT ordering; FP keyed by immutable cached detection with coordinate/confidence reconciliation. Paired counts must reconcile to official CLEAR.',
            'limitations': 'These gates do not prove physical identity or universal long-event recovery. New dataset group, same pretrained detector/runtime, four ordered non-random driving sequences; no independent sites/participants/statistical power claim.'},
        'evaluation': 'All predictions/three repeats/unhooked reference seal before any GT member decompression/parsing. Before tracking only hash untouched labels ZIP and read directory CRC/size metadata. Official clean pinned TrackEval Kitti2DBox pedestrian preprocessing, CLEAR/Identity/HOTA. Native zero-based KITTI xyxy, no MOT GT conversion. Ignore regions/sitting people/truncation/occlusion/height follow official adapter. No leaderboard submission.',
        'input_lock': 'After freeze, bind full immutable caches, lossless video/pixel manifests, untouched official labels archive/member hashes before first tracking. Same cache across arms; no GT or output selection.',
        'terms': {'dataset_page': 'https://www.cvlibs.net/datasets/kitti/eval_tracking.php',
            'license_page': 'https://www.cvlibs.net/datasets/kitti/',
            'source_fps_page': 'https://www.cvlibs.net/datasets/kitti/setup.php', 'license': 'CC BY-NC-SA 3.0',
            'terms_page_sha256': sha256_file(terms), 'attribution': 'Andreas Geiger, Philip Lenz, Raquel Urtasun. Are we ready for Autonomous Driving? The KITTI Vision Benchmark Suite. CVPR 2012.',
            'images_url': 'https://s3.eu-central-1.amazonaws.com/avg-kitti/data_tracking_image_2.zip',
            'labels_url': 'https://s3.eu-central-1.amazonaws.com/avg-kitti/data_tracking_label_2.zip',
            'scope': 'Local noncommercial research only; original images, labels, caches and raw results not redistributed; program AGPL does not relicense dataset.'},
        'public_scope': 'Only source hashes/counts, fixed parameters/rules, aggregate metrics/reasons/risk groups, synthetic tests and numeric figures. Raw matrices, histories, GT, images/IDs, paths and diagnostics local.'}
    output.parent.mkdir(parents=True, exist_ok=True); output.write_text(json.dumps(definitions, indent=2, allow_nan=False)+'\n')
    local(seal).write_text(json.dumps({'protocol_sha256': sha256_file(output), 'frozen_at_utc': definitions['frozen_at_utc']}, indent=2)+'\n')
    print(json.dumps({'protocol_sha256': sha256_file(output), 'new_inference_or_tracking_started': False}))


def validate(protocol_path, seal, manifest_path, input_lock_path, evaluator, work, output):
    protocol = json.loads(protocol_path.read_text()); manifest = json.loads(local(manifest_path).read_text())
    lock = json.loads(input_lock_path.read_text()); digest = sha256_file(protocol_path)
    require(json.loads(local(seal).read_text())['protocol_sha256'] == digest == lock['protocol_sha256'], 'Frozen seal/input lock differs')
    require(protocol['arms'] == list(ARMS) and protocol['parameters'] == PARAMETERS and protocol['signed_margin'] == MARGIN, 'Rule differs')
    for name, sha in protocol['implementation_sha256'].items():
        verify_hash(ROOT / name, sha)
    runtime = {n: importlib.metadata.version(n) for n in protocol['runtime']}
    require(runtime == protocol['runtime'], 'Pinned research runtime differs')
    require(subprocess.check_output(['git', '-C', str(evaluator), 'rev-parse', 'HEAD'], text=True).strip() == TRACKEVAL_COMMIT
            and subprocess.run(['git', '-C', str(evaluator), 'diff', '--quiet', 'HEAD']).returncode == 0, 'Clean pinned evaluator required')
    from trackers import ByteTrackTracker
    require(hashlib.sha256(inspect.getsource(ByteTrackTracker).encode()).hexdigest() == protocol['upstream_bytetrack_class_sha256'], 'Upstream differs')
    require([s['name'] for s in manifest['sequences']] == list(SCENES) == [s['name'] for s in lock['sequences']], 'Complete source order required')
    local(work).mkdir(parents=True, exist_ok=True)
    require(not list(work.glob('KITTI-*')), 'Refuse to overwrite a study run')
    archive = local(Path(manifest['labels_archive'])); verify_hash(archive, lock['labels_archive_sha256'])
    import cv2
    import numpy as np
    cv2.setNumThreads(1)
    first = {}; caches = {}; hashes = {}; trace_hashes = {}
    for source, locked, frozen in zip(manifest['sequences'], lock['sequences'], protocol['sequences']):
        name = source['name']; folder = work / name; folder.mkdir(); cache_path = local(Path(source['detections']))
        video = local(Path(source['video'])); verify_hash(cache_path, locked['cache_sha256']); verify_hash(video, frozen['video_sha256'])
        cache = read_cache(cache_path); caches[name] = cache
        require(len(cache['frames']) == frozen['frames'] and cache['fps'] == 10 and cache['video_sha256'] == frozen['video_sha256'], 'Complete source metadata differs')
        require({k: cache['detector'][k] for k in protocol['detector']} == protocol['detector'], 'Detector configuration differs')
        require(cache['detector']['frames_at_detection_cap'] == 0, 'Detection-cap exposure must be resolved before acceptance')
        first[name] = {}; hashes[name] = {}; trace_hashes[name] = {}
        for trial in range(3):
            order = ARMS[trial % 4:] + ARMS[:trial % 4]
            for arm in order:
                cv2.setRNGSeed(0)
                pred, trace = run_arm(video, cache, arm, folder/(arm+'-trace.local.jsonl') if trial == 0 else None)
                h = hashlib.sha256(canonical_predictions(pred).encode()).hexdigest()
                if arm in hashes[name]:
                    require(hashes[name][arm] == h and trace_hashes[name][arm] == trace, 'Repeated predictions/trace differ')
                hashes[name][arm] = h; trace_hashes[name][arm] = trace
                if trial == 0:
                    first[name][arm] = pred; (folder/(arm+'-predictions.local.json')).write_text(json.dumps(pred)+'\n')
                print(name+' '+arm+' repeat '+str(trial+1)+' sealed', flush=True)
        pred, _ = run_video_tracker(video, cache, 'bytetrack', parameters=PARAMETERS)
        require(hashlib.sha256(canonical_predictions(pred).encode()).hexdigest() == hashes[name][ARMS[0]], 'Observed reference differs from unhooked upstream')
    (work/'predictions-seal.local.json').write_text(json.dumps({'canonical': hashes, 'traces': trace_hashes}, indent=2)+'\n')
    score_predictions(protocol, digest, manifest, lock, input_lock_path, evaluator, work, output, first, caches, hashes, trace_hashes)


def score_predictions(protocol, digest, manifest, lock, input_lock_path, evaluator, work, output, first, caches, hashes, trace_hashes):
    import numpy as np
    runtime = {n: importlib.metadata.version(n) for n in protocol['runtime']}
    archive = local(Path(manifest['labels_archive']))
    # Every source/arm has finished tracking before any label member is opened.

    for name, value in [('int', int), ('float', float), ('bool', bool)]:
        if name not in np.__dict__:
            setattr(np, name, value)
    sys.path.insert(0, str(evaluator)); import trackeval
    gt_folder = work/'evaluation-gt'; (gt_folder/'label_02').mkdir(parents=True, exist_ok=True)
    gt_hashes = {}
    with zipfile.ZipFile(archive) as z:
        for source, locked in zip(manifest['sequences'], lock['sequences']):
            number = source['name'][-4:]; member = 'training/label_02/'+number+'.txt'; entry = z.getinfo(member)
            require(entry.CRC == locked['gt_member_crc32'] and entry.file_size == locked['gt_member_bytes'], 'Official label directory differs')
            raw = z.read(member); gt_hashes[source['name']] = hashlib.sha256(raw).hexdigest()
            (gt_folder/'label_02'/(number+'.txt')).write_bytes(raw)
    (gt_folder/'evaluate_tracking.seqmap.training').write_text(''.join(f'{s["name"][-4:]} empty 0 {s["frames"]}\n' for s in protocol['sequences']))
    for name in SCENES:
        for arm in ARMS:
            write_kitti_predictions(first[name][arm], work/'evaluation-trackers'/arm/'data'/(name[-4:]+'.txt'))
    dataset = trackeval.datasets.Kitti2DBox({'GT_FOLDER': str(gt_folder), 'TRACKERS_FOLDER': str(work/'evaluation-trackers'),
        'TRACKERS_TO_EVAL': list(ARMS), 'CLASSES_TO_EVAL': ['pedestrian'], 'PRINT_CONFIG': False})
    metrics = [m({'PRINT_CONFIG': False}) for m in (trackeval.metrics.CLEAR, trackeval.metrics.Identity, trackeval.metrics.HOTA)]
    result = {'format': 'depthport.past-support-acceptance.v1', 'protocol_sha256': digest,
              'input_lock_sha256': sha256_file(input_lock_path), 'runtime': runtime,
              'evaluator_commit': TRACKEVAL_COMMIT, 'repeats': 3, 'sequences': [], 'group_screens': {}}
    for name in SCENES:
        methods = {}; errors = {}; gt_count = None; gt_signature = None
        for arm in ARMS:
            data = dataset.get_preprocessed_seq_data(dataset.get_raw_seq_data(arm, name[-4:]), 'pedestrian')
            signature = hashlib.sha256(json.dumps([[g.tolist(), b.tolist()] for g, b in zip(data['gt_ids'], data['gt_dets'])], separators=(',', ':')).encode()).hexdigest()
            if gt_count is None:
                gt_count = data['num_gt_dets']; gt_signature = signature
            require(data['num_gt_dets'] == gt_count and signature == gt_signature, 'GT ordering/cohort differs across arms')
            scores = metric_summary({m.get_name(): m.eval_sequence(data) for m in metrics})
            locations, counts = kitti_error_locations(data, caches[name])
            require(all(counts[k] == scores[k] for k in counts), 'Diagnostic/official CLEAR differs')
            errors[arm] = locations
            (work/name/(arm+'-error-locations.local.json')).write_text(json.dumps({k: sorted(v) for k, v in locations.items()})+'\n')
            audit = audit_counts(work/name/(arm+'-trace.local.jsonl'), arm == ARMS[0])
            methods[arm] = {'metrics': scores, 'exposure': audit, 'canonical_predictions_sha256': hashes[name][arm],
                'trace_sha256': trace_hashes[name][arm], 'repeated_predictions_and_full_trace_equal': True}
        paired = {a: paired_error_counts(errors[ARMS[0]], errors[a]) for a in ARMS[1:]}
        screens = {a: scene_screen(methods[ARMS[0]]['metrics'], methods[a]['metrics'], paired[a],
                   methods[a]['exposure']['counts']['actual_vetoes'], gt_count) for a in ARMS[1:]}
        result['sequences'].append({'name': name, 'frames': len(caches[name]['frames']), 'gt_pedestrian_observations': gt_count,
            'gt_member_sha256': gt_hashes[name],
            'cached_detections': sum(len(f['detections']) for f in caches[name]['frames']), 'methods': methods,
            'paired_errors': paired, 'screens': screens, 'unhooked_reference_equal': True, 'official_gt_layout_equal_across_arms': True})
    for arm in ARMS[1:]:
        screens = [s['screens'][arm] for s in result['sequences']]
        result['group_screens'][arm] = group_screen(screens)
    result.update(tracking_gt_read=False, retuned=False, all_predictions_sealed_before_gt=True,
                  public_raw_data=False, acceptance_scope='Frozen research harm/exposure screen only, not release or general physical-identity acceptance.')
    output.write_text(json.dumps(result, indent=2, allow_nan=False)+'\n')
    print('Complete aggregate results written; raw data stays local.', flush=True)


def resume_report(protocol_path, seal, manifest_path, input_lock_path, amendment_path, evaluator, work, output):
    protocol = json.loads(protocol_path.read_text()); digest = sha256_file(protocol_path)
    amendment = json.loads(amendment_path.read_text()); lock = json.loads(input_lock_path.read_text())
    manifest = json.loads(local(manifest_path).read_text())
    require(digest == amendment['protocol_sha256'] == lock['protocol_sha256'] == json.loads(local(seal).read_text())['protocol_sha256'], 'Original freeze differs')
    require(amendment['tracking_rules_changed'] is False and amendment['tracking_rerun'] is False, 'Report-only amendment required')
    for name, original in protocol['implementation_sha256'].items():
        expected = original
        if name == 'tools/validate_tracking_past_support.py':
            require(amendment['original_runner_sha256'] == original, 'Original implementation differs')
            expected = amendment['report_runner_sha256']
        verify_hash(ROOT/name, expected)
    runtime = {n: importlib.metadata.version(n) for n in protocol['runtime']}
    require(runtime == protocol['runtime'], 'Pinned research runtime differs')
    require(subprocess.check_output(['git', '-C', str(evaluator), 'rev-parse', 'HEAD'], text=True).strip() == TRACKEVAL_COMMIT
            and subprocess.run(['git', '-C', str(evaluator), 'diff', '--quiet', 'HEAD']).returncode == 0, 'Clean pinned evaluator required')
    require([s['name'] for s in manifest['sequences']] == list(SCENES) == [s['name'] for s in lock['sequences']], 'Complete source order required')
    verify_hash(local(work/'predictions-seal.local.json'), amendment['original_prediction_seal_sha256'])
    sealed = json.loads((work/'predictions-seal.local.json').read_text()); first = {}; caches = {}
    verify_hash(local(Path(manifest['labels_archive'])), lock['labels_archive_sha256'])
    for source, locked, frozen in zip(manifest['sequences'], lock['sequences'], protocol['sequences']):
        name = source['name']; video = local(Path(source['video'])); cache_path = local(Path(source['detections']))
        verify_hash(video, frozen['video_sha256']); verify_hash(cache_path, locked['cache_sha256'])
        cache = read_cache(cache_path); caches[name] = cache
        require(len(cache['frames']) == frozen['frames'] and cache['fps'] == 10 and cache['video_sha256'] == frozen['video_sha256'], 'Source coverage differs')
        require({k: cache['detector'][k] for k in protocol['detector']} == protocol['detector'] and cache['detector']['frames_at_detection_cap'] == 0, 'Detector differs')
        first[name] = {}
        for arm in ARMS:
            pred = json.loads(local(work/name/(arm+'-predictions.local.json')).read_text())
            require(hashlib.sha256(canonical_predictions(pred).encode()).hexdigest() == sealed['canonical'][name][arm], 'Sealed prediction differs')
            verify_hash(local(work/name/(arm+'-trace.local.jsonl')), sealed['traces'][name][arm])
            require(len(pred['frames']) == frozen['frames'], 'Prediction coverage differs')
            first[name][arm] = pred
    score_predictions(protocol, digest, manifest, lock, input_lock_path, evaluator, work, output,
                      first, caches, sealed['canonical'], sealed['traces'])
    result = json.loads(output.read_text()); result['report_only_amendment_sha256'] = sha256_file(amendment_path)
    result['tracking_rerun_after_gt'] = False
    output.write_text(json.dumps(result, indent=2, allow_nan=False)+'\n')


def main():
    p = argparse.ArgumentParser(description=__doc__); sub = p.add_subparsers(dest='command', required=True)
    f = sub.add_parser('freeze')
    for arg in ('prepared', 'output', 'seal', 'source-intent'):
        f.add_argument('--'+arg, type=Path, required=True)
    v = sub.add_parser('validate')
    for arg in ('protocol', 'seal', 'manifest', 'input-lock', 'trackeval-root', 'work-dir', 'output'):
        v.add_argument('--'+arg, type=Path, required=True)
    r = sub.add_parser('resume-report', help='Use sealed predictions; no tracker calls')
    for arg in ('protocol', 'seal', 'manifest', 'input-lock', 'amendment', 'trackeval-root', 'work-dir', 'output'):
        r.add_argument('--'+arg, type=Path, required=True)
    a = p.parse_args()
    if a.command == 'freeze':
        freeze(a.prepared, a.output, a.seal, a.source_intent)
    elif a.command == 'resume-report':
        resume_report(a.protocol, a.seal, a.manifest, a.input_lock, a.amendment, a.trackeval_root.resolve(), a.work_dir.resolve(), a.output)
    else:
        validate(a.protocol, a.seal, a.manifest, a.input_lock, a.trackeval_root.resolve(), a.work_dir.resolve(), a.output)


if __name__ == '__main__':
    main()
