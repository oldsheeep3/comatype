# Names of generated code

## Module names (per file)

Each `.comat` becomes one module. The name joins the words of the directories (without groups) and the file name (`__` marks a dynamic path, so it is removed).

| `.comat` | TypeScript import | Go (package) | Python |
|---|---|---|---|
| `post_user.comat` | `@/comatype/post_user` | `post_user` | `comatype_gen.post_user` |
| `user/get.comat` | `@/comatype/user/get` | `user_get` | `comatype_gen.user.get` |
| `user/post_login.comat` | `@/comatype/user/post_login` | `user_post_login` | `comatype_gen.user.post_login` |
| `user/put_[id].comat` | `@/comatype/user/put__id` | `user_put_id` | `comatype_gen.user.put__id` |
| `user/profile/get.comat` | `@/comatype/user/profile/get` | `user_profile_get` | `comatype_gen.user.profile.get` |

- In TS and Python, the location of the file is the import path as it is.
- In Go, the directory is the package path, and the package name is the snake_case joined name (`package user_put_id`).
- Rust uses a module with the snake_case joined name (`user_put_id`), and Java / Kotlin / Swift / Ruby / C# use the PascalCase joined name (`UserPutId`).
- These names are reserved: `types` / `init` in TypeScript and Go, and `models` / `comatype_init` in Python (they cannot be a `.comat` module name). Java / Kotlin / C# reserve `Types` / `Init`, Swift reserves `ComatypeInit` and the names of declared types, and Rust reserves `types` / `init`. In Python, keywords (such as `class`) and names with a hyphen are errors too.

## Names inside a module

Names are decided by role. There is no mark for server side or client side.

| Name | Meaning |
|---|---|
| `path` / `endpoint` | The path and method (the descriptor) |
| `Body` | The request body (the `body` line) |
| `Request` | The whole request (`params` `search` `body` `headers`) |
| `Response` | The union of the responses of every status |
| `s200` (function) / `S200` (type, class) | Builds a response with status 200 |
| `s200.Res` / `S200.Res` / `S200Res` | The type of the body of the status 200 response |
| `s200.Headers` / `S200Headers` | The type of the response headers of status 200 |

- The leading `s` / `S` is the initial of status, and has nothing to do with server.
- TypeScript uses `s200.Res` (a type). Go uses `S200Res` (it cannot nest). Python uses `S200Res` (for annotations) and `S200.Res` (for building).
- Naming follows each language's conventions (Go exports with a capital letter, Python uses snake_case fields).

## The `init` module

`init.comat` produces the `init` module (`@/comatype/init` in TS, `comatype_init` in Go, `comatype_init` in Python).

| Name | Meaning |
|---|---|
| `AuthCtx` | The ctx type of `wrapper auth { ctx { ... } }` (wrapper name + `Ctx`) |
| `s401` / `S401` | A status the wrapper can return |
| `Wrappers` | The type of the wrapper implementations you pass to `init` |
