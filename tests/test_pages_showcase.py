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


def test_version_navigation_identifies_its_actual_destination(tmp_path):
    class VersionNavigation(HTMLParser):
        def __init__(self):
            super().__init__()
            self.in_nav = False
            self.href = None
            self.label = ''
            self.links = []
            self.in_title = False
            self.title = ''

        def handle_starttag(self, tag, attrs):
            attrs = dict(attrs)
            if tag == 'title':
                self.in_title = True
            if tag == 'nav' and attrs.get('aria-label') == 'Version navigation':
                self.in_nav = True
            if tag == 'a' and self.in_nav:
                self.href, self.label = attrs.get('href'), ''

        def handle_data(self, data):
            if self.in_title:
                self.title += data
            if self.href is not None:
                self.label += data

        def handle_endtag(self, tag):
            if tag == 'title':
                self.in_title = False
            if tag == 'a' and self.href is not None:
                self.links.append((self.label.strip(), self.href))
                self.href = None
            if tag == 'nav':
                self.in_nav = False

    out = tmp_path / 'site'
    build(out)
    versions = {'v0.1', 'v0.2', 'v0.3'}
    for version in sorted(versions):
        parser = VersionNavigation()
        parser.feed((out / version / 'index.html').read_text(encoding='utf-8'))
        assert version in parser.title
        links = [(label, href) for label, href in parser.links if label in versions]
        assert {label for label, _ in links} == versions - {version}
        assert all(urlsplit(href).path == f'../{label}/' for label, href in links)


def test_progressive_cloud_packs_preserve_original_points(tmp_path):
    """Faster first paint must not substitute or downsample saved coordinates."""
    out = tmp_path / 'site'
    build(out)
    manifest = json.loads((ROOT / 'website/data/bus/manifest.json').read_text())
    for entry in manifest['engines']:
        source = json.loads((ROOT / 'website/data/bus' / entry['path']).read_text())
        small = out / 'data/bus/previews' / (entry['id'] + '.json')
        preview = json.loads(small.read_text())
        assert preview == {key: source[key] for key in
                           ('engine', 'model', 'width', 'height', 'rgb', 'cloud', 'color_range')}
        assert small.stat().st_size < 0.17 * (ROOT / 'website/data/bus' / entry['path']).stat().st_size
        assert (out / 'data/bus' / entry['path']).read_bytes() == (ROOT / 'website/data/bus' / entry['path']).read_bytes()


def test_results_index_metrics_keep_source_cohorts_and_unverified_gates(tmp_path):
    from tools.build_results import pointer
    from html import escape
    out = tmp_path / 'site'
    build(out)
    html = (out / 'results/index.html').read_text(encoding='utf-8')
    config = json.loads((ROOT / 'website/results-index.json').read_text(encoding='utf-8'))
    assert html.count('data-result=') == len(config['records']) == 26
    assert '<!--RESULTS_ROWS-->' not in html and '<!--OPTIONS_' not in html
    assert 'not a global leaderboard' in html and '未量測不當成零' in html
    assert 'unique frozen matrix remains 33 passed / 31 not run' in html
    assert 'status-not_run' in html and 'status-failed' in html
    for row in config['records']:
        for path in [row['source'], *row['report'].values()]:
            assert (ROOT / path).is_file()
        if not row['metrics']:
            continue
        source = json.loads((ROOT / row['source']).read_text())
        for metric in row['metrics']:
            value = pointer(source, metric['pointer'])
            if metric['format'] == 'percent':
                value = f'{value * 100:.2f}%'
            elif metric['format'] == 'number':
                value = f'{value:,}'
            assert '<dd>' + escape(str(value)) + '</dd>' in html
    # No extra network/data payload is needed to see results; only filtering
    # needs JavaScript. Project-site local links must resolve at this depth.
    parser = Links()
    parser.feed(html)
    for href in parser.paths:
        url = urlsplit(href)
        if url.scheme or url.netloc or not url.path:
            continue
        resolved = ((out / 'results') / unquote(url.path)).resolve()
        assert resolved.is_relative_to(out)
        if resolved.is_dir():
            resolved /= 'index.html'
        assert resolved.is_file()
    js = (ROOT / 'website/results.js').read_text()
    assert 'fetch(' not in js and '/api/' not in js and 'innerHTML' not in js


