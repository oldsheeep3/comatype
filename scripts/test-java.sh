#!/usr/bin/env bash
# Unit tests of the Java runtime
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
. "$root/scripts/jvm-env.sh"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
# shellcheck disable=SC2046
javac -d "$tmp" $(find "$root/packages/java/src" -name '*.java')
java -cp "$tmp" comatype.ComatypeTest
