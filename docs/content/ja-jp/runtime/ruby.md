# Ruby

Ruby 3.1 以上が必要です。ランタイム `comatype`（`packages/ruby`）は**標準ライブラリだけ**で動きます（json・net/http・bigdecimal・socket など）。Ruby は動的な言語なので、生成物は「型の記述」を書き出し、変換と検証はランタイムが行います。

## 生成されるもの

```text
comatype_gen/
├─ types.rb                 名前付きの型（Comatype::Model / Comatype::Enum のサブクラス）  ComatypeGen::Types
├─ init.rb                  ラッパー・ctx・ラッパーのステータス                            ComatypeGen::Init
├─ user_put_id.rb           エンドポイントごと                                              ComatypeGen::UserPutId
└─ all.rb                   全部を require する
```

`require_relative "comatype_gen/all"` で読み込みます。

## クライアント

<<< @/../usage/ruby_client/user_put_id.rb [user_put_id.rb]

- 引数は `params:` `search:` `headers:` `body:`（Model のインスタンスか、属性名をキーにしたハッシュ）。無ければ省略できます。
- 戻り値は、`S200` `S404` ... のインスタンス（`res.status` `res.body` `res.headers`）。`case` / `when` で絞り込めます。
- `.comat` に無いステータスは `Comatype::UnexpectedStatusError`、検証エラーは `Comatype::ValidationError`（`path` と `reason`）。
- 通信は `Net::HTTP`（同期）です。

<<< @/../usage/ruby_client/init.rb [init.rb]

<<< @/../usage/ruby_client/wrappers/auth.rb [wrappers/auth.rb]

## サーバ

<<< @/../usage/ruby_server/user_put_id.rb [user_put_id.rb]

- `Comatype::S` のインスタンスにブロックでハンドラを登録します。戻り値は `S200.new(body, headers: {...})` などのレスポンス。cookie は `.with_cookie(value, max_age: 3600)` / `.clear_cookie`。
- `s` は **Rack 互換**です（`run s`）。`s.handle(method, target, headers, body)` は任意のフレームワーク用の入口、`s.serve(port: 3000)` は標準ライブラリだけの簡易サーバです。

<<< @/../usage/ruby_server/init.rb [init.rb]

<<< @/../usage/ruby_server/wrappers/auth.rb [wrappers/auth.rb]

## 型の対応

- `string` `bool` `int` は `String` `true`/`false` `Integer`。`int64` は `Integer`（通信上は文字列）。
- `date` は `Date`、`datetime` は `Time`、`decimal` は `BigDecimal`、`url` は `URI`、`bytes` は `String`（バイナリ）、`json` は `Hash` / `Array`。
- `uuid` 系・`email`・`phone`・`time` は、形式を検証した `String` です（uuid は小文字にそろえます）。
- 省略可能（`?`）と `T | null` は `nil` になれます。属性名は snake_case（`X-Request-Id` → `x_request_id`）。
- 制約（`min` `max` `pattern`）は、読むとき・送るときにランタイムが確かめます。
