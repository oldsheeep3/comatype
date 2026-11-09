# Comatype — VS Code 拡張

`.comat` ファイルのための拡張。

| 機能                   | 内容                                                                                                                                                                                                                                                                       |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 診断（リアルタイム）   | 入力のたびに、構文エラーを出す。未登録のステータスコード（`s499`）もエラー。保存前の内容で、プロジェクト全体を検査する（型が見つからない、path と params が合わない、ルートの重複、など）。別のファイルを直すと、そのファイルを使っているファイルの診断も更新される        |
| 定義ジャンプ           | 型の参照（`User`、`...User`、`s200 User`、`body User`）→ 宣言。`import` の名前 → 宣言、`import` のパス → ファイル。`wrap auth` → `init.comat` の `wrapper`                                                                                                                 |
| ホバー                 | 型の宣言のソース、組み込みの型の説明（`int64` は通信上は文字列、など）、キーワード、ステータスコード                                                                                                                                                                       |
| アウトライン           | 型・enum・wrapper・`path`・`params`・`s200` などの一覧（Outline、`Cmd+Shift+O`）                                                                                                                                                                                           |
| 補完                   | 文頭ではキーワードとステータス、型の位置では組み込みの型・このファイルの型・import した型、`wrap` の後ではラッパー名、`cookie` の後では `on` / `off`                                                                                                                       |
| シンタックスハイライト | TextMate 文法（`source.comat`）。下の「スコープ」                                                                                                                                                                                                                          |
| スニペット             | `import` `type` `enum` `params` `search` `body` `bodyo` `sheaders` `path` `wrap` `wrapoff` `cookie` `header` `init` `wrapper`、および**全ステータスコード**（`s200` `s201` ... `s511` の 62 個。`s404` → `s404 { message: string, }`、本文を持てないコードは `s204 none`） |
| コマンド               | `Comatype: Generate`（`comatype generate`）、`Comatype: Export OpenAPI`（`.comat` → `openapi.yml`）、`Comatype: Import OpenAPI`（`openapi.yml` → `.comat`、続けてコード生成）、`Comatype: Show Status Codes`（一覧から選んで挿入）、`Comatype: Restart Language Server`    |
| 言語の設定             | `//` コメント、括弧の補完、インデント                                                                                                                                                                                                                                      |

診断・定義ジャンプ・ホバー・アウトライン・補完は、言語サーバ（`comatype lsp`）が提供する。構文エラーがあるあいだは、意味の検査の結果は出さない（入力の途中で、画面中が赤くならないように）。定義ジャンプなどは、構文エラーがあるファイルでも使える。

## 設定

| 設定                              | 既定       | 内容                                                                                                      |
| --------------------------------- | ---------- | --------------------------------------------------------------------------------------------------------- |
| `comatype.path`                   | `comatype` | `comatype` コマンドの場所（PATH に無いとき。例: `<リポジトリ>/target/debug/comatype`）                    |
| `comatype.config`                 | 空         | `comatype.config.json` の場所（ワークスペースからの相対）。空なら、開いているファイルから上に向かって探す |
| `comatype.languageServer.enabled` | `true`     | 言語サーバ（`comatype lsp`）を使う。オフなら、保存時に `comatype check` を実行する従来の方法              |
| `comatype.checkOnSave`            | `true`     | 言語サーバを使わないときだけ: 開いたとき・保存したときに `comatype check` を実行する                      |

## 入れ方

開発中の拡張として、フォルダごと VS Code の拡張フォルダに置く（リンクで足りる）。言語サーバとコマンドには、`comatype` コマンドが要る（`cargo build` で `target/debug/comatype`、または `comatype.path`）。

```bash
ln -s "$PWD/editors/vscode" ~/.vscode/extensions/comatype.comatype-vscode-0.0.1
```

VS Code を再読み込みすると、`.comat` が「Comatype」として開く。`.vsix` にするなら `npx @vscode/vsce package`。

## スコープ

| 対象                                                            | スコープ                                                                                  |
| --------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| コメント `//`                                                   | `comment.line.double-slash.comat`                                                         |
| `import` / `from`                                               | `keyword.control.import.comat` / `keyword.control.from.comat`                             |
| import・path の値                                               | `string.unquoted.path.comat`（`:id` は `variable.parameter.path.comat`）                  |
| `baseUrl` の値                                                  | `string.unquoted.url.comat`                                                               |
| `path` `wrap` `wrapper` `cookie` `baseUrl`                      | `keyword.other.*.comat`                                                                   |
| `params` `search` `header` `headerReq` `headerRes` `body` `ctx` | `keyword.other.block.comat`                                                               |
| `s200` など                                                     | `support.constant.status.comat`                                                           |
| `wrap auth` / `wrapper auth` の名前                             | `entity.name.function.wrapper.comat`                                                      |
| `on` `off`                                                      | `constant.language.switch.comat`                                                          |
| 型の宣言・参照・`enum`                                          | `entity.name.type.class.comat` / `entity.name.type.comat` / `entity.name.type.enum.comat` |
| enum の値                                                       | `variable.other.enummember.comat`                                                         |
| 組み込みの型（`string` `uuidv4` ...）                           | `support.type.builtin.comat`                                                              |
| `null` `none` `empty`                                           | `constant.language.comat`                                                                 |
| フィールド名（引用符つきも）                                    | `variable.other.property.comat`                                                           |
| `?` `\|` `...` `..` `[]`                                        | `keyword.operator.optional/union/spread/range.comat`、`storage.modifier.array.comat`      |
| 文字列・数値                                                    | `string.quoted.double.comat` など、`constant.numeric.integer.comat`                       |
| cookie の設定の値                                               | `constant.language.boolean.comat`、`constant.language.option.comat`                       |

`s200` や `body` のようなキーワードと同じ名前のフィールド（`body: string`）は、フィールドとして扱う。

## テスト

```bash
cd editors/vscode && pnpm install && pnpm test
```

- 文法: `vscode-textmate` + `vscode-oniguruma` で実際に適用し、期待するスコープと、`usage/` の全 `.comat` が「強調されない文字なし・不正なスコープなし」であることを確かめる。
- 拡張: `vscode` を差し替えた `activate`（言語サーバの起動と再起動、起動に失敗したとき、従来の方法）、実際の `comatype lsp` を子プロセスで起動して標準入出力で話す確認（診断 → 修正 → 定義ジャンプ → 終了コード）。
- 言語サーバ: `cargo test -p comatype-lsp`（メッセージを実際に流す 13 件）。実際の VS Code の中での動作は、手で確かめる（下の「確かめ方」）。

## 確かめ方（VS Code の中）

`editors/vscode` を VS Code で開いて `F5`（Extension Development Host）。開いたウィンドウで `usage/` を開き、`comatfiles/get_user.comat` を保存しなくても、入力するだけで診断が出る（例: `s200 {` と書くと、構文エラー）。`User` の上で `Cmd+クリック` すると、宣言に飛ぶ。
