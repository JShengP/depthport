# SPDX-License-Identifier: AGPL-3.0-only
"""Offline public-file, local-link and obvious-secret checks; not a security audit."""
from __future__ import annotations
import json
from pathlib import Path
import re
import subprocess
import sys
from urllib.parse import unquote, urlsplit
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from depthport.source_archive import public_files


def problems(root: Path) -> list[str]:
    errors: list[str] = []
    try:
        selected = public_files(root)
    except (OSError, ValueError) as exc:
        return [str(exc)]
    names = {p.relative_to(root).as_posix() for p in selected}
    required = {'README.md', 'README.zh-TW.md', 'LICENSE', 'NOTICE', 'THIRD_PARTY_NOTICES.md',
                'SECURITY.md', 'CONTRIBUTING.md', 'PUBLIC_FILES.txt', 'static/i18n.js',
                '.github/workflows/ci.yml', 'docs/en/publishing.md', 'docs/zh-TW/publishing.md',
                'docs/en/public-private-boundary.md', 'docs/zh-TW/public-private-boundary.md'}
    errors += [f'Missing required file: {name}' for name in sorted(required - names)]
    blocked = re.compile(r'(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,}|'
                         r'AKIA[A-Z0-9]{16}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----)')
    private_path = re.compile(r'(?:/mnt/data/|/home/oai/|C:\\Users\\[^\\]+)', re.I)
    for path in selected:
        name = path.relative_to(root).as_posix()
        if path.suffix in {'.png', '.jpg', '.ico'}:
            continue
        try:
            text = path.read_text(encoding='utf-8')
        except UnicodeError:
            errors.append(f'Unexpected non-text public file: {name}')
            continue
        # The scanner's definitions and test fixtures are not evidence of a secret.
        if not name.startswith('tests/') and name != 'tools/check_release.py':
            if blocked.search(text): errors.append(f'Possible credential in {name}; review manually')
            if private_path.search(text): errors.append(f'Local build path in {name}')
            for match in re.finditer(r'rtsps?://[^\s<>"\x27`]+', text):
                url = match.group(0)
                if '@' in url: errors.append(f'Credential-bearing RTSP example in {name}; use a non-secret placeholder')
        if path.suffix == '.md':
            # Inline Markdown destinations (including images), excluding fenced code.
            prose = re.sub(r'```.*?```', '', text, flags=re.S)
            for dest in re.findall(r'\]\(([^\s)]+)(?:\s+"[^"]*")?\)', prose):
                link = urlsplit(dest)
                if link.scheme or link.netloc or not link.path or link.path.startswith('/'):
                    continue
                resolved = (path.parent / unquote(link.path)).resolve()
                if not resolved.is_relative_to(root.resolve()) or not resolved.exists():
                    errors.append(f'Broken local Markdown link in {name}: {dest}')
                elif resolved.is_file() and resolved.relative_to(root).as_posix() not in names:
                    errors.append(f'Linked file missing from manifest in {name}: {dest}')
    # In a git checkout, refuse source that was committed but omitted from distribution.
    try:
        result = subprocess.run(['git', 'ls-files', '-z'], cwd=root, capture_output=True, check=True)
    except (FileNotFoundError, subprocess.CalledProcessError):
        pass
    else:
        tracked = {n for n in result.stdout.decode().split('\0') if n}
        errors += [f'Tracked file absent from public manifest: {n}' for n in sorted(tracked-names)]
    return errors


def main() -> int:
    errors = problems(ROOT)
    if errors:
        print('\n'.join(errors), file=sys.stderr)
        return 1
    print(json.dumps({'public_manifest': 'PASS', 'local_markdown_links': 'PASS',
                      'obvious_secret_patterns': 'no matches in checked public files',
                      'limitations': 'Not a full secret scan, history scan, ownership review or security audit.'}, indent=2))
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
