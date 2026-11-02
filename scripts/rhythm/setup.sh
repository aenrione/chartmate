#!/usr/bin/env bash
# Create (or reuse) the Python venv used by scripts/rhythm. Idempotent.
# The venv is ~2 GB, so it lives outside the repo: $CHARTMATE_RHYTHM_VENV
# (default ~/.cache/chartmate-rhythm/venv).
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
VENV="${CHARTMATE_RHYTHM_VENV:-$HOME/.cache/chartmate-rhythm/venv}"

command -v uv >/dev/null || { echo "uv is required (https://docs.astral.sh/uv/)" >&2; exit 1; }

if [ ! -x "$VENV/bin/python" ]; then
  mkdir -p "$(dirname "$VENV")"
  uv venv --python 3.12 "$VENV"
fi
uv pip install --python "$VENV/bin/python" -r "$HERE/requirements.txt"
echo "$VENV"
