# TypeScript — server `s`

`s` from `@comatype/typescript` is a small router where you register handlers. The entry point is the Fetch API `Request` → `Response`, so it works on Node, Bun, Deno and Cloudflare Workers.

```ts
import { s } from '@comatype/typescript'
import { serve } from '@comatype/typescript/node'
import { path, s200, s404 } from '@/comatype/user/put__id'

s.put(path, (req) => {
  // req.params.id: string, req.body: UserData (already validated)
  const user = db.update(req.params.id, req.body)
  if (!user) return s404({ error: { code: 'not_found', message: 'not found' } })
  return s200({ data: user })
})

await serve({ port: 3000, server: s })
```

## Handlers

Register them as in `s.get(path, handler)`. A handler may be `async`.

### `req`

| Field | Meaning |
|---|---|
| `req.params` | Path parameters (validated and converted) |
| `req.search` | The query. `{}` if there is none |
| `req.body` | The body. `undefined` for an endpoint with no `body` |
| `req.headers` | Request headers (converted) |
| `req.cookies` | The cookies that arrived |
| `req.ctx` | Values added by the enabled wrappers (typed) |

### Return value

The endpoint's `Response` (built with `s200({ ... })` and the like). A status that is not in the `.comat`, or a value of the wrong type, is a compile error.

```ts
return s200({ data: user })                                    // a 2xx has data
return s404({ error: { code: 'not_found', message: 'not found' } })               // anything else has error
return s204()                                                  // the body is none
return s200({ headers: { Allow: ['GET', 'POST'] } })           // response headers
return s200({ data: { uid }, cookie: { session: token } })     // Set-Cookie
```

## Entry points

| Way | When to use it |
|---|---|
| `serve({ port, server: s })` (`@comatype/typescript/node`) | Start it as a Node `http` server |
| `nodeListener(s)` | Pass it to an existing `http.createServer` |
| `s.handle(request)` | Make a `Response` from a Fetch API `Request`. Bun / Deno / Workers, and tests |

## Behavior

- **Validation**: if the input is invalid, it returns `400` (`{ code: 'validation_error', message, path }`) without calling the handler. If the body is not JSON, `400` (`invalid_json`).
- **Output validation**: the handler's return value is validated too. A status that is not in the `.comat`, or a body of the wrong type, gives `500` (`{ code: 'internal_error' }`) and the details are not shown to the client. Exceptions are handled the same way.
- **Routing**: static segments win over dynamic ones, a trailing `/` is ignored, a path that matches with the wrong method gives `405` (with `Allow`), and no match gives `404`. Registering the same method and the same path shape twice is an error at registration.
- **Initializing**: `s.init({ wrappers, onError })`. `onError` receives exceptions from handlers and wrappers, and the cause of responses that do not match the `.comat`.

## Real example

<<< @/../usage/node_server/user_put_id.ts

<<< @/../usage/node_server/user_post_login.ts

<<< @/../usage/node_server/wrappers/auth.ts

<<< @/../usage/node_server/index.ts
