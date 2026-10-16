# SPDX-License-Identifier: AGPL-3.0-only
"""Install four backend presets into THIS project's isolated venv."""
from __future__ import annotations
import argparse
import hashlib
import json
from pathlib import Path
import subprocess
import sys
ROOT = Path(__file__).resolve().parent
DA3_SOURCE = 'https://github.com/ByteDance-Seed/Depth-Anything-3/archive/3d835ec.zip'


def run(*args):
    print('+', sys.executable, *args, flush=True)
    subprocess.run([sys.executable, *args], cwd=ROOT, check=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    group = parser.add_mutually_exclusive_group()
    group.add_argument('--yolo-only', action='store_true', help='YOLO/web only; no four-model success marker.')
    group.add_argument('--v2-only', action='store_true', help='Original V2/web only, without Ultralytics or DA3.')
    args = parser.parse_args()
    if sys.prefix == sys.base_prefix:
        raise SystemExit('Refusing to change system Python. Run INSTALL_ALL_WINDOWS.bat / INSTALL_ALL_UBUNTU.sh.')
    if not (3, 10) <= sys.version_info[:2] <= (3, 12):
        raise SystemExit('Use Python 3.11 or 3.12 (3.10 supported by code); do not use 3.13 for this dependency profile.')
    marker = ROOT / '.installed-all.json'
    marker.unlink(missing_ok=True)
    try:
        if args.yolo_only:
            run('-m', 'pip', 'install', '-r', 'requirements.txt')
            run('check_env.py', '--engine', 'yolo26')
        elif args.v2_only:
            run('-m', 'pip', 'install', '-r', 'requirements-base.txt', '-r', 'requirements-v2.txt')
            run('check_env.py', '--engine', 'da2-small')
        else:
            # One resolution transaction avoids installing incompatible hub versions
            # separately for Transformers and DA3. Existing compatible torch is kept.
            run('-m', 'pip', 'install', '-r', 'requirements.txt',
                '-r', 'requirements-v2.txt', '-r', 'requirements-da3.txt')
            run('-m', 'pip', 'install', '--no-deps', f'depth-anything-3 @ {DA3_SOURCE}')
            run('check_env.py', '--all')
            fingerprints = {n: hashlib.sha256((ROOT/n).read_bytes()).hexdigest()
                            for n in ('requirements.txt', 'requirements-base.txt', 'requirements-v2.txt',
                                      'requirements-da3.txt', 'install.py')}
            marker.write_text(json.dumps({'python': sys.executable, 'version': '0.1.0-alpha.1',
                'engines': ['yolo26', 'da2-small', 'da3-small', 'da3-metric'],
                'da3_source': DA3_SOURCE, 'requirements': fingerprints,
                'real_inference_tested': False}, indent=2), encoding='utf-8')
        print('\nINSTALL/API IMPORT CHECK PASSED. Weight download and real inference have NOT been tested.')
        if args.v2_only:
            print('V2-only: set DEPTH_ENGINE=da2-small in .env, then run this venv Python app.py directly.')
        if args.yolo_only or args.v2_only:
            print('Partial installation: other model options will fail until installed. No all-model marker written.')
    except subprocess.CalledProcessError as exc:
        print('\nInstallation incomplete. Read the failing command. No success marker was written.', file=sys.stderr)
        raise SystemExit(exc.returncode)


if __name__ == '__main__':
    main()
