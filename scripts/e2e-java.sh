#!/usr/bin/env bash
# Generate Java from usage/, compile it, and run the E2E that connects the generated client to the generated server
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
. "$root/scripts/jvm-env.sh"
tmp="$(mktemp -d)"
pid=""
trap '[ -n "$pid" ] && kill "$pid" 2>/dev/null || true; rm -rf "$tmp"' EXIT
rsync -a --exclude node_modules --exclude .venv "$root/usage/" "$tmp/"
cargo run -q -p comatype-cli --manifest-path "$root/Cargo.toml" -- generate --config "$tmp" --lang java 2>&1 | grep -v '\[warn\]' || true
runtime="$(find "$root/packages/java/src/main" -name '*.java')"
# Do not include the sample .java files (they use undefined functions); compile only the generated code and the E2E main
mkdir -p "$tmp/out_server" "$tmp/out_client" "$tmp/src_server" "$tmp/src_client"
cp "$root/scripts/java-e2e/Server.java.txt" "$tmp/src_server/Server.java"
cp "$root/scripts/java-e2e/Client.java.txt" "$tmp/src_client/Client.java"
# shellcheck disable=SC2086
javac -Xlint:all -Xlint:-serial -d "$tmp/out_server" $runtime $(find "$tmp/java_server/src/main/java/comatype/gen" -name '*.java') "$tmp/src_server/Server.java"
# shellcheck disable=SC2086
javac -Xlint:all -Xlint:-serial -d "$tmp/out_client" $runtime $(find "$tmp/java_client/src/main/java/comatype/gen" -name '*.java') "$tmp/src_client/Client.java"
java -cp "$tmp/out_server" Server > "$tmp/server.out" &
pid=$!
for _ in $(seq 100); do grep -q '^PORT=' "$tmp/server.out" 2>/dev/null && break; sleep 0.1; done
port="$(sed -n 's/^PORT=//p' "$tmp/server.out")"
COMATYPE_BASE_URL="http://127.0.0.1:$port" java -cp "$tmp/out_client" Client
