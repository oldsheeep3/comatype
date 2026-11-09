#!/usr/bin/env bash
# Builds a .vsix of the VS Code extension.
#   scripts/package-vsix.sh <vscode-target> <comatype-binary>   platform build with the binary bundled in bin/
#   scripts/package-vsix.sh universal                           no binary: the extension uses `comatype` from PATH
# <vscode-target>: linux-x64, linux-arm64, darwin-x64, darwin-arm64, win32-x64 (what `vsce package --target` accepts).
# The result is editors/vscode/comatype-<target>-<version>.vsix (comatype-<version>.vsix for universal).
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
target="${1:?usage: package-vsix.sh <vscode-target> <comatype-binary> | universal}"
ext="$root/editors/vscode"
rm -rf "$ext/bin"
trap 'rm -rf "$ext/bin"' EXIT
if [ "$target" = universal ]; then
  args=()
else
  bin="${2:?missing the path of the comatype binary for $target}"
  [ -f "$bin" ] || { echo "binary not found: $bin" >&2; exit 1; }
  mkdir -p "$ext/bin"
  name=comatype
  [[ "$target" == win32-* ]] && name=comatype.exe
  cp "$bin" "$ext/bin/$name"
  chmod +x "$ext/bin/$name"
  args=(--target "$target")
fi
cd "$ext"
pnpm exec vsce package --no-dependencies ${args[@]+"${args[@]}"}
