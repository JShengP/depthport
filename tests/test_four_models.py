# SPDX-License-Identifier: AGPL-3.0-only
"""Four-preset service lifecycle checks with explicit NON-AI test doubles."""
import numpy as np
from depthport.api import Service
from tests.helpers import FakeEngine, wait_for, fixture_image


def test_same_image_all_four_switches_keep_hash_and_unload_before_load():
    events = []
    s = Service(lambda key: FakeEngine(key, events))
    try:
        s.set_image(fixture_image(), 'same-image-hash')
        wait_for(lambda: s.latest)
        last_id = s.latest['frame_id']
        previous = 'yolo26'
        for key in ['da2-small', 'da3-small', 'da3-metric', 'da2-small', 'yolo26']:
            s.request_model(key)
            wait_for(lambda: s.latest and s.latest['engine'] == key)
            f = s.latest
            assert f['source_sha256'] == 'same-image-hash' and f['frame_id'] > last_id
            last_id = f['frame_id']
            assert events[-2:] == [('load', key), ('predict', key)]
            assert events[-3] == ('unload', previous)
            if key == 'da2-small':
                assert f['units'] == 'relative'
                assert f['depth_info']['per_frame_geometry_normalization'] is True
                assert f['color_range'] == [1., 5.]
            previous = key
    finally:
        s.shutdown()


def test_v2_load_failure_clears_old_model_result_and_recovers():
    class Broken(FakeEngine):
        def load(self): raise RuntimeError('Explicit test: missing Transformers')
    s = Service(lambda key: Broken(key) if key == 'da2-small' else FakeEngine(key))
    try:
        s.set_image(fixture_image(), 'same')
        wait_for(lambda: s.latest)
        s.request_model('da2-small')
        wait_for(lambda: s.status()['model_state'] == 'error')
        assert s.latest is None and 'missing Transformers' in s.status()['error']
        s.request_model('yolo26')
        wait_for(lambda: s.latest)
        assert s.latest['engine'] == 'yolo26' and s.latest['source_sha256'] == 'same'
    finally:
        s.shutdown()
