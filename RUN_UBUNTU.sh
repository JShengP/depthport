#!/usr/bin/env bash
set -euo pipefail
cd -- "$(dirname -- "${BASH_SOURCE[0]}")"
if [ "${SKIP_INSTALL:-0}" != 1 ] && [ ! -f .installed-all.json ]; then
  bash INSTALL_ALL_UBUNTU.sh
fi
[ -f .env ] || cp .env.example .env
echo '[DepthPort] http://127.0.0.1:8000/ - one UI, four model presets'
echo '[DepthPort] First inference downloads weights; depth is NOT verified distance.'
exec .venv-depthport/bin/python app.py