def test_tracking_comparison_charts_keep_cohort_values_order_and_scales(tmp_path):
    import math
    from tools.build_results import comparison_views, count_axis_maximum, render_comparison
    config = json.loads((ROOT / 'website/results-index.json').read_text())
    records = {row['id']: row for row in config['records']}
    approved = set((ROOT / 'PUBLIC_FILES.txt').read_text().splitlines())
    out = tmp_path / 'site'
    build(out)
    html = (out / 'results/index.html').read_text()

    class Charts(HTMLParser):
        def __init__(self):
            super().__init__()
            self.chart = self.view = self.metric = self.member = None
            self.figures = {}
            self.rows = []

        def handle_starttag(self, tag, attrs):
            a = dict(attrs)
            if 'data-comparison' in a:
                self.chart = a['data-comparison']
            if 'data-comparison-view' in a:
                self.view = a['data-comparison-view']
            if 'data-metric' in a:
                self.metric = a['data-metric']
                self.figures[(self.chart, self.view, self.metric)] = float(a['data-axis-max'])
            if 'data-comparison-member' in a:
                self.member = a['data-comparison-member']
                self.rows.append({'chart': self.chart, 'metric': self.metric, 'view':self.view,
                                  'member': self.member, 'value': float(a['data-value'])})
            if tag == 'i':
                self.rows[-1]['width'] = float(a['style'].split(':')[1].rstrip('%'))

    parser = Charts()
    parser.feed(html)
    assert len(parser.figures) == 28 and len(parser.rows) == 72
    assert all(r['member'] != 'worker' for r in parser.rows)
    for spec in config['comparisons']:
        source, views = comparison_views(ROOT, spec, records, approved)
        for metric in ('HOTA', 'IDSW', 'CLR_FN', 'CLR_FP'):
            upper = 100 if metric == 'HOTA' else count_axis_maximum([v[metric] for view in views for _, v in view['series']])
            for view in views:
                actual = [r for r in parser.rows if r['chart'] == spec['id'] and r['view'] == view['id'] and r['metric'] == metric]
                assert [r['member'] for r in actual] == [m['record'] for m in spec['members']]
                values = [v[metric] * 100 if metric == 'HOTA' else v[metric] for _, v in view['series']]
                assert parser.figures[(spec['id'], view['id'], metric)] == upper
                for row, value in zip(actual, values):
                    assert row['value'] == value
                    assert math.isclose(row['width'], value / upper * 100, abs_tol=1e-8)
                assert 'starts at zero' in html and '篩選不重算' in html
        assert [v['id'] for v in views] == ['all'] + [s['name'] for s in source['sequences']]
        for member in spec['members']:
            assert 'href="#result-' + member['record'] + '"' in html
            assert 'id="result-' + member['record'] + '"' in html


def test_tracking_comparison_rejects_cross_cohort_and_profile_members():
    import copy
    from tools.build_results import comparison_series
    config = json.loads((ROOT / 'website/results-index.json').read_text())
    records = {row['id']: row for row in config['records']}
    approved = set((ROOT / 'PUBLIC_FILES.txt').read_text().splitlines())
    spec = copy.deepcopy(config['comparisons'][1])
    spec['members'][1] = {'record': 'worker', 'arm': 'botsort'}
    with pytest.raises(ValueError, match='share a source and cohort'):
        comparison_series(ROOT, spec, records, approved)
    spec = copy.deepcopy(config['comparisons'][1])
    spec['members'][0]['arm'] = 'bytetrack__activation_only'
    with pytest.raises(ValueError, match='different arm'):
        comparison_series(ROOT, spec, records, approved)


def test_tracking_comparison_does_not_turn_missing_into_zero(tmp_path):
    import copy
    from tools.build_results import comparison_series, count_axis_maximum, render_comparison
    config = json.loads((ROOT / 'website/results-index.json').read_text())
    records = {row['id']: copy.deepcopy(row) for row in config['records']}
    spec = config['comparisons'][0]
    path = tmp_path / spec['source']
    path.parent.mkdir(parents=True)
    source = json.loads((ROOT / spec['source']).read_text())
    for values in source['combined']['all_sequences'].values():
        for key in ('HOTA', 'IDSW', 'CLR_FN', 'CLR_FP'):
            values[key] = 0
    for sequence in source['sequences']:
        for member in spec['members']:
            sequence['methods'][member['arm']]['metrics'].update(HOTA=0, IDSW=0, CLR_FN=0, CLR_FP=0)
    path.write_text(json.dumps(source))
    approved = {spec['source']}
    _, series = comparison_series(tmp_path, spec, records, approved)
    assert all(value == 0 for _, values in series for value in values.values())
    assert count_axis_maximum([0, 0, 0]) == 1
    zero_html = render_comparison(tmp_path, spec, records, approved)
    assert zero_html.count('width:0.00000000%') == 48
    assert zero_html.count('<strong>0.00%</strong>') == 12
    assert zero_html.count('data-axis-max="1"') == 12
    for values in source['combined']['all_sequences'].values():
        values.update(IDSW=3, CLR_FN=5, CLR_FP=7)
    path.write_text(json.dumps(source))
    small_html = render_comparison(tmp_path, spec, records, approved)
    for upper in (3, 5, 7):
        assert f'<span>0</span><span>{upper}</span>' in small_html
    source['combined']['all_sequences']['baseline'].pop('CLR_FN')
    path.write_text(json.dumps(source))
    with pytest.raises(KeyError):
        comparison_series(tmp_path, spec, records, approved)


@pytest.mark.parametrize('fault', ['missing_metric', 'wrong_configuration'])
def test_sequence_views_reject_missing_and_mismatched_profiles(tmp_path, fault):
    from tools.build_results import comparison_views
    config = json.loads((ROOT / 'website/results-index.json').read_text())
    records = {row['id']: row for row in config['records']}
    spec = config['comparisons'][1]
    path = tmp_path / spec['source']
    path.parent.mkdir(parents=True)
    source = json.loads((ROOT / spec['source']).read_text())
    method = source['sequences'][0]['methods']['bytetrack__default']
    if fault == 'missing_metric':
        method['metrics'].pop('HOTA')
        error = KeyError
    else:
        method['configuration']['parameters']['track_activation_threshold'] = 0.3
        error = ValueError
    path.write_text(json.dumps(source))
    with pytest.raises(error):
        comparison_views(tmp_path, spec, records, {spec['source']})


def test_spatial_practice_loads_actual_renderer_before_initialization(tmp_path):
    node = shutil.which('node')
    if node is None:
        pytest.skip('Node.js is not installed')
    out = tmp_path / 'site'
    build(out)
    subprocess.run([node, str(ROOT / 'tests/test_spatial_showcase.cjs'),
                    str(out / 'v0.2/index.html')],
                   check=True, capture_output=True, text=True)
