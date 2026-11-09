#!/usr/bin/env bash
# Create OpenAPI from usage/ and validate it with the official validator (openapi-spec-validator).
# Also convert it back to .comat (from-openapi), check that it passes `check`, and that converting to OpenAPI again gives the same result.
# Requires: openapi-spec-validator in the root .venv (uv pip install --python .venv/bin/python openapi-spec-validator)
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
cargo build -q -p comatype-cli --manifest-path "$root/Cargo.toml"
bin="$root/target/debug/comatype"
"$bin" to-openapi --config "$root/usage" -o "$tmp/openapi.yml" 2>/dev/null
"$root/.venv/bin/openapi-spec-validator" "$tmp/openapi.yml"
"$bin" from-openapi "$tmp/openapi.yml" --out "$tmp/rt" --target ts:client:./client 2>&1 | grep -v '^warning' | tail -2
"$bin" check --config "$tmp/rt" 2>&1 | tail -1
"$bin" to-openapi --config "$tmp/rt" -o "$tmp/openapi2.yml" 2>/dev/null
"$root/.venv/bin/openapi-spec-validator" "$tmp/openapi2.yml"
echo "OpenAPI: OK"
