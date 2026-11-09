# Rust

Rust のランタイムは、クレート `comatype`（`packages/rust`）です。serde / serde_json（JSON）、regex（形式と pattern の検証）、ureq（HTTP クライアント、同期）に依存します。

## 生成されるもの

```text
<out>/                       既定は src/comatype_gen
├─ mod.rs                    各モジュールの宣言
├─ types.rs                  名前付きの型（構造体・enum。serde の derive 付き）
├─ init.rs                   ラッパー・ctx・ラッパーのステータス
└─ user_put_id.rs            エンドポイントごと（モジュール名は snake_case の連結名）
```

`main.rs` に `mod comatype_gen;` を書くと使えます。生成された `.rs` は、手元に `rustfmt` があれば整形されます。

## クライアント

<<< @/../usage/rust_client/src/user_put_id.rs [user_put_id.rs]

- 引数は、`params` / `search` / ヘッダがあれば `Request`（`Default` を実装しているので `..Default::default()` が使えます）、`body` だけならボディそのもの、無ければ `comatype::NoArg`。
- 戻り値は `Result<Response, comatype::Error>`。`Response` は enum で、バリアントは `S200(body, headers)` のように、ボディとヘッダがあるものだけを持ちます。
- `.comat` に無いステータスは `Error::UnexpectedStatus`、検証エラーは `Error::Validation`（`path` と `reason`）。
- クライアントは**同期**（ureq）です。

<<< @/../usage/rust_client/src/init.rs [init.rs]

## サーバ

<<< @/../usage/rust_server/src/user_put_id.rs [user_put_id.rs]

- `s::Server` にハンドラを登録します。ハンドラは `Fn(Request) -> Response`。`cookie on` のエンドポイントでは `Reply`（`Response` に `.into()`、cookie は `.with_cookie(CookieValue::new(v).max_age(3600))` / `.clear_cookie()`）。
- `server.handle(method, target, headers, body)` は任意のフレームワークから呼べる入口です。`server.serve("127.0.0.1:3000", |addr| ...)` は標準ライブラリだけの簡易サーバ（接続ごとにスレッド）。
- ハンドラの panic は `500`（原因は `on_error` に渡る）。

<<< @/../usage/rust_server/src/init.rs [init.rs]

<<< @/../usage/rust_server/src/auth.rs [auth.rs]

## 型の対応

- `email` `phone` `uuid` `uuidv4` `uuidv7` `date` `time` `datetime` `decimal` `url` は、文字列を包んだ**独自型**（`comatype::Email` など）。`.into()` / `::new()` で作り、`validate` で形式を確かめます。
- `int` は `i64`、`int64` は `comatype::Int64`（通信上は文字列）、`bytes` は `comatype::Bytes`（base64）、`json` は `serde_json::Value`。
- 省略可能（`?`）と `T | null` は `Option<T>`。フィールド名は snake_case（`serde(rename)` で元の名前に戻します）。
- 制約（`min` `max` `pattern`）は、生成された `Validate` の実装が確かめます。

## 注意

- ユニオン型は、`T | null` と文字列リテラルだけのユニオンに対応しています。再帰する型（自分自身を含む型）は未対応です。
- ラッパーが足りないことは、`Wrappers` 構造体のフィールドが必須なので、コンパイル時に分かります。
