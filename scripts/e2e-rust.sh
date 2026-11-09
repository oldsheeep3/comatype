#!/usr/bin/env bash
# Generate Rust from usage/, build it, and run the E2E that connects the generated client to the generated server
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
tmp="$(mktemp -d)"
pid=""
trap '[ -n "$pid" ] && kill "$pid" 2>/dev/null || true; rm -rf "$tmp"' EXIT
# Do not bring in the sample .rs files (they use undefined functions); replace them with the E2E main.rs
rsync -a --exclude node_modules --exclude .venv --exclude 'rust_*/src/*.rs' "$root/usage/" "$tmp/"
cargo run -q -p comatype-cli --manifest-path "$root/Cargo.toml" -- generate --config "$tmp" --lang rust 2>&1 | grep -v '\[warn\]' || true
target="${CARGO_TARGET_DIR:-$root/target/e2e-rust}"
for d in rust_server rust_client; do
  printf '[package]\nname = "%s"\nversion = "0.0.0"\nedition = "2021"\n\n[dependencies]\ncomatype = { path = "%s/packages/rust" }\nureq = "2"\n\n[workspace]\n' "$d" "$root" > "$tmp/$d/Cargo.toml"
done
cp "$root/scripts/rust-e2e/server.rs.txt" "$tmp/rust_server/src/main.rs"
cp "$root/scripts/rust-e2e/client.rs.txt" "$tmp/rust_client/src/main.rs"
for d in rust_server rust_client; do
  (cd "$tmp/$d" && CARGO_TARGET_DIR="$target" cargo build -q 2>&1)
done
"$target/debug/rust_server" > "$tmp/server.out" &
pid=$!
for _ in $(seq 50); do grep -q '^PORT=' "$tmp/server.out" 2>/dev/null && break; sleep 0.1; done
port="$(sed -n 's/^PORT=//p' "$tmp/server.out")"
COMATYPE_BASE_URL="http://127.0.0.1:$port" "$target/debug/rust_client"
