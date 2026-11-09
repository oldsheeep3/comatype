# Endpoints

One `.comat` file (other than `init.comat` and `defaults.comat`) is one endpoint. The method and the path are decided by **where the file is and what it is called** ([How paths are decided](/language/paths)).

## What you can write

| Statement | Meaning |
|---|---|
| `import Type from path` | Use a type from another file (the path is relative to this file) |
| `path /fix/path` / `path ./relative` | Spell out the path (not recommended). See [How paths are decided](/language/paths) |
| `params { ... }` | Path parameters (they match the `[id]` directory or file name) |
| `search { ... }` | The query string |
| `body Type` / `body { ... }` | The request body. **One per endpoint**. No `body` means no body |
| `header { }` `headerReq { }` `headerRes { }` | Headers ([Headers and cookies](/language/headers-cookies)) |
| `sNNN Type` | The response body per status ([Status codes](/language/status-codes)) |
| `wrap name` / `wrap name off` | Turn a wrapper on or off ([init / defaults / wrappers](/language/init-defaults-wrappers)) |
| `cookie on` / `cookie off` | Whether cookies are sent and received |
| `cache off` / `cache 5000` / `cache 5000 cookie` | Caching of GET / QUERY responses ([Caching](/language/cache)). It has no effect in `defaults.comat` |

`wrap`, `cookie`, headers and `sNNN` that you can write in `defaults.comat` may also be written here (the endpoint wins).

## Example: `PUT /user/:id`

<<< @/../usage/comatfiles/user/put_[id].comat

- `params { id: uuidv4 }` declares the type of `[id]` in the path. The `:id` in the path and `params` must match exactly, with nothing missing or extra, or it is an error.
- `body UserData` takes a body of type `UserData`.
- `s200 UserData` and `s404 ApiError` are the responses per status.

## Example: query string and optional fields

<<< @/../usage/comatfiles/get_user.comat

The `?` in `verbose?: bool` means the field may be omitted.

## Example: building a body (`...` and `empty`)

<<< @/../usage/comatfiles/(noauth)/post_user.comat

- `...UserData` expands the fields of `UserData` in place.
- `uid: empty` **removes** that field (the key is omitted and cannot be sent). It lets you build a type such as "when registering, the server decides `uid`" out of `UserData`.

## Methods

`get` `post` `put` `patch` `delete` `options` `query` `head`. `query` is the HTTP QUERY method (a safe, idempotent call that sends its search conditions in the body).

<<< @/../usage/comatfiles/query_user.comat

<<< @/../usage/comatfiles/options_user.comat

## Rules

- Two endpoints with the same method and path are an error (even in different groups).
- Two `body` statements are an error.
- `params` cannot have optional fields.
- `defaults.comat` cannot contain `body` `params` `search` or `path`.
