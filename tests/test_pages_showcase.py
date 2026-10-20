# SPDX-License-Identifier: AGPL-3.0-only
"""Validate the generated Pages site without running AI, browsers or internet calls."""
from __future__ import annotations
from html.parser import HTMLParser
from pathlib import Path
import subprocess
import sys
from urllib.parse import urlsplit, unquote
import zipfile
import json
import shutil
import pytest

ROOT = Path(__file__).resolve().parents[1]


class Links(HTMLParser):
    def __init__(self):
        super().__init__()
        self.paths = []

    def handle_starttag(self, tag, attrs):
        vals = dict(attrs)
        name = vals.get('src') or vals.get('href')
        if tag in ('img', 'script', 'link', 'a') and name:
            self.paths.append(name)


def build(target: Path):
    subprocess.run([sys.executable, str(ROOT / 'tools' / 'build_site.py'),
                    '--output', str(target)], cwd=ROOT, check=True,
                   capture_output=True, text=True)


def test_build_multi_version_showcase_with_safe_artefacts(tmp_path):
    out = tmp_path / 'site'
    build(out)
    expected = ('index.html', 'v0.1/index.html', 'v0.2/index.html', 'v0.3/index.html',
                'assets/showcase.css', 'assets/showcase.js', 'static/viewer.js',
                'static/main.js', 'source.zip', 'LICENSE.txt',
                'media/preview.en.png', 'media/spatial-preview.en.png',
                'media/tracking-replay-crossing.zh-TW.jpg')
    assert all((out / file).is_file() for file in expected)
    # Reuse the exact reviewed README images, including the second language.
    captures = json.loads((ROOT / 'docs/validation/readme-real-pages.json').read_text(encoding='utf-8'))
    for entry in captures['images']:
        original = ROOT / entry['path']
        assert (out / 'media' / original.name).read_bytes() == original.read_bytes()
    pages = [out / p for p in ('index.html', 'v0.1/index.html',
                             'v0.2/index.html', 'v0.3/index.html')]
    assert 'data-demo-only="true"' in pages[1].read_text(encoding='utf-8')
    assert 'href="../source.zip"' in pages[1].read_text(encoding='utf-8')
    assert 'href="../LICENSE.txt"' in pages[1].read_text(encoding='utf-8')
    assert 'id="sessionLinkBox"' not in pages[1].read_text(encoding='utf-8')
    assert 'id="spatialLinkBox"' not in pages[1].read_text(encoding='utf-8')
    assert 'virtual units' in pages[2].read_text(encoding='utf-8').lower()
    assert 'Synthetic' in pages[3].read_text(encoding='utf-8')
    # Local paths resolve below the generated directory, for project-site URLs too.
    for page in pages:
        parser = Links()
        parser.feed(page.read_text(encoding='utf-8'))
        for href in parser.paths:
            url = urlsplit(href)
            if url.scheme or url.netloc or not url.path:
                continue
            # Project-site URLs must not rely on root /static paths.
            assert not url.path.startswith('/'), (page, href)
            resolved = (page.parent / unquote(url.path)).resolve()
            assert resolved.is_relative_to(out), (page, href)
            if resolved.is_dir():
                resolved /= 'index.html'
            assert resolved.is_file(), (page, href)
    # Site only copies explicit safe files and reviewed documentation screenshots.
    site_files = {p.relative_to(out).as_posix() for p in out.rglob('*') if p.is_file()}
    assert not any('private' in p or 'outputs/' in p or p.endswith('.env') for p in site_files)
    with zipfile.ZipFile(out / 'source.zip') as zipfile_obj:
        names = zipfile_obj.namelist()
        assert any(name.endswith('website/v0.3/index.html') for name in names)
        assert not any(name.endswith('/.env') or '/outputs/' in name for name in names)
    # Deterministic regeneration works with the previous generated marker.
    build(out)
    assert (out / 'v0.3' / 'index.html').is_file()


def test_pages_builder_refuses_unrelated_output_tree(tmp_path):
    unrelated = tmp_path / 'do-not-delete'
    unrelated.mkdir()
    (unrelated / 'data.txt').write_text('important local data', encoding='utf-8')
    res = subprocess.run([sys.executable, str(ROOT / 'tools' / 'build_site.py'),
                          '--output', str(unrelated)], cwd=ROOT,
                         text=True, capture_output=True)
    assert res.returncode != 0
    assert (unrelated / 'data.txt').read_text(encoding='utf-8') == 'important local data'


def test_showcase_js_parses_if_node_is_available():
    node = shutil.which('node')
    if node is None:
        pytest.skip('Node.js is not installed')
    subprocess.run([node, '--check', str(ROOT / 'website' / 'showcase.js')],
                   check=True, capture_output=True, text=True)


def test_home_card_images_and_links_follow_language_if_node_available():
    node = shutil.which('node')
    if node is None:
        pytest.skip('Node.js is not installed')
    subprocess.run([node, str(ROOT / 'tests/test_home_cards.cjs')],
                   check=True, capture_output=True, text=True)
