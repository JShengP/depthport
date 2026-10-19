# SPDX-License-Identifier: AGPL-3.0-only
"""Pure spatial analysis primitives. None of these functions imply measured depth.

Camera coordinates: X right, Y down, Z forward. Viewer coordinates: X right,
Y up, Z negative. All dimensions inherit the selected engine's depth units.
"""
from __future__ import annotations

import math
from dataclasses import dataclass

import numpy as np


def checked_intrinsics(k: dict) -> dict:
    for name in ('fx', 'fy', 'cx', 'cy'):
        if name not in k or not math.isfinite(float(k[name])):
            raise ValueError(f'Invalid camera intrinsics: {name}')
    if float(k['fx']) <= 0 or float(k['fy']) <= 0:
        raise ValueError('Focal lengths must be positive')
    return k


def backproject(u: np.ndarray | float, v: np.ndarray | float, depth: np.ndarray | float,
                intrinsics: dict) -> np.ndarray:
    """Metric only when Z is metric AND camera intrinsics/scale are validated."""
    k = checked_intrinsics(intrinsics)
    z = np.asarray(depth, dtype=np.float64)
    x = (np.asarray(u, dtype=np.float64) - float(k['cx'])) * z / float(k['fx'])
    y = (np.asarray(v, dtype=np.float64) - float(k['cy'])) * z / float(k['fy'])
    return np.stack(np.broadcast_arrays(x, y, z), axis=-1)


def valid_depth(depth: np.ndarray, limits: tuple[float, float] | None = None) -> np.ndarray:
    keep = np.isfinite(depth) & (depth > 0)
    if limits:
        keep &= (depth >= limits[0]) & (depth <= limits[1])
    return keep


def pixel_inspection(result, frame: dict, u: int, v: int) -> dict:
    z = result.depth
    h, w = z.shape
    if not (0 <= u < w and 0 <= v < h):
        raise ValueError('Pixel outside aligned RGB / depth dimensions')
    raw = float(result.raw_depth[v, u])
    value = float(z[v, u])
    valid = bool(np.isfinite(value) and value > 0)
    xyz = backproject(float(u), float(v), value, result.intrinsics).tolist() if valid else None
    color = result.bgr[v, u, ::-1].tolist()
    return {
        'frame_id': frame['frame_id'], 'generation': frame['generation'],
        'source_sha256': frame.get('source_sha256'), 'engine': frame['engine'],
        'model': frame['model'], 'timestamp': frame['timestamp'],
        'u': u, 'v': v, 'rgb': [int(c) for c in color],
        'raw_depth': raw if math.isfinite(raw) else None,
        'depth': value if valid else None, 'units': frame['units'],
        'valid_depth': valid, 'xyz_camera': xyz,
        'xyz_viewer': [xyz[0], -xyz[1], -xyz[2]] if xyz else None,
        'intrinsics': result.intrinsics,
        'depth_interpretation': 'unvalidated_estimated_meters' if frame['units'] == 'estimated_m' else 'relative_or_virtual_not_meters',
        'mapping': result.info.get('mapping_id'),
        'note': 'Camera coordinates X right/Y down/Z forward; depth is not field-validated.',
    }


def depth_distribution(depth: np.ndarray, bins: int = 20) -> dict:
    if bins < 4 or bins > 100: raise ValueError('Invalid bin count')
    v = depth[valid_depth(depth)].astype(np.float64)
    if not v.size:
        return {'count': 0, 'hist': [], 'edges': [], 'stats': None}
    q = np.percentile(v, [2, 50, 98])
    # Shape-comparison visualization only, NEVER convert the raw measurements.
    lo, hi = float(q[0]), float(q[2])
    if hi <= lo: hi = lo + max(1e-6, abs(lo) * .001)
    normalized = np.clip((v - lo) / (hi - lo), 0, 1)
    hist, edges = np.histogram(normalized, bins=bins, range=(0, 1))
    return {'count': int(v.size), 'hist': hist.astype(int).tolist(),
            'edges': edges.tolist(), 'normalized_for_visualization': True,
            'stats': {'min': float(np.min(v)), 'p02': float(q[0]), 'median': float(q[1]),
                      'p98': float(q[2]), 'max': float(np.max(v))}}


