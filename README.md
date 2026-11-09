# Comatype

`.comat` ファイルで API の型を 1 回だけ書き、各言語の型・検証・クライアント・サーバのコードを生成する。仕様は [SPEC.md](SPEC.md)、使い方の見本は [usage/](usage/)。

## 仕様書

[docs/](docs/)（Next.js（静的エクスポート）+ React + TypeScript。`pnpm --dir docs build` で `docs/out/` に静的サイトができる。コードのエディタは Monaco で、`.comat` の文法は VS Code 拡張と同じもの）。

```bash
pnpm install
pnpm --dir docs dev      # http://localhost:5173
pnpm --dir docs build
pnpm --dir docs test     # コードブロックの構文解析、<<< のファイル、quickstart の型検査
```

## 対応言語とテスト

TypeScript / Go / Python / Rust / Java / Kotlin / Swift / Ruby（それぞれ client と server）。生成した client を生成した server に繋ぐ E2E がある。

```bash
cargo test
./scripts/e2e-client.sh   # TypeScript
./scripts/e2e-go.sh
./scripts/e2e-python.sh   # 要 .venv
./scripts/e2e-rust.sh
./scripts/e2e-java.sh     # 要 JDK 21 以上
./scripts/e2e-kotlin.sh   # 要 JDK と kotlinc
./scripts/e2e-swift.sh    # 要 Swift 5.9 以上
./scripts/e2e-ruby.sh     # 要 Ruby 3.1 以上
(cd packages/swift && swift run comatype-selftest)   # Swift のランタイムの単体テスト
```
