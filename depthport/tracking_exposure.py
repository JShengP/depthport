# SPDX-License-Identifier: AGPL-3.0-only
"""GT-free exposure selection and strict local input contracts.

No evaluator, labels, accuracy scores or native-ID comparison across arms.
Public summaries contain only predefined counts and hashes.
"""
from __future__ import annotations
from collections import Counter
from pathlib import Path
import json

from depthport.video_tracking_benchmark import read_cache, sha256_file
from depthport.tracking_exclusive_control import ARMS

SCAN_ARMS = (ARMS[0], ARMS[2], ARMS[3])
COUNT_KEYS = ('legacy_eligible_edges','available_edges','equivalent_edges',
              'actual_vetoes','frames_with_veto','competitor_alternatives',
              'occupied_alternatives','available_alternatives','equivalent_alternatives')


def exposure_counts(trace):
    c=Counter()
    c['frames_with_veto']=int(bool(trace['deferred']))
    c['actual_vetoes']=len(trace['deferred'])
    for edge in trace['competition_audit']:
        c['legacy_eligible_edges']+=1
        c['available_edges']+=any(not x['assigned_elsewhere'] for x in edge['competitors'])
        c['equivalent_edges']+=any(x['equivalent'] for x in edge['competitors'])
        for x in edge['competitors']:
            c['competitor_alternatives']+=1
            c['occupied_alternatives']+=x['assigned_elsewhere']
            c['available_alternatives']+=not x['assigned_elsewhere']
            c['equivalent_alternatives']+=x['equivalent']
    return {k:int(c[k]) for k in COUNT_KEYS}


def selection(records, order):
    """First actually exposed discovery scene per arm; never rank by quality.

    Examine every frozen candidate, including failures/zeros. A confirmation
    scene cannot fill a discovery slot. One frame proves exposure only.
    """
    by_name={r['name']:r for r in records}
    if len(by_name)!=len(records) or set(by_name)!=set(order):
        raise ValueError('Complete unique frozen discovery ledger required')
    selected={a:None for a in SCAN_ARMS[1:]}
    for name in order:
        r=by_name[name]
        if r['phase']!='discovery':
            raise ValueError('Confirmation cannot select discovery')
        if r['status']!='completed':
            continue
        for arm in selected:
            v=r['arms'][arm]
            if set(v['counts'])!=set(COUNT_KEYS):
                raise ValueError('Only frozen exposure counts accepted')
            if (v['counts']['actual_vetoes']>0 and v['counts']['frames_with_veto']>0
                and v['repeat_equal'] and selected[arm] is None):
                selected[arm]=name
    return selected


def validate_cohort(sequences):
    """Disjoint fixed source families, discovery first and complete reserved set."""
    names=[s['name'] for s in sequences]
    phases=[s['phase'] for s in sequences]
    if len(set(names))!=len(names) or not set(phases)=={'discovery','confirmation'}:
        raise ValueError('Unique discovery/confirmation sequences required')
    if phases!=sorted(phases,key=lambda p:0 if p=='discovery' else 1):
        raise ValueError('Complete discovery must precede confirmation')
    discovery={s['source_family'] for s in sequences if s['phase']=='discovery'}
    reserved={s['source_family'] for s in sequences if s['phase']=='confirmation'}
    if discovery & reserved:
        raise ValueError('Source family leaks into confirmation')


def load_inputs(path, protocol):
    """Manifest schema has no GT/evaluator/score field, including nested items."""
    path=Path(path)
    if path.is_symlink() or path.stat().st_size>1024*1024:
        raise ValueError('Regular bounded input manifest required')
    m=json.loads(path.read_text())
    if set(m)!={'format','sequences'} or m['format']!='depthport.exposure-inputs.v1':
        raise ValueError('GT-free input schema required')
    seqs=m['sequences'];wanted=protocol['sequences']
    validate_cohort(wanted)
    if [s['name'] for s in seqs]!=[s['name'] for s in wanted]:
        raise ValueError('Complete frozen input order required')
    for seq,frozen in zip(seqs,wanted):
        if set(seq)!={'name','video','caches','video_sha256','cache_sha256'}:
            raise ValueError('GT-free sequence schema required')
        if (not seq['caches'] or len(seq['caches'])!=len(seq['cache_sha256'])
            or len(set(seq['caches']))!=len(seq['caches'])):
            raise ValueError('Unique hashed cache shards required')
        video=Path(seq['video'])
        if video.is_symlink() or sha256_file(video)!=seq['video_sha256']:
            raise ValueError('Immutable source video required')
        total=0
        for cache in iter_caches(seq,protocol['detector_settings']):
            if cache['fps']!=frozen['fps']:
                raise ValueError('Frozen source FPS differs')
            total+=len(cache['frames'])
        if total!=frozen['frames']:
            raise ValueError('Full frozen source sequence required')
    return m


def iter_caches(seq, detector):
    """Bound each shard by unchanged read_cache limits; preserve source order.

    A single existing full cache may omit source_start_frame (means frame one).
    New shards use explicit contiguous offsets. Never reset tracker at a shard.
    """
    offset=1;meta=None
    for name,digest in zip(seq['caches'],seq['cache_sha256']):
        path=Path(name)
        if path.is_symlink() or sha256_file(path)!=digest:
            raise ValueError('Immutable cache shard required')
        cache=read_cache(path)
        if cache.get('source_start_frame',1)!=offset or cache['video_sha256']!=seq['video_sha256']:
            raise ValueError('Dense contiguous source coverage required')
        if {k:cache['detector'].get(k) for k in detector}!=detector:
            raise ValueError('Frozen common detector required')
        current=(cache['width'],cache['height'],cache['fps'])
        if meta is not None and current!=meta:
            raise ValueError('Source metadata changed across shards')
        meta=current;offset+=len(cache['frames'])
        yield cache
