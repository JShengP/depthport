# SPDX-License-Identifier: AGPL-3.0-only
"""Build an offline static viewer demo. It cannot run AI or receive RTSP."""
from __future__ import annotations
import argparse
from pathlib import Path
import shutil
import re
import sys
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from depthport.source_archive import source_bytes


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--output', type=Path, default=ROOT/'_site')
    args = p.parse_args()
    out = args.output.resolve()
    if out == ROOT or ROOT.is_relative_to(out):
        raise SystemExit('Refusing to overwrite the project or a parent directory.')
    out.mkdir(parents=True, exist_ok=True)
    # Only named public UI files are copied; never recursively copy a runtime tree.
    (out/'static').mkdir(exist_ok=True)
    for name in ('style.css', 'viewer.js', 'i18n.js', 'main.js', 'favicon.svg'):
        shutil.copyfile(ROOT/'static'/name, out/'static'/name)
    html = (ROOT/'static/index.html').read_text(encoding='utf-8')
    html = re.sub(r'<div[^>]*id="spatialLinkBox".*?</div>\s*', '', html, flags=re.S)
    html = re.sub(r'<div[^>]*id="sessionLinkBox".*?</div>\s*', '', html, flags=re.S)
    html = html.replace('<html lang="en">', '<html lang="en" data-demo-only="true">')
    if 'data-demo-only="true"' not in html:
        raise SystemExit('The static demo marker was not applied.')
    html = html.replace('="/static/', '="./static/').replace('href="/api/source-code.zip"', 'href="./source.zip"')
    html = html.replace('href="/api/license"', 'href="./LICENSE.txt"')
    shutil.copyfile(ROOT/'LICENSE', out/'LICENSE.txt')
    (out/'index.html').write_text(html, encoding='utf-8')
    (out/'source.zip').write_bytes(source_bytes(ROOT))
    (out/'.nojekyll').touch()
    print('Static demo built: synthetic viewer ONLY, no API / AI / RTSP. No site was deployed.')


if __name__ == '__main__':
    main()
