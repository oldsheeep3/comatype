# usage — Comatype の使い方の見本

`comatfiles/` の `.comat` から、各言語のクライアントとサーバを作る見本。言語ごとのディレクトリに、書き方の見本がある。

| 場所 | 内容 |
|---|---|
| `comatype.config.json` | どの言語・役割のコードを、どこに生成するか |
| `comatfiles/` | `.comat`（init.comat、defaults.comat、エンドポイント） |
| `types/` | 共有の型 |
| **`node_server/`** | **動く** TypeScript のサーバ（ルート・ラッパー・cookie のセッション）+ テスト |
| **`node_client/`** | **動く** TypeScript のクライアント（全エンドポイントを呼ぶ関数）+ サーバをつないだ E2E |
| `go_*` `python_*` `rust_*` `java_*` `kotlin_*` `swift_*` `ruby_*` `csharp_*` `js_*` | 他の言語の書き方の見本（ラッパー・init・`user_put_id` の呼び出し / ハンドラ。`kotlin_*` `swift_*` `ruby_*` は全エンドポイント）。見本は実行しない。生成器・ランタイム・E2E は各言語にある（下） |
| `dart_*` | Dart の書き方の見本のみ（生成器は未実装） |

## TypeScript（pnpm）

`usage` が pnpm のルート。`node_server` と `node_client` が、`@comatype/typescript`（`../packages/typescript`）を使って、生成されたコードの上に書かれている。

```bash
cd usage
pnpm install
pnpm check      # generate → typecheck → test
```

```bash
pnpm generate   # comatfiles/ から node_server/comatype と node_client/comatype を作り直す（comatype の CLI をビルドして使う）
pnpm typecheck  # tsc
pnpm test       # node_server: s.handle() を直接呼ぶ単体テスト / node_client: サーバを別プロセスで起動して HTTP で繋ぐ
pnpm --filter @usage/node-server start   # PORT=3000 でサーバを起動
```

- `node_server/comatype` と `node_client/comatype` は生成物（コミットしてあるので、`.comat` を変えたら `pnpm generate` で直す）。
- `@/comatype/...` は、各パッケージの `tsconfig.json` の `paths`（`@/*` → パッケージ直下）。
- `node_server/` : `db.ts`（メモリ上のストレージ）、`wrappers/auth.ts`（`ComatypeWrap<AuthCtx>`）、`init.ts`、エンドポイントごとの `*.ts`（`s.get(path, handler)`）、`app.ts`、`index.ts`。
- `node_client/` : `wrappers/auth.ts`、`init.ts`（cookie jar）、`api.ts`（エンドポイントごとの関数）。

## 他の言語（生成して、E2E で動かす）

見本のコードは、生成された型（`comatype generate` の出力）の上に書く。TypeScript 以外の生成物はコミットしていない。各言語の E2E が、`usage/` の `.comat` から生成して、生成した client を生成した server に繋ぐ。

```bash
cargo run -p comatype-cli -- generate --config usage   # 全言語（targets）を生成。--lang rust などで絞る
./scripts/e2e-go.sh        # js / go / python / rust / java / kotlin / swift / ruby / csharp も同じ名前（scripts/e2e-*.sh）
```

| 言語 | 見本 |
|---|---|
| Go | `go_client` `go_server`（`registerXxx()`） |
| Python | `python_client` `python_server`（`@s.get(path)`） |
| JavaScript | `js_client` `js_server`（`await c.put(path, ...)` と `s.put(path, ...)`。`.js` と `.d.ts`） |
| Rust | `rust_client/src` `rust_server/src`（`Server::put(&ENDPOINT, ...)`） |
| Java | `java_client` `java_server`（`src/main/java/app`） |
| Kotlin | `kotlin_client` `kotlin_server`（suspend の `CK` と `coGet` など） |
| Swift | `swift_client` `swift_server`（`async` の `C.get` と `s.get`） |
| Ruby | `ruby_client` `ruby_server`（`Comatype::C.get(ENDPOINT, params: ...)`） |
| C# | `csharp_client` `csharp_server`（`await C.PutAsync(Endpoint, ...)` と `s.Put(Endpoint, ...)`） |

## 依存の解決（package manager）

各言語のプロジェクトは、その言語の package manager でランタイムを解決する。公開済みのバージョン（0.0.3）を、レジストリから取る。

| 言語 | マニフェスト | ランタイムの取得元 |
|---|---|---|
| TypeScript | `node_*/package.json`、`pnpm-lock.yaml` | npm `@comatype/typescript` |
| Go | `go_*/go.mod`、`go.sum` | `github.com/oldsheeep3/comatype/packages/go`（Go module proxy） |
| Python | `python_*/pyproject.toml`、`uv.lock` | PyPI `comatype` |
| Rust | `rust_*/Cargo.toml`、`Cargo.lock` | crates.io `comatype` |
| Java | `java_*/build.gradle.kts` | Maven Central `net.sheeplab.comatype:comatype` |
| Kotlin | `kotlin_*/build.gradle.kts` | Maven Central `net.sheeplab.comatype:comatype-ktx` |
| Ruby | `ruby_*/Gemfile`、`Gemfile.lock` | RubyGems `comatype` |
| JavaScript | `js_*/package.json` | `../../packages/javascript`（npm には未公開） |
| Swift | `swift_*/Package.swift` | `../../packages/swift`（未公開。SwiftPM は、リポジトリ直下の `Package.swift` を必要とするため） |
| C# | `csharp_*/usage-csharp-*.csproj` | `../../packages/csharp`（NuGet には未公開） |

生成物（`comatype generate` の出力）は、コミットしていない。生成してから、各言語のビルドを行う（例: `cd usage && cargo run -p comatype-cli -- generate --config . && cd go_client && go build ./...`）。サーバの見本は、アプリ自身の関数（`db` や `verify_session`）を呼ぶので、そのままではビルドが通らないものがある。ランタイムの解決そのものは、`go mod download`、`cargo fetch`、`uv sync`、`bundle install`、`gradle build` で確かめられる。

`scripts/e2e-*.sh` は、`usage/` を一時ディレクトリへ写して、リポジトリ内のランタイム（`packages/*`）を使って検証する。公開版ではなく、手元のコードを試すため。

## キャッシュ（cache）

`GET` / `QUERY` のエンドポイントに `cache` を書くと、クライアントとサーバが、レスポンスをキャッシュする（[docs の「キャッシュ」](../docs/content/language/cache.md)）。

| `.comat` | 書いてあること |
|---|---|
| `comatfiles/user/(noauth)/get_ping.comat` | `cache 60000`: 60 秒、メモリにキャッシュ（クライアントもサーバも）。E2E は、呼ばれるたびに返す値を入れ替えて、キャッシュに当たったことを確かめる |
| `comatfiles/user/get_me.comat` | `cache 3000 cookie`: 3 秒、cookie にキャッシュ（クライアントのみ）。ログアウトのときは `clearCache()`（`node_client/api.ts` の `logout`） |
| `comatfiles/get_user.comat` | `cache off`: 強制的にキャッシュしない |

`defaults.comat` / `init.comat` に `cache` を書くと、警告が出て、無視される。
