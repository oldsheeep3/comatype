#!/usr/bin/env bash
# Generate TS from usage/ and run the generated client against a real HTTP server
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
rsync -a --exclude node_modules --exclude .venv "$root/usage/" "$tmp/"
cargo run -q -p comatype-cli --manifest-path "$root/Cargo.toml" -- generate --config "$tmp" --lang ts 2>&1 | grep -v '\[warn\]' || true
cp "$root/scripts/e2e_client.ts" "$root/scripts/e2e_full.ts" "$tmp/"
echo '{"type":"module"}' > "$tmp/package.json"
cat > "$tmp/tsconfig.json" <<JSON
{
  "compilerOptions": {
    "target": "ES2022", "module": "ESNext", "moduleResolution": "Bundler", "strict": true,
    "lib": ["ES2022", "DOM", "DOM.Iterable"], "allowImportingTsExtensions": true,
    "baseUrl": ".", "paths": { "@comatype/typescript": ["$root/packages/typescript/src/index.ts"], "@comatype/typescript/node": ["$root/packages/typescript/src/node.ts"] }
  },
  "include": ["node_client/comatype", "e2e_client.ts", "e2e_full.ts"]
}
JSON
"$root/node_modules/.bin/tsc" --noEmit -p "$tmp" --types node --typeRoots "$root/node_modules/@types" --skipLibCheck
cd "$tmp"
for f in e2e_client e2e_full; do "$root/node_modules/.bin/tsx" --tsconfig "$tmp/tsconfig.json" $f.ts; done
