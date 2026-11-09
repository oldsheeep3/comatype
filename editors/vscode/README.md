# Comatype for VS Code

Language support for [Comatype](https://comatype.sheeplab.net) `.comat` files. Comatype turns API definitions written in `.comat` into typed clients, servers and validation code for TypeScript, Go, Python, Rust, Java, Kotlin, Swift and Ruby.

## Requirements

The language server and the commands run the `comatype` command line tool, so it has to be installed (see the [repository](https://github.com/oldsheeep3/comatype) for how to build it). Syntax highlighting, snippets and the `comatype.config.json` schema work without it.

## Features

| Feature                | What it does                                                                                                                                                                                                                                                         |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Diagnostics            | Syntax errors as you type, unregistered status codes (`s499`), and project-wide checks on the unsaved content: unknown types, `path` and `params` that do not match, duplicate routes and so on. Fixing one file refreshes the diagnostics of the files that use it. |
| Go to definition       | Type references (`User`, `...User`, `s200 User`, `body User`) jump to their declaration; `import` names jump to the declaration and `import` paths to the file; `wrap auth` jumps to the `wrapper` in `init.comat`.                                                  |
| Hover                  | The source of a type, a description of built-in types (for example `int64` travels as a string), keywords and status codes.                                                                                                                                          |
| Outline                | Types, enums, wrappers, `path`, `params`, `s200` and so on in the Outline view and `Cmd/Ctrl+Shift+O`.                                                                                                                                                               |
| Completion             | Keywords and status codes at the start of a statement, built-in, local and imported types where a type is expected, wrapper names after `wrap`, `on` / `off` after `cookie`.                                                                                         |
| Syntax highlighting    | A TextMate grammar (`source.comat`).                                                                                                                                                                                                                                 |
| Snippets               | `import`, `type`, `enum`, `params`, `search`, `body`, `bodyo`, `sheaders`, `path`, `wrap`, `wrapoff`, `cookie`, `header`, `init`, `wrapper`, and one snippet per status code (`s200` … `s511`).                                                                      |
| JSON schema            | Validation and completion for `comatype.config.json`.                                                                                                                                                                                                                |
| Language configuration | `//` comments, bracket pairs and indentation.                                                                                                                                                                                                                        |

Diagnostics, go to definition, hover, outline and completion are provided by the language server. While a file has a syntax error, semantic results are withheld so that the screen does not turn red halfway through typing; go to definition and the like keep working.

## Commands

Open the Command Palette and type `Comatype`.

| Command                             | What it does                                                                                          |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `Comatype: Generate`                | Runs `comatype generate`.                                                                             |
| `Comatype: Check`                   | Restarts the language server and checks again from scratch.                                           |
| `Comatype: Export OpenAPI`          | Writes the project as `openapi.yml` (`comatype to-openapi`).                                          |
| `Comatype: Import OpenAPI`          | Turns an `openapi.yml` into `.comat` files and, optionally, generates code (`comatype from-openapi`). |
| `Comatype: Show Status Codes`       | Lists the status codes and inserts the one you pick.                                                  |
| `Comatype: Restart Language Server` | Restarts `comatype lsp`.                                                                              |

## Settings

| Setting                           | Default    | Description                                                                                                                      |
| --------------------------------- | ---------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `comatype.path`                   | `comatype` | Path to the `comatype` executable. Set it when it is not on `PATH`.                                                              |
| `comatype.config`                 | empty      | Location of `comatype.config.json`, relative to the workspace folder. When empty, it is searched for upwards from the open file. |
| `comatype.languageServer.enabled` | `true`     | Use the language server (`comatype lsp`). When off, `comatype check` runs on save instead.                                       |
| `comatype.checkOnSave`            | `true`     | Only when the language server is off: run `comatype check` when a file is opened or saved.                                       |

## How the language server is found

The extension starts `comatype lsp` as a child process and talks to it over standard input and output. The executable is the value of `comatype.path` (default `comatype`), resolved through your `PATH` like any command. If it cannot be started, the extension shows an error and logs the reason in the **Comatype** output channel; set `comatype.path` to an absolute path (for example `<repository>/target/debug/comatype`) and run `Comatype: Restart Language Server`.

## Links

- Website: <https://comatype.sheeplab.net>
- Source and issues: <https://github.com/oldsheeep3/comatype>

## Development

```bash
pnpm install
pnpm --dir editors/vscode test      # grammar, extension, schema and language server tests
pnpm --dir editors/vscode package   # builds comatype-<version>.vsix
```

To try the extension, open `editors/vscode` in VS Code and press `F5` (Extension Development Host), then open `usage/` in the new window.

The marketplace bundle is built by esbuild into `dist/extension.js`; the version is stamped from the repository's `VERSION` file by `scripts/set-version.sh`.

## License

MIT
