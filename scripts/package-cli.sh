#!/usr/bin/env bash
# Packages a built CLI for a release: dist/comatype-<target>.tar.gz (dist/....zip on Windows) with comatype, comat and
# LICENSE, plus dist/comatype-bin-<vscode-target>[.exe], the raw binary that the VS Code platform builds bundle.
#   scripts/package-cli.sh <rust-target> <vscode-target>
# Run `cargo build --release -p comatype-cli --target <rust-target>` first. Used by the Release workflow and by CI.
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
target="${1:?usage: package-cli.sh <rust-target> <vscode-target>}"
vscode="${2:?usage: package-cli.sh <rust-target> <vscode-target>}"
out="$root/target/$target/release"
ext=""
[[ "$target" == *windows* ]] && ext=".exe"
rm -rf "$root/dist"
mkdir -p "$root/dist/stage"
cp "$out/comatype$ext" "$root/dist/stage/comatype$ext"
cp "$out/comat$ext" "$root/dist/stage/comat$ext"
cp "$root/LICENSE" "$root/dist/stage/"
archive="comatype-$target"
if [ -n "$ext" ]; then
  (cd "$root/dist/stage" && 7z a -tzip "../$archive.zip" . >/dev/null)
else
  tar -C "$root/dist/stage" -czf "$root/dist/$archive.tar.gz" .
fi
cp "$out/comatype$ext" "$root/dist/comatype-bin-$vscode$ext"
rm -rf "$root/dist/stage"
ls -la "$root/dist"
