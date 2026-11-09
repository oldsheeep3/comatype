## What and why

<!-- What does this change, and why? Link the issue: Closes #123 -->

## Area

- [ ] Language / parser / checker (`crates/comatype-core`)
- [ ] Generator (`crates/comatype-gen-*`)
- [ ] Runtime (`packages/*`)
- [ ] CLI / language server / OpenAPI
- [ ] VS Code extension
- [ ] Website / docs
- [ ] CI / release

## Checklist

- [ ] Tests added or updated, and they pass (`cargo test`, the e2e script of each language I touched)
- [ ] A change to the language also updates every generator, runtime, the docs (English and Japanese) and `usage/`
- [ ] Lint and format pass (`pnpm lint`, `cargo fmt`, `cargo clippy`)
- [ ] Generated code was regenerated, not edited by hand
- [ ] `VERSION` is bumped only in a release PR (`develop` → `main`)
