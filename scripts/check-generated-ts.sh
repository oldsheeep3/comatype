#!/usr/bin/env bash
# Generate TS from usage/, type-check it, and verify that the types work (scripts/usage_check.ts)
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
rsync -a --exclude node_modules --exclude .venv "$root/usage/" "$tmp/"
cargo run -q -p comatype-cli --manifest-path "$root/Cargo.toml" -- generate --config "$tmp" --lang ts 2>&1 | grep -v '\[warn\]' || true
cp "$root/scripts/usage_check.ts" "$tmp/usage_check.ts"
cat > "$tmp/tsconfig.json" <<JSON
{
  "compilerOptions": {
    "target": "ES2022", "module": "ESNext", "moduleResolution": "Bundler",
    "strict": true, "noEmit": true, "skipLibCheck": true, "noUnusedLocals": true,
    "lib": ["ES2022", "DOM", "DOM.Iterable"], "types": [], "allowImportingTsExtensions": true,
    "baseUrl": ".", "paths": { "@comatype/typescript": ["$root/packages/typescript/src/index.ts"], "@comatype/typescript/node": ["$root/packages/typescript/src/node.ts"] }
  },
  "include": ["node_client/comatype", "node_server/comatype", "usage_check.ts"]
}
JSON
"$root/node_modules/.bin/tsc" -p "$tmp"
echo "生成物の型検査: OK"
