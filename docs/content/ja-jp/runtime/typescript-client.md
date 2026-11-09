# TypeScript — クライアント `c`

`@comatype/typescript` の `c` が、生成された `path`（エンドポイントの記述子）とステータスを受け取って、型の付いた `fetch` を作ります。

```ts
import { c } from '@comatype/typescript'
import { path, s200, s404 } from '@/comatype/user/put__id'

const res = await c.put(path, { params: { id }, body: user }, s200, s404)
if (res.status === 200) res.data   // UserData
if (res.status === 404) res.error  // ApiError
```

## 呼び出し

```ts
c.get(path, ...)  c.post(path, ...)  c.put(path, ...)  c.patch(path, ...)
c.delete(path, ...)  c.options(path, ...)  c.query(path, ...)  c.head(path, ...)
```

`delete` は予約語なので、名前付き import ではなく `c.delete()` と書きます。`c.get()` に PUT のエンドポイントを渡すと、コンパイルエラーです。

### リクエストの渡し方

エンドポイントの形で、引数が決まります。

| エンドポイント | 呼び出し |
|---|---|
| `params` / `search` / `body` が無い | `c.get(path, s200)` |
| `body` だけ | `c.post(path, ボディ, s200)`（ボディをそのまま渡す） |
| `search` だけで、全部任意 | `c.get(path, s200)` でも `c.get(path, { search: { limit } }, s200)` でも |
| それ以外 | `{ params, search, body }` のオブジェクト |

リクエストヘッダ（`header` / `headerReq`）は引数では渡さず、`c.init({ headers })` か `c.with({ headers })` で付けます。

### デフォルトの import

生成された各モジュールには、`path`・`endpoint`・ステータス（`s200` ...）・型（`Request` `Response` `Body` ...）をまとめた default export もあります。`as` で 1 つずつ別名を付けなくても、エンドポイントを 1 つの名前で import できます。

```ts
import user_put__id from '@/comatype/user/put__id'

const res = await c.put(user_put__id.path, { params: { id }, body: user }, user_put__id.s200, user_put__id.s404)
const body: user_put__id.Body = user
```

### 戻り値

渡したステータス（`s200`、`s404` ...）のレスポンスの**和**です。`status` で絞り込めます。

```ts
const { status, data, error } = await c.post(path, input, s200)   // 分割代入もできる
```

- 2xx は `data`、それ以外は `error` です。ボディが `none` のステータスには、どちらもありません。
- レスポンスヘッダは `res.headers` です（`s200 none, { Allow: string[] }` なら `res.headers.Allow`）。
- **渡していないステータス**が返ったときは、`UnexpectedStatusError` を投げます（`s500` を毎回渡す必要はありません）。

## 初期化

```ts
import { c, createCookieJar } from '@comatype/typescript'
import { auth } from './wrappers/auth'

c.init({
  baseUrl: 'https://api.example.com',
  wrappers: { auth },                 // init.comat の wrapper が揃っていないと、型エラー
  cookie: { jar: createCookieJar() }, // Node など、cookie を保持しない環境
  headers: { 'x-app': 'web' },        // 全リクエストに付けるヘッダ
})
```

`baseUrl` の優先順位は、`c.init({ baseUrl })` ＞ 環境変数 `COMATYPE_BASE_URL` ＞ `init.comat` の `baseUrl` です。

### `c.with()`

ヘッダや `AbortSignal` を足した、別のクライアントを返します（設定は元のクライアントと共有）。

```ts
await c.with({ headers: { 'x-trace': '1' }, signal }).get(path, s200)
```

## 検証

- 送る前に `params` `search` ヘッダ `body` を検証します。不正なら**通信せずに** `ValidationError`（`path` が `body.email` のような形で入る）。
- 受け取った後は、ボディを `parse` して型に直し、ヘッダは文字列から `int` / `bool` / 配列に直してから検証します。`int64` は `bigint` になります。

[バリデーションとエラー](/reference/validation)も見てください。

## 実例

<<< @/../usage/node_client/api.ts

<<< @/../usage/node_client/init.ts
