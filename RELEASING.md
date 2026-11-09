# Releasing

Branches: `main` is the release, `develop` is the next version, `hotfix` is for urgent patches. Work lands in `develop`; a release is the merge of `develop` (or `hotfix`) into `main`.

## How a release happens

1. Bump `VERSION` (for example `0.1.0`) in the branch you are merging.
2. Merge it into `main`. The **Release** workflow (`.github/workflows/release.yml`) runs on that push:
   - runs the Rust tests, then creates the tags `vX.Y.Z` and `packages/go/vX.Y.Z` and a GitHub release;
   - publishes to every registry. A registry step is skipped if that version is already published, so the workflow can be re-run (Actions → Release → Run workflow).
3. `scripts/set-version.sh` stamps `VERSION` into the manifests at publish time, so the manifests in git do not have to change.

| Registry | Package | Needs |
|---|---|---|
| npm | `@comatype/typescript` | secret `NPM_TOKEN` (an automation token; the `@comatype` scope must exist on npm and be yours) |
| Go | `github.com/oldsheeep3/comatype/packages/go` | nothing: the tag `packages/go/vX.Y.Z` is the release |
| PyPI | `comatype` | PyPI trusted publishing for this repository, workflow `release.yml`, environment `pypi` |
| crates.io | `comatype` | secret `CARGO_REGISTRY_TOKEN` (the crate name must be free) |
| RubyGems | `comatype` | RubyGems trusted publishing for this repository, workflow `release.yml` (no secret needed) |
| NuGet | `Comatype` | secret `NUGET_API_KEY` (an API key that may push the package id `Comatype`; without it the step is skipped with a warning) |
| Maven Central | `net.sheeplab.comatype:comatype`, `net.sheeplab.comatype:comatype-ktx` | secrets `MAVEN_CENTRAL_USERNAME`, `MAVEN_CENTRAL_PASSWORD` (Central Portal user token), `SIGNING_KEY`, `SIGNING_KEY_PASSWORD` (ASCII-armored GPG key); the namespace `net.sheeplab` must be verified in the Central Portal (it is, via a DNS TXT record managed in cloudflare-iac) |
| VS Code Marketplace | `comatype.comatype` (`editors/vscode`) | secret `VSCE_PAT` (an Azure DevOps personal access token, see below); the publisher `comatype` must exist |
| Open VSX | `comatype.comatype` | secret `OVSX_PAT` (an Open VSX access token); the namespace `comatype` must exist |

## Turning it on

The release workflow does nothing until the repository variable `RELEASE_ENABLED` is `true`:

```bash
gh variable set RELEASE_ENABLED --body true
```

Set it after the secrets above are in place (`gh secret set NPM_TOKEN`, ...).

## VS Code extension

The `binaries` job builds the `comatype` CLI for five platforms (Linux x64 / arm64 as static musl binaries, macOS x64 / arm64, Windows x64) and the `cli-release` job attaches them to the GitHub release as `comatype-<target>.tar.gz` / `.zip` plus `SHA256SUMS`; `install.sh` downloads them. No Rust toolchain is needed to use the CLI.

The `vscode` job then builds `editors/vscode` into one `.vsix` per platform with the matching binary bundled in `bin/` (`comatype-<platform>-X.Y.Z.vsix`) and a universal `comatype-X.Y.Z.vsix` without a binary (the fallback for other platforms; it uses `comatype` from `PATH`). esbuild bundles the language client; `scripts/set-version.sh` stamps `VERSION` into `editors/vscode/package.json`. The files are attached to the GitHub release `vX.Y.Z` and published to the VS Code Marketplace and Open VSX. A registry whose secret is not set is skipped with a warning, so the rest of the release is never blocked; set the secret and re-run the workflow to publish later. Pre-release versions (`0.1.0-rc.1`) are not published because the Marketplace does not accept them. CI builds a universal and a `linux-x64` `.vsix` on every pull request (the `web` job) without publishing.

To build one locally: `cargo build --release -p comatype-cli && ./scripts/package-vsix.sh darwin-arm64 target/release/comatype` (or `./scripts/package-vsix.sh universal`).

### One-time setup: VS Code Marketplace

1. Sign in at <https://marketplace.visualstudio.com/manage> with a Microsoft account and create a publisher with the ID `comatype` (the ID must match `publisher` in `editors/vscode/package.json`).
2. Create an Azure DevOps organization at <https://dev.azure.com> if there is none (the PAT belongs to it).
3. In Azure DevOps open User settings → Personal access tokens → New Token: organization **All accessible organizations**, scope **Marketplace → Manage**, the longest expiry allowed (it has to be renewed when it expires).
4. Store the token: `gh secret set VSCE_PAT`.

### One-time setup: Open VSX

1. Sign in at <https://open-vsx.org> with GitHub and sign the Eclipse Foundation publisher agreement (profile page → Log in with Eclipse, then "Sign Publisher Agreement").
2. Create an access token at <https://open-vsx.org/user-settings/tokens> and store it: `gh secret set OVSX_PAT`.
3. Create the namespace once, with the token: `pnpm --dir editors/vscode exec ovsx create-namespace comatype --pat <token>`. To get the verified badge, claim ownership of the namespace as described at <https://github.com/EclipseFdn/open-vsx.org/wiki/Namespace-Access>.
