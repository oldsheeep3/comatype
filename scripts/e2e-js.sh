#!/usr/bin/env bash
# Generate JavaScript from usage/ and run the generated client against a real HTTP server and against the generated server (Node 20 or later)
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
pnpm --dir "$root/packages/javascript" build >/dev/null
rsync -a --exclude node_modules --exclude .venv "$root/usage/" "$tmp/"
cargo run -q -p comatype-cli --manifest-path "$root/Cargo.toml" -- generate --config "$tmp" --lang js 2>&1 | grep -v '\[warn\]' || true
d="$tmp/js_client"
mkdir -p "$d/node_modules/@comatype"
ln -s "$root/packages/javascript" "$d/node_modules/@comatype/javascript"
echo '{"type":"module"}' > "$d/package.json"
cp "$root/scripts/js-e2e/client.mjs" "$root/scripts/js-e2e/full.mjs" "$d/"
# The declarations must be valid and match the values: check them with the TypeScript compiler (a type-only check of the .d.ts files)
cat > "$d/tsconfig.json" <<JSON
{ "compilerOptions": { "target": "ES2022", "module": "ESNext", "moduleResolution": "Bundler", "strict": true, "noEmit": true, "skipLibCheck": false, "lib": ["ES2022", "DOM"], "types": ["node"], "typeRoots": ["$root/node_modules/@types"] }, "include": ["comatype/**/*.d.ts"] }
JSON
"$root/node_modules/.bin/tsc" -p "$d"
cd "$d"
for f in client full; do node "$f.mjs"; done
