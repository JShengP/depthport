# SPDX-License-Identifier: AGPL-3.0-only
"""Unit-aware back-projection. Adapters own depth semantics; V2 display mapping is explicit before projection.

Coordinate convention: +X right, +Y up, camera looking along -Z (WebGL).
Estimated camera Z-depth is used; this is not Euclidean range along a ray.
"""
from __future__ import annotations
import base64
import json
import math
from pathlib import Path
import cv2
import numpy as np

POINT_DTYPE = np.dtype([('x', '<f4'), ('y', '<f4'), ('z', '<f4'),
                        ('r', 'u1'), ('g', 'u1'), ('b', 'u1'), ('a', 'u1')], align=False)


def compress_jpeg(bgr: np.ndarray, quality: int = 76) -> str:
    ok, buff = cv2.imencode('.jpg', bgr, [cv2.IMWRITE_JPEG_QUALITY, quality])
    if not ok:
        raise RuntimeError('JPEG encoder failed')
    return base64.b64encode(buff.tobytes()).decode('ascii')


class CameraGeometry:
    """Approximate HFOV by default; optional measured intrinsic JSON and distortion."""
    def __init__(self, hfov: float = 65.0, calibration_path: str = ''):
        if not math.isfinite(hfov) or not 15 <= hfov <= 140:
            raise ValueError('HFOV must be 15..140 degrees.')
        self.hfov = hfov
        self.calibration = None
        if calibration_path:
            obj = json.loads(Path(calibration_path).read_text(encoding='utf-8'))
            for key in ('image_width', 'image_height', 'fx', 'fy', 'cx', 'cy'):
                if key not in obj or not math.isfinite(float(obj[key])):
                    raise ValueError(f'Invalid camera calibration field: {key}')
            if any(float(obj[k]) <= 0 for k in ('image_width', 'image_height', 'fx', 'fy')):
                raise ValueError('Calibration dimensions and focal lengths must be positive.')
            dist = np.asarray(obj.get('dist_coeffs', []), dtype=np.float64).ravel()
            if dist.size not in (0, 4, 5, 8, 12, 14) or not np.all(np.isfinite(dist)):
                raise ValueError('dist_coeffs must be a finite OpenCV pinhole distortion vector.')
            if obj.get('camera_model', 'pinhole') != 'pinhole':
                raise ValueError('Only pinhole/Brown-Conrady calibration is implemented, not fisheye.')
            self.calibration = obj

    def intrinsics(self, width: int, height: int) -> dict:
        if self.calibration is None:
            fx = width / (2 * math.tan(math.radians(self.hfov) / 2))
            return {'fx': fx, 'fy': fx, 'cx': (width - 1) / 2, 'cy': (height - 1) / 2,
                    'source': 'hfov_estimate', 'hfov_degrees': self.hfov,
                    'distortion_corrected': False}
        c = self.calibration
        sx, sy = width / float(c['image_width']), height / float(c['image_height'])
        # A crop, a different lens mode or non-uniform source scaling invalidates K.
        if not math.isclose(sx, sy, rel_tol=.005):
            raise ValueError('Image aspect ratio does not match intrinsic calibration. '
                             'Use the same full-frame camera mode, not a cropped substream.')
        return {'fx': float(c['fx']) * sx, 'fy': float(c['fy']) * sy,
                'cx': (float(c['cx']) + .5) * sx - .5,
                'cy': (float(c['cy']) + .5) * sy - .5,
                'source': 'provided_intrinsics',
                'distortion_corrected': bool(c.get('dist_coeffs', []))}

    def prepare(self, bgr: np.ndarray, max_width: int) -> tuple[np.ndarray, dict]:
        h, w = bgr.shape[:2]
        # Also bound portrait images to avoid a small-width, huge-height decode workload.
        scale = min(1., max_width / max(h, w))
        if scale < 1:
            bgr = cv2.resize(bgr, (max(1, round(w * scale)), max(1, round(h * scale))), interpolation=cv2.INTER_AREA)
        intr = self.intrinsics(bgr.shape[1], bgr.shape[0])
        if intr['distortion_corrected']:
            k = np.array([[intr['fx'], 0, intr['cx']], [0, intr['fy'], intr['cy']], [0, 0, 1]], np.float64)
            bgr = cv2.undistort(bgr, k, np.asarray(self.calibration['dist_coeffs'], np.float64), None, k)
        return bgr, intr


