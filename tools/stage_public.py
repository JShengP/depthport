# SPDX-License-Identifier: AGPL-3.0-only
"""Stage manifest-listed public source only. Does NOT commit, push or publish."""
from pathlib import Path
import subprocess
import sys
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from depthport.source_archive import public_files


def main() -> None:
    subprocess.run([sys.executable, str(ROOT/'tools/check_release.py')], cwd=ROOT, check=True)
    files = [p.relative_to(ROOT).as_posix() for p in public_files(ROOT)]
    for start in range(0, len(files), 40):
        subprocess.run(['git', 'add', '--', *files[start:start+40]], cwd=ROOT, check=True)
    print('Public files staged. Review git diff --cached before committing. Nothing was pushed.')


if __name__ == '__main__':
    main()
