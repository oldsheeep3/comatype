# Comatype

[English](README.md) | 日本語

API を `.comat` ファイルに 1 回だけ書くと、8 言語の型・検証・クライアント・サーバのコードが生成されます。

```comat
// comatfiles/user/[id]/put.comat  →  PUT /user/:id
import UserData from ../../../types/UserData.comat

params {
    id: uuidv4,
}

body UserData

s200 UserData
s404 ApiError
```

言語・CLI・生成コードの仕様は [SPEC.md](SPEC.md)、動く見本のプロジェクトは [usage/](usage/) にあります。

## 対応言語

TypeScript / Go / Python / Rust / Java / Kotlin / Swift / Ruby（それぞれ client と server）。生成した client を、生成した server に繋ぐ E2E を、全言語でテストしています。

| 言語 | ランタイムのパッケージ | 状態 |
|---|---|---|
| TypeScript | `@comatype/typescript`（npm） | リリースの仕組みは用意済み。未公開 |
| Go | `github.com/oldsheeep3/comatype/packages/go` | リリースの仕組みは用意済み。未公開 |
| Python | `comatype`（PyPI） | リリースの仕組みは用意済み。未公開 |
| Rust | `comatype`（crates.io） | リリースの仕組みは用意済み。未公開 |
| Java / Kotlin | `net.sheeplab.comatype:comatype`、`:comatype-ktx`（Maven Central） | リリースの仕組みは用意済み。未公開 |
| Ruby | `comatype`（RubyGems） | リリースの仕組みは用意済み。未公開 |
| Swift | `packages/swift` | このリポジトリ内のみ |

## コマンドライン

```bash
cargo build -p comatype-cli       # `comatype`（短い別名は `comat`）をビルド

comatype check                    # 全 .comat を検査
comatype generate                 # comatype.config.json の targets にコードを生成
comatype endpoints -g             # エンドポイントを、wrap の組み合わせごとに列挙
comatype format comatfiles --fix  # ファイル名を、推奨の配置に直す
comatype to-openapi -o openapi.yml
```

設定ファイルは `comatype.config.json` で、JSON Schema は [schema/comatype.config.schema.json](schema/comatype.config.schema.json) です（VS Code 拡張は自動で適用します）。

## リポジトリの構成

| パス | 内容 |
|---|---|
| `crates/` | パーサ・検査・ジェネレータ・OpenAPI 変換・言語サーバ・CLI（Rust） |
| `packages/` | 生成コードが依存するランタイム（`c` クライアント / `s` サーバ） |
| `editors/vscode/` | VS Code 拡張（色分け・診断・定義へ移動・補完） |
| `docs/` | Web サイト（Next.js の静的エクスポート。英語が `/`、日本語が `/ja-jp/`） |
| `usage/` | 全言語の生成コードつきの見本プロジェクト |
| `scripts/` | 生成物の検査と E2E のスクリプト |

## 開発

```bash
cargo test
pnpm install
pnpm --dir docs dev               # http://localhost:5173
pnpm --dir docs check             # 型検査・ビルド・テスト

./scripts/e2e-client.sh           # TypeScript
./scripts/e2e-go.sh
./scripts/e2e-python.sh           # ルートの .venv が必要
./scripts/e2e-rust.sh
./scripts/e2e-java.sh             # JDK 21 以上が必要
./scripts/e2e-kotlin.sh           # JDK と kotlinc が必要
./scripts/e2e-swift.sh            # Swift 5.9 以上が必要
./scripts/e2e-ruby.sh             # Ruby 3.1 以上が必要
```

ブランチは、`main` がリリース、`develop` が次の版、`hotfix` が緊急パッチ用です。リリースの手順は [RELEASING.md](RELEASING.md) にあります。

## ライセンス

[MIT](LICENSE)