def make_cloud(bgr: np.ndarray, depth: np.ndarray, *, hfov_degrees: float = 65.0,
               grid_max_width: int = 220, intrinsics: dict | None = None,
               min_depth: float = .1, max_depth: float = 80.,
               color_min: float = .1, color_max: float = 20.,
               units: str = 'estimated_m', valid_mask: np.ndarray | None = None,
               color_mode: str = 'fixed') -> dict:
    """Sample original predicted depth; omit invalid/out-of-range points, never clip Z.

    Only depth COLORS are normalized. Bounds are supplied by the unit-aware caller.
    Entire raw float depth is retained separately by the service for NPY export.
    """
    if units not in ('estimated_m', 'relative'):
        raise ValueError('Unknown depth units')
    h, w = bgr.shape[:2]
    if depth.shape != (h, w):
        raise ValueError('Depth dimensions must match RGB dimensions.')
    if grid_max_width < 16:
        raise ValueError('grid_max_width must be >=16')
    if not all(math.isfinite(v) for v in (min_depth, max_depth, color_min, color_max)):
        raise ValueError('Depth bounds must be finite.')
    if not 0 < min_depth < max_depth or not 0 <= color_min < color_max:
        raise ValueError('Invalid depth or color range.')
    intr = intrinsics or CameraGeometry(hfov_degrees).intrinsics(w, h)
    if not all(math.isfinite(float(intr[k])) for k in ('fx', 'fy', 'cx', 'cy')) or min(intr['fx'], intr['fy']) <= 0:
        raise ValueError('Invalid camera intrinsics.')
    d = np.asarray(depth, dtype=np.float32)
    positive = np.isfinite(d) & (d > 0)
    if not np.any(positive):
        raise ValueError('Depth contains no positive finite values.')
    valid = positive & (d >= min_depth) & (d <= max_depth)
    if valid_mask is not None:
        if valid_mask.shape != (h, w):
            raise ValueError('Validity mask shape mismatch')
        valid &= valid_mask.astype(bool)
    near_color = np.zeros_like(d)
    near_color[positive] = np.clip(1. - (d[positive] - color_min) / (color_max - color_min), 0, 1)
    colored = cv2.applyColorMap(np.rint(near_color * 255).astype(np.uint8), cv2.COLORMAP_TURBO)
    colored[~positive] = 0
    step = max(1, math.ceil(max(w, h) / grid_max_width))
    ys, xs = np.mgrid[0:h:step, 0:w:step]
    sampled = valid[::step, ::step]
    zs = d[::step, ::step][sampled]
    xs, ys = xs[sampled].astype(np.float32), ys[sampled].astype(np.float32)
    records = np.empty(zs.size, dtype=POINT_DTYPE)
    records['x'] = (xs - intr['cx']) * zs / intr['fx']
    records['y'] = -(ys - intr['cy']) * zs / intr['fy']
    records['z'] = -zs
    rgb = cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB)[::step, ::step][sampled]
    records['r'], records['g'], records['b'], records['a'] = rgb[:, 0], rgb[:, 1], rgb[:, 2], 255
    values = d[positive]
    return {
        'points': base64.b64encode(records.tobytes()).decode('ascii'), 'points_raw': records,
        'count': int(zs.size), 'rgb_jpeg': compress_jpeg(bgr), 'depth_jpeg': compress_jpeg(colored),
        'width': int(w), 'height': int(h),
        'depth_type': 'metric_estimate' if units == 'estimated_m' else 'relative_depth', 'units': units,
        'coordinate_system': 'X right, Y up, camera looks along -Z',
        'depth_convention': 'camera_z', 'scene_scale_verified': False,
        'intrinsics': intr, 'color_range': [color_min, color_max], 'color_mode': color_mode,
        'point_filter': [min_depth, max_depth], 'sample_step': step,
        'depth_stats': {'min': float(values.min()), 'median': float(np.median(values)), 'max': float(values.max())},
        'valid_depth_fraction': round(float(positive.mean()), 6),
        'warning': ('No points remain in the selected depth interval.' if not zs.size else None),
    }


def export_binary_ply(records: np.ndarray, *, frame_id: int | None = None,
                      units: str = 'estimated_m', engine: str = 'unknown') -> bytes:
    if units not in ('relative', 'estimated_m'):
        raise ValueError('Unknown PLY units')
    engine = ''.join(c for c in engine if c.isalnum() or c in '-_')[:40]

    header = (
        'ply\nformat binary_little_endian 1.0\n'
        f'comment DepthPort engine {engine}; units {units}\n'
        'comment Single-view AI estimate; NOT measured or safety-validated\n'
        + ('comment V2 display-only per-frame virtual 1..5 mapping; NOT meters\n' if engine == 'da2-small' else '')
        +
        'comment Coordinates: X right, Y up, camera looks along -Z\n'
        'comment Camera intrinsics may be approximate; see frame metadata\n'
        f'comment frame_id {frame_id if frame_id is not None else "unknown"}\n'
        f'element vertex {len(records)}\n'
        'property float x\nproperty float y\nproperty float z\n'
        'property uchar red\nproperty uchar green\nproperty uchar blue\nend_header\n'
    ).encode('ascii')
    dtype = np.dtype([(k, '<f4' if k in ('x', 'y', 'z') else 'u1') for k in ('x', 'y', 'z', 'r', 'g', 'b')], align=False)
    output = np.empty(len(records), dtype=dtype)
    for key in output.dtype.names:
        output[key] = records[key]
    return header + output.tobytes()
