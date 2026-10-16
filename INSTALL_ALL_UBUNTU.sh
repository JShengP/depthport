#!/usr/bin/env bash
set -euo pipefail
cd -- "$(dirname -- "${BASH_SOURCE[0]}")"
if [ ! -x .venv-depthport/bin/python ]; then
  py="${PYTHON:-}"
  if [ -z "$py" ]; then
    for candidate in python3.11 python3.12 python3.10; do
      if command -v "$candidate" >/dev/null; then py="$candidate"; break; fi
    done
  fi
  if [ -z "$py" ]; then echo 'Install Python 3.11/3.12 with venv support, or set PYTHON.' >&2; exit 1; fi
  "$py" -m venv .venv-depthport
fi
[ -f .env ] || cp .env.example .env
.venv-depthport/bin/python install.py "$@"
