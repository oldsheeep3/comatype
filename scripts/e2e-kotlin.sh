#!/usr/bin/env bash
# Generate Kotlin from usage/, compile it, and run the E2E that connects the generated client to the generated server
# (The runtimes are packages/java and packages/kotlin. kotlinc and a JDK are required)
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
. "$root/scripts/jvm-env.sh"
command -v kotlinc >/dev/null || { echo "kotlinc が見つかりません（brew install kotlin）" >&2; exit 1; }
tmp="$(mktemp -d)"
pid=""
trap '[ -n "$pid" ] && kill "$pid" 2>/dev/null || true; rm -rf "$tmp"' EXIT
rsync -a --exclude node_modules --exclude .venv "$root/usage/" "$tmp/"
cargo run -q -p comatype-cli --manifest-path "$root/Cargo.toml" -- generate --config "$tmp" --lang kotlin 2>&1 | grep -v '\[warn\]' || true
mkdir -p "$tmp/rt"
# shellcheck disable=SC2046
javac -d "$tmp/rt" $(find "$root/packages/java/src/main" -name '*.java')
for d in server client; do
  # Do not include the sample .kt files (they use undefined functions); compile only the generated code and the E2E main
  mkdir -p "$tmp/src_$d"
  cp "$root/scripts/kotlin-e2e/$(echo "${d:0:1}" | tr a-z A-Z)${d:1}.kt.txt" "$tmp/src_$d/Main.kt"
  kotlinc -nowarn -cp "$tmp/rt" -include-runtime -d "$tmp/$d.jar" "$tmp/kotlin_$d/src/main/kotlin/comatype/gen" "$root/packages/kotlin/src/main/kotlin" "$tmp/src_$d/Main.kt"
done
java -cp "$tmp/server.jar:$tmp/rt" MainKt > "$tmp/server.out" &
pid=$!
for _ in $(seq 100); do grep -q '^PORT=' "$tmp/server.out" 2>/dev/null && break; sleep 0.1; done
port="$(sed -n 's/^PORT=//p' "$tmp/server.out")"
COMATYPE_BASE_URL="http://127.0.0.1:$port" java -cp "$tmp/client.jar:$tmp/rt" MainKt
