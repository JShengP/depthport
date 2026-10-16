# SPDX-License-Identifier: AGPL-3.0-only
import base64
import json
import cv2
import numpy as np
import pytest
from depthport.cloud import CameraGeometry, make_cloud, export_binary_ply


def image(h=40, w=80):
    return np.full((h, w, 3), (23, 200, 120), np.uint8)


def test_metric_geometry_preserved_and_ply_layout():
    rgb = image(60, 100)
    depth = np.tile(np.linspace(3, 9, 100, dtype=np.float32), (60, 1))
    result = make_cloud(rgb, depth, grid_max_width=55)
    rec = result['points_raw']
    assert result['count'] == 30 * 50
    assert len(base64.b64decode(result['points'])) == result['count'] * 16
    assert rec.dtype.itemsize == 16
    np.testing.assert_array_equal(rec['z'], -depth[::2, ::2].ravel())
    assert rec['r'][0] == 120 and rec['g'][0] == 200 and rec['b'][0] == 23
    ply = export_binary_ply(rec, frame_id=7)
    end = ply.index(b'end_header\n') + len(b'end_header\n')
    assert b'estimated_m' in ply[:end] and b'NOT measured' in ply[:end]
    assert b'frame_id 7' in ply[:end]
    assert len(ply) - end == result['count'] * 15
    assert cv2.imdecode(np.frombuffer(base64.b64decode(result['depth_jpeg']), np.uint8), 1) is not None


def test_uniform_depth_is_not_remapped_to_three():
    result = make_cloud(image(), np.full((40, 80), 2.5, np.float32))
    assert np.all(result['points_raw']['z'] == -2.5)


def test_invalid_and_out_of_range_points_are_omitted_not_clipped():
    depth = np.full((16, 16), 2.5, np.float32)
    depth[0, :6] = [np.nan, np.inf, 0, -1, .01, 81]
    result = make_cloud(image(16, 16), depth)
    assert result['count'] == 250
    assert np.all(result['points_raw']['z'] == -2.5)
    assert result['depth_stats']['max'] == 81  # raw stats do not hide removed points


def test_fixed_colors_do_not_modify_coordinates():
    depth = np.tile(np.linspace(1, 40, 80, dtype=np.float32), (40, 1))
    a = make_cloud(image(), depth, color_max=5)
    b = make_cloud(image(), depth, color_max=50)
    np.testing.assert_array_equal(a['points_raw'], b['points_raw'])
    assert a['depth_jpeg'] != b['depth_jpeg']


def test_other_pixels_cannot_rescale_a_static_depth():
    d = np.full((40, 80), 2.5, np.float32)
    a = make_cloud(image(), d)
    d[20:, 40:] = 50
    b = make_cloud(image(), d)
    assert a['points_raw']['z'][0] == b['points_raw']['z'][0] == -2.5


def test_known_intrinsics_and_webgl_axis_signs():
    d = np.full((17, 17), 4., np.float32)
    k = dict(fx=8., fy=8., cx=8., cy=8., source='provided_intrinsics')
    rec = make_cloud(image(17, 17), d, intrinsics=k)['points_raw']
    assert rec[8 * 17 + 8]['x'] == 0 and rec[8 * 17 + 8]['y'] == 0
    assert rec[8 * 17 + 10]['x'] == 1
    assert rec[10 * 17 + 8]['y'] == -1
    assert rec[0]['z'] == -4


def test_all_points_filtered_still_has_raw_depth_metadata():
    result = make_cloud(image(), np.full((40, 80), 500, np.float32))
    assert result['count'] == 0 and result['warning']
    assert result['points'] == ''


@pytest.mark.parametrize('value', [np.nan, np.inf, 0, -2])
def test_no_positive_finite_depth_rejected(value):
    with pytest.raises(ValueError):
        make_cloud(image(), np.full((40, 80), value, np.float32))


def test_calibration_resize_and_aspect_ratio_guard(tmp_path):
    p = tmp_path / 'camera.json'
    p.write_text(json.dumps(dict(image_width=1920, image_height=1080, fx=1500, fy=1500,
                                cx=959.5, cy=539.5, dist_coeffs=[])))
    camera = CameraGeometry(calibration_path=str(p))
    rgb, k = camera.prepare(image(1080, 1920), max_width=960)
    assert rgb.shape == (540, 960, 3)
    assert (k['fx'], k['fy'], k['cx'], k['cy']) == (750., 750., 479.5, 269.5)
    with pytest.raises(ValueError, match='aspect ratio'):
        camera.intrinsics(640, 480)


def test_zero_distortion_preserves_image(tmp_path):
    p = tmp_path / 'camera.json'
    p.write_text(json.dumps(dict(image_width=80, image_height=40, fx=100, fy=100,
                                cx=39.5, cy=19.5, dist_coeffs=[0, 0, 0, 0, 0])))
    rgb, k = CameraGeometry(calibration_path=str(p)).prepare(image(), 960)
    np.testing.assert_array_equal(rgb, image())
    assert k['distortion_corrected'] is True
