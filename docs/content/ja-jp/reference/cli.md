# CLI（`comatype`）

`comat` は、同じプログラムの短い名前です（`comat endpoints` のように書けます）。

```text
comatype <コマンド> [オプション]
```

## コマンド

| コマンド | 内容 |
|---|---|
| `check [分野]` | `.comat` を検査する。エラーがあれば終了コード 1。`check cache` のように、分野で絞れる |
| `format [dir]` | ディレクトリ・ファイル名を、推奨の書き方に直す（既定は提案だけ。`--fix` で直す） |
| `endpoints` | エンドポイントを `GET /path` の形で列挙する（wrap ごとに色分け。`-a` で型なども、`-g` で wrap ごとに区切る） |
| `generate` | `targets` に従ってコードを生成する（ts / go / python / rust / java / kotlin / swift / ruby） |
| `ir` | 検査して IR（言語に依存しない JSON）を出力する |
| `parse <file>` | 1 ファイルを構文解析して AST（JSON）を出力する |
| `to-openapi` | `.comat` から OpenAPI 3（YAML / JSON）を作る |
| `from-openapi <file>` | OpenAPI から `.comat` と設定ファイルを作る |
| `statuses` | 使えるステータスコードの一覧 |
| `lsp` | 言語サーバ（LSP）を標準入出力で起動する（エディタ用） |
| `help` | ヘルプ |

## 共通のオプション

| オプション | 内容 |
|---|---|
| `--config <path>` | `comatype.config.json`（またはそれのあるディレクトリ）。既定は `./comatype.config.json` |
| `--service <名前>` | 対象の service。既定は全部 |

## `check`

```bash
comatype check
comatype check --config usage --service api
```

```text
[warn]  comatfiles/get_user.comat:5:1  an explicit path is deprecated (let the directory and file name decide it)
[info]  OK: 11 endpoint(s), 4 warning(s)
```

CLI のメッセージは英語です（ASCII のみ）。形式 `[error|warn|info] ファイル:行:桁  メッセージ` は、どの環境でも同じです。

- 設定ミスになりやすいところは、警告を出します: `cache` を書いたエンドポイントに `wrap` が効いている / どのエンドポイントでも使われていない `wrapper` / `cookie on` なのに init.comat に cookie の宣言が無い、など。
- 診断は `[error|warn|info] ファイル:行:桁  メッセージ`（ファイルは設定ファイルのあるディレクトリからの相対）。端末では、タグ（`[error]` は赤、`[warn]` は黄、`[info]` は水色）と、場所（太字・下線の水色）に色が付きます。`--color` で強制、`--no-color` と `NO_COLOR` で無効です。
- 検査するのは、構文、型の解決、`path` と `params` の突き合わせ、ルートの重複、`wrap` の宣言、ステータスコード、cookie の設定、ヘッダなど。

### 分野で絞る（`check <分野>`）

全体を検査して、その分野の診断だけを出します（エラーがあれば終了コード 1）。

```bash
comatype check cache     # cache（get / query だけ、defaults / init では無視、wrap との組み合わせ）
comatype check path      # path の導出・重複
comatype check wrap      # wrap と wrapper の宣言（使われていない wrapper など）
comatype check cookie    # cookie と init.comat の宣言
comatype check status    # ステータスコードと本文の型
comatype check import    # import（未使用など）
comatype check type      # 上のどれでもないもの（型・制約・ヘッダ）
comatype check all       # 全部（`check` と同じ）
```

分野は、診断のメッセージから決めます。絞った分野の外にエラーがあるときは、その件数を添えて知らせます。

## `endpoints`

設定されたエンドポイントを列挙します（`comatype check` でエラーが無いとき）。

```bash
comatype endpoints          # メソッドと path だけ
comatype endpoints -a       # メソッドに加えて、型（params / search / body / ヘッダ / レスポンス）、wrap、cookie、cache
comatype endpoints -g       # wrap ごとに区切る
comatype endpoints -g -a
```

```text
GET /ping
GET /user
POST /user
PUT /user/:id
POST /user/login
```

