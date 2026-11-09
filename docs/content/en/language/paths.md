# How paths are decided

The path is **decided automatically** from the directories under `comatDir` and the file name.

## Directories and file names

| File (under `comatDir`) | Method | Path |
|---|---|---|
| `post_user.comat` | POST | `/user` |
| `users/post_uid.comat` | POST | `/users/uid` |
| `users/[uid]/post.comat` | POST | `/users/:uid` (dynamic path. **Recommended**) |
| `users/post_[uid].comat` | POST | `/users/:uid` (dynamic path. Not recommended) |
| `users/posts/[id]/get.comat` | GET | `/users/posts/:id` |
| `users/get.comat` | GET | `/users` (just the method name = the directory itself) |
| `get.comat` | GET | `/` |
| `(noauth)/get_user.comat` | GET | `/user` (groups are not part of the path) |

- A file name is `<method>_<segment>`. Everything up to the first `_` is the method, and the rest is **one** segment (`get_user_list` is `/user_list`).
- Express deeper levels with directories.
- A file named only after a method (`get.comat`, `post.comat`) is the path of the directory itself.

## Dynamic segments (`[name]`)

Write a dynamic segment as `[name]`. This is the same notation as file routing in Next.js, Nuxt, SvelteKit and Astro, and it can be used in Windows file names. Declare the type of the name in the file's `params`.

| Notation | Status | Example |
|---|---|---|
| Directory name `[id]/get.comat` | **Recommended** | `path/[id]/user/[userid]/get.comat` → `GET /path/:id/user/:userid` |
| File name `get_[id].comat` | Allowed (not recommended) | `path/[id]/user/get_[userid].comat` → `GET /path/:id/user/:userid` |
| File name `get__id.comat` (`__`) | **Removed** (error) | |
| File name `get_:id.comat` (`:`) | **Removed** (error). It can still be written in an explicit path | |
| Directory name `:id/` / `__id/` | **Removed** (error) | |

- A name is made of letters, digits, `-` and `_`, and cannot start with `_`.
- `[...rest]` (matches everything left) and `[[id]]` (optional) cannot be used (error).
- Two files that give the same path (`a/[id]/get.comat` and `a/get_[id].comat`) are a duplicate error.
- In the module names and file names of generated code, `[id]` becomes `__id` (`path/[id]/get.comat` → `path/__id/get`, `user/put_[id].comat` → `user/put__id`). So no `[` or `]` ends up in generated output.

`comatype format` rewrites the not recommended and removed notations into the recommended form ([CLI](/reference/cli)).

::: tip In a shell
`[` and `]` are interpreted as shell patterns. Quote `ls path/[id]` and `mkdir path/[id]` (`mkdir 'path/[id]'`).
:::

## Spelling out the path (not recommended)

If you write `path` inside the file, it takes priority. `comatype check` gives a warning.

| Notation | Meaning |
|---|---|
| `path /fix/path` | **Fixed**. That path, wherever the directory is |
| `path ./relative/path` | **Relative**. Relative to the path of the directory the file is in |

Quotes are optional (`path '/user'`). **In an explicit path, dynamic segments are written as `:name`** (`path /user/:id`).

<<< @/../usage/comatfiles/user/get_me.comat

<<< @/../usage/comatfiles/user/(noauth)/get_ping.comat

## Groups `(name)`

A directory name wrapped in parentheses, like `(name)`, becomes a **group**.

- The `defaults.comat` of a group applies **only below it**.
- The name of a group is **not included** in the path or in the module names of generated code.

For example, writing `wrap auth off` in `(noauth)/defaults.comat` removes the authentication wrapper only from the endpoints under `(noauth)`.

<<< @/../usage/comatfiles/(noauth)/defaults.comat

## All patterns

| Pattern | File | Path |
|---|---|---|
| Directly under `comatDir` | `post_user.comat` / `options_user.comat` / `query_user.comat` | `/user` |
| Explicit path (not recommended) | `get_user.comat` | `/user/:id` |
| The directory itself | `user/get.comat` | `/user` |
| Static segment | `user/(noauth)/post_login.comat` | `/user/login` |
| Dynamic segment | `user/[id]/put.comat` (recommended) / `user/put_[id].comat` | `/user/:id` |
| Nested directories | `user/profile/get.comat` | `/user/profile` |
| Group (directly under) | `(noauth)/post_user.comat` | `/user` |
| Fixed path | `user/(noauth)/get_ping.comat` (`path /ping`) | `/ping` |
| Relative path | `user/get_me.comat` (`path ./me`) | `/user/me` |

## What is an error

- A method in the file name that is not valid, such as `fetch_a.comat`
- A `:id` in the path that is not in `params` (or in `params` but not in the path)
- Several endpoints with the same method and path
- Duplicate generated module names

A path with a dynamic segment in the middle (`/pets/:petId/photos/:photoId`) cannot be expressed with directories, so spell out the `path`.
