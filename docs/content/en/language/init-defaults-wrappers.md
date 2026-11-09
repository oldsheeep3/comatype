# init / defaults / wrappers

## `init.comat`

Project-wide settings. Put **exactly one** directly under `comatDir`.

<<< @/../usage/comatfiles/init.comat

| Statement | Meaning |
|---|---|
| `baseUrl URL` | The base url of every endpoint. It can be overridden at run time with the `COMATYPE_BASE_URL` environment variable or an argument to init |
| `cookie name { ... }` | The settings of the cookie to issue ([Headers and cookies](/language/headers-cookies)) |
| `wrapper name { ... }` | Declares a wrapper |

## `wrapper`

Declare processing shared by several endpoints, such as authentication, as a **wrapper**. The declaration holds the type of the value the wrapper hands to the handler (`ctx`) and the statuses the wrapper itself can return.

```comat
wrapper auth {
    ctx {
        user: UserData,
    }
    s401 ApiError
}
```

You write the implementation in each language's code ([Wrappers and cookies](/runtime/wrappers-cookies)). If the implementation you pass to `init` does not match the declaration, the type check reports an error (except in Go).

## `defaults.comat`

A file of default values that **can be put in any directory**. It applies to that directory and the endpoints below it.

<<< @/../usage/comatfiles/defaults.comat

What you can write: `wrap` / `cookie on|off` / `header` `headerReq` `headerRes` / `sNNN` (shared statuses). You cannot write `path` or `body`. `cache` has no effect and gives a warning (write it per endpoint).

### Order of merging

Merging goes **parent `defaults.comat` → that directory's `defaults.comat` (including groups) → endpoint**, and the later one wins.

| Item | How it merges |
|---|---|
| `wrap` | Per name. `wrap auth` enables it, `wrap auth off` removes it |
| `cookie` | The endpoint wins |
| Headers | Per header name |
| `sNNN` | Per code. A `wrapper`'s statuses are added to endpoints where that wrapper is enabled |

## Order of `wrap` (several wrappers)

When several wrappers are enabled, they nest from **outside to inside** in this order.

1. The higher the directory of the file, the further out (parent `defaults.comat` > child `defaults.comat` > endpoint)
2. At the same level, `defaults.comat` is further out
3. Within the same file, **the `wrap` written higher is further out**

The outer wrapper runs first, and the response goes back from inside to outside. `wrap name off` only removes that name; the order of the rest does not change. If a lower level writes `wrap` for the same name again, it is placed again at the lower position (inside).

## Switching by group

Writing `wrap auth off` in the `defaults.comat` of a group such as `(noauth)` removes authentication only below it.

<<< @/../usage/comatfiles/user/(noauth)/post_login.comat

Here `wrap auth` is removed, so the wrapper's `s401` is not added. `s401` is declared by the endpoint itself, for a failed login.
