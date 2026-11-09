# Contributing

Thanks for helping with Comatype.

## Branches

| Branch | Role |
|---|---|
| `main` | The release. Merging `develop` (or `hotfix`) into it publishes the packages |
| `develop` | The next version. Open pull requests against it |
| `hotfix` | Urgent patches for the released version |

Work on a branch such as `feat/…`, `fix/…`, `docs/…` or `chore/…` cut from `develop`, and open a pull request into `develop`. `main` and `develop` accept pull requests only, and a code owner must approve.

## Before you open a pull request

```bash
pnpm install
cargo test
pnpm lint            # formatters and linters (a pre-commit hook fixes staged files for you)
pnpm --dir docs check
./scripts/e2e-client.sh   # and the e2e script of each language you touched
```

- Do not edit generated code. Change the generator and regenerate.
- A change to the `.comat` language touches the parser and checker, every generator and runtime, the VS Code extension, the docs (`docs/content/en` and `docs/content/ja-jp`), `SPEC.md` and `usage/`.
- Write code comments, commit messages and docs in English. Japanese lives in `docs/content/ja-jp`, the Japanese UI strings and the CLI messages that already are Japanese.
- Commit messages follow Conventional Commits (`feat:`, `fix:`, `docs:`, `chore:`, `ci:`, `test:`).

## Releases

A release is a pull request from `develop` to `main` that bumps `VERSION`. See [RELEASING.md](RELEASING.md).

## Security

Report vulnerabilities privately; see [SECURITY.md](SECURITY.md).
