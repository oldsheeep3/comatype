# JavaScript

JavaScript のランタイムは、npm のパッケージ `@comatype/javascript`（`packages/javascript`）です。[`@comatype/typescript`](/runtime/typescript-client) と同じランタイム（クライアント `c`、サーバ `s`、検証、ラッパー、cookie、キャッシュ）を、同じソースからビルドして、ただの ES モジュールと `.d.ts` の型宣言で配っています。Node.js 20 以上が必要です（Bun・Deno・Cloudflare Workers でも動きます）。

プロジェクトが JavaScript のときに使います。TypeScript なら、`@comatype/typescript` と `--lang ts` を使ってください。

## 生成されるもの

`"lang": "js"` で `comatype generate` を実行すると、`.comat` ファイルごとに、値（スキーマ・ステータス・エンドポイント）の `.js` と、型の `.d.ts` が出ます。

```text
<out>/                       既定は comatype
├─ types.js, types.d.ts      名前付きの型
├─ init.js, init.d.ts        ラッパーのステータスと Wrappers 型
└─ user/put__id.js, put__id.d.ts   エンドポイントごとに 1 組（パスは .comat の場所。[id] は __id になる）
```

<<< @/examples/generated/js/comatype/todo/__id/get.js [get.js]

相対 import には `.js` の拡張子が要ります（`./comatype/user/put__id.js`）。エディタに型を効かせるのは `.d.ts` です。`jsconfig.json` で `checkJs` を有効にすると、型の検査も受けられます。

## クライアント

<<< @/../usage/js_client/api.js [api.js]

- `c.put(path, request, s200, s404)` は、渡したステータスのどれかを返します。`res.status` を調べてください。2xx は `data`、それ以外は `error` です。
- 渡していないステータスは `UnexpectedStatusError`、不正な入力は、送る前に `ValidationError` になります。JavaScript では、この検証が実行時の守りです。
- リクエストの渡し方、ほかのメソッド（`c.get`、`c.post`、`c.delete` ...）、リクエストヘッダ、cookie、キャッシュは、[TypeScript のクライアント](/runtime/typescript-client)と同じです。

<<< @/../usage/js_client/init.js [init.js]

<<< @/../usage/js_client/wrappers/auth.js [wrappers/auth.js]

## サーバ

<<< @/../usage/js_server/user_put_id.js [user_put_id.js]

- `s` にハンドラを登録して（`s.put(path, req => ...)`）、`@comatype/javascript/node` の `serve({ port, server: s })` で起動します。Fetch API がある環境なら、`s.handle(request)` も使えます。[TypeScript のサーバ](/runtime/typescript-server)を参照してください。
- `.comat` に合わない入力は、ハンドラの前に 400 で返ります。

<<< @/../usage/js_server/init.js [init.js]

<<< @/../usage/js_server/wrappers/auth.js [wrappers/auth.js]

## 注意

- `@comatype/javascript` と `@comatype/typescript` は別のパッケージです。1 つのプロジェクトで混ぜないでください（それぞれが別の `c`・`s`・状態を持ちます）。
- 生成された `.js` は `@comatype/javascript` を import するので、それを置くプロジェクトに入れてください。
