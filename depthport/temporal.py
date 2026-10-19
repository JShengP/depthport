# SPDX-License-Identifier: AGPL-3.0-only
"""Bounded, read-only same-pixel temporal diagnostics for saved DepthPort frames.

These are *image-grid differences*, not optical flow, metric camera motion,
world-aligned geometry, or ground-truth depth accuracy. All per-model units
stay distinct. No automatic recording or live model inference happens here.
"""
from __future__ import annotations

import io
import json
import math
import zipfile
from collections import defaultdict

import numpy as np

MAX_PAIRS = 32
MAX_SAMPLED_PIXELS = 8192
MAX_DEPTH_PIXELS = 4_000_000


def _read_depth(bundle: bytes, row: dict) -> tuple[np.ndarray, dict]:
    """Read a depth-only snapshot, verify provenance; avoid pickles and oversize grids."""
    from depthport.sessions import SessionIntegrity

    try:
        with zipfile.ZipFile(io.BytesIO(bundle)) as z:
            names = [i.filename for i in z.infolist()]
            candidates = [n for n in names if n.startswith('depth_') and n.endswith('.npy')]
            if len(candidates) != 1 or 'frame.json' not in names:
                raise SessionIntegrity('Saved frame has no unique geometry depth array')
            item = z.getinfo(candidates[0])
            if item.file_size > MAX_DEPTH_PIXELS * 4 + 4096:
                raise SessionIntegrity('Saved depth exceeds analysis size limit')
            meta = json.loads(z.read('frame.json'))
            if any(meta.get(field) != row.get(field) for field in ('frame_id', 'engine', 'units')):
                raise SessionIntegrity('Saved frame provenance does not match session index')
            depth = np.load(io.BytesIO(z.read(candidates[0])), allow_pickle=False)
    except (zipfile.BadZipFile, KeyError, ValueError, EOFError, TypeError) as exc:
        raise SessionIntegrity('Saved depth could not be safely read') from exc
    if (depth.ndim != 2 or depth.size == 0 or depth.size > MAX_DEPTH_PIXELS or
            depth.dtype != np.dtype('float32')):
        raise SessionIntegrity('Saved depth array has unsupported dimensions or dtype')
    if not isinstance(meta.get('intrinsics'), dict):
        raise SessionIntegrity('Saved camera intrinsics are absent')
    return depth, meta


def _grid_signature(meta: dict, shape: tuple[int, int]) -> tuple:
    """Allow pixel-grid comparison only for exactly matching rays and source kind."""
    k = meta['intrinsics']
    # All four coefficients must exist and be finite, or the pair is not safe.
    from depthport.sessions import SessionIntegrity
    try:
        values = tuple(float(k[x]) for x in ('fx', 'fy', 'cx', 'cy'))
    except (ValueError, TypeError, KeyError) as exc:
        raise SessionIntegrity('Invalid stored camera intrinsics') from exc
    if not all(math.isfinite(x) for x in values) or min(values[:2]) <= 0:
        raise SessionIntegrity('Invalid stored camera intrinsics')
    return (tuple(shape), values, str(k.get('source')), bool(k.get('distortion_corrected')),
            str(meta.get('source')))


def _percentile_normalized(depth: np.ndarray, valid: np.ndarray) -> np.ndarray:
    """Per-frame normalization supports shape *only*; never defines metres."""
    arr = np.asarray(depth, dtype=np.float64)
    available = arr[valid]
    lo, hi = np.percentile(available, [5, 95])
    if hi <= lo + 1e-8:
        return np.zeros(arr.shape, dtype=np.float64)
    return np.clip((arr - lo) / (hi - lo), 0., 1.)


