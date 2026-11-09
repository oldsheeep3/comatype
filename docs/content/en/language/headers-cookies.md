# Headers and cookies

## Headers

| Block | Applies to |
|---|---|
| `header { ... }` | **Both** the request and the response |
| `headerReq { ... }` | The request only |
| `headerRes { ... }` | The response only |
| `sNNN Type, { ... }` | The response of that status only |

You can write them in `defaults.comat` and in an endpoint. Quote names that contain a hyphen. `?` means optional.

<<< @/../usage/comatfiles/defaults.comat

### Priority

They are merged per header name.

**Per-status headers > `headerReq` / `headerRes` > `header`**

Merging goes parent `defaults.comat` → child `defaults.comat` → endpoint, and the later one wins.

### On the wire

Header values arrive as strings. The runtime converts them to match the type.

| Type | Conversion |
|---|---|
| `int` | Made an integer |
| `bool` | `true` / `false` |
| Array | Joined with `", "` (split on `,` when received) |
| `datetime` and the like | Validated as strings |

Header names are case-insensitive.

## Cookies

### `cookie on` / `cookie off`

Decides whether cookies are sent and received for that endpoint. It is usual to write it in `defaults.comat` so it applies to everything below.

```comat
cookie on
```

### Declaring a cookie (`init.comat`)

Declare the name and attributes of the cookie to issue **once** in `init.comat`.

<<< @/../usage/comatfiles/init.comat

| Key | Value |
|---|---|
| `httpOnly` / `secure` | `true` / `false` |
| `sameSite` | `lax` / `strict` / `none` (`none` needs `secure: true`) |
| `path` | A string starting with `/` (default `/`) |
| `domain` | A string |
| `maxAge` | Seconds (an integer, 0 or more) |

`comatype check` reports unknown keys and invalid values as errors.

### Issuing a cookie

In an endpoint with `cookie on`, pass `cookie` when you build the response. Attributes such as `httpOnly` come from the `init.comat` settings.

::: code-group

```ts [TypeScript]
return s200({ data: { uid }, cookie: { session: { value: token, maxAge: 3600 } } })
// A plain string also works: cookie: { session: token }
// Delete: cookie: { session: null }
```

```go [Go]
return user_post_login.S200(&user_post_login.S200Res{UID: uid}).WithCookie(token, comatype.MaxAge(3600))
// Delete: .ClearCookie()
```

```python [Python]
return S200(data=S200.Res(uid=uid), cookie=Cookie(token, max_age=3600))
# Delete: cookie=Cookie.clear()
```

:::

Passing a cookie in an endpoint with `cookie off` is treated as a server mistake and gives `500` (no `Set-Cookie` is sent).

### Cookies on the client

In a browser, use `credentials: 'include'` and leave it to the browser. In environments that do not keep cookies, such as Node, pass a cookie jar ([Wrappers and cookies](/runtime/wrappers-cookies)).
