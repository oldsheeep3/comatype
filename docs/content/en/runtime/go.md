# Go

Go output depends on three packages of the runtime `github.com/oldsheeep3/comatype/packages/go`: the shared `comatype`, the client `c`, and the server `s`.

## What is generated

```text
<out>/
├─ types/types.go                   Named types (package types)
├─ init/init.go                     Wrappers, ctx and wrapper statuses (package comatype_init)
└─ user/put__id/endpoint.go         One per endpoint (package user_put_id)
```

The contents of `init` and `endpoint` differ between `client` and `server`. The import path of the output is decided from `importPath` in `comatype.config.json`, or from `module` in `go.mod` if that is missing.

## Client

```go
res, err := c.Put(ctx, user_put_id.Endpoint, user_put_id.Request{
    Params: user_put_id.Params{ID: comatype.Uuidv4(id)},
    Body:   userInput,
})
if err != nil { return err }

switch res.Status {
case 200:
    _ = res.S200 // *user_put_id.S200Res
case 404:
    _ = res.S404
}
```

- The argument is `Request` if there are `params` / `search`, `Body` if there is only a `body`, and it can be left out if there is neither (`c.Options(ctx, ep)`).
- The return value is `*Response`: `Status` plus a field per status (`S200` `S200Headers` ...). `nil` if there is no body.
- A status that is not in the `.comat` is `*comatype.UnexpectedStatusError`.
- A validation error is `*comatype.ValidationError` (`Path` and `Reason`).

```go
c.Init(c.Config{
    Wrappers:  comatype_init.Wrappers{Auth: wrappers.Auth},
    CookieJar: c.NewCookieJar(),
})
```

## Server

```go
s.Put(user_put_id.Endpoint, func(req user_put_id.Request) user_put_id.Response {
    // req.Params.ID, req.Body, req.Ctx.User (when wrap auth is enabled)
    if !ok {
        return user_put_id.S404(&user_put_id.S404Res{Code: "not_found", Message: "not found"})
    }
    return user_put_id.S200(&user)
})

s.Init(s.Config{Wrappers: comatype_init.Wrappers{Auth: wrappers.Auth}})
http.ListenAndServe(":3000", s.Handler())
```

- The constructor is `S200(body)`. For a `none` body it is `S204()`. It takes headers as arguments only when there are **required** response headers (`S200(nil, &S200Headers{...})`). Optional headers go through `.WithS200Headers(&S200Headers{...})`.
- Cookies use `.WithCookie(value, comatype.MaxAge(3600))` / `.ClearCookie()`.

## Type mapping

- `uuid`, `email` and the like are **separate types** that wrap a string. Converting from `string` is required (`comatype.Uuidv4(id)`). `Validate()` checks the format.
- `int64` is `comatype.Int64`, `datetime` is `time.Time`, `bytes` is `[]byte`, and `json` is `json.RawMessage`.
- Optional (`?`) fields are pointers (`*string`). `c.Ptr(true)` makes one.
- Constraints go into struct tags (`min` `max` `pattern` `oneof`).
- Field names follow Go conventions (`ID` `UID` `URL`), and the names of declared types stay as they are.

## Notes

- A missing wrapper cannot be caught by types (a struct literal can leave fields out). It becomes an error on the client, and `500` on the server, when an endpoint that uses it is called.
- Union types support `T | null` and unions of only string literals.

## Real example

<<< @/../usage/go_client/user_put_id.go

<<< @/../usage/go_server/user_put_id.go
