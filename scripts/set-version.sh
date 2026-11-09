#!/usr/bin/env bash
# Stamp the version in VERSION (or the first argument) into every package manifest.
# CI runs it before publishing; the JVM packages take -PreleaseVersion and Go uses git tags instead.
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
v="${1:-$(tr -d '[:space:]' < "$root/VERSION")}"
[[ "$v" =~ ^[0-9]+\.[0-9]+\.[0-9]+([-.][0-9A-Za-z.]+)?$ ]] || { echo "invalid version: $v" >&2; exit 1; }
sed_i() { if [[ "$OSTYPE" == darwin* ]]; then sed -i '' "$@"; else sed -i "$@"; fi; }
sed_i -E "s/^version = \".*\"/version = \"$v\"/" "$root/Cargo.toml" "$root/packages/rust/Cargo.toml" "$root/packages/python/pyproject.toml"
sed_i -E "s/(s\.version = )\".*\"/\1\"$v\"/" "$root/packages/ruby/comatype.gemspec"
(cd "$root/packages/typescript" && npm pkg set version="$v" >/dev/null)
echo "$v"
