#!/usr/bin/env bash
# Generate Ruby from usage/ and run the E2E that connects the generated client to the generated server (Ruby 3.1 or later required)
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
for d in /opt/homebrew/opt/ruby/bin /usr/local/opt/ruby/bin; do [ -x "$d/ruby" ] && export PATH="$d:$PATH" && break; done
ruby -e 'exit(RUBY_VERSION >= "3.1" ? 0 : 1)' || { echo "Ruby 3.1 以上が必要です（brew install ruby）" >&2; exit 1; }
tmp="$(mktemp -d)"
pid=""
trap '[ -n "$pid" ] && kill "$pid" 2>/dev/null || true; rm -rf "$tmp"' EXIT
rsync -a --exclude node_modules --exclude .venv "$root/usage/" "$tmp/"
cargo run -q -p comatype-cli --manifest-path "$root/Cargo.toml" -- generate --config "$tmp" --lang ruby 2>&1 | grep -v '\[warn\]' || true
cp "$root/scripts/ruby-e2e/server.rb.txt" "$tmp/ruby_server/main.rb"
cp "$root/scripts/ruby-e2e/client.rb.txt" "$tmp/ruby_client/main.rb"
ruby -I "$root/packages/ruby/lib" "$tmp/ruby_server/main.rb" > "$tmp/server.out" &
pid=$!
for _ in $(seq 100); do grep -q '^PORT=' "$tmp/server.out" 2>/dev/null && break; sleep 0.1; done
port="$(sed -n 's/^PORT=//p' "$tmp/server.out")"
COMATYPE_BASE_URL="http://127.0.0.1:$port" ruby -I "$root/packages/ruby/lib" "$tmp/ruby_client/main.rb"
