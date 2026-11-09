# Caching (cache)

A `GET` or `QUERY` endpoint can cache its response locally if you write `cache` in the `.comat`. It works on **both the client and the server** with the same single line.

```comat
// user/get_ping.comat
cache 60000          // cache in memory for 60 seconds
```

| Notation | Meaning |
|---|---|
| (nothing) | Do not cache |
| `cache off` | Never cache, forcibly |
| `cache 5000` | Cache in **memory** for 5000 milliseconds (the ttl) |
| `cache 5000 cookie` | Cache in a **cookie** for 5000 milliseconds (**client only**) |

- It applies only to `get` and `query` endpoints. Writing `cache` (other than `cache off`) on any other method is an error.
- **Writing it in `defaults.comat` or `init.comat` gives a warning and is ignored.** Caching is something to decide on purpose, per endpoint.
- The ttl is 1 or more milliseconds. A cookie's ttl is in seconds, so anything under 1000 ms is rounded up to 1 second (with a warning).
- Only **2xx responses** are cached. Responses that come with `Set-Cookie` are not cached. Errors (4xx / 5xx) are not cached either.

## Which requests count as "the same"

| | Key |
|---|---|
| **Server** (memory) | An **exact match** of the request: method, path, query, **all headers** (including Cookie and Authorization), and body |
| **Client** (memory / cookie) | Method, URL (path and query), body, and the **request headers declared** in the `.comat` (`header` / `headerReq`). Headers added by wrappers or init (such as Authorization) are not included |

The client relaxes the header condition a little, so that values that change every time (token refreshes, `User-Agent`, ...) do not make the cache miss.

## Behavior

- The **server** looks in the cache **before** the wrappers. On a hit, it returns the stored response without running the wrappers or the handler. Authentication headers and cookies are part of the key, so another user's response is never returned (note, though, that even if a session expires, a request with the same credentials gets the stored response during the ttl).
- The **client** looks in the cache after the wrappers, just before the network call. On a hit it does not communicate (the wrappers do run).
- A memory cache is per process (it is not shared between several server processes). It holds up to 1000 entries and drops the oldest when it goes over.
- The client cache can be dropped, for example on logout: `c.clearCache()` (TypeScript), `c.ClearCache()` (Go), `c.clear_cache()` (Python), `c::clear_cache()` (Rust), `C.clearCache()` (Java / Kotlin `CK`), `C.clearCache()` (Swift), `Comatype::C.clear_cache` (Ruby).

## Caching in a cookie (client only)

`cache 5000 cookie` writes the response into a cookie. It is saved where the client keeps cookies (`document.cookie` in a browser, a cookie jar otherwise) under the name `comatype_cache_<hash>`, and it expires by `Max-Age`.

- A client without a cookie jar (anything but a browser) does not cache.
- A cookie has a size limit (about 4KB each), so a response whose encoded value is over 3800 characters is not cached.
- Cookies starting with `comatype_cache_` are not sent back to the server (for clients that use a jar). **A browser attaches cookies to same-origin requests automatically, so the cache cookie is sent to the server too** (and it cannot be `httpOnly`).
- The server does not use `cookie` caching (even for an endpoint with `cache 5000 cookie`, the server side does not cache).

## Real example

<<< @/../usage/comatfiles/user/(noauth)/get_ping.comat [user/(noauth)/get_ping.comat]
