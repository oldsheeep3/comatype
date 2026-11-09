#!/usr/bin/env bash
# Rebuild the status code snippets (editors/vscode/snippets/status.json) from the registry (status.rs in comatype-core)
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
cargo run -q -p comatype-cli --manifest-path "$root/Cargo.toml" -- statuses --snippets > "$root/editors/vscode/snippets/status.json"
echo "generated: editors/vscode/snippets/status.json"
