# SPDX-License-Identifier: AGPL-3.0-only
"""GT-free exposure ledger for the unchanged causal-support factorial.

Only actual vetoes in each arm's own continuous history select a source.
No labels/evaluator/accuracy inputs; raw identities and positions stay local.
"""
from collections import Counter
import json
from pathlib import Path
from depthport.tracking_past_support_control import ARMS
from depthport.video_tracking_benchmark import sha256_file
from depthport.tracking_exposure import iter_caches, validate_cohort

COUNTS = ('frames', 'candidate_edges', 'actual_vetoes', 'frames_with_veto',
          'active_alternatives', 'retained_alternatives', 'unconfirmed_alternatives',
          'past_qualified', 'protected', 'joint')


def counts(trace):
    out = Counter(frames=1, candidate_edges=len(trace['past_support_audit']),
                  actual_vetoes=len(trace['deferred']), frames_with_veto=int(bool(trace['deferred'])))
    if sum(bool(e['veto']) for e in trace['past_support_audit']) != len(trace['deferred']):
        raise ValueError('Decision/audit mismatch')
    for edge in trace['past_support_audit']:
        for q in edge['competitors']:
            if q['role'] not in ('active', 'retained', 'unconfirmed'):
                raise ValueError('Unknown hypothesis role')
            out[q['role']+'_alternatives'] += 1
            out['past_qualified'] += bool(q['past']['qualified'])
            out['protected'] += bool(q['protection']['protected'])
            out['joint'] += bool(q['past']['qualified'] and q['protection']['protected'])
    return {k: int(out[k]) for k in COUNTS}


def canonical(frames):
    ids = {}; rows = []
    for f in frames:
        objects = [[ids.setdefault(o['object_id'], len(ids)+1), o['class_id'], o['confidence'], *o['bbox']]
                   for o in f['objects']]
        rows.append([f['index'], objects])
    return json.dumps(rows, separators=(',', ':'), allow_nan=False)


def select(records, order):
    by_name = {r['name']: r for r in records}
    if len(by_name) != len(records) or set(by_name) != set(order):
        raise ValueError('Complete unique discovery ledger required')
    result = {arm: None for arm in ARMS[1:]}
    for name in order:
        r = by_name[name]
        if r['phase'] != 'discovery':
            raise ValueError('Confirmation cannot select discovery')
        if r['status'] != 'completed':
            continue
        if set(r['arms']) != set(ARMS):
            raise ValueError('Complete factorial required')
        for arm in result:
            value = r['arms'][arm]
            if set(value['counts']) != set(COUNTS):
                raise ValueError('Only frozen exposure counts allowed')
            if (value['repeat_equal'] and r['unhooked_reference_equal'] and r['capped_frames'] == 0
                    and value['counts']['frames'] == r['frames'] and value['counts']['actual_vetoes'] > 0
                    and value['counts']['frames_with_veto'] > 0 and result[arm] is None):
                result[arm] = name
    return result


def confirm(discovery, ledger):
    complete = discovery['all_scheduled_completed'] and all(r['status'] == 'completed' for r in ledger)
    return {arm: {'discovery_found': discovery['selection'][arm] is not None,
        'exposed_reserved_sources': [r['name'] for r in ledger if r['status'] == 'completed'
                                    and r['arms'][arm]['counts']['actual_vetoes'] > 0],
        'exposure_replicated_in_both_reserved': bool(complete and len(ledger) == 2
            and discovery['selection'][arm] is not None
            and all(r['arms'][arm]['counts']['actual_vetoes'] > 0 and r['arms'][arm]['repeat_equal']
                    and r['unhooked_reference_equal'] and r['capped_frames'] == 0 for r in ledger))}
        for arm in ARMS[1:]}


def manifest(path, protocol, phase):
    """Strict phase-local schema: never accept GT/score keys, even nested."""
    path = Path(path)
    if path.is_symlink() or path.stat().st_size > 1024*1024:
        raise ValueError('Regular bounded manifest required')
    m = json.loads(path.read_text())
    if set(m) != {'format', 'sequences'} or m['format'] != 'depthport.past-exposure-inputs.v1':
        raise ValueError('GT-free input schema required')
    validate_cohort(protocol['sequences'])
    wanted = [s['name'] for s in protocol['sequences'] if s['phase'] == phase]
    if [s.get('name') for s in m['sequences']] != wanted:
        raise ValueError('Complete frozen phase order required')
    for s in m['sequences']:
        if set(s) != {'name', 'video', 'caches', 'video_sha256', 'cache_sha256'}:
            raise ValueError('GT-free source schema required')
        if not s['caches'] or len(s['caches']) != len(s['cache_sha256']) or len(set(s['caches'])) != len(s['caches']):
            raise ValueError('Unique hashed shards required')
    return m


def source_metadata(seq, spec, detector):
    video = Path(seq['video'])
    if video.is_symlink() or sha256_file(video) != seq['video_sha256']:
        raise ValueError('Immutable local source required')
    total = detections = capped = 0; resolution = None
    for cache in iter_caches(seq, detector):
        if cache['fps'] != spec['fps']:
            raise ValueError('Frozen FPS differs')
        total += len(cache['frames']); detections += sum(len(f['detections']) for f in cache['frames'])
        capped += cache['detector']['frames_at_detection_cap']
        resolution = [cache['width'], cache['height']]
    if total != spec['frames']:
        raise ValueError('Complete source coverage required')
    return {'name': seq['name'], 'video_sha256': seq['video_sha256'], 'cache_sha256': seq['cache_sha256'],
            'frames': total, 'fps': spec['fps'], 'resolution': resolution,
            'cache_shards': len(seq['caches']), 'cached_detections': detections, 'capped_frames': capped}
