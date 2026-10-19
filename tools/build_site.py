# SPDX-License-Identifier: AGPL-3.0-only
"""Build a synthetic-only multi-version GitHub Pages showcase.

No model, inference runtime, account data, user media or RTSP input is copied.
The historical release tags are not modified; v0.1/v0.2/v0.3 here denote
public *capability demos*, not exact historical binary/runtime snapshots.
"""
from __future__ import annotations
import argparse
from pathlib import Path
import re
import shutil
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from depthport.source_archive import source_bytes

STATIC_ASSETS = ('style.css', 'viewer.js', 'i18n.js', 'main.js', 'favicon.svg')
SHOWCASE_ASSETS = ('showcase.css', 'showcase.js')
SCREENSHOTS = ('preview.en.png', 'spatial-preview.en.png',
               'tracking-replay-crossing.zh-TW.jpg')


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
    for file in SCREENSHOTS:
        shutil.copyfile(ROOT / 'docs' / 'assets' / file, out / 'media' / file)

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
    (out / 'v0.1' / 'index.html').write_text(html, encoding='utf-8')

    # v0.2 and v0.3 are standalone read-only canvases with synthetic inputs;
    # they must not fetch API resources, execute models or persist user content.
    for ver in ('v0.2', 'v0.3'):
        (out / ver).mkdir()
        shutil.copyfile(ROOT / 'website' / ver / 'index.html', out / ver / 'index.html')
    shutil.copyfile(ROOT / 'website' / 'index.html', out / 'index.html')
    shutil.copyfile(ROOT / 'LICENSE', out / 'LICENSE.txt')
    (out / 'source.zip').write_bytes(source_bytes(ROOT))
    (out / '.nojekyll').touch()
    print('Multiversion static-only showcase built: v0.1 viewer, v0.2 synthetic spatial,'
          ' v0.3 synthetic tracking. No API, AI, RTSP or personal Sessions. No deployment.')


if __name__ == '__main__':
    main()
