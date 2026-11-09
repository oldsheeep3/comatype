# CLI (`comatype`)

`comat` is a short name for the same program (you can write `comat endpoints`).

```text
comatype <command> [options]
```

## Commands

| Command | Meaning |
|---|---|
| `check [topic]` | Check the `.comat` files. Exit code 1 if there are errors. You can narrow by topic, as in `check cache` |
| `format [dir]` | Rewrite directory and file names to the recommended notation (by default it only suggests; `--fix` rewrites) |
| `endpoints` | List endpoints as `GET /path` (colored per wrap; `-a` adds types and more, `-g` separates by wrap) |
| `generate` | Generate code according to `targets` (ts / js / go / python / rust / java / kotlin / swift / ruby / csharp) |
| `ir` | Check and print the IR (language-independent JSON) |
| `parse <file>` | Parse one file and print the AST (JSON) |
| `to-openapi` | Make OpenAPI 3 (YAML / JSON) from `.comat` |
| `from-openapi <file>` | Make `.comat` and a config file from OpenAPI |
| `statuses` | List the status codes you can use |
| `lsp` | Start the language server (LSP) on standard input and output (for editors) |
| `help` | Help |

## Common options

| Option | Meaning |
|---|---|
| `--config <path>` | `comatype.config.json` (or the directory that has it). Default is `./comatype.config.json` |
| `--service <name>` | The service to target. Default is all |

## `check`

```bash
comatype check
comatype check --config usage --service api
```

```text
[warn]  comatfiles/get_user.comat:5:1  an explicit path is deprecated (let the directory and file name decide it)
[info]  OK: 11 endpoint(s), 4 warning(s)
```

- It warns about places where mistakes are easy to make: a `wrap` that applies to an endpoint with `cache`, a `wrapper` that no endpoint uses, `cookie on` with no cookie declaration in init.comat, and so on.
- A diagnostic is `[error|warn|info] file:line:column  message` (the file is relative to the directory that has the config file). On a terminal, the tag is colored (`[error]` red, `[warn]` yellow, `[info]` cyan) and the location is bold, underlined cyan. `--color` forces it, and `--no-color` and `NO_COLOR` turn it off.
- It checks syntax, type resolution, matching `path` against `params`, duplicate routes, `wrap` declarations, status codes, cookie settings, headers and more.

### Narrowing by topic (`check <topic>`)

It checks everything and prints only the diagnostics of that topic (exit code 1 if there are errors).

```bash
comatype check cache     # cache (get / query only, ignored in defaults / init, combination with wrap)
comatype check path      # deriving paths, duplicates
comatype check wrap      # wrap and wrapper declarations (unused wrappers and so on)
comatype check cookie    # cookies and the init.comat declaration
comatype check status    # status codes and body types
comatype check import    # import (unused and so on)
comatype check type      # anything not in the above (types, constraints, headers)
comatype check all       # everything (same as `check`)
```

The topic is decided from the diagnostic message. If there are errors outside the topic you picked, it tells you how many.

## `endpoints`

Lists the configured endpoints (when `comatype check` has no errors).

```bash
comatype endpoints          # method and path only
comatype endpoints -a       # in addition to the method: types (params / search / body / headers / responses), wrap, cookie, cache
comatype endpoints -g       # separate by wrap
comatype endpoints -g -a
```

```text
GET /ping
GET /user
POST /user
PUT /user/:id
POST /user/login
```

- **Coloring**: paths that share the same wrap get the same color (on a terminal only; `--color` forces it, `--no-color` turns it off, and `NO_COLOR` is honored). The last segment takes the color of the endpoint's own wrap, and a middle segment takes the color of the wrap that most of the endpoints below it have. Endpoints with no wrap get no color. The legend `■ wrap: auth` at the end tells you what each color means.
- **`--group` (`-g`)**: adds a separator like `── wrap: auth > log ──` for each set of endpoints whose wraps **match exactly, order included** (`auth > log` and `log > auth` are different groups). The group with no wrap comes first.

## `format`

Rewrites how dynamic segments of `path` are written to the recommended form (`[id]/get.comat`) ([How paths are decided](/language/paths)).

```bash
comatype format comatfiles            # only shows what would change (suggest). Exit code 1 if anything would change
comatype format comatfiles --fix      # asks one by one, then fixes ([y]es / [n]o / [a]ll / [q]uit)
comatype format comatfiles --fix -y   # fixes everything without asking
comatype format .                     # in a directory with comatype.config.json, the comatDir of every service
```

```text
old/:uid/delete.comat  ->  old/[uid]/delete.comat
    directory name `:uid` is removed (-> `[uid]`)
user/put_[id].comat  ->  user/[id]/put.comat
    `[id]` in file name `put_[id].comat` is deprecated (-> `[id]/put.comat`)
[info]  comatfiles: 2 item(s) can be fixed. Run `comatype format comatfiles --fix` (add `-y` to apply all without asking)
```

| What it fixes | After |
|---|---|
| File name `get_[id].comat` (not recommended) | `[id]/get.comat` |
| File name `get__id.comat` / `get_:id.comat` (removed) | `[id]/get.comat` |
| Directory name `:id/` / `__id/` (removed) | `[id]/` |

- Moving a file changes the relative `import` paths in other `.comat` files, so **they are rewritten together**.
- **Skipped with a reason, not fixed**: files with `path ./...` (relative to the file's directory), files where a file already exists at the destination, and files where the destination has a `defaults.comat` (the settings that apply would change).
- After fixing, **the module names of generated code change** (`user/put__id` → `user/__id/put`), so run `comatype generate` again.
- Using `--fix` outside a terminal (in a pipe and the like) needs `-y`.

## `generate`

```bash
comatype generate
comatype generate --lang ts --role client
comatype generate --dry-run              # write nothing, only show the destinations
```

| Option | Meaning |
|---|---|
| `--lang <language>` | Narrow to `ts` / `js` / `go` / `python` / `rust` / `java` / `kotlin` / `swift` / `ruby` / `csharp` |
| `--role <role>` | Narrow to `client` / `server` |
| `--dry-run` | Do not write files |

It does not generate if there are errors. An unsupported language (dart) is shown as `skip` and passed over. Go output is tidied with `gofmt` if it is available.

## `to-openapi`

```bash
comatype to-openapi -o openapi.yml
comatype to-openapi --service api -o openapi.json
```

Without `-o` it writes to standard output. With several services you need `--service`. For details see [OpenAPI conversion](/guide/openapi).

## `from-openapi`

```bash
comatype from-openapi openapi.yml --out ./my-api \
  --target ts:client:./client --target ts:server:./server --generate
```

| Option | Meaning |
|---|---|
| `--out <DIR>` | Where to write. Default is `.` |
| `--target <lang:role:root>` | Add to `targets`. Can be repeated |
| `--generate` | Generate code right after creating (needs `--target`) |
| `--force` | Overwrite even if `comatfiles` or the config file already exists |

## `statuses`

```bash
comatype statuses                    # list
comatype statuses --json             # JSON (status / message / body / custom)
comatype statuses --snippets         # VS Code snippets
comatype statuses --config usage     # include additionalStatusCodes too
```

## `lsp`

```bash
comatype lsp
```

It speaks LSP (JSON-RPC) on standard input and output. An editor starts it; you do not run it by hand. See [Editor](/guide/editor).

## Exit codes

| Code | Meaning |
|---|---|
| 0 | Success |
| 1 | Error (a check error, a failed write, and so on) |
| 2 | Wrong usage (missing arguments and so on) |
