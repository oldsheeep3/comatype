# Wrappers and cookies

## Wrappers

A wrapper is shared processing that wraps the request and the response. Declare it in `init.comat` ([init / defaults / wrappers](/language/init-defaults-wrappers)), **write the implementation** in each language's code, and pass it to `init`.

Use the same name as `wrapper name` in `init.comat`. The generated `Wrappers` type tells you about a missing wrapper or a different type (except in Go).

### TypeScript

<<< @/../usage/node_server/wrappers/auth.ts

- On the server, add to ctx with `next({ ...req, ctx: { ...req.ctx, user } })` and hand it on to what follows and to the handler.
- You can return a status the wrapper declared, such as `s401(...)`, and **stop right there**.
- On the client, rewrite the request headers and call `next(req)`.

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

On the client it is `c.ComatypeWrap` (`func(req *c.RawRequest, next c.Next) (*c.RawResponse, error)`).

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

### How they work

- Wrappers nest from **outside to inside**. The outer one runs first, and the response goes back from inside to outside.
- What a wrapper sees is the **raw request and response** that have no per-endpoint types (the wire form).
- A response a wrapper makes with `s401()` is validated and converted on the spot, and looks the same to the wrappers outside it.
- If a wrapper is `wrap`ped but not passed to `init`, the client gives an error before any network call, and the server gives `500`.

## Cookies

### Issuing (server)

In an endpoint with `cookie on`, pass it when you build the response. The attributes (`httpOnly` `secure` `sameSite`) come from `init.comat`. [Headers and cookies](/language/headers-cookies) shows how to write it in three languages.

- A string → `Set-Cookie` with that value
- `maxAge` `expires` `path` `domain` → change only for that issue
- Delete → `Max-Age=0` and a past `Expires`
- A cookie that is not declared, or passing one in a `cookie off` endpoint, gives `500`

### Receiving (server)

Read it from `req.cookies` in a handler or in a wrapper.

### Keeping (client)

A browser uses `credentials: 'include'` and leaves it to the browser. Environments that do not keep cookies, such as Node, take a **cookie jar**.

| Language | How to pass it |
|---|---|
| TypeScript | `c.init({ cookie: { jar: createCookieJar() } })` |
| Go | `c.Init(c.Config{CookieJar: c.NewCookieJar()})` |
| Python | `c.init(cookies=True)` (or `CookieJar()`) |

The jar keeps the `Set-Cookie` of responses from `cookie on` endpoints and sends it back in the `Cookie` header of the next request. It assumes the API is a single origin, ignores Domain, and looks only at Path and expiry. It keeps HttpOnly cookies too.