def distance_between(result, a: tuple[int, int], b: tuple[int, int], scale: float = 1.) -> dict:
    h, w = result.depth.shape
    for u, v in (a, b):
        if not (0 <= u < w and 0 <= v < h): raise ValueError('Pixel outside depth map')
        if not valid_depth(result.depth)[v, u]: raise ValueError('Both points require valid positive depth')
    pa = backproject(*a, result.depth[a[1], a[0]], result.intrinsics)
    pb = backproject(*b, result.depth[b[1], b[0]], result.intrinsics)
    unscaled = float(np.linalg.norm(pa - pb))
    if not math.isfinite(scale) or scale <= 0: raise ValueError('Invalid scale factor')
    return {'points_px': [list(a), list(b)], 'raw_distance': unscaled,
            'scale_factor': float(scale), 'distance': float(unscaled * scale),
            'units': result.units}


def fit_plane(depth: np.ndarray, intrinsics: dict, roi: tuple[float, float, float, float],
              threshold: float, iterations: int = 120, max_points: int = 25000,
              seed: int = 7) -> dict:
    """RANSAC candidate plane in camera coordinates, NOT verified ground."""
    if not math.isfinite(threshold) or threshold <= 0: raise ValueError('threshold must be positive')
    if len(roi) != 4 or not all(math.isfinite(t) and 0 <= t <= 1 for t in roi):
        raise ValueError('ROI fractions must be between 0 and 1')
    x0, y0, x1, y1 = roi
    if x1 - x0 < .05 or y1 - y0 < .05: raise ValueError('ROI too small')
    h, w = depth.shape
    x_start, x_stop = max(0,int(x0*w)),min(w,int(math.ceil(x1*w)))
    y_start, y_stop = max(0,int(y0*h)),min(h,int(math.ceil(y1*h)))
    ys, xs = np.mgrid[y_start:y_stop, x_start:x_stop]
    zz = depth[y_start:y_stop, x_start:x_stop]
    mask = valid_depth(zz)
    xs, ys, zz = xs[mask], ys[mask], zz[mask]
    if len(zz) < 60: raise ValueError('Not enough valid points in selected ROI')
    rnd = np.random.default_rng(seed)
    if len(zz) > max_points:
        take = rnd.choice(len(zz), max_points, replace=False)
        xs, ys, zz = xs[take], ys[take], zz[take]
    pts = backproject(xs, ys, zz, intrinsics)
    best_inlier = np.zeros(len(pts), dtype=bool)
    for _ in range(iterations):
        ids = rnd.choice(len(pts), 3, replace=False)
        p0, p1, p2 = pts[ids]
        normal = np.cross(p1-p0,p2-p0)
        norm = float(np.linalg.norm(normal))
        if norm < 1e-9: continue
        normal /= norm
        d = -normal @ p0
        inlier = np.abs(pts @ normal + d) <= threshold
        if int(inlier.sum()) > int(best_inlier.sum()): best_inlier = inlier
    if int(best_inlier.sum()) < 30:
        raise ValueError('No supported plane found at the chosen threshold')
    fit_pts = pts[best_inlier]
    center = fit_pts.mean(axis=0)
    _, _, vh = np.linalg.svd(fit_pts - center, full_matrices=False)
    normal = vh[-1]
    if normal[1] > 0: normal = -normal  # orient upward in camera frame, Y down
    d = -float(normal @ center)
    residual = np.abs(pts @ normal + d)
    refined = residual <= threshold
    return {'normal_camera': normal.tolist(), 'd': d,
            'equation': 'nx*X + ny*Y + nz*Z + d = 0',
            'rms_inlier': float(np.sqrt(np.mean(residual[refined]**2))) if refined.any() else None,
            'inliers': int(refined.sum()), 'points': int(len(pts)),
            'inlier_fraction': float(refined.mean()), 'threshold': float(threshold),
            'roi': list(roi), 'algorithm': 'RANSAC_3point_SVD_refinement',
            'interpretation': 'candidate_plane_not_confirmed_floor'}


def empirical_validation(raw_distance: float, expected: float, scale: float) -> dict:
    if not (math.isfinite(expected) and expected > 0): raise ValueError('Known distance must be positive')
    observed = raw_distance * scale
    return {'expected_m': float(expected), 'estimated_m': float(observed),
            'signed_error_m': float(observed-expected),
            'absolute_error_m': abs(float(observed-expected)),
            'relative_error_percent': abs(float(observed-expected)/expected)*100,
            'disclaimer': 'One check is a sample residual, not a confidence interval or safety certification.'}
