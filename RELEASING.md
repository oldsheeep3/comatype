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
| Maven Central | `net.sheeplab.comatype:comatype`, `net.sheeplab.comatype:comatype-ktx` | secrets `MAVEN_CENTRAL_USERNAME`, `MAVEN_CENTRAL_PASSWORD` (Central Portal user token), `SIGNING_KEY`, `SIGNING_KEY_PASSWORD` (ASCII-armored GPG key); the namespace `net.sheeplab` must be verified in the Central Portal (it is, via a DNS TXT record managed in cloudflare-iac) |

## Turning it on

The release workflow does nothing until the repository variable `RELEASE_ENABLED` is `true`:

```bash
gh variable set RELEASE_ENABLED --body true
```

Set it after the secrets above are in place (`gh secret set NPM_TOKEN`, ...).
