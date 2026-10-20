# SPDX-License-Identifier: AGPL-3.0-only
"""Build a static multi-version Pages showcase with attributed recorded examples.

Only reviewed public sample media and documented screenshots are copied; no model, inference runtime, personal sessions, account data or RTSP input.
The historical release tags are not modified; v0.1/v0.2/v0.3 here denote
public *capability demos*, not exact historical binary/runtime snapshots.
"""
from __future__ import annotations
import argparse
import hashlib
import json
from pathlib import Path
import re
import shutil
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from depthport.source_archive import source_bytes, public_files

STATIC_ASSETS = ('style.css', 'viewer.js', 'i18n.js', 'main.js', 'favicon.svg')
SHOWCASE_ASSETS = ('showcase.css', 'showcase.js', 'recorded-examples.css', 'recorded-examples.js', 'real-results.js', 'real-results.css')
SCREENSHOTS = ('preview.en.png', 'spatial-preview.en.png',
               'tracking-replay-start.zh-TW.jpg',
               'tracking-replay-crossing.zh-TW.jpg',
               'tracking-replay-later.zh-TW.jpg',
               'pages-v01-cloud.en.jpg', 'pages-v01-cloud.zh-TW.jpg',
               'pages-v02-inspector.en.jpg', 'pages-v02-inspector.zh-TW.jpg',
               'pages-v03-replay.en.jpg', 'pages-v03-replay.zh-TW.jpg')
BUS_SHA256 = 'c02019c4979c191eb739ddd944445ef408dad5679acab6fd520ef9d434bfbc63'


def _prepare_output(out: Path) -> None:
    if out == ROOT or ROOT.is_relative_to(out) or out.is_symlink():
        raise SystemExit('Refusing to overwrite project/parent/symlink output.')
    if out.exists() and any(out.iterdir()):
        # Existing historical synthetic-only builds have the .nojekyll marker.
        # Reject other output trees rather than deleting unrelated data.
        if not ((out / '.nojekyll').is_file() and (out / 'index.html').is_file()
                and 'DepthPort' in (out / 'index.html').read_text(encoding='utf-8')[:4000]):
            raise SystemExit('Refusing to overwrite an output tree not generated for DepthPort Pages.')
        shutil.rmtree(out)
    out.mkdir(parents=True, exist_ok=True)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, default=ROOT / '_site')
    args = parser.parse_args()
    if args.output.is_symlink():
        raise SystemExit('Refusing to use symlink site output.')
    out = args.output.resolve()
    _prepare_output(out)

    # Explicitly selected public files only; never copy a directory recursively.
    (out / 'static').mkdir()
    for file in STATIC_ASSETS:
        shutil.copyfile(ROOT / 'static' / file, out / 'static' / file)
    (out / 'assets').mkdir()
    for file in SHOWCASE_ASSETS:
        shutil.copyfile(ROOT / 'website' / file, out / 'assets' / file)
    (out / 'media').mkdir()
    captures = json.loads((ROOT / 'docs/validation/readme-real-pages.json').read_text(encoding='utf-8'))
    for entry in captures['images']:
        payload = (ROOT / entry['path']).read_bytes()
        if len(payload) != entry['bytes'] or hashlib.sha256(payload).hexdigest() != entry['sha256']:
            raise SystemExit('Reviewed UI screenshot hash mismatch: ' + entry['path'])
    for file in SCREENSHOTS:
        shutil.copyfile(ROOT / 'docs' / 'assets' / file, out / 'media' / file)
    bus_file = ROOT / 'website' / 'media' / 'bus.jpg'
    bus_bytes = bus_file.read_bytes()
    if hashlib.sha256(bus_bytes).hexdigest() != BUS_SHA256:
        raise SystemExit('Original bus.jpg does not match the published real-inference input SHA-256.')
    (out / 'media' / 'bus.jpg').write_bytes(bus_bytes)

    # Preserve the original, intentionally synthetic local viewer.
    (out / 'v0.1').mkdir()
    html = (ROOT / 'static' / 'index.html').read_text(encoding='utf-8')
    html = re.sub(r'<div[^>]*id="spatialLinkBox".*?</div>\s*', '', html, flags=re.S)
    html = re.sub(r'<div[^>]*id="sessionLinkBox".*?</div>\s*', '', html, flags=re.S)
    html = html.replace('<html lang="en">', '<html lang="en" data-demo-only="true">')
    if 'data-demo-only="true"' not in html:
        raise SystemExit('Original viewer did not receive its static-only safety marker.')
    html = html.replace('="/static/', '="../static/')
    html = html.replace('href="/api/source-code.zip"', 'href="../source.zip"')
    html = html.replace('href="/api/license"', 'href="../LICENSE.txt"')
    html = html.replace('<body data-release="0.2.0-alpha.1">',
                        '<body data-release="v0.1-capability-showcase">'
                        '<nav aria-label="Showcase navigation" style="padding:10px 22px;'
                        'background:#102334;color:#7addd1;border-bottom:1px solid #2c5667;'
                        'font:700 13px system-ui,sans-serif">'
                        '<a style="color:inherit" href="../">'
                        '← All versions / 返回版本入口</a>'
                        ' · Synthetic viewer / 合成檢視器</nav>')
    (out / 'v0.1' / 'synthetic.html').write_text(html, encoding='utf-8')

    # Standalone read-only demos load reviewed saved data and separate synthetic
    # exercises; no API, inference runtime or private user content is needed.
    for ver in ('v0.1', 'v0.2', 'v0.3'):
        (out / ver).mkdir(exist_ok=True)
        shutil.copyfile(ROOT / 'website' / ver / 'index.html', out / ver / 'index.html')
    catalog = json.loads((ROOT / 'website/data/catalog.json').read_text(encoding='utf-8'))
    approved = {p.relative_to(ROOT).as_posix() for p in public_files(ROOT)}
    for entry in catalog['files']:
        rel = 'website/data/' + entry['path']
        if rel not in approved:
            raise SystemExit('Result asset missing from explicit public manifest: ' + rel)
        payload = (ROOT / rel).read_bytes()
        if len(payload) != entry['bytes'] or hashlib.sha256(payload).hexdigest() != entry['sha256']:
            raise SystemExit('Curated result asset hash mismatch: ' + rel)
    # Curated static result files must appear individually in PUBLIC_FILES.
    for file in public_files(ROOT):
        rel = file.relative_to(ROOT).as_posix()
        if rel.startswith('website/data/'):
            target = out / rel.removeprefix('website/')
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(file, target)
    shutil.copyfile(ROOT / 'website' / 'index.html', out / 'index.html')
    shutil.copyfile(ROOT / 'LICENSE', out / 'LICENSE.txt')
    (out / 'source.zip').write_bytes(source_bytes(ROOT))
    (out / '.nojekyll').touch()
    print('Static showcase built: actual saved model results, attributed artworks, and separate synthetic exercises. No backend or private Sessions.')


if __name__ == '__main__':
    main()