- **色分け**: 同じ wrap を共有する path が、同じ色になります（端末のときだけ。`--color` で強制、`--no-color` で無効、`NO_COLOR` も見ます）。最後の区間はそのエンドポイント自身の wrap の色、途中の区間は、その下にあるエンドポイントで最も多い wrap の色です。wrap が無いものは色なしです。色の意味は、末尾の `■ wrap: auth` の凡例で分かります。
- **`--group`（`-g`）**: wrap が**順番も含めて完全一致**するものごとに、`── wrap: auth > log ──` の区切りを付けます（`auth > log` と `log > auth` は別のグループ）。wrap なしのグループが先頭です。

## `format`

`path` の動的セグメントの書き方を、推奨（`[id]/get.comat`）に直します（[path の決め方](/language/paths)）。

```bash
comatype format comatfiles            # 直す内容を表示するだけ（suggest）。直すものがあれば、終了コード 1
comatype format comatfiles --fix      # 1 件ずつ確かめて、直す（[y]es / [n]o / [a]ll / [q]uit）
comatype format comatfiles --fix -y   # 確かめずに、全部直す
comatype format .                     # comatype.config.json のあるディレクトリなら、全 service の comatDir
```

```text
old/:uid/delete.comat  ->  old/[uid]/delete.comat
    directory name `:uid` is removed (-> `[uid]`)
user/put_[id].comat  ->  user/[id]/put.comat
    `[id]` in file name `put_[id].comat` is deprecated (-> `[id]/put.comat`)
[info]  comatfiles: 2 item(s) can be fixed. Run `comatype format comatfiles --fix` (add `-y` to apply all without asking)
```

| 直すもの | 直した後 |
|---|---|
| ファイル名 `get_[id].comat`（非推奨） | `[id]/get.comat` |
| ファイル名 `get__id.comat` / `get_:id.comat`（廃止） | `[id]/get.comat` |
| ディレクトリ名 `:id/` / `__id/`（廃止） | `[id]/` |

- ファイルを動かすと、ほかの `.comat` の `import` の相対パスが変わるので、**一緒に書き換えます**。
- **直さずに、理由を添えてスキップするもの**: `path ./...`（そのファイルのディレクトリからの相対）があるもの、移動先に同じファイルがあるもの、移動先に `defaults.comat` があるもの（効く設定が変わるため）。
- 直した後は、**生成物のモジュール名が変わる**ので（`user/put__id` → `user/__id/put`）、`comatype generate` で作り直してください。
- `--fix` を端末以外（パイプなど）で使うときは、`-y` が必要です。

## `generate`

```bash
comatype generate
comatype generate --lang ts --role client
comatype generate --dry-run              # 書かずに、出力先だけ表示する
```

| オプション | 内容 |
|---|---|
| `--lang <言語>` | `ts` / `go` / `python` / `rust` / `java` / `kotlin` / `swift` / `ruby` に絞る |
| `--role <役割>` | `client` / `server` に絞る |
| `--dry-run` | ファイルを書かない |

エラーがあると生成しません。未対応の言語（dart）は `skip` と表示して飛ばします。Go は生成後に `gofmt` があれば整えます。

## `to-openapi`

```bash
comatype to-openapi -o openapi.yml
comatype to-openapi --service api -o openapi.json
```

`-o` を省略すると標準出力です。service が複数あるときは `--service` が要ります。詳しくは [OpenAPI との変換](/guide/openapi)。

## `from-openapi`

```bash
comatype from-openapi openapi.yml --out ./my-api \
  --target ts:client:./client --target ts:server:./server --generate
```

| オプション | 内容 |
|---|---|
| `--out <DIR>` | 出力先。既定は `.` |
| `--target <lang:role:root>` | `targets` に足す。繰り返せる |
| `--generate` | 作ったあとに、続けてコードを生成する（`--target` が要る） |
| `--force` | `comatfiles` や設定ファイルが既にあっても、上書きする |

## `statuses`

```bash
comatype statuses                    # 一覧
comatype statuses --json             # JSON（status / message / body / custom）
comatype statuses --snippets         # VS Code のスニペット
comatype statuses --config usage     # additionalStatusCodes も含める
```

## `lsp`

```bash
comatype lsp
```

標準入出力で LSP（JSON-RPC）を話します。エディタが起動するもので、手で実行するものではありません。[エディタ](/guide/editor)を見てください。

## 終了コード

| コード | 意味 |
|---|---|
| 0 | 成功 |
| 1 | エラー（検査のエラー、書き込みの失敗など） |
| 2 | 使い方の誤り（引数が足りない、など） |
