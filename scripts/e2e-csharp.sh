#!/usr/bin/env bash
# Generate C# from usage/, build it, and run the E2E that connects the generated client to the generated server
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
export DOTNET_NOLOGO=1 DOTNET_CLI_TELEMETRY_OPTOUT=1 DOTNET_GENERATE_ASPNET_CERTIFICATE=false
if ! command -v dotnet >/dev/null 2>&1 && [ -x "$HOME/.dotnet/dotnet" ]; then export PATH="$HOME/.dotnet:$PATH"; fi
command -v dotnet >/dev/null 2>&1 || { echo ".NET SDK 8 or later is needed (https://dotnet.microsoft.com/download)" >&2; exit 1; }
tmp="$(mktemp -d)"
pid=""
trap '[ -n "$pid" ] && kill "$pid" 2>/dev/null || true; rm -rf "$tmp"' EXIT
rsync -a --exclude node_modules --exclude .venv "$root/usage/" "$tmp/"
cargo run -q -p comatype-cli --manifest-path "$root/Cargo.toml" -- generate --config "$tmp" --lang csharp 2>&1 | grep -v '\[warn\]' || true
for d in server client; do
  p="$tmp/pkg_$d"
  mkdir -p "$p"
  cp -R "$tmp/csharp_$d/ComatypeGen" "$p/ComatypeGen"
  if [ "$d" = server ]; then src=Server; else src=Client; fi
  cp "$root/scripts/csharp-e2e/$src.cs.txt" "$p/Program.cs"
  cat > "$p/e2e_$d.csproj" <<PKG
<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <OutputType>Exe</OutputType>
    <TargetFramework>net8.0</TargetFramework>
    <Nullable>enable</Nullable>
    <ImplicitUsings>enable</ImplicitUsings>
    <TreatWarningsAsErrors>true</TreatWarningsAsErrors>
  </PropertyGroup>
  <ItemGroup>
    <ProjectReference Include="$root/packages/csharp/Comatype.csproj" />
  </ItemGroup>
</Project>
PKG
  (cd "$p" && dotnet build -c Release -o "$tmp/out_$d" -nologo -v q 2>&1 | grep -E "error|warning" | sort -u || true)
done
dotnet "$tmp/out_server/e2e_server.dll" > "$tmp/server.out" &
pid=$!
for _ in $(seq 100); do grep -q '^PORT=' "$tmp/server.out" 2>/dev/null && break; sleep 0.1; done
port="$(sed -n 's/^PORT=//p' "$tmp/server.out")"
COMATYPE_BASE_URL="http://127.0.0.1:$port" dotnet "$tmp/out_client/e2e_client.dll"
