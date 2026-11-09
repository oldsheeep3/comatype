#!/usr/bin/env bash
# Unit tests of the C# runtime
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
export DOTNET_NOLOGO=1 DOTNET_CLI_TELEMETRY_OPTOUT=1 DOTNET_GENERATE_ASPNET_CERTIFICATE=false
if ! command -v dotnet >/dev/null 2>&1 && [ -x "$HOME/.dotnet/dotnet" ]; then export PATH="$HOME/.dotnet:$PATH"; fi
command -v dotnet >/dev/null 2>&1 || { echo ".NET SDK 8 or later is needed (https://dotnet.microsoft.com/download)" >&2; exit 1; }
dotnet run --project "$root/packages/csharp/tests/SelfTest" -c Release
