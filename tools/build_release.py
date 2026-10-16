# SPDX-License-Identifier: AGPL-3.0-only
"""Build an explicit public source archive. No git push, upload or model download."""
from __future__ import annotations
import argparse
import hashlib
from pathlib import Path
import subprocess
import sys
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from depthport import __version__
from depthport.source_archive import source_bytes


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--output', type=Path, default=ROOT/'dist')
    args = p.parse_args()
    subprocess.run([sys.executable, str(ROOT/'tools/check_release.py')], cwd=ROOT, check=True)
    data = source_bytes(ROOT)
    args.output.mkdir(parents=True, exist_ok=True)
    name = f'depthport-{__version__}-source.zip'
    (args.output/name).write_bytes(data)
    (args.output/'SHA256SUMS.txt').write_text(hashlib.sha256(data).hexdigest()+'  '+name+'\n', encoding='utf-8')
    print(f'Created {name} ({len(data):,} bytes). No repository was published.')


if __name__ == '__main__':
    main()
