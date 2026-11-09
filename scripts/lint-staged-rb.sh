#!/usr/bin/env bash
# Runs RuboCop (safe autocorrect) on the staged Ruby files. Skips with a hint when rubocop is not installed.
set -euo pipefail
if ! command -v rubocop >/dev/null 2>&1; then
  echo "rubocop not found (gem install rubocop); skipping Ruby formatting" >&2
  exit 0
fi
cd packages/ruby
files=()
for f in "$@"; do files+=("${f#packages/ruby/}"); done
rubocop -a --force-exclusion "${files[@]}"
