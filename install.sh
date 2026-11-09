#!/bin/sh
# Installs the comatype CLI (and its short alias `comat`) from a GitHub release. No Rust toolchain needed.
#
#   curl -fsSL https://raw.githubusercontent.com/oldsheeep3/comatype/main/install.sh | sh
#   curl -fsSL https://raw.githubusercontent.com/oldsheeep3/comatype/main/install.sh | sh -s -- v0.0.3   # a version
#
# COMATYPE_INSTALL_DIR  where to put the binaries (default: ~/.local/bin)
# COMATYPE_RELEASE_BASE override the download base URL (for mirrors and tests)
# Windows: download comatype-x86_64-pc-windows-msvc.zip from the release page and unzip it.
set -eu

repo="oldsheeep3/comatype"
version="${1:-latest}"
dir="${COMATYPE_INSTALL_DIR:-$HOME/.local/bin}"

case "$(uname -s)-$(uname -m)" in
  Linux-x86_64) target="x86_64-unknown-linux-musl" ;;
  Linux-aarch64 | Linux-arm64) target="aarch64-unknown-linux-musl" ;;
  Darwin-x86_64) target="x86_64-apple-darwin" ;;
  Darwin-arm64) target="aarch64-apple-darwin" ;;
  *)
    echo "comatype: no prebuilt binary for $(uname -s) $(uname -m). Build it with: cargo install --git https://github.com/$repo comatype-cli" >&2
    exit 1
    ;;
esac

archive="comatype-$target.tar.gz"
if [ -n "${COMATYPE_RELEASE_BASE:-}" ]; then
  base="$COMATYPE_RELEASE_BASE"
elif [ "$version" = "latest" ]; then
  base="https://github.com/$repo/releases/latest/download"
else
  base="https://github.com/$repo/releases/download/$version"
fi

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

echo "Downloading $archive ($version)"
curl -fsSL "$base/$archive" -o "$tmp/$archive"
curl -fsSL "$base/SHA256SUMS" -o "$tmp/SHA256SUMS"

expected="$(grep " $archive\$" "$tmp/SHA256SUMS" | cut -d' ' -f1)"
if command -v sha256sum >/dev/null 2>&1; then
  actual="$(sha256sum "$tmp/$archive" | cut -d' ' -f1)"
else
  actual="$(shasum -a 256 "$tmp/$archive" | cut -d' ' -f1)"
fi
if [ -z "$expected" ] || [ "$expected" != "$actual" ]; then
  echo "comatype: checksum mismatch for $archive" >&2
  exit 1
fi

tar -xzf "$tmp/$archive" -C "$tmp"
mkdir -p "$dir"
install -m 755 "$tmp/comatype" "$tmp/comat" "$dir/"
echo "Installed comatype and comat to $dir"

case ":$PATH:" in
  *":$dir:"*) ;;
  *) echo "Add $dir to your PATH:  export PATH=\"$dir:\$PATH\"" ;;
esac
"$dir/comatype" help | head -1
