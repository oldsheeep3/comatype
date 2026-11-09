#!/usr/bin/env bash
# Generate Go from usage/, run go vet, and run the E2E that connects the generated client to the generated server
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
tmp="$(mktemp -d)"
pid=""
trap '[ -n "$pid" ] && kill "$pid" 2>/dev/null || true; rm -rf "$tmp"' EXIT
rsync -a --exclude node_modules --exclude .venv "$root/usage/" "$tmp/"
cargo run -q -p comatype-cli --manifest-path "$root/Cargo.toml" -- generate --config "$tmp" --lang go 2>&1 | grep -v '\[warn\]' || true
for d in go_server go_client; do
  # Drop the sample .go files (they use undefined functions) and replace them with the E2E main.go
  (cd "$tmp/$d" && find . -maxdepth 1 -name '*.go' -delete && rm -rf wrappers)
  printf 'module example.com/app\n\ngo 1.22\n\nrequire github.com/oldsheeep3/comatype/packages/go v0.0.0\n\nreplace github.com/oldsheeep3/comatype/packages/go => %s/packages/go\n' "$root" > "$tmp/$d/go.mod"
done
cp "$root/scripts/go-e2e/server.go.txt" "$tmp/go_server/main.go"
cp "$root/scripts/go-e2e/client.go.txt" "$tmp/go_client/main.go"
for d in go_server go_client; do
  (cd "$tmp/$d" && test -z "$(gofmt -l comatype)" && go vet ./... && go build -o "$tmp/$d.bin" .)
done
"$tmp/go_server.bin" > "$tmp/server.out" &
pid=$!
for _ in $(seq 50); do grep -q '^PORT=' "$tmp/server.out" 2>/dev/null && break; sleep 0.1; done
port="$(sed -n 's/^PORT=//p' "$tmp/server.out")"
COMATYPE_BASE_URL="http://127.0.0.1:$port" "$tmp/go_client.bin"
