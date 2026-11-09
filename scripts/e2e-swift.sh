#!/usr/bin/env bash
# Generate Swift from usage/, build it, and run the E2E that connects the generated client to the generated server
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
tmp="$(mktemp -d)"
pid=""
trap '[ -n "$pid" ] && kill "$pid" 2>/dev/null || true; rm -rf "$tmp"' EXIT
rsync -a --exclude node_modules --exclude .venv "$root/usage/" "$tmp/"
cargo run -q -p comatype-cli --manifest-path "$root/Cargo.toml" -- generate --config "$tmp" --lang swift 2>&1 | grep -v '\[warn\]' || true
for d in server client; do
  p="$tmp/pkg_$d"
  mkdir -p "$p/Sources/ComatypeGen" "$p/Sources/main"
  cp "$tmp/swift_$d/Sources/ComatypeGen/"*.swift "$p/Sources/ComatypeGen/"
  cp "$root/scripts/swift-e2e/$d.swift.txt" "$p/Sources/main/main.swift"
  cat > "$p/Package.swift" <<PKG
// swift-tools-version: 5.9
import PackageDescription
let package = Package(
    name: "e2e_$d",
    platforms: [.macOS(.v12)],
    dependencies: [.package(path: "$root/packages/swift")],
    targets: [
        .target(name: "ComatypeGen", dependencies: [.product(name: "Comatype", package: "swift")]),
        .executableTarget(name: "e2e_$d", dependencies: ["ComatypeGen", .product(name: "Comatype", package: "swift")], path: "Sources/main"),
    ],
    swiftLanguageVersions: [.v5]
)
PKG
  (cd "$p" && swift build -q 2>&1 | grep -E "error" -A3 || true)
done
"$tmp/pkg_server/.build/debug/e2e_server" > "$tmp/server.out" &
pid=$!
for _ in $(seq 100); do grep -q '^PORT=' "$tmp/server.out" 2>/dev/null && break; sleep 0.1; done
port="$(sed -n 's/^PORT=//p' "$tmp/server.out")"
COMATYPE_BASE_URL="http://127.0.0.1:$port" "$tmp/pkg_client/.build/debug/e2e_client"