def _pair_metrics(previous: np.ndarray, current: np.ndarray, units: str) -> dict:
    """Deterministic bounded sample; validity fractions computed on full grid."""
    if previous.shape != current.shape:
        raise ValueError('Depth shapes differ')
    valid_a = np.isfinite(previous) & (previous > 0.)
    valid_b = np.isfinite(current) & (current > 0.)
    both = valid_a & valid_b
    total = previous.size
    result = {
        'previous_valid_fraction': round(float(valid_a.mean()), 6),
        'current_valid_fraction': round(float(valid_b.mean()), 6),
        'overlap_fraction': round(float(both.mean()), 6),
        'sample_stride': max(1, math.ceil(total / MAX_SAMPLED_PIXELS)),
        'comparison_kind': 'same_pixel_grid_no_motion_compensation',
    }
    stride = result['sample_stride']
    idx = np.flatnonzero(both.ravel()[::stride])
    if len(idx) == 0:
        result.update(sampled_overlap_count=0, normalized_mae=None,
                      native_mae=None, native_rmse=None, native_p95_abs=None,
                      native_signed_mean=None)
        return result
    sample_pos = idx * stride
    a = previous.ravel()[sample_pos].astype(np.float64)
    b = current.ravel()[sample_pos].astype(np.float64)
    # Normalize separately using the valid sampled pixels. This is display-shape
    # consistency, not an absolute distance comparison or cross-model metric.
    a_shape = _percentile_normalized(a, np.ones(a.shape, dtype=bool))
    b_shape = _percentile_normalized(b, np.ones(b.shape, dtype=bool))
    result['sampled_overlap_count'] = len(a)
    result['normalized_mae'] = round(float(np.mean(np.abs(b_shape - a_shape))), 6)
    if units == 'estimated_m':
        diff = b - a
        result.update(native_mae=round(float(np.mean(np.abs(diff))), 6),
                      native_rmse=round(float(np.sqrt(np.mean(diff * diff))), 6),
                      native_p95_abs=round(float(np.percentile(np.abs(diff), 95)), 6),
                      native_signed_mean=round(float(diff.mean()), 6),
                      native_units='unvalidated_estimated_meters')
    else:
        result.update(native_mae=None, native_rmse=None, native_p95_abs=None,
                      native_signed_mean=None, native_units='relative_not_meters')
    return result


def analyze_session(store, sid: str, *, max_pairs: int = MAX_PAIRS) -> dict:
    """Analyze saved snapshots offline; read two snapshots at a time, never record."""
    if type(max_pairs) is not int or not 1 <= max_pairs <= MAX_PAIRS:
        raise ValueError(f'max_pairs must be 1..{MAX_PAIRS}')
    rows = store.frames(sid)['frames']
    groups: dict[tuple, dict] = {}
    previous: dict[tuple, tuple] = {}
    pairs = []
    warnings = []
    for row in rows:
        # Re-read the exact archive through the SessionStore SHA-256/symlink guard.
        depth, meta = _read_depth(store.bundle(sid, row['index']), row)
        identity = (str(row['engine']), str(row.get('model')), str(row['units']))
        key = ':'.join(identity)
        if identity not in groups:
            groups[identity] = {'engine': identity[0], 'model': identity[1],
                                'units': identity[2], 'frames': [], 'pair_count': 0}
        group = groups[identity]
        valid = np.isfinite(depth) & (depth > 0)
        sample = depth[::max(1, math.ceil(depth.shape[0]/256)),
                       ::max(1, math.ceil(depth.shape[1]/256))]
        vals = sample[np.isfinite(sample) & (sample > 0)]
        group['frames'].append({
            'index':row['index'], 'frame_id':row['frame_id'],
            'captured_at':row['captured_at'],
            'frame_timestamp':row.get('frame_timestamp'),
            'valid_fraction':round(float(valid.mean()),6),
            'depth_median':round(float(np.median(vals)),6) if vals.size else None,
            'source_sha256':row.get('source_sha256'),
            'shape':[int(x) for x in depth.shape],
        })
        signature = _grid_signature(meta, depth.shape)
        prior = previous.get(identity)
        if prior is not None:
            prior_row, prior_depth, prior_sig = prior
            if prior_sig != signature:
                warnings.append({'from_index': prior_row['index'], 'to_index':row['index'],
                                 'reason':'different_image_grid_or_intrinsics_or_source'})
            elif len(pairs) < max_pairs:
                pair = _pair_metrics(prior_depth, depth, row['units'])
                pair.update(engine=row['engine'], model=row.get('model'), units=row['units'],
                            from_index=prior_row['index'],to_index=row['index'],
                            same_source_image=(bool(row.get('source_sha256')) and
                                               row.get('source_sha256') == prior_row.get('source_sha256')),
                            timestamp_delta_s=round(float(row['frame_timestamp'] - prior_row['frame_timestamp']),6)
                            if isinstance(row.get('frame_timestamp'),(int,float)) and
                               isinstance(prior_row.get('frame_timestamp'),(int,float)) else None)
                pairs.append(pair)
                group['pair_count'] += 1
        previous[identity]=(row,depth,signature)
    return {
        'session_id':sid, 'format':'depthport.temporal-consistency.v1',
        'total_saved_frames':len(rows), 'evaluated_pairs':len(pairs),
        'max_pairs':max_pairs, 'additional_pairs_not_evaluated':max(0, sum(max(0,len(g['frames'])-1) for g in groups.values()) - len(pairs)-len(warnings)),
        'groups':list(groups.values()), 'pairs':pairs,
        'skipped_pairs':warnings,
        'interpretation':(
            'Differences compare matching pixel indexes in stored depth maps only, without '
            'camera-motion compensation, object correspondence or ground truth. '
            'Relative-model results use per-frame normalized shape only. '
            'Estimated-metre changes are NOT independently calibrated distance errors. '
            'Session capture is manual; time gaps are user-selected, not true continuous FPS.'),
    }
