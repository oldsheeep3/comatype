# TypeScript — client `c`

`c` from `@comatype/typescript` takes a generated `path` (the endpoint descriptor) and statuses, and builds a typed `fetch`.

```ts
import { c } from '@comatype/typescript'
import { path, s200, s404 } from '@/comatype/user/put__id'

const res = await c.put(path, { params: { id }, body: user }, s200, s404)
if (res.status === 200) res.data   // UserData
if (res.status === 404) res.error  // ApiError
```

## Calling

```ts
c.get(path, ...)  c.post(path, ...)  c.put(path, ...)  c.patch(path, ...)
c.delete(path, ...)  c.options(path, ...)  c.query(path, ...)  c.head(path, ...)
```

`delete` is a reserved word, so write `c.delete()` rather than a named import. Passing a PUT endpoint to `c.get()` is a compile error.

### How to pass the request

The shape of the endpoint decides the arguments.

| Endpoint | Call |
|---|---|
| No `params` / `search` / `body` | `c.get(path, s200)` |
| `body` only | `c.post(path, body, s200)` (pass the body as it is) |
| `search` only, all optional | Either `c.get(path, s200)` or `c.get(path, { search: { limit } }, s200)` |
| Anything else | An object `{ params, search, body }` |

Request headers (`header` / `headerReq`) are not passed as arguments. Add them with `c.init({ headers })` or `c.with({ headers })`.

### Default import

Every generated module also has a default export that bundles `path`, `endpoint`, the statuses (`s200` ...) and the types (`Request`, `Response`, `Body` ...). You can import the endpoint as one name instead of renaming each export with `as`.

```ts
import user_put__id from '@/comatype/user/put__id'

const res = await c.put(user_put__id.path, { params: { id }, body: user }, user_put__id.s200, user_put__id.s404)
const body: user_put__id.Body = user
```

### Return value

A **union** of the responses for the statuses you passed (`s200`, `s404` ...). You can narrow it with `status`.

```ts
const { status, data, error } = await c.post(path, input, s200)   // destructuring works too
```

- A 2xx has `data`, anything else has `error`. A status whose body is `none` has neither.
- Response headers are in `res.headers` (for `s200 none, { Allow: string[] }`, `res.headers.Allow`).
- If a **status you did not pass** comes back, it throws `UnexpectedStatusError` (you do not have to pass `s500` every time).

## Initializing

```ts
import { c, createCookieJar } from '@comatype/typescript'
import { auth } from './wrappers/auth'

c.init({
  baseUrl: 'https://api.example.com',
  wrappers: { auth },                 // a type error unless every wrapper in init.comat is there
  cookie: { jar: createCookieJar() }, // for environments that keep no cookies, such as Node
  headers: { 'x-app': 'web' },        // headers added to every request
})
```

The priority of `baseUrl` is `c.init({ baseUrl })` > the `COMATYPE_BASE_URL` environment variable > `baseUrl` in `init.comat`.

### `c.with()`

Returns another client with extra headers or an `AbortSignal` (the settings are shared with the original client).

```ts
await c.with({ headers: { 'x-trace': '1' }, signal }).get(path, s200)
```

## Validation

- Before sending, it validates `params`, `search`, headers and `body`. If anything is invalid it throws `ValidationError` **without any network call** (`path` is set in a form like `body.email`).
- After receiving, it `parse`s the body into the type, and converts headers from strings to `int` / `bool` / arrays before validating. `int64` becomes `bigint`.

See also [Validation and errors](/reference/validation).

## Real example

<<< @/../usage/node_client/api.ts

<<< @/../usage/node_client/init.ts
