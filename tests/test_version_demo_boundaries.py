# SPDX-License-Identifier: AGPL-3.0-only
"""Version demos expose different operations without inventing new AI evidence."""
from html.parser import HTMLParser
from pathlib import Path
import shutil
import subprocess
import pytest
ROOT=Path(__file__).resolve().parents[1]


class IDs(HTMLParser):
    def __init__(self):super().__init__();self.ids=set()
    def handle_starttag(self,tag,attrs):
        value=dict(attrs).get('id')
        if value:self.ids.add(value)


def test_v1_cloud_and_v2_spatial_operations_are_distinct():
    docs=[(ROOT/f'website/v0.{v}/index.html').read_text() for v in (1,2)]
    parsers=[IDs(),IDs()]
    for p,s in zip(parsers,docs):p.feed(s)
    assert {'cloudDemo','savedCloud','cloudEngine','cloudColor','cloudPointSize'}<=parsers[0].ids
    assert not {'realBus','realSemanticMode','realXYZ','realPixel','realObject'}&parsers[0].ids
    assert {'realBus','realRGB','realDepth','realXYZ','realPixel','realSemanticMode','realObject'}<=parsers[1].ids
    assert 'historical release snapshots' in docs[0] and 'HFOV' in docs[0]
    assert 'shared' in docs[0].lower() and 'v0.2' in docs[0]


def test_actual_cloud_loader_boundary_and_failure_recovery():
    node=shutil.which('node')
    if not node:pytest.skip('Node not installed')
    r=subprocess.run([node,str(ROOT/'tests/test_cloud_demo.cjs')],cwd=ROOT,text=True,capture_output=True,timeout=30)
    assert r.returncode==0,r.stdout+'\n'+r.stderr
