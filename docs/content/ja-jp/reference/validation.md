# バリデーションとエラー

Comatype は、通信の**両側**で、同じスキーマを使って検証します。

| 場面 | 検証すること | 不正なとき |
|---|---|---|
| クライアントが送る前 | `params` `search` ヘッダ `body` | 通信せずに、検証エラーを投げる |
| サーバが受け取った後 | 同上 | ハンドラを呼ばずに `400` を返す |
| サーバが返す前 | ハンドラの戻り値（ステータス・ボディ・ヘッダ） | `500` を返す（中身は見せない） |
| クライアントが受け取った後 | ボディ・ヘッダ | 検証エラーを投げる |

## 検証エラーの形

エラーには、**どこが**悪いかが入ります。

| 言語 | 型 | 位置 |
|---|---|---|
| TypeScript | `ValidationError` | `path`（`body.email`、`params.id`、`tags[0]`） |
| Go | `*comatype.ValidationError` | `Path` |
| Python | `ComatypeValidationError` | `path` |
| Rust | `comatype::Error::Validation(ValidationError)` | `path` |
| Java / Kotlin | `comatype.ValidationException` | `path` |
| Swift | `ValidationError` | `path` |
| Ruby | `Comatype::ValidationError` | `path` |

## サーバの応答

| 状況 | 応答 |
|---|---|
| 入力が不正 | `400` `{ "code": "validation_error", "message": "...", "path": "body.email" }` |
| ボディが JSON でない | `400` `{ "code": "invalid_json", ... }` |
| path が合わない | `404` `{ "code": "not_found", ... }` |
| path は合うがメソッドが違う | `405`（`Allow` ヘッダつき） |
| ハンドラの例外、`.comat` に合わないレスポンス | `500` `{ "code": "internal_error", "message": "Internal Server Error" }` |

この `400` は、`.comat` の `Response` には含まれません。

## 厳密さ

- ボディは、JSON の型に**厳密**です。文字列の `"5"` を `int` にはしません（Python、TypeScript、Go で同じ）。
- path・クエリ・ヘッダは、文字列で届くので、`int` / `bool` / 配列に直してから検証します。
- `int64` と `decimal` は、通信上は**文字列**で、数値で送ると不正です。
- 余分なキーは、読み飛ばします（エラーにはしません）。
- 必須のキーが無い、`null` が許されない場所に `null` がある、は不正です。

## クライアントの例外

| 例外 | 意味 |
|---|---|
| 検証エラー | 送る前の入力が不正、または受け取ったレスポンスが不正 |
| `UnexpectedStatusError` | 呼び出しに渡していないステータスが返った（`status` と `body` を持つ） |
| `ComatypeError` | 使い方の誤り（メソッド違い、ラッパーが足りない、base url が無いなど） |
