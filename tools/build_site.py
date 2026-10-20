# SPDX-License-Identifier: AGPL-3.0-only
"""Build a static multi-version Pages showcase with attributed recorded examples.

Only reviewed public sample media and documented screenshots are copied; no model, inference runtime, personal sessions, account data or RTSP input.
The historical release tags are not modified; v0.1/v0.2/v0.3 here denote
public *capability demos*, not exact historical binary/runtime snapshots.
"""
from __future__ import annotations
import argparse
import hashlib
from pathlib import Path
import re
import shutil
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from depthport.source_archive import source_bytes

STATIC_ASSETS = ('style.css', 'viewer.js', 'i18n.js', 'main.js', 'favicon.svg')
SHOWCASE_ASSETS = ('showcase.css', 'showcase.js', 'recorded-examples.css', 'recorded-examples.js')
SCREENSHOTS = ('preview.en.png', 'spatial-preview.en.png',
               'tracking-replay-start.zh-TW.jpg',
               'tracking-replay-crossing.zh-TW.jpg',
               'tracking-replay-later.zh-TW.jpg')
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
    html = html.replace('</nav>', '</nav>' + "<section aria-label=\"Recorded real bus example\" style=\"background:#0f2937;color:#e0f3ef;border-bottom:1px solid #38596b;padding:20px 26px;font:14px/1.5 system-ui,sans-serif\">\n<strong style=\"color:#83e0d1\">RECORDED REAL BUS EXAMPLE · 已保存的實際公車範例</strong>\n<p>Original Ultralytics <code>bus.jpg</code> and a later <b>v0.2 verified CUDA inference screenshot</b>. The point cloud in the v0.1 viewer below is still <b>synthetic</b> because the original native depth/XYZ file was not published. / 下方真實圖片及後續 v0.2 推論截圖與合成 3D 練習分開，不能將其視為原本 v0.1 Tag 的實機驗收。</p>\n<div style=\"display:grid;grid-template-columns:minmax(0,.65fr) minmax(0,1.35fr);gap:14px\">\n<figure style=\"margin:0\"><img style=\"width:100%;max-height:290px;object-fit:contain;background:#071625;border:1px solid #346071;border-radius:8px\" src=\"../media/bus.jpg\" alt=\"Original Ultralytics bus.jpg RGB with a bus and pedestrians\"><figcaption>Original RGB / 原始公車照片</figcaption></figure>\n<figure style=\"margin:0\"><a href=\"../media/spatial-preview.en.png\" target=\"_blank\" rel=\"noopener noreferrer\"><img style=\"width:100%;max-height:290px;object-fit:contain;background:#071625;border:1px solid #346071;border-radius:8px\" src=\"../media/spatial-preview.en.png\" alt=\"Later v0.2 four-model real CUDA inference screenshot, not a raw depth tensor\"></a><figcaption>Later v0.2 validated result / 後續 v0.2 真推論截圖（點擊放大）</figcaption></figure>\n</div><p style=\"font-size:12px;color:#a5c6d0\"><a style=\"color:#88decf\" href=\"https://github.com/ultralytics/assets/blob/53d4e2a8fd15f473c29a148c317a8477be559327/im/bus.jpg\">Ultralytics Assets · original bus.jpg</a> · <a style=\"color:#88decf\" href=\"https://github.com/JShengP/depthport/blob/main/docs/validation/v0.2-summary.json\">Verified experiment</a>. No metric distance accuracy or true interactive point cloud is inferred from the screenshot.</p>\n<b style=\"font-size:12px;color:#74d6c9\">↓ Synthetic 3D interaction practice / 下方為合成點雲互動練習</b>\n</section>", 1)
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
    print('Static showcase built: verified bus.jpg, documented real v0.2/v0.3 screenshots,'
          ' and separately marked synthetic interaction. No API, AI, RTSP, Sessions or deployment.')


if __name__ == '__main__':
    main()
