# JavaScript

The JavaScript runtime is the npm package `@comatype/javascript` (`packages/javascript`). It is the same runtime as [`@comatype/typescript`](/runtime/typescript-client) (the client `c`, the server `s`, validation, wrappers, cookies and caching), built from the same source and shipped as plain ES modules with `.d.ts` declarations. It needs Node.js 20 or later (it also works on Bun, Deno and Cloudflare Workers).

Use it when your project is JavaScript. If you use TypeScript, use `@comatype/typescript` and `--lang ts`.

## What is generated

`comatype generate` with `"lang": "js"` writes, for each `.comat` file, a `.js` file with the values (schemas, statuses, the endpoint) and a `.d.ts` file with the types:

```text
<out>/                       default is comatype
├─ types.js, types.d.ts      Named types
├─ init.js, init.d.ts        Wrapper statuses and the Wrappers type
└─ user/put__id.js, put__id.d.ts   One pair per endpoint (the path is the location of the .comat file; [id] becomes __id)
```

<<< @/examples/generated/js/comatype/todo/__id/get.js [get.js]

Relative imports need the `.js` extension (`./comatype/user/put__id.js`). The `.d.ts` files are what gives your editor the types: turn on `checkJs` in `jsconfig.json` to have them checked too.

## Client

<<< @/../usage/js_client/api.js [api.js]

- `c.put(path, request, s200, s404)` returns the status you pass; check `res.status`. 2xx is `data`, everything else is `error`.
- A status you did not pass throws `UnexpectedStatusError`, and invalid input throws `ValidationError` before any request is sent. In JavaScript this check is what protects you at run time.
- The request, the other methods (`c.get`, `c.post`, `c.delete`, ...), request headers, cookies and caching work as in [the TypeScript client](/runtime/typescript-client).

<<< @/../usage/js_client/init.js [init.js]

<<< @/../usage/js_client/wrappers/auth.js [wrappers/auth.js]

## Server

<<< @/../usage/js_server/user_put_id.js [user_put_id.js]

- Register handlers on `s` (`s.put(path, req => ...)`) and start it with `serve({ port, server: s })` from `@comatype/javascript/node`, or use `s.handle(request)` on any runtime that has the Fetch API. See [the TypeScript server](/runtime/typescript-server).
- A request that does not match the `.comat` is answered with 400 before your handler runs.

<<< @/../usage/js_server/init.js [init.js]

<<< @/../usage/js_server/wrappers/auth.js [wrappers/auth.js]

## Notes

- `@comatype/javascript` and `@comatype/typescript` are separate packages. Do not mix them in one project (each has its own `c`, `s` and state).
- The generated `.js` files import `@comatype/javascript`, so install it in the project that holds them.
