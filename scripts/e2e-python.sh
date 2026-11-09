#!/usr/bin/env bash
# Generate Python from usage/, then run mypy (strict) and the E2E that connects the generated client to the generated server
# Requires: the root .venv (uv venv --python 3.12 .venv && uv pip install --python .venv/bin/python pydantic httpx mypy pytest pytest-asyncio uvicorn)
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
py="$root/.venv/bin/python"
[ -x "$py" ] || { echo "$root/.venv がありません（上のコメントの手順で作ってください）" >&2; exit 1; }
tmp="$(mktemp -d)"
pid=""
trap '[ -n "$pid" ] && kill "$pid" 2>/dev/null || true; rm -rf "$tmp"' EXIT
rsync -a --exclude node_modules --exclude .venv "$root/usage/" "$tmp/"
cargo run -q -p comatype-cli --manifest-path "$root/Cargo.toml" -- generate --config "$tmp" --lang python 2>&1 | grep -v '\[warn\]' || true
for d in python_server python_client; do
  # Drop the sample .py files (they use undefined functions) and replace them with the E2E main.py
  (cd "$tmp/$d" && find . -maxdepth 1 -name '*.py' -delete && rm -rf wrappers)
done
cp "$root/scripts/py-e2e/server.py.txt" "$tmp/python_server/main.py"
cp "$root/scripts/py-e2e/client.py.txt" "$tmp/python_client/main.py"
cp "$root/scripts/py-e2e/typecheck_server.py.txt" "$tmp/python_server/typecheck.py"
cp "$root/scripts/py-e2e/typecheck_client.py.txt" "$tmp/python_client/typecheck.py"
cat > "$tmp/mypy.ini" <<INI
[mypy]
strict = True
plugins = pydantic.mypy
mypy_path = $root/packages/python
explicit_package_bases = True

[pydantic-mypy]
init_typed = True
init_forbid_extra = True
INI
for d in python_server python_client; do
  (cd "$tmp/$d" && "$root/.venv/bin/mypy" --config-file "$tmp/mypy.ini" main.py typecheck.py comatype_gen)
done
(cd "$tmp/python_server" && PYTHONPATH="$root/packages/python:$tmp/python_server" "$py" main.py > "$tmp/server.out" 2> "$tmp/server.err") &
pid=$!
for _ in $(seq 100); do grep -q '^PORT=' "$tmp/server.out" 2>/dev/null && break; sleep 0.1; done
port="$(sed -n 's/^PORT=//p' "$tmp/server.out")"
[ -n "$port" ] || { cat "$tmp/server.err" >&2; exit 1; }
(cd "$tmp/python_client" && COMATYPE_BASE_URL="http://127.0.0.1:$port" PYTHONPATH="$root/packages/python:$tmp/python_client" "$py" main.py) || { cat "$tmp/server.err" >&2; exit 1; }
