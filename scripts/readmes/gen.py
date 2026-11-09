#!/usr/bin/env python3
"""Generates the README.md of every runtime package (packages/<lang>/README.md) from one template.

The registries (npm, PyPI, crates.io, RubyGems, pkg.go.dev, Maven Central) show these files as the package page.
Shared sections (CLI, init.comat, comatfiles, .comat examples, cache) live here once; the code of each language is in `scripts/readmes/langs.py`.

    python3 scripts/readmes/gen.py           # write the files
    python3 scripts/readmes/gen.py --check   # fail if a README is out of date (CI)
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from langs import LANGS  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
REPO = "https://github.com/oldsheeep3/comatype"
SITE = "https://comatype.sheeplab.net"

CLI_INSTALL = f"""```bash
curl -fsSL https://raw.githubusercontent.com/oldsheeep3/comatype/main/install.sh | sh
```

This downloads the prebuilt `comatype` command (and its short alias `comat`) for macOS (arm64, x64) and Linux (x64, arm64) from the [latest release]({REPO}/releases/latest); no Rust toolchain needed. On Windows, download `comatype-x86_64-pc-windows-msvc.zip` from the release page. To build it from source instead: `cargo install --git {REPO} comatype-cli`."""

CHECK = """```bash
comatype check                  # check every .comat file; prints [error] / [warn] / [info] lines, exits 1 on errors
comatype check cache            # only one topic: cache, path, wrap, cookie, status, import, type
comatype endpoints -g           # list the endpoints, grouped by wrapper chain
comatype generate --lang {lang} # generate the code ({lang} only)
```

Run `comatype check` in CI so that a broken `.comat` never reaches the generated code."""

INIT_COMAT = """`init.comat` holds the settings of the whole project. Put exactly one directly under `comatDir`.

```comat
// comatfiles/init.comat
import UserData from ../types/UserData.comat
import ApiError from ../types/common.comat

// The base url of every endpoint. Override it at run time with the COMATYPE_BASE_URL environment variable
baseUrl https://api.example.com

// The cookie the server issues (for `cookie on` endpoints)
cookie session {
    httpOnly: true,
    secure: true,
    sameSite: lax,
}

// A wrapper: what it adds to `ctx`, and the statuses it can return. You implement it in {language}
wrapper auth {
    ctx {
        user: UserData,
    }
    s401 ApiError
}
```"""

COMATFILES = """A `.comat` file is one endpoint. Its method and path come from where the file is and what it is called.

```text
comatfiles/
├─ init.comat               baseUrl, cookie, wrapper declarations (exactly one)
├─ defaults.comat           defaults for this directory and below: wrap, headers, shared statuses
├─ post_user.comat          POST /user
└─ user/
   ├─ [id]/put.comat        PUT /user/:id        ([id] is a dynamic segment)
   ├─ (noauth)/             a group: not part of the path
   │  ├─ defaults.comat     wrap auth off
   │  ├─ post_login.comat   POST /user/login
   │  └─ get_ping.comat     GET /user/ping
   └─ get.comat             GET /user
types/                      types shared by endpoints (outside comatDir)
```

`comatype.config.json` says where `comatfiles` is and what to generate:

```json
{
  "$schema": "https://raw.githubusercontent.com/oldsheeep3/comatype/main/schema/comatype.config.schema.json",
  "services": {
    "api": {
      "comatDir": "./comatfiles",
      "targets": [{target}]
    }
  }
}
```

See the [syntax reference]({site}/language/endpoint/) for `params`, `search`, `body`, headers, status codes and `path`."""

COMAT_FILES_EXAMPLE = """```comat
// types/UserData.comat
UserData {
    name: string,
    email: email,
    phone: phone,
    uid: uuidv4,
}
```

```comat
// comatfiles/user/[id]/put.comat  ->  PUT /user/:id
import UserData from ../../../types/UserData.comat
import ApiError from ../../../types/common.comat

params {
    id: uuidv4,
}

body UserData

s200 UserData
s404 ApiError
```

```comat
// comatfiles/defaults.comat: applies to every endpoint below
import ApiError from ../types/common.comat

wrap auth        // the wrapper declared in init.comat
cookie on        // send and receive the session cookie
s500 ApiError    // every endpoint can answer 500
```

