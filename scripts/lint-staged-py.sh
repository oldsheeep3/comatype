#!/usr/bin/env bash
# Runs ruff (fix + format) on the staged Python files. Skips with a hint when neither `ruff` nor `uvx` is installed.
set -euo pipefail
if command -v ruff >/dev/null 2>&1; then r=(ruff); elif command -v uvx >/dev/null 2>&1; then r=(uvx ruff); else
  echo "ruff not found (pip install ruff / brew install uv); skipping Python formatting" >&2
  exit 0
fi
"${r[@]}" check --fix --quiet "$@"
"${r[@]}" format --quiet "$@"
