<h1 align="center">
<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/oldsheeep3/comatype/main/assets/logo/logo-horizontal-dark.svg">
  <img alt="Comatype" src="https://raw.githubusercontent.com/oldsheeep3/comatype/main/assets/logo/logo-horizontal.svg" height="72">
</picture>
</h1>

[English](README.md) | 日本語

> [!NOTE]
> Comatype は現在 **ベータ版**（0.0.x）です。言語・CLI・生成コードは、互換性のない形で変わることがあります。

累計ダウンロード数:

[![npm](https://img.shields.io/npm/dt/@comatype/typescript?label=npm&logo=npm)](https://www.npmjs.com/package/@comatype/typescript)
[![PyPI](https://static.pepy.tech/badge/comatype?label=PyPI)](https://pepy.tech/project/comatype)
[![crates.io](https://img.shields.io/crates/d/comatype?label=crates.io&logo=rust)](https://crates.io/crates/comatype)
[![RubyGems](https://img.shields.io/gem/dt/comatype?label=RubyGems&logo=rubygems&logoColor=white)](https://rubygems.org/gems/comatype)

月間ダウンロード数（crates.io と RubyGems は月間の数を公開していません）:

[![npm](https://img.shields.io/npm/dm/@comatype/typescript?label=npm&logo=npm)](https://www.npmjs.com/package/@comatype/typescript)
[![PyPI](https://img.shields.io/pypi/dm/comatype?label=PyPI&logo=pypi&logoColor=white)](https://pypi.org/project/comatype/)

API を `.comat` ファイルに 1 回だけ書くと、9 言語の型・検証・クライアント・サーバのコードが生成されます。

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

![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white) ![Go](https://img.shields.io/badge/Go-00ADD8?logo=go&logoColor=white) ![Python](https://img.shields.io/badge/Python-3776AB?logo=python&logoColor=white) ![Rust](https://img.shields.io/badge/Rust-000000?logo=rust&logoColor=white) ![Java](https://img.shields.io/badge/Java-ED8B00?logo=openjdk&logoColor=white) ![Kotlin](https://img.shields.io/badge/Kotlin-7F52FF?logo=kotlin&logoColor=white) ![Ruby](https://img.shields.io/badge/Ruby-CC342D?logo=ruby&logoColor=white) ![Swift](https://img.shields.io/badge/Swift-F05138?logo=swift&logoColor=white) ![C#](https://img.shields.io/badge/C%23-512BD4?logo=dotnet&logoColor=white) ![Dart: planned](https://img.shields.io/badge/Dart-planned-lightgrey?logo=dart&logoColor=white)

TypeScript / Go / Python / Rust / Java / Kotlin / Swift / Ruby / C#（それぞれ client と server。Dart は予定）。生成した client を、生成した server に繋ぐ E2E を、全言語でテストしています。

| 言語 | ランタイムのパッケージ | 状態 |
|---|---|---|
| TypeScript | `@comatype/typescript`（npm） | 公開済み（各パッケージの README を参照） |
| Go | [`github.com/oldsheeep3/comatype/packages/go`](https://pkg.go.dev/github.com/oldsheeep3/comatype/packages/go) | 公開済み（各パッケージの README を参照） |
| Python | `comatype`（PyPI） | 公開済み（各パッケージの README を参照） |
| Rust | `comatype`（crates.io） | 公開済み（各パッケージの README を参照） |
| Java / Kotlin | [`net.sheeplab.comatype:comatype`](https://central.sonatype.com/artifact/net.sheeplab.comatype/comatype)、[`:comatype-ktx`](https://central.sonatype.com/artifact/net.sheeplab.comatype/comatype-ktx)（Maven Central） | 公開済み（各パッケージの README を参照） |
| Ruby | `comatype`（RubyGems） | 公開済み（各パッケージの README を参照） |
| Swift | [`packages/swift`](packages/swift) | このリポジトリ内のみ |
| C# | [`Comatype`](https://www.nuget.org/packages/Comatype)（NuGet） | 未公開（各パッケージの README を参照） |
| VS Code 拡張 | `comatype.comatype`（VS Code Marketplace、Open VSX） | リリースの準備は完了、未公開 |

## コマンドライン

```bash
# ビルド済みのバイナリを入れる（macOS・Linux。Windows はリリースページの zip）
curl -fsSL https://raw.githubusercontent.com/oldsheeep3/comatype/main/install.sh | sh
# ソースからビルドする場合:  cargo install --git https://github.com/oldsheeep3/comatype comatype-cli

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
./scripts/e2e-csharp.sh           # .NET 8 以上が必要
```

ブランチは、`main` がリリース、`develop` が次の版、`hotfix` が緊急パッチ用です。リリースの手順は [RELEASING.md](RELEASING.md) にあります。

## ライセンス

[MIT](LICENSE)
