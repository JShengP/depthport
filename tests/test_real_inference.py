# SPDX-License-Identifier: AGPL-3.0-only
"""Opt-in integration test. Requires real image, installed backends and real weights."""
import os
from pathlib import Path
import pytest
from depthport.engines import PRESETS

@pytest.mark.parametrize('key',list(PRESETS))
def test_real_model_smoke(key,tmp_path):
    image=os.getenv('DEPTHPORT_TEST_IMAGE')
    if not image:pytest.skip('No DEPTHPORT_TEST_IMAGE; real model inference NOT run.')
    from check_env import smoke
    report=smoke(key,Path(image),tmp_path)
    assert report['real_inference']=='PASS'
