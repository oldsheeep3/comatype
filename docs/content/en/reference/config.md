# Configuration file

Put `comatype.config.json` at the root of the repository where you run `comatype`.

```json
{
  "services": {
    "api": {
      "comatDir": "./comatfiles",
      "targets": [
        { "lang": "ts", "role": "client", "root": "./web" },
        { "lang": "go", "role": "server", "root": "./server", "out": "./server/internal/comatype", "importPath": "example.com/app/internal/comatype" }
      ]
    }
  },
  "additionalStatusCodes": [
    { "status": 299, "message": "Custom Thing" }
  ]
}
```

## Fields

### `services`

Named units of an API. One service has one `comatDir` and several `targets`. In a monorepo you can handle several APIs.

| Key | Meaning |
|---|---|
| `comatDir` | Where the service's `.comat` files are. `comatype generate` scans it |
| `targets` | The list of generation targets |

### `targets[]`

| Key | Required | Meaning |
|---|---|---|
| `lang` | ✅ | `ts` / `go` / `python` / `rust` / `java` / `kotlin` / `swift` / `ruby` (`dart` can be written, but generating it is not supported yet) |
| `role` | ✅ | `client` / `server` |
| `root` | ✅ | Where the project of that language is |
| `out` | | Where to write. If omitted, the per-language default (below) |
| `package` | | Java / Kotlin only. The package name of the generated code. If omitted, the path of `out` after `src/main/java/` (`src/main/kotlin/` for Kotlin), or `comatype.gen` if there is none |
| `importPath` | | Go only. The import path of the output. If omitted, it is decided from the `module` of the `go.mod` found by searching up from `root`, plus the relative path from `go.mod` to `out` |

#### Default output location

| Language | Default `out` (under `root`) |
|---|---|
| TypeScript, Go | `comatype` |
| Python, Ruby | `comatype_gen` |
| Rust | `src/comatype_gen` |
| Java | `src/main/java/comatype/gen` |
| Kotlin | `src/main/kotlin/comatype/gen` |
| Swift | `Sources/ComatypeGen` |
| Dart | `lib/comatype_gen` |

- If one `root` has several services of the same language, it becomes `<default>/<service>`.
- If one `root` has both a client and a server of the same language, it becomes `<default>/client` / `<default>/server`.
- If you set `out` explicitly, it is used as it is.

### `additionalStatusCodes`

Adds status codes that are not standard.

| Key | Meaning |
|---|---|
| `status` | An integer from 100 to 599. A code already defined as standard, or a duplicate, is an error |
| `message` | The message. Empty is an error |

See [Status codes](/language/status-codes).

## Editor completion (`$schema`)

A JSON Schema for this file is at `schema/comatype.config.schema.json` in the repository. Point to it on the first line, and editors such as VS Code give completion, descriptions and validation.

```json
{
  "$schema": "./node_modules/comatype/schema/comatype.config.schema.json",
  "services": { }
}
```

The path is relative to the config file (in this repository, for example, `../schema/comatype.config.schema.json`). Comatype itself ignores `$schema`.

## What is checked

`comatype check` and the language server also check the config file.

- The values of `lang` / `role`
- The range, duplicates and empty messages of `additionalStatusCodes`
- That `comatDir` exists
