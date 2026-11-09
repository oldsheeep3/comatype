# ラッパーと cookie

## ラッパー

ラッパーは、リクエストとレスポンスを包む共通処理です。`init.comat` で宣言し（[init / defaults / ラッパー](/language/init-defaults-wrappers)）、各言語のコードで**実装を書いて**、`init` に渡します。

名前は、`init.comat` の `wrapper 名前` と同じにします。生成された `Wrappers` の型が、足りないラッパーや型の違いを教えます（Go を除く）。

### TypeScript

<<< @/../usage/node_server/wrappers/auth.ts

- サーバでは `next({ ...req, ctx: { ...req.ctx, user } })` と ctx を足して、後続とハンドラに渡します。
- `s401(...)` のように、ラッパーが宣言したステータスを返して、**そこで打ち切る**ことができます。
- クライアントでは、リクエストのヘッダを書き換えて `next(req)` を呼びます。

<<< @/../usage/node_client/wrappers/auth.ts

### Go

```go
var Auth s.CoatWrap[comatype_init.AuthCtx] = func(req *s.RawRequest[comatype_init.AuthCtx], next s.Next[comatype_init.AuthCtx]) s.RawResponse {
    user, ok := verifySession(req.Cookie("session"))
    if !ok {
        return comatype_init.S401(&comatype_init.S401Res{Code: "unauthorized", Message: "login required"})
    }
    req.Ctx = comatype_init.AuthCtx{User: user}
    return next(req)
}
```

クライアントは `c.ComatypeWrap`（`func(req *c.RawRequest, next c.Next) (*c.RawResponse, error)`）です。

### Python

```python
async def _auth(req, next):
    user = await verify_session(req.cookies.get("session"))
    if user is None:
        return S401(error=S401.Res(code="unauthorized", message="login required"))
    req.ctx = AuthCtx(user=user)
    return await next(req)

auth = ComatypeWrap[AuthCtx](_auth)
```

### 動き方

- ラッパーは、**外側から内側**へ重なります。外側が先に動き、レスポンスは内側から外側へ戻ります。
- ラッパーが見るのは、エンドポイントごとの型を持たない**生のリクエスト・レスポンス**です（通信上の形）。
- ラッパーが `s401()` で作ったレスポンスは、その場で検証・変換されて、外側のラッパーからも同じ形で見えます。
- `wrap` されているのに `init` に渡していないラッパーがあると、クライアントは通信前にエラー、サーバは `500` です。

## cookie

### 発行（サーバ）

`cookie on` のエンドポイントで、レスポンスを作るときに渡します。属性（`httpOnly` `secure` `sameSite`）は `init.comat` の設定です。[ヘッダと cookie](/language/headers-cookies) に、3 言語の書き方があります。

- 文字列 → その値で `Set-Cookie`
- `maxAge` `expires` `path` `domain` → その発行だけ変える
- 削除 → `Max-Age=0` と過去の `Expires`
- 宣言に無い cookie や、`cookie off` のエンドポイントで渡すと `500`

### 受信（サーバ）

ハンドラの `req.cookies`、ラッパーの `req.cookies` で読みます。

### 保持（クライアント）

ブラウザは `credentials: 'include'` で、ブラウザに任せます。Node など cookie を保持しない環境では **cookie jar** を渡します。

| 言語 | 渡し方 |
|---|---|
| TypeScript | `c.init({ cookie: { jar: createCookieJar() } })` |
| Go | `c.Init(c.Config{CookieJar: c.NewCookieJar()})` |
| Python | `c.init(cookies=True)`（または `CookieJar()`） |

jar は、`cookie on` のエンドポイントのレスポンスの `Set-Cookie` を保持して、次のリクエストに `Cookie` ヘッダで送ります。API が 1 つの origin である前提で、Domain は無視し、Path と期限だけを見ます。HttpOnly の cookie も保持します。
