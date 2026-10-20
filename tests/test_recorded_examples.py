# SPDX-License-Identifier: AGPL-3.0-only
"""Verify real recorded demos do not invent numerical depth or live tracking."""
from __future__ import annotations
import hashlib
from pathlib import Path
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
EXPECTED = 'c02019c4979c191eb739ddd944445ef408dad5679acab6fd520ef9d434bfbc63'


def test_authentic_public_bus_file_and_gallery(tmp_path):
    raw = ROOT/'website'/'media'/'bus.jpg'
    assert hashlib.sha256(raw.read_bytes()).hexdigest() == EXPECTED
    out = tmp_path/'site'
    subprocess.run([sys.executable, str(ROOT/'tools'/'build_site.py'), '--output', str(out)],
                   cwd=ROOT, check=True, capture_output=True, text=True)
    assert hashlib.sha256((out/'media'/'bus.jpg').read_bytes()).hexdigest() == EXPECTED
    for name in ('spatial-preview.en.png','tracking-replay-start.zh-TW.jpg',
                 'tracking-replay-crossing.zh-TW.jpg','tracking-replay-later.zh-TW.jpg'):
        assert (out/'media'/name).is_file()
    a=(out/'v0.1'/'index.html').read_text(encoding='utf-8')
    b=(out/'v0.2'/'index.html').read_text(encoding='utf-8')
    c=(out/'v0.3'/'index.html').read_text(encoding='utf-8')
    assert 'data-demo-only="true"' in a and 'bus.jpg' in a and 'synthetic' in a.lower()
    assert 'recordedV2' in b and 'recordedBusPhoto' in b
    assert 'synthetic' in b.lower() and 'relative' in b.lower()
    assert 'recordedReplay' in c and '24' in c and 'Pexels' in c
    script=(out/'assets'/'recorded-examples.js').read_text(encoding='utf-8')
    assert 'source:32' in script and 'source:43' in script and 'source:55' in script
    assert 'fetch(' not in script and '/api/' not in script and 'XMLHttpRequest' not in script
    assert (out/'source.zip').exists()


def test_recorded_source_does_not_copy_private_user_media():
    s=(ROOT/'tools'/'build_site.py').read_text(encoding='utf-8')
    assert 'BUS_SHA256' in s and 'bus_bytes' in s and 'SCREENSHOTS' in s
    assert 'shutil.copytree' not in s
