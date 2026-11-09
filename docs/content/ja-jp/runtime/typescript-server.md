# TypeScript — サーバ `s`

`@comatype/typescript` の `s` は、ハンドラを登録する小さなルータです。入口は Fetch API の `Request` → `Response` なので、Node・Bun・Deno・Cloudflare Workers で使えます。

```ts
import { s } from '@comatype/typescript'
import { serve } from '@comatype/typescript/node'
import { path, s200, s404 } from '@/comatype/user/put__id'

s.put(path, (req) => {
  // req.params.id: string, req.body: UserData（検証済み）
  const user = db.update(req.params.id, req.body)
  if (!user) return s404({ error: { code: 'not_found', message: 'not found' } })
  return s200({ data: user })
})

await serve({ port: 3000, server: s })
```

## ハンドラ

`s.get(path, handler)` のように登録します。ハンドラは `async` でも構いません。

### `req`

| フィールド | 内容 |
|---|---|
| `req.params` | path パラメータ（検証・変換済み） |
| `req.search` | クエリ。無ければ `{}` |
| `req.body` | ボディ。`body` が無いエンドポイントでは `undefined` |
| `req.headers` | リクエストヘッダ（変換済み） |
| `req.cookies` | 届いた cookie |
| `req.ctx` | 有効なラッパーが足した値（型付き） |

### 戻り値

そのエンドポイントの `Response`（`s200({ ... })` などで作ったもの）です。`.comat` に無いステータスや、型に合わない値は、コンパイルエラーになります。

```ts
return s200({ data: user })                                    // 2xx は data
return s404({ error: { code: 'not_found', message: 'not found' } })               // それ以外は error
return s204()                                                  // ボディが none
return s200({ headers: { Allow: ['GET', 'POST'] } })           // レスポンスヘッダ
return s200({ data: { uid }, cookie: { session: token } })     // Set-Cookie
```

## 入口

| 方法 | 使いどころ |
|---|---|
| `serve({ port, server: s })`（`@comatype/typescript/node`） | Node の `http` サーバとして起動する |
| `nodeListener(s)` | 既存の `http.createServer` に渡す |
| `s.handle(request)` | Fetch API の `Request` から `Response` を作る。Bun / Deno / Workers、テスト |

## 動作

- **検証**: 入力が不正なら、ハンドラを呼ばずに `400`（`{ code: 'validation_error', message, path }`）。ボディが JSON でなければ `400`（`invalid_json`）。
- **出力の検証**: ハンドラの戻り値も検証します。`.comat` に無いステータスや、型に合わないボディは `500`（`{ code: 'internal_error' }`）で、中身はクライアントに見せません。例外も同じです。
- **ルーティング**: 静的なセグメントが動的より優先、末尾の `/` は無視、path は合うがメソッドが違うと `405`（`Allow` つき）、無ければ `404`。同じメソッド・同じ形の path を 2 回登録すると、登録時にエラーです。
- **初期化**: `s.init({ wrappers, onError })`。`onError` は、ハンドラやラッパーの例外と、`.comat` に合わないレスポンスの原因を受け取ります。

## 実例

<<< @/../usage/node_server/user_put_id.ts

<<< @/../usage/node_server/user_post_login.ts

<<< @/../usage/node_server/wrappers/auth.ts

<<< @/../usage/node_server/index.ts
