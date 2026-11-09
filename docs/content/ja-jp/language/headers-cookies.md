# ヘッダと cookie

## ヘッダ

| ブロック | 対象 |
|---|---|
| `header { ... }` | リクエストとレスポンスの**両方** |
| `headerReq { ... }` | リクエストだけ |
| `headerRes { ... }` | レスポンスだけ |
| `sNNN 型, { ... }` | そのステータスのレスポンスだけ |

`defaults.comat` にも、エンドポイントにも書けます。ハイフンを含む名前は引用符で囲みます。`?` は省略可能です。

<<< @/../usage/comatfiles/defaults.comat

### 優先順位

ヘッダ名ごとに合成します。

**ステータスごとのヘッダ ＞ `headerReq` / `headerRes` ＞ `header`**

親の `defaults.comat` → 子の `defaults.comat` → エンドポイント、の順に合成し、後ろが勝ちます。

### 通信上の形

ヘッダの値は文字列で届きます。ランタイムが、型に合わせて変換します。

| 型 | 変換 |
|---|---|
| `int` | 整数にする |
| `bool` | `true` / `false` |
| 配列 | `", "` でつなぐ（受け取るときは `,` で分ける） |
| `datetime` など | 文字列のまま検証する |

ヘッダ名は大文字小文字を区別しません。

## cookie

### `cookie on` / `cookie off`

そのエンドポイントで、cookie を送受信するかを決めます。`defaults.comat` に書いて、配下に効かせるのが普通です。

```comat
cookie on
```

### cookie の宣言（`init.comat`）

発行する cookie の名前と属性は、`init.comat` に **1 つ**宣言します。

<<< @/../usage/comatfiles/init.comat

| キー | 値 |
|---|---|
| `httpOnly` / `secure` | `true` / `false` |
| `sameSite` | `lax` / `strict` / `none`（`none` には `secure: true` が必要） |
| `path` | `/` で始まる文字列（既定は `/`） |
| `domain` | 文字列 |
| `maxAge` | 秒（0 以上の整数） |

未知のキーや不正な値は、`comatype check` がエラーにします。

### cookie を発行する

`cookie on` のエンドポイントで、レスポンスを作るときに `cookie` を渡します。`httpOnly` などの属性は、`init.comat` の設定が付きます。

::: code-group

```ts [TypeScript]
return s200({ data: { uid }, cookie: { session: { value: token, maxAge: 3600 } } })
// 文字列だけでもよい: cookie: { session: token }
// 削除: cookie: { session: null }
```

```go [Go]
return user_post_login.S200(&user_post_login.S200Res{UID: uid}).WithCookie(token, comatype.MaxAge(3600))
// 削除: .ClearCookie()
```

```python [Python]
return S200(data=S200.Res(uid=uid), cookie=Cookie(token, max_age=3600))
# 削除: cookie=Cookie.clear()
```

:::

`cookie off` のエンドポイントで cookie を渡すと、サーバの誤りとして `500` になります（`Set-Cookie` は出しません）。

### クライアントの cookie

ブラウザは `credentials: 'include'` で、ブラウザに任せます。Node など cookie を保持しない環境では、cookie jar を渡します（[ラッパーと cookie](/runtime/wrappers-cookies)）。