```comat
// comatfiles/user/(noauth)/defaults.comat: this group needs no login
wrap auth off
```

```comat
// comatfiles/user/(noauth)/post_login.comat  ->  POST /user/login
import ApiError from ../../../types/common.comat

body {
    email: email,
    password: string,
}

s200 {
    uid: uuidv4,
}
// the auth wrapper is off in this group, so declare the 401 yourself
s401 ApiError
```"""

CACHE = """Caching is declared in the `.comat` file, once, for the client and the server (GET and QUERY endpoints only):

```comat
// comatfiles/user/(noauth)/get_ping.comat  ->  GET /user/ping
s200 {
    ok: bool,
}

cache 60000          // cache the response in memory for 60 seconds
```

| Declaration | Meaning |
|---|---|
| (none) | no caching |
| `cache off` | never cache |
| `cache 5000` | in memory for 5000 ms (client and server) |
| `cache 5000 cookie` | in a cookie for 5000 ms (client only) |

- The server looks the cache up before the wrappers, with the exact request (method, path, query, all headers, body) as the key.
- The client looks it up just before the network call, with the method, URL, body and the request headers declared in the `.comat`.
- Only 2xx responses without `Set-Cookie` are cached. `cache` in `defaults.comat` or `init.comat` is ignored with a warning.
{cache_client}"""

TEMPLATE = """<p align="center">
<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/oldsheeep3/comatype/main/assets/logo/logo-horizontal-dark.svg">
  <img alt="Comatype" src="https://raw.githubusercontent.com/oldsheeep3/comatype/main/assets/logo/logo-horizontal.svg" height="56">
</picture>
</p>

# {title}

{tagline}

{links}

> Comatype: write an API once in `.comat` files, get types, validation, a client and a server in ten languages.
> This package is the **{language}** runtime that the generated code depends on.

## How to use

### Install

{install}

The `comatype` command (parser, checker and generators) is separate from the runtime:

{cli_install}

### Import

{import_}

### Format / Lint

{format_lint}

### Check

{check}

### init.comat

{init_comat}

### comatfiles

{comatfiles}

## Example

### ComatFiles

{comat_files_example}

Generate the {language} code with `comatype generate --lang {lang}`.

### Client

{client}

### Server

{server}

### Wrapper & Cookie

A wrapper wraps the request and the response: authentication, headers, logging. Declare it in `init.comat`, enable it with `wrap auth` in a `defaults.comat` or in an endpoint, and implement it in {language}.

{wrapper}

### Cache

{cache}

## More

- Documentation: {site}
- Source and issues: {repo}
- License: MIT
"""


def render(lang_id: str, d: dict) -> str:
    target = '{ "lang": "%s", "role": "client", "root": "%s" }' % (d["lang"], d["root"])
    values = {
        "title": d["title"],
        "tagline": d["tagline"],
        "links": d["links"],
        "language": d["language"],
        "lang": d["lang"],
        "install": d["install"].strip("\n"),
        "cli_install": CLI_INSTALL,
        "import_": d["import"].strip("\n"),
        "format_lint": d["format_lint"].strip("\n"),
        "check": CHECK.replace("{lang}", d["lang"]),
        "init_comat": INIT_COMAT.replace("{language}", d["language"]),
        "comatfiles": COMATFILES.replace("{target}", target).replace("{site}", SITE),
        "comat_files_example": COMAT_FILES_EXAMPLE,
        "client": d["client"].strip("\n"),
        "server": d["server"].strip("\n"),
        "wrapper": d["wrapper"].strip("\n"),
        "cache": CACHE.replace("{cache_client}", d["cache_client"].strip("\n")),
        "site": SITE,
        "repo": REPO,
    }
    out = TEMPLATE
    for k, v in values.items():
        out = out.replace("{" + k + "}", v)
    return out.rstrip("\n") + "\n"


def main() -> int:
    check = "--check" in sys.argv
    stale = []
    for lang_id, d in LANGS.items():
        path = ROOT / "packages" / lang_id / "README.md"
        text = render(lang_id, d)
        if check:
            if not path.exists() or path.read_text() != text:
                stale.append(str(path.relative_to(ROOT)))
        else:
            path.write_text(text)
            print("wrote", path.relative_to(ROOT))
    if stale:
        print("out of date (run: python3 scripts/readmes/gen.py):", *stale, sep="\n  ")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
