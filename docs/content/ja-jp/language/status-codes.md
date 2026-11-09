# ステータスコード

エンドポイントのレスポンスは、`sNNN` で**ステータスごと**に書きます（`s200`、`s404` ...）。

```comat
s200 UserData
s404 ApiError
s204 none
```

## 使えるコードは決まっています

`sNNN` に書けるのは、**登録されたコードだけ**です。

- 標準のコード（IANA に登録されたもの）62 個
- 設定ファイルの `additionalStatusCodes` で足したコード

それ以外（`s499` や、未使用の `s306`）は、`comatype check` とエディタで**エラー**になります。`wrapper` の中の `sNNN` も同じです。

一覧は [ステータスコード一覧](/reference/status-codes) にあります。コマンドでも出せます。

```bash
comatype statuses            # 一覧
comatype statuses --json     # JSON
```

### コードを足す

標準に無いコードは、`comatype.config.json` の最上位に書きます。

```json
{
  "services": { "api": { "comatDir": "./comatfiles" } },
  "additionalStatusCodes": [
    { "status": 299, "message": "Custom Thing" },
    { "status": 499, "message": "Client Closed Request" }
  ]
}
```

- `status` は 100〜599 の整数です。
- 標準で定義済みのコード、重複、空の `message` は、設定のエラーです。
- 足したコードは、本文を持てる普通のコードとして扱います。

## 本文の型を省略する

ボディの型を省略した `sNNN` は、**既定の本文**になります。

```comat
s400
s404
s500
```

は、それぞれ次と同じです。

```comat
s400 { message: string }
s404 { message: string }
s500 { message: string }
```

ステータスのメッセージ（`Not Found` など）は本文の型には入りません。OpenAPI の説明と、エディタのホバー・補完に使います。

型を省略して、ヘッダだけ書くこともできます。

```comat
s404, {
    "X-Reason"?: string,
}
```

## 本文を持てないコード

1xx、204、205、304 は、HTTP の決まりで本文を持てません。

- 型を省略すると `none` になります（`s204` と `s204 none` は同じ）。
- `s204 UserData` のように本文を書くと、**エラー**です。

```comat
s204 none
s304
```

## レスポンスヘッダ

`sNNN 型, { ... }` の 2 つ目のブロックが、そのステータスだけのレスポンスヘッダです。

<<< @/../usage/comatfiles/options_user.comat

[ヘッダと cookie](/language/headers-cookies) も見てください。

## 共通のステータス

`defaults.comat` に書いたステータスは、配下の全エンドポイントに加わります（同じコードをエンドポイントに書けば、そちらが勝ちます）。

<<< @/../usage/comatfiles/defaults.comat

`wrapper` が宣言したステータス（`s401` など）は、そのラッパーが有効なエンドポイントにだけ加わります。

## 呼び出し側から見ると

2xx のボディは `data`、それ以外は `error` に入ります。ステータスごとに型が付くので、`status` で絞り込めます。

```ts
const res = await c.put(path, { params: { id }, body: user }, s200, s404)
if (res.status === 200) res.data   // UserData
if (res.status === 404) res.error  // ApiError
```
