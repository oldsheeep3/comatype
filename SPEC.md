# Comatype 仕様（ドラフト）

Comatype は、`.comat` ファイルで API の型を 1 回だけ書き、各言語の型・検証・クライアント・サーバのコードを生成する。

`usage/` の例が、この仕様の「使い方の見本」になっている。実装は Rust の cargo workspace（`crates/`）と、言語ごとのランタイム（`packages/`）。実装の状況は §9。

## 1. 全体像

```
.comat ──▶ パーサ（1 つだけ） ──▶ IR（言語非依存の JSON） ──▶ 言語ごとのジェネレータ ──▶ comatype/*.ts, *.go, *.py ...
```

- パーサは 1 つだけ作り、Rust 製の単一バイナリ `comatype` として配布する（各言語の環境に依存しない）。各言語に実装しない。パーサは `comatype-core` クレートにまとめ、CLI・LSP・WASM から共通で使う。
- `comatype generate --lang <言語>` で、型・検証・`endpoint` などを生成する。
- 各言語には薄いランタイム（`c` = クライアント、`s` = サーバ）を用意する。
- 対象言語: TS / Go / Python / Rust / Java / Kotlin / Swift / Ruby / C#（client + server。実装済み）、Dart（未実装）。

## 2. ファイル構成

| ファイル | 役割 |
|---|---|
| `[method]_[segment].comat` | 1 エンドポイント。メソッドはファイル名から、path は置き場所とファイル名から決まる（§2.3） |
| `init.comat` | プロジェクト固有の宣言（base URL、cookie、ラッパー）。`comatDir` の直下に 1 つだけ置く（§2.5） |
| `defaults.comat` | そのディレクトリと配下のエンドポイントの既定値。ディレクトリごとに置ける（§2.6） |
| `types/*.comat` | 型の定義。`import` で読み込む |
| `comatype.config.json` | `.comat` の場所、生成する言語と出力先（§2.1） |
| 各言語の `init` ファイル | base URL、ラッパーの実装、cookie の設定（コードで書く） |

### 2.1 comatype.config.json

```json
{
  "services": {
    "api": {
      "comatDir": "./comatfiles",
      "targets": [
        { "lang": "ts", "role": "client", "root": "./web" },
        { "lang": "go", "role": "server", "root": "./server", "out": "./server/internal/comatype" }
      ]
    }
  }
}
```

- `services`: 名前を付けた API の単位。1 service = 1 つの `comatDir` と、複数の `targets`。モノレポで複数の API を扱える。
- `comatDir`: その service の `.comat` を置く場所。`comatype generate` はここを走査する。
- `targets`: 生成する言語（`lang`）、`client` / `server`（`role`）、プロジェクトの場所（`root`）、出力先（`out`）。Java / Kotlin は生成物のパッケージ名（`package`。省略すると `out` の `src/main/java/` 以降のパス）も指定できる。Go だけ、生成先の import path（`importPath`、例 `example.com/app/comatype`）も指定できる。省略すると、`root` から上にたどった `go.mod` の `module` と、`go.mod` から `out` までの相対パスで決める。
- 言語を問わず読める JSON にした（パーサは Rust のバイナリだが、他言語のプロジェクトにも置ける）。
- 完全な例は `usage/comatype.config.json`。

#### 出力先の既定値

`out` を省略すると、`<root>/<言語ごとの既定のディレクトリ>` になる。

| 言語 | 既定のディレクトリ |
|---|---|
| TS | `comatype` |
| Go | `comatype` |
| Python / Ruby | `comatype_gen` |
| Rust | `src/comatype_gen` |
| Java | `src/main/java/comatype/gen` |
| Kotlin | `src/main/kotlin/comatype/gen` |
| Swift | `Sources/ComatypeGen` |
| C# | `ComatypeGen` |
| Dart | `lib/comatype_gen` |

- 同じ `root` に、同じ言語の複数の service がある場合は、`<既定>/<service>` になる。
- 同じ `root` に、同じ言語の client と server がある場合は、`<既定>/client` / `<既定>/server` になる。
- `out` を明示した場合は、それを使う。

### 2.2 import

```
import UserData from ../types/UserData.comat
```

- パスは、書いたファイルからの相対で解決する（TS の相対 import と同じ）。

### 2.3 path の決め方

path は `comatDir` からのディレクトリと、ファイル名から自動で決まる。

| ファイル（`comatDir` 以下） | メソッド | path |
|---|---|---|
| `users/post_uid.comat` | POST | `/users/uid` |
| `users/[uid]/post.comat` | POST | `/users/:uid`（動的パス。推奨） |
| `users/post_[uid].comat` | POST | `/users/:uid`（動的パス。非推奨） |
| `post_user.comat` | POST | `/user` |
| `users/posts/[id]/get.comat` | GET | `/users/posts/:id` |
| `users/get.comat` | GET | `/users`（メソッド名だけのファイル = ディレクトリ自体のパス） |
| `(noauth)/get_user.comat` | GET | `/user`（グループ `(noauth)` は path に含まれない） |

- ファイル名は `<method>_<segment>`。最初の `_` までがメソッド、残りが 1 つ分のセグメント。
- 動的パスは `[名前]` で書く（Next.js などのファイルルーティングと同じ。Windows のファイル名にも使える）。
  - ディレクトリ名 `[id]/get.comat`: **推奨**。
  - ファイル名 `get_[id].comat`: 許可（非推奨）。
  - ファイル名の `get__id`（`__`）と `get_:id`（`:`）、ディレクトリ名の `:id` と `__id`: **廃止**（エラー）。
  - path を明示するときは、`path /user/:id` のように `:名前` で書ける。
  - `[...rest]`（残り全部）と `[[id]]`（省略可能）は使えない。
  - 名前の型は、そのファイルの `params { }` で宣言する。
  - 生成物のモジュール名・ファイル名では、`[id]` を `__id` にそろえる（`users/[id]/get.comat` → `users/__id/get`、`users/get_[id].comat` → `users/get__id`）。`[` `]` は、各言語の import に使えないため。
- 深い階層は、ディレクトリで表す。
- ファイル名がメソッド名だけ（`get.comat`、`post.comat`）の場合は、ディレクトリ自体のパスになる。
- `comatDir` 直下の `get.comat` は `/`。
- ファイル内に `path` を明示した場合は、そちらが優先される（**非推奨**。`comatype check` が警告する）。書き方は 2 つ。
  - `path /fix/path`: 固定のパス。ディレクトリの位置に関係なく、そのパスになる。
  - `path ./relative/path`: そのファイルがあるディレクトリのパスからの相対。`user/get_me.comat` に `path ./me` と書くと `/user/me`。
  - 引用符は付けても付けなくてもよい（`path '/user'` も可）。
- ディレクトリ名を `(名前)` のように括弧で囲むと「グループ」になる。グループの `defaults.comat` は配下だけに適用され、グループの名前は path に含まれない（§2.6）。

`usage/comatfiles` が、全パターンの例になっている。

| パターン | ファイル | path |
|---|---|---|
| `comatDir` 直下 | `post_user.comat` / `options_user.comat` / `query_user.comat` | `/user` |
| path を明示（非推奨） | `get_user.comat` | `/user/:id` |
| ディレクトリ自体 | `user/get.comat` | `/user` |
| 静的なセグメント | `user/post_login.comat` | `/user/login` |
| 動的なセグメント | `user/put_[id].comat` / `user/delete_[id].comat`（推奨は `user/[id]/put.comat`） | `/user/:id` |
| ネストしたディレクトリ | `user/profile/get.comat` | `/user/profile` |
| グループ（直下） | `(noauth)/post_user.comat` | `/user` |
| グループ（ネスト） | `user/(noauth)/post_login.comat` | `/user/login` |
| 固定のパス | `user/(noauth)/get_ping.comat`（`path /ping`） | `/ping` |
| 相対のパス | `user/get_me.comat`（`path ./me`） | `/user/me` |

メソッドは `post` / `get` / `put` / `delete` / `options` / `query`（HTTP の QUERY）。

### 2.4 .comat の置き方（想定する使い方）

`.comat` は、次のどちらかで管理する。クライアントとサーバが別のリポジトリでも、同じ `.comat` を読めることが目的。

| 方式 | 構成 | `comatype.config.json` の `comatDir` |
|---|---|---|
| A. モノレポ | 1 つのリポジトリに `.comat` と、クライアント・サーバの各プロジェクトを置く | リポジトリ内のディレクトリ（例: `./comatfiles`） |
| B. `.comat` 専用リポジトリ（サブリポジトリ） | `.comat` だけを管理するリポジトリを作り、各プロジェクトのリポジトリが git submodule で読み込む | submodule のパス（例: `./vendor/api-schema/comatfiles`） |

どちらでも共通のこと:

- 生成物は、`.comat` を読む側（クライアント・サーバの各プロジェクト）に置く。`.comat` のリポジトリには置かない。
- `comatype.config.json` は、`comatype` を実行する側のリポジトリのルートに置く（方式 A では、通常 1 つ。方式 B では、プロジェクトごとに 1 つ）。
- `comatype generate` / `comatype dev` / `comatype build` は、どちらの方式でも同じように動く。

方式 B で注意すること:

- `comatype dev` は、submodule の作業ツリーの `.comat` を監視する。submodule の中の変更は、`.comat` のリポジトリ側でコミットしてから、各プロジェクトが submodule の参照を更新する。
- `comatype.lock.json` は、生成の元になった `.comat` の版（submodule のコミット）を記録する。作業ツリーに未コミットの変更があるときは、`dirty` として記録する。
- `comatype check --check-generated` は、生成物が、いまの submodule のコミットから作られたものかどうかを確認する。食い違いがあれば失敗する。
- path が変わるコミットを取り込んだときも、§7.4 と同じ手順で、生成物だけが自動で直る。

### 2.5 init.comat（プロジェクト固有の宣言）

`comatDir` の直下に 1 つだけ置く。「このプロジェクトに何があるか」を、言語に依存しない形で宣言する。

```
import UserData from ../types/UserData.comat
import ApiError from ../types/common.comat

baseUrl https://api.example.com        // 全エンドポイントの base URL

cookie session {                       // サーバが使う cookie（`cookie on` のエンドポイントで使う）
    httpOnly: true,
    secure: true,
    sameSite: lax,
}

wrapper auth {                         // ラッパーの宣言（実装は各言語のコードに書く）
    ctx { user: UserData }             // ラッパーが ctx に足す値の型
    s401 ApiError                      // ラッパーが返せるステータス
}
```

- `baseUrl` は、実行時に環境変数 `COMATYPE_BASE_URL` か、各言語の init の引数で上書きできる。
- `wrapper <名前>` は、ラッパーの宣言。`.comat` の `wrap <名前>` は、ここで宣言した名前だけを参照できる（未宣言なら `comatype check` がエラー）。
- `wrapper` の `s401` などは、そのラッパーが有効なエンドポイントの `Response` に自動で加わる（`wrap <名前> off` なら加わらない）。
- 生成物は、`comatype_init`（Pascal は `ComatypeInit`）というモジュールになる。ctx の型（`AuthCtx`）、ラッパーが返せるステータス（`S401`）、実装を渡すための型（`Wrappers`）が入る。

### 2.6 defaults.comat（ディレクトリごとの既定値）

`defaults.comat` は、`comatDir` を含む**どのディレクトリにも**置ける。そのディレクトリと配下のエンドポイントの既定値になる。

- 合成の順は、親の `defaults.comat` → そのディレクトリの `defaults.comat` → 各エンドポイントの `.comat`。後ろが勝つ。
- `defaults.comat` に書けるのは、`wrap` / `cookie` / `header` / `headerReq` / `headerRes` / `sNNN`（共通のステータス）。`path` や `body` は書けない。

#### グループ

ディレクトリ名を `(名前)` と括弧で囲むと「グループ」になる。

- そのグループの `defaults.comat` は、グループの配下だけに適用される。
- グループの名前は、path にも、生成物のモジュール名にも含まれない。`(noauth)/get_user.comat` は `/user`、モジュール名は `GetUser`。
- 異なるグループに、同じメソッドと path になるファイルがあると、衝突として `comatype check` がエラーにする。

```
comatfiles/
  init.comat
  defaults.comat                     // wrap auth（全体）
  (noauth)/
    defaults.comat                   // wrap auth off（この配下だけ）
    post_user.comat                  // POST /user
  user/
    defaults.comat                   // user 配下のヘッダ
    (noauth)/
      defaults.comat                 // wrap auth off
      post_login.comat               // POST /user/login
      get_ping.comat                 // path /ping で、GET /ping
```

## 3. エンドポイントの `.comat`

```
import UserData from ../types/UserData.comat

path /user/:id         // 明示（非推奨）。ふつうは置き場所とファイル名で決まる（§2.3）

wrap auth off          // ラッパーの無効化
cookie on              // httpOnly cookie の扱い

params { id: uuidv4 }          // パスパラメータ
search { verbose?: bool }      // クエリ文字列
body UserData                  // リクエストのボディ（エンドポイントに 1 つ。無ければボディなし）

s200 UserData                  // ステータスごとのレスポンスのボディ（nullable）
s404 ApiError
s204 none                      // none = ボディなし
```

- `body` はエンドポイントに 1 つ。`sNNN` はレスポンスだけを書く。
- `sNNN` のボディは nullable（サーバがボディを送らなくてもよい）。
- `sNNN` に書けるコードは、登録されたものだけ（標準 + 設定の `additionalStatusCodes`）。ボディの型を省略した `s404` は、既定の本文になる（下の「ステータスコード」）。
- `none` はボディなし。
- `...UserData` はフィールドの展開。`uid: empty` は「キーごと省略」（型から取り除く）。
- `?` は省略可能なフィールド（`verbose?: bool`）。`| null` は null を許す値。
- `T[]` は配列。

### キャッシュ（cache）

`get` / `query` のエンドポイントだけが、レスポンスをローカルにキャッシュできる（クライアント・サーバとも）。

```
cache off            // 強制的にキャッシュしない
cache 5000           // ttl（ミリ秒）だけ、メモリにキャッシュする
cache 5000 cookie    // ttl だけ、cookie にキャッシュする（クライアントのみ）
```

- 書かなければキャッシュしない。`defaults.comat` / `init.comat` に書くと警告が出て、無視される。`get` / `query` 以外に `off` 以外を書くとエラー。
- キャッシュするのは 2xx のレスポンスだけ（`Set-Cookie` を伴うものは除く）。
- サーバ: ラッパーの前に引く。キーはリクエストの完全一致（メソッド・path・クエリ・全ヘッダ・ボディ）。`cookie` は使わない。
- クライアント: ラッパーの後、通信の直前に引く。キーはメソッド・URL・ボディと、`.comat` に宣言したリクエストヘッダ（ラッパーや init が足すヘッダは含めない）。
- メモリは、プロセスごとに最大 1000 件。cookie は `comatype_cache_<FNV-1a 64 ビット>` という名前で、cookie jar（ブラウザは `document.cookie`）に、ttl（秒に切り上げ）を `Max-Age` にして書く。値は 3800 文字まで。この名前の cookie は、サーバへ送り返さない。
- IR では、エンドポイントの `cache`（`{ "mode": "off" | "memory" | "cookie", "ttlMs": 5000 }`、無ければ null）。

### ヘッダ

```
header    { "X-Request-Id"?: uuid }       // リクエストとレスポンスの両方
headerReq { "X-Client-Version"?: string } // リクエストだけ
headerRes { "X-Server-Time"?: datetime }  // レスポンスだけ

s200 none, { Allow: string[] }            // このステータスのレスポンスだけ（省略可）
```

- `sNNN <ボディ>, { ... }` の 2 つ目のブロックが、そのステータスだけの独自レスポンスヘッダ。
- ハイフンを含む名前は引用符で囲む。`?` は省略可能。名前の大文字小文字は区別しない。
- 配列のヘッダは、通信上は ", " でつないだ 1 つの文字列。
- `Set-Cookie` は書かない。cookie は `cookie on` と init で扱う。
- コードでは、クライアントは `res.headers`、サーバは `s200({ headers })` で扱う（言語の慣習に合わせた名前になる。TS は `Allow`、Python / Ruby / Kotlin は `allow`）。
- リクエストヘッダは `Request` の `headers` に入る。

### 優先順位

親の `defaults.comat` → そのディレクトリの `defaults.comat`（グループを含む）→ 各エンドポイントの `.comat` の順に合成する（§2.6）。次の規則で、後ろが勝つ。

- `wrap <名前>` / `wrap <名前> off`: 名前ごとに合成する。`wrap auth` は有効にし、`wrap auth off` は外す（下位のほうが勝つ）。
- ラッパーの実行順（外側から内側）: 複数のラッパーが有効なときは、次の順で外側から内側に重ねる。外側のラッパーが先に動き、レスポンスは内側から外側へ戻る。
  1. ディレクトリが上の `.comat` ほど外側（親の `defaults.comat` ＞ 子の `defaults.comat` ＞ エンドポイントの `.comat`）。グループ `(noauth)` のディレクトリも、深さで同じように並べる。
  2. 同じ階層では、`defaults.comat` が外側、エンドポイントの `.comat` が内側。
  3. 同じファイルの中では、上に書いた `wrap` ほど外側。
  - 例: 親の `wrap auth`、子の `wrap log` なら、`auth` → `log` → ハンドラの順。
  - `wrap <名前> off` は、その名前の位置から取り除くだけで、残りの順番は変わらない。下位で同じ名前を再び `wrap` した場合は、下位の位置（内側）に置き直す。
- `cookie on|off`: エンドポイント側が勝つ。
- `header` / `headerReq` / `headerRes`: ヘッダ名ごとに合成し、エンドポイント側が勝つ。優先順位は、ステータスごとのヘッダ > `headerReq` / `headerRes` > `header`。
- `sNNN`: ステータスコードごとに合成し、エンドポイント側が勝つ。`defaults.comat` のステータス（`s500` など）は配下の全エンドポイントの `Response` に、`wrapper` のステータス（`s401` など）は、そのラッパーが有効なエンドポイントの `Response` に加わる。

## 4. 型

### 4.1 組み込みのスカラー型

型の実体は、通信上は文字列や数値で、各言語では「文字列を包んだ独自型」にする。ただし、その言語に同じ意味の標準型があれば、通信上の形式（format）を決めて、それを使う。

| 型 | 通信上の形式 | 補足 |
|---|---|---|
| `string` / `bool` / `int` | JSON の文字列 / 真偽値 / 数値 | |
| `email` | 文字列 | メールアドレスの形式を検証 |
| `phone` | 文字列 | E.164 |
| `uuid` | 文字列 | バージョン不問 |
| `uuidv4` / `uuidv7` | 文字列 | バージョンを検証。v7 は時刻順に並ぶ |
| `date` | `YYYY-MM-DD` | 日付のみ |
| `datetime` | RFC 3339（タイムゾーン付き） | |
| `time` | `HH:MM:SS` | 時刻のみ |
| `int64` | **文字列** | JavaScript で 2^53 を超えると精度が落ちるため |
| `decimal` | **文字列** | 金額など。誤差を避ける |
| `url` | 文字列 | URL の形式を検証 |
| `bytes` | base64 の文字列 | |
| `json` | 任意の JSON | |

「独自型」と書いた箇所は、その言語に適した標準型が無いことを示す。標準型を使う場合も、検証（バージョン、形式）はランタイムが行う。

| 型 | TS | Go | Python | Rust | Java | Kotlin | Swift | C# |
|---|---|---|---|---|---|---|---|---|
| `int` | `number` | `int` | `int` | `i64` | `long` | `Long` | `Int` | `long` |
| `uuid` / `uuidv4` / `uuidv7` | 独自型 | 独自型 | `uuid.UUID` | 独自型 | `java.util.UUID` | `java.util.UUID` | `UUID` | `Guid` |
| `date` | 独自型 | 独自型 | `datetime.date` | 独自型 | `LocalDate` | `LocalDate` | 独自型 | `DateOnly` |
| `datetime` | 独自型 | `time.Time` | `datetime.datetime` | 独自型 | `Instant` | `Instant` | `Date` | `DateTimeOffset` |
| `time` | 独自型 | 独自型 | `datetime.time` | 独自型 | `LocalTime` | `LocalTime` | 独自型 | `TimeOnly` |
| `int64` | `bigint` | `int64` | `int` | 独自型（`Int64`） | `long` | `Long` | `Int64` | `long` |
| `decimal` | 独自型 | 独自型 | `decimal.Decimal` | 独自型 | `BigDecimal` | `BigDecimal` | `Decimal` | `decimal` |
| `url` | `URL` | `net/url.URL` | 独自型 | 独自型 | `URI` | `URI` | `URL` | `Uri` |
| `bytes` | `Uint8Array` | `[]byte` | `bytes` | 独自型（`Bytes`） | `byte[]` | `ByteArray` | `Data` | `byte[]` |
| `json` | `unknown` | `json.RawMessage` | `Any` | `serde_json::Value` | `Object` | `Any` | `JSON`（ランタイムの enum） | `object?` |

Java / Kotlin の日時は `java.time`（標準ライブラリ）を使う。C# の `decimal` は 28 桁までで、それを超える値は検証エラーになる。Dart は、生成器が未実装。Ruby は動的な言語なので、型は記述として生成し、変換と検証はランタイムが行う（`date` は `Date`、`datetime` は `Time`、`decimal` は `BigDecimal`、`url` は `URI`、`bytes` は `String`）。

`email` と `phone` は、全言語で独自型（文字列）。

### 4.2 型の宣言

```
UserData {
    name: string,
    email: email,
    uid: uuidv4,
}
```

### 4.3 enum とリテラルのユニオン

```
enum Role { admin, member, guest }       // 名前付き。通信上は文字列
status: "active" | "banned"              // その場で書く
```

- 各言語: TS はリテラルのユニオン、Go は文字列型＋定数、Python は `Enum` / `Literal`、Rust / Java / Kotlin / Swift / C# は enum（C# は `[WireName("...")]` を付けた `enum`）。

### 4.4 制約

```
nickname: string(1..50)                  // 長さ
age: int(0..150)                         // 範囲（片方は省略可: 0..）
zip: string(pattern: "^[0-9]{3}-[0-9]{4}$")
```

- 制約は、送る前と受け取った後の検証に使う。
- 生成する型は変わらない（`string(1..50)` も言語上は `string`）。

## 5. 生成されるコードの名前

### モジュール名（ファイルごと）

`.comat` ごとに 1 つのモジュールを作る。名前は、ディレクトリとファイル名の単語をつないだもの（`__` は動的パスの印なので取り除く）。

| `.comat` | PascalCase（Java / Kotlin / Swift / Ruby / C#） | snake_case（Go / Python / Rust / Dart のパッケージ・モジュール・別名） | TS の import 先 |
|---|---|---|---|
| `post_user.comat` | `PostUser` | `post_user` | `@/comatype/post_user` |
| `user/get.comat` | `UserGet` | `user_get` | `@/comatype/user/get` |
| `user/post_login.comat` | `UserPostLogin` | `user_post_login` | `@/comatype/user/post_login` |
| `user/put_[id].comat` | `UserPutId` | `user_put_id` | `@/comatype/user/put__id` |
| `user/profile/get.comat` | `UserProfileGet` | `user_profile_get` | `@/comatype/user/profile/get` |

- TS / Python / Ruby / Dart は、ファイルの置き場所（`user/put__id`）がそのまま import のパスになる。
- Go は、ディレクトリがパッケージのパス、パッケージ名は snake_case の連結名（`package user_put_id`）。

### モジュールの中の名前

役割で名前が決まる。サーバ側かクライアント側かの印は付けない。

| 名前 | 意味 |
|---|---|
| `path` / `endpoint` | path とメソッド |
| `Body` | リクエストのボディ（`body` の行） |
| `Request` | リクエスト全体（params, search, body） |
| `Response` | 全ステータスのレスポンスの和 |
| `s200`（関数）/ `S200`（クラス） | ステータス 200 のレスポンスを作る |
| `s200.Res` / `S200.Res` / `S200Res` | ステータス 200 のレスポンスのボディの型 |
| `s200.Headers` / `S200.Headers` / `S200Headers` | ステータス 200 のレスポンスヘッダの型（2 つ目のブロックがあるとき） |

- 先頭の `s` / `S` はステータス（status）の頭文字で、サーバ（`s`）とは無関係。
- TS は `s200.Res`（型）と `s200.res`（スキーマ）。Go と Dart は `S200Res`（ネストできないため）。それ以外は `S200.Res`。
- 命名は言語の慣習に合わせる（Go は大文字で公開、Python / Ruby / Kotlin はクラスを PascalCase など）。

## 6. 実行時の仕様

### 呼び出し

```
c.post(path, body, success, ...error)   // クライアント
s.post(path, handler)                   // サーバ
```

- メソッドは `c.post` / `c.get` / `c.put` / `c.delete` / `c.options` / `c.query`（`delete` が予約語なので、名前付き import ではなく `c.` / `s.` 経由で呼ぶ）。
- `get` / `put` / `delete` のリクエストは `{ params, search, body }`。パラメータもボディも無いメソッドは引数なし。ボディだけのメソッドは、ボディをそのまま渡す。
- 結果は `status` / `data` / `error`。2xx は `data`、それ以外は `error`。

### サーバの返し方

- `s200({ data })` でレスポンスを作る。
- ステータスだけ返す場合は `s200()`。ボディだけ返す場合は、最初の 2xx として扱う。
- `empty` のキーは型に存在しないため、送れない。

### init とラッパー

- ラッパーの実装は、各言語のコードに **`ComatypeWrap` 型の値**として書き、export する。init のファイルでそれを import して渡す。
- 名前は `init.comat` の `wrapper <名前>` と同じにする。生成された `Wrappers` 型が、足りないラッパーや型の違いを、コンパイル時（型検査）に知らせる。
- ラッパーは request と `next` を受け取り、レスポンスを返す（どちらも書き換えられる）。ラッパーが見る request / response は、エンドポイントごとの型を持たない生の値。
- ラッパーが `ctx` に足す値の型は、`init.comat` の `wrapper <名前> { ctx { ... } }` で宣言する。サーバ側のラッパーは `ComatypeWrap<AuthCtx>`（言語の書き方に合わせる）で、`wrap auth` が有効なエンドポイントでは、ハンドラで `req.ctx.user` が型付きで読める。
- ラッパーが返せるステータス（`s401` など）は、`init.comat` の `wrapper` に宣言する。実装は、生成された `S401` / `s401()` を返す。
- base URL と cookie の設定（名前、httpOnly など）は `init.comat` にあり、init のコードには書かない。クライアントの cookie の送受信方法（cookie jar など）は、HTTP クライアントに依存するので、各言語の init で切り替える。
- `cookie` は httpOnly。クライアントのコードは値を読まない。`cookie on` のときに送受信するだけ。

```ts
// wrappers/auth.ts（サーバ）
import type { ComatypeWrap } from '@comatype/typescript'
import { s401, type AuthCtx } from "@/comatype/init"
export const auth: ComatypeWrap<AuthCtx> = async (req, next) => { ... }

// init.ts
import { s } from '@comatype/typescript'
import { auth } from "./wrappers/auth"
s.init({ wrappers: { auth } })
```

## 7. 開発時とビルド時

### 7.1 生成物とユーザーのコード

| 種類 | 例 | 扱い |
|---|---|---|
| 生成物 | 型、スキーマ、`endpoint`、`s200()` など | 出力先に書き出す。先頭に `@generated` を付ける。ユーザーは編集しない。comatype が上書き・移動・削除してよい |
| ユーザーのコード | ハンドラ、init、ラッパーの実装（`ComatypeWrap` の値）、`import` を書いたファイル | 出力先の外に置く。comatype は自動で書き換えない |

- 出力先には `comatype.lock.json` を置く。生成したファイルの一覧と、その内容のハッシュ、元の `.comat` を記録する。
- `lock` のハッシュが一致しない生成物は「ユーザーが手を入れた」とみなし、comatype は上書き・移動・削除しない（警告を出す）。

### 7.2 コマンド

| コマンド | 役割 |
|---|---|
| `comatype generate` | 一度だけ生成する |
| `comatype dev` | `.comat` の変更を監視して、開発中の即時反映をする（§7.3） |
| `comatype build` | 動的な部分を生成物に静的に埋め込む（§7.5） |
| `comatype check` | 構文と、明示した `path` の警告などを検査する。`--check-generated` で生成物が最新かも確認する |
| `comatype migrate` | path の変更に伴うユーザーのコードの `import` の書き換えを、計画として表示する。承認したときだけ書き換える（§7.4） |

### 7.3 開発中の即時反映（comatype dev）

`comatype dev` は `comatDir` を監視して、変更のたびに次を行う。

1. `.comat` を再パースして、IR を作る。構文エラーのときは、直前の正常な IR を保ち、エラーを表示する。
2. 前回の IR との差分を調べる。
3. 影響のある生成物だけを再生成する（型ファイルは、エディタの補完のために更新する）。
4. IR を出力先に書き出す（`ir.json`）。

開発中、ランタイム（`c` / `s`）は IR を監視して再読み込みする。そのため、次は**再ビルドなしで**変わる。

- 型の検証（フィールド、制約、`enum`）
- ヘッダ（`header` / `headerReq` / `headerRes` / ステータスごと）
- ステータスの追加・削除、`wrap` と `cookie` の有効 / 無効

次は動的にならない。

- Go / Kotlin / Swift / Dart の**型そのもの**（フィールドの追加など）は、生成物が更新されたあと、各言語のビルド（ウォッチ）が必要。
- サーバのルーティング（path の変更）は、起動時に登録されるため、サーバの再起動が必要。

### 7.4 path が変わったとき

`comatype dev` は IR の差分から変更の種類を判定し、**生成物だけ**を自動で直す。ユーザーのコードには触れない。

| 変更 | 生成物 | ユーザーのコード |
|---|---|---|
| `.comat` の移動・改名（モジュール名が変わる） | 新しい名前で再生成する。旧ファイルは、`lock` のハッシュが一致していれば削除し、一致しなければ残して警告する | 触らない。`comatype migrate` が `import` の書き換え計画を表示し、承認したときだけ `import` の行だけを書き換える |
| 明示した `path` 行の追加・変更 | 同じ場所で再生成する | 触らない |
| `root` / `out` の変更 | 生成物のディレクトリを移動する（`lock` のハッシュが一致するファイルだけ）。一致しないものは移動せず、警告する | 触らない |

- 移動か、削除と追加かは、内容（`params` / `body` / ステータス）が同じかどうかで判定する。
- 変更前に、`--dry-run` で計画を確認できる。
- `comatype migrate` が書き換えるのは `import`（と生成名の参照）だけ。ロジックは書き換えない。

### 7.5 ビルド（comatype build）

- `comatype build` は、開発中に IR から動的に読んでいた部分（検証、ヘッダ、ステータス、`wrap` / `cookie`）を、生成物の中に静的に埋め込む。
- 本番では IR ファイルを読まない。ランタイムは、`comatype dev` が設定した環境でだけ IR を監視する。
- CI やビルドスクリプトに `comatype build` を入れて使う。`comatype check --check-generated` で、生成物が最新かどうかを検査できる。
- 言語ごとのビルドプラグイン（vite / webpack、Gradle、Swift Package、build_runner、`go generate` など）は、あとから足す。

## 8. 未決定

- `init.comat` の構文の細部（`cookie` の項目、`baseUrl` の環境変数での書き方）。
- Go: `url` を `net/url.URL` でなく `comatype.Url`（文字列）にしたことと、`uuid` などを defined type にしたこと（TS はブランドなしの別名、Python は標準の `uuid.UUID`）を、他言語とそろえるか。
- Python: `S200.Res` を型注釈に使えない（mypy が、クラスの中の別名を型として認めないため）。型注釈には `S200Res` を使う。
- `ir.json` の置き場所と、ランタイムが IR を監視する方法（ファイル監視か、`comatype dev` との通信か）。
- dev 中に path が変わったときの、サーバのルーティングの再登録（再起動が必要か）。
- 移動の判定の基準（内容の類似度をどこまで許すか）。
- Swift / Dart のサーバ側（Vapor、dart_frog など）。
- Flutter / React のフック（`c.usePost` など）を提供するパッケージの分け方。
- 制約を型の一部として扱うか（今は検証だけに使う）。
- ヘッダの名前の、各言語での変換規則（`X-Request-Id` → `xRequestId` / `XRequestID` など）。

---

## 9. 実装の状況

| 部品 | 場所 | 状態 |
|---|---|---|
| 構文解析（AST） | `crates/comatype-core/src/parser.rs` | 済。最初のエラーで止まる（複数エラーの回復は未対応） |
| config の読み込み | `crates/comatype-core/src/config.rs` | 済 |
| 名前解決・展開（`...`、`empty`） | `crates/comatype-core/src/project.rs` | 済 |
| path の導出・グループ・defaults と wrap の合成 | 同上 | 済 |
| 検査（`comatype check`） | 同上 | 済。診断は `ファイル:行:桁` つき |
| IR の出力（`comatype ir`） | `crates/comatype-core/src/ir.rs` | 済（`version: 1`） |
| TS ジェネレータ（`comatype generate`） | `crates/comatype-gen-ts` | 済（型・スキーマ・`sNNN`・`endpoint`・`init.ts`）。他の言語は未 |
| `@comatype/typescript`（TS）のスキーマ・`defineStatus`・`ComatypeWrap` | `packages/typescript` | 済 |
| クライアント `c`（TS） | `packages/typescript/src/client.ts` | 済（fetch。型・検証・ラッパー・ヘッダ・cookie） |
| サーバ `s`（TS） | `packages/typescript/src/server.ts` / `node.ts` | 済（Fetch API の `handle`、Node 用の `serve`、cookie の発行） |
| `comatype dev` / `build` / `migrate` / `fmt` / LSP | — | 未 |
| 生成物の型検査 | `scripts/check-generated-ts.sh` | `usage` から生成し、`tsc` と `@ts-expect-error` で型の効き方を確認する |
| クライアント・サーバの E2E（TS） | `scripts/e2e-client.sh` | 生成した TS のクライアントを手書きの HTTP サーバに、さらに生成した `s` のサーバにつなぐ（tsx） |
| `usage` の TS（動く見本 + テスト） | `usage/node_server`、`usage/node_client` | 済。`usage` が pnpm のルートで、`cd usage && pnpm check`（generate → typecheck → test） |
| ステータスコードの登録表 | `crates/comatype-core/src/status.rs` | 済。標準の 62 コード + 設定の `additionalStatusCodes`。未登録のコードはエラー。`comatype statuses` |
| OpenAPI（`to-openapi` / `from-openapi`） | `crates/comatype-openapi` | 済。OpenAPI 3.0.3 の書き出しと取り込み（取り込みから続けてコード生成）。`scripts/check-openapi.sh` で公式のバリデータにかける |
| 仕様書サイト | `docs/` | 済。Next.js（`output: 'export'` の静的サイト。出力は `docs/out/`。サブパス配信は `DOCS_BASE_PATH`）+ React + TypeScript。Monaco に `.comat` の文法（VS Code 拡張と同じ TextMate 文法）を入れた Playground とエディタ。`pnpm --dir docs build` / `test` |
| `cache`（メモリ・cookie） | 各ランタイムの `cache` | 済。TS / Go / Python / Rust / Java / Kotlin / Swift / Ruby / C#。cookie の統合テストは TS のみ（ほかは符号化と、メモリの E2E） |
| 言語サーバ（LSP） | `crates/comatype-lsp`（`comatype lsp`） | 済。入力中の診断（未保存の内容を使う）、定義ジャンプ、ホバー、アウトライン、補完。`cargo test -p comatype-lsp` |
| VS Code 拡張 | `editors/vscode` | 済。言語サーバのクライアント、ハイライト（TextMate 文法 `source.comat`）、スニペット、生成コマンド。`cd editors/vscode && pnpm test`。実際の VS Code での動作は未確認。tree-sitter は未 |
| Go ジェネレータ | `crates/comatype-gen-go` | 済（client / server。型・構造体タグ・`sNNN`・`init`・cookie） |
| Go ランタイム `comatype` / `c` / `s` | `packages/go` | 済（`go test ./...`） |
| Go の E2E | `scripts/e2e-go.sh` | `usage` から生成して `go vet`、生成した client を生成した server につなぐ |
| Python ジェネレータ | `crates/comatype-gen-python` | 済（client / server。pydantic v2 のモデル・dataclass） |
| Python ランタイム `comatype`（`c` / `s`） | `packages/python` | 済（`pytest`、`mypy --strict`）。要 Python 3.10 以上 |
| Python の E2E・型検査 | `scripts/e2e-python.sh` | `usage` から生成して mypy（strict）、生成した client を生成した server（uvicorn）につなぐ |
| Rust ジェネレータ・ランタイム | `crates/comatype-gen-rust`、`packages/rust` | 済（client / server。serde・ureq・regex を使う。サーバは `s::Server`。`cargo test`、`scripts/e2e-rust.sh`） |
| Java ジェネレータ・ランタイム | `crates/comatype-gen-java`、`packages/java` | 済（依存なし。record・sealed interface。サーバは JDK の `com.sun.net.httpserver`。要 JDK 21 以上。`scripts/e2e-java.sh`） |
| Kotlin ジェネレータ・ランタイム | `crates/comatype-gen-kotlin`、`packages/kotlin` | 済（data class・sealed interface。コルーチン（suspend）の c / s は `packages/kotlin`、型・検証は `packages/java`。標準ライブラリのみ。要 kotlinc。`scripts/e2e-kotlin.sh`） |
| Swift ジェネレータ・ランタイム | `crates/comatype-gen-swift`、`packages/swift` | 済（Foundation のみ。クライアントは async、サーバは async ハンドラ + POSIX ソケットの HTTP/1.1 サーバ（keep-alive・チャンク対応）。`swift run comatype-selftest`、`scripts/e2e-swift.sh`） |
| Ruby ジェネレータ・ランタイム | `crates/comatype-gen-ruby`、`packages/ruby` | 済（標準ライブラリのみ。サーバは Rack 互換 + 簡易サーバ。要 Ruby 3.1 以上。`ruby packages/ruby/test/comatype_test.rb`、`scripts/e2e-ruby.sh`） |
| C# ジェネレータ・ランタイム | `crates/comatype-gen-csharp`、`packages/csharp` | 済（標準ライブラリのみ。record・sealed な record の階層。クライアントは `HttpClient` の async、サーバは async / 同期のハンドラ + `HttpListener`。要 .NET 8 以上。`scripts/e2e-csharp.sh`） |

```bash
cargo run -p comatype-cli -- check --config usage
cargo run -p comatype-cli -- ir --config usage -o ir.json
cargo test
./scripts/check-generated-ts.sh   # 生成した TS の型検査
(cd packages/typescript && pnpm test)         # スキーマ・クライアントのテスト
./scripts/e2e-client.sh                 # 生成物の c / s の E2E（TS）
(cd usage && pnpm install && pnpm check)  # usage の TS のサーバ・クライアント（動く見本）のテスト
./scripts/e2e-go.sh                     # 同じく Go
(cd packages/go && go test ./...)       # Go のランタイムのテスト
./scripts/check-openapi.sh              # OpenAPI（要 .venv の openapi-spec-validator）
./scripts/gen-status-snippets.sh        # ステータスコードのスニペットを、登録表から作り直す
./scripts/e2e-python.sh                 # Python（要 .venv。下を参照）
(cd packages/python && ../../.venv/bin/python -m pytest && ../../.venv/bin/mypy comatype)
cargo run -p comatype-cli -- generate --config usage --lang ts
```

実装で決めた細部（SPEC の本文にまだ無かったもの）:

- `import` で読まれていない型のファイル（`usage/types/Profile.comat` など）は、いまは検査されない。
- 型の ID は `<config からの相対パス（拡張子なし）>::<型名>`（例: `types/UserData::UserData`）。IR の `types` のキーで、`Ref` はこれを指す。
- `...Type` と `empty` は IR では展開済みで、`empty` のフィールドは IR から消える。
- `init.comat` が無いときは警告にとどめる（`wrap` を使うとエラー）。
- 制約は `string` / `int` / `int64` / `decimal` の範囲と、`string` の `pattern` だけ。

TS ジェネレータで決めた細部:

- 出力は `<out>/types.ts`（名前付きの型）、`<out>/init.ts`（ラッパーの ctx 型・ステータス・`Wrappers`）、`<out>/<module>.ts`（エンドポイントごと）。
- 名前付きの型は、型（`type`）とスキーマ（`const`）を同じ名前で出す。型は IR から直接書き、スキーマには `Schema<型>` の注釈を付けるので、再帰した型でも推論が詰まらない。
- 文字列を包む型（`email` `phone` `uuid*` `date` `datetime` `time` `decimal`）は、TS では**ブランドなしの別名**（`type Uuid = string`）。ブランドを付けると `usage` の `{ id }`（string）がそのまま渡せなくなるため。検証は `parse` が行う。ブランドにするかは §8 で決める。
- `int64` は通信上が文字列、TS では `bigint`（`parse` / `encode` で変換）。`url` は `URL`、`bytes` は `Uint8Array`（base64）。
- `s200` は `defineStatus` の戻り値で、`S200`（型）、`s200`（関数）、`s200.Res` / `s200.Headers`（`declare namespace`）の 3 つが同じ名前で並ぶ。呼び出しの引数は、2xx が `{ data }`、それ以外が `{ error }`。ボディが `none` で、必須のヘッダも無ければ、引数なしで呼べる。
- `endpoint` に、メソッド・path・wraps・cookie・スキーマ・レスポンスの一覧が入る。`path` は `endpoint` と同じ値。
- ラッパーが宣言したステータス（`s401`）は、`init.ts` と、そのラッパーが有効なエンドポイントのモジュールの両方に出る。
- 同じ名前の型が複数のファイルにあるとエラー（TS は `types.ts` 1 つにまとめるため）。2 つのラッパーが同じ `sNNN` を宣言しても、エラー。
- ヘッダの値は文字列で届くので、`int` などのヘッダを数値に直す処理は、クライアント / サーバのランタイムで行う（未実装）。
- 古い生成ファイルの削除は、まだしない。

クライアント `c`（TS）で決めた細部:

- **リクエストの渡し方**は、エンドポイントの `Request` の形で決まる（`c.get` などのオーバーロード）。
  - `params` / `search` / `body` が無い → 引数なし: `c.get(path, s200)`。
  - `body` だけ → ボディをそのまま渡す: `c.post(path, body, s200)`。
  - `search` だけで、全部任意 → 引数ごと省略できる: `c.get(path, s200)` / `c.get(path, { search }, s200)`。
  - それ以外 → `{ params, search, body }`。
  - リクエストヘッダ（`header` / `headerReq`）は引数では渡さず、`c.init({ headers })` か `c.with({ headers })` で付ける。
- **戻り値**は、渡したステータスのレスポンスの和（`status` で絞り込める）。`const { status, data, error } = await c.post(...)` と分割代入できるよう、無いキーは `undefined` になる。
- **渡していないステータス**のレスポンスが返ると `UnexpectedStatusError`（`s500` を毎回渡す必要は無いが、返ってきたら例外）。
- **送る前の検証**: `params` / `search` / ヘッダ / `body` は、`encode` してから `parse` し直して検証する。不正なら通信せずに `ValidationError`。
- **受け取った後の変換**: ボディは `parse`。ヘッダは、文字列から `int` / `bool` / 配列（`", "` 区切り）に直してから `parse`（ヘッダ名は大文字小文字を区別しない）。
- **ラッパー**は、外側から内側の順に `send` へ重ねる。`wrap` されているのに init に渡していないラッパーがあれば、通信前に `ComatypeError`。ラッパーが `s401()` などで作ったレスポンスは、検証済みの値として、そのまま呼び出し側へ返る。
- **base URL の優先順位**は、`c.init({ baseUrl })` ＞ 環境変数 `COMATYPE_BASE_URL` ＞ `init.comat` の `baseUrl`（生成された `endpoint` に入る）。
- **`c.init({ wrappers })`** の型は、生成された `init.ts` の `declare module '@comatype/typescript'` で `Wrappers` に差し替わる。`init.comat` に宣言したラッパーが足りない、または型が違うと、コンパイルエラー。
- **`ComatypeWrap<Ctx>`** の `req` / `next` の ctx は `Partial<Ctx>`。ctx を使わないラッパーも `ComatypeWrap<AuthCtx>` の枠に入れるため（`next` に ctx の漏れを検出させることは諦めた）。
- `cookie on` のエンドポイントには `c.init({ cookie: { credentials } })` を fetch に渡す。Node など cookie を保持しない環境用に、`cookie: { jar: createCookieJar() }` も使える（下の「cookie」）。
- リトライ・タイムアウトは未実装（`c.with({ signal })` で中断はできる）。

サーバ `s`（TS）で決めた細部:

- **入口**は `s.handle(request: Request): Promise<Response>`（Fetch API）。Node は `import { serve } from '@comatype/typescript/node'` の `serve({ port })`、または `nodeListener(s)` を `http.createServer` に渡す。Bun / Deno / Workers は `handle` を直接使う。
- **ハンドラが受け取る `req`**: `params` / `search` / `body` / `headers`（検証・変換済み）、`cookies`、`ctx`、`method`、`path`。`search` は無ければ `{}`、`body` が無いエンドポイントでは `undefined`。`ctx` の型は、そのエンドポイントで有効なラッパーの ctx の積（生成された `export type Ctx`）。
- **ハンドラの戻り値**は、そのエンドポイントの `Response`（`s200()` などで作ったもの）。ステータスだけの `none` は `s204()`。ボディだけを返す書き方は未対応。
- **入力の検証エラー**は、ハンドラを呼ばずに `400`（`{ code: 'validation_error', message, path }`）。ボディが JSON でなければ `400`（`invalid_json`）。この 400 は `.comat` の `Response` には含まれない。
- **出力の検証**: ハンドラの戻り値を `encode` して `parse` し直す。`.comat` に無いステータスや、型に合わないボディは `500`（`{ code: 'internal_error' }`）で、中身はクライアントに見せず、`onError` か `console.error` に出す。例外も同じ。
- **ルーティング**: 静的なセグメントが動的より優先。末尾の `/` は無視。path に合うがメソッドが違うと `405`（`Allow` 付き）、合わなければ `404`。同じメソッド・同じ形の path を 2 回登録すると、登録時に `ComatypeError`。`s.get` に PUT のエンドポイントを渡すとコンパイルエラー（`Endpoint` の第 4 型引数がメソッド）。
- **ラッパー**は、リクエストを組み立てた後、外側から内側の順に重なる。ラッパーは生のリクエスト（通信上の形）と、通信上の形のレスポンスを見る。ラッパーが `s401()` で作ったレスポンスは、その場で `encode`・検証して通信上の形にするので、外側のラッパーからも同じ形で見える。

cookie（`init.comat` の `cookie session { ... }`、`cookie on|off`）で決めた細部:

- **宣言**: `init.comat` に `cookie <name> { httpOnly, secure, sameSite, path, domain, maxAge }` を 1 つ書く。`sameSite` は `lax` / `strict` / `none`（`none` は `secure: true` が必要）、`maxAge` は秒。未知のキーや不正な値は `comatype check` がエラーにする。`path` の既定は `/`。
- **生成**: `cookie on` のエンドポイントの `endpoint` に `cookieDef`（上の設定）が入る。`init.ts` の `declare module` が `cookies: 'session'` を登録し、`CookieInit`（`{ session?: CookieValue }`）の型になる。
- **発行（サーバ）**: `cookie on` のエンドポイントの `sNNN()` に `cookie: { session: ... }` を渡す。ラッパーが作る `s401()` などにも渡せる。
  - 文字列 → その値で `Set-Cookie`（属性は `init.comat` の設定）。
  - `{ value, maxAge, expires, path, domain }` → この発行だけ有効期限などを変える（`httpOnly` / `secure` / `sameSite` は変えられない）。
  - `null` → 削除（`Max-Age=0` と過去の `Expires`）。
  - 宣言に無い名前や、`cookie off` のエンドポイントで渡すと、サーバの誤りとして `500`（`Set-Cookie` は出さない）。値は `encodeURIComponent` で、`path` / `domain` に `;` や改行があるとエラー。
- **受信（サーバ）**: `req.cookies`（ハンドラ）と `RawRequest.cookies`（ラッパー）。
- **クライアント**: ブラウザは `credentials: 'include'` でブラウザに任せる。Node などは `createCookieJar()` を `c.init({ cookie: { jar } })` に渡すと、`cookie on` のエンドポイントのレスポンスの `Set-Cookie` を保持し、次のリクエストに送る（Path と期限だけを見る。API が 1 つの origin である前提で、Domain は無視する）。ラッパーは `RawRequest.cookies` に足すことで、リクエストに cookie を付けられる。
- **HttpOnly**: jar は HttpOnly の cookie も保持する（js から読ませないのはブラウザの役目で、Node のクライアントにとっては HTTP クライアントの状態にすぎない）。
- 未実装: 複数の cookie の宣言（`init.comat` は 1 つ）、署名・暗号化、`__Host-` などの接頭辞の検査、`Partitioned`。

Go（`crates/comatype-gen-go`、`packages/go`）で決めた細部:

- **ランタイム**は Go モジュール `github.com/oldsheeep3/comatype/packages/go`（`packages/go`）。共有の `comatype`、クライアントの `c`、サーバの `s` の 3 パッケージ。生成物は `comatype`（と、client / server に応じて `c` / `s`）だけに依存する。
- **生成物**: `<out>/types/types.go`（package `types`）、`<out>/init/init.go`（package `comatype_init`）、`<out>/<module>/endpoint.go`（package は `user/put__id` → `user_put_id`）。`types` / `init` という名前のディレクトリ（モジュール）は衝突するのでエラー。client と server で `init` と `endpoint` の中身が違う。`gofmt` があれば生成後に整える。
- **型の対応**: `string` `bool` `int` はそのまま。`email` `phone` `uuid` `uuidv4` `uuidv7` `date` `time` `decimal` `url` は文字列を包んだ defined type（`comatype.Email` など。`Validate()` を持つ）、`datetime` は `time.Time`、`int64` は `comatype.Int64`（通信上は文字列）、`bytes` は `[]byte`（base64）、`json` は `json.RawMessage`。`uuid` などは defined type なので、`string` からは `comatype.Uuidv4(id)` で変換する。
- **フィールド**: 省略可能（`?`）は、ボディの構造体ではポインタ + `omitempty`（スライスは `omitempty` だけ）、path・クエリ・ヘッダの構造体ではポインタ。`T | null` はポインタ。名前は Go の慣習で `ID` `UID` `URL` などにする（`X-Request-Id` → `XRequestID`）。宣言した型の名前はそのまま（先頭を大文字にするだけ）。
- **制約**は構造体タグ（`min` `max` `pattern` `oneof`）。文字列リテラルだけのユニオンは `string` + `oneof`。それ以外のユニオン、`null` だけの型、`null` を含む配列の要素は、Go では表せないのでエラー。path・クエリ・ヘッダにはスカラーとその配列、enum だけ。
- **検証**: `comatype.Decode`（受信）は、JSON の形（必須のキー、`null`、型）→ デコード → `Validate()` と制約の順。`comatype.Encode`（送信）は、検証してから JSON にする。ボディ・path・クエリ・ヘッダのどれも、クライアントは送る前に、サーバは受けた後と返す前に検証する。入力の不正は `400`（`validation_error`）、`.comat` に合わないレスポンスは `500`。
- **`Request` と `Response`**: `Request` は `Params` `Search` `Body` `Headers`（あるものだけ）と、server のみ `Ctx`。`Response` は `Status` と、ステータスごとのフィールド（`S200` `S200Headers` ...。ボディが `none` なら `S204` は無い）。クライアントは `*Response` を受け取り、`Status` で分岐する。`.comat` に無いステータスは `*comatype.UnexpectedStatusError`。
- **クライアントの引数**: `params` / `search` があれば `Request`、`body` だけなら `Body`、なければ省略できる（`c.Options(ctx, ep)`）。リクエストヘッダは `Request.Headers`（object 形式のとき）か `Config.Header`。
- **サーバのコンストラクタ**: `S200(body)`。ボディが `none` なら `S204()`。必須のレスポンスヘッダがあるときだけ引数に取る（`S200(nil, &S200Headers{...})`）。任意のヘッダは `.WithS200Headers(&S200Headers{...})`。cookie は `.WithCookie(value, comatype.MaxAge(3600))` / `.ClearCookie()`（`cookie on` かつ `init.comat` に宣言があるときだけ）。
- **ラッパー**: サーバは `s.ComatypeWrap[Ctx]`（`func(req *s.RawRequest[Ctx], next s.Next[Ctx]) s.RawResponse`）。`req.Ctx` を書いて `next(req)` を呼ぶと、ハンドラの `req.Ctx.<Wrapper>Ctx`（フィールドは埋め込みなので `req.Ctx.User` で読める）に入る。クライアントは `c.ComatypeWrap`（`func(req *c.RawRequest, next c.Next) (*c.RawResponse, error)`）。`init` パッケージの `Wrappers` 構造体のフィールドに入れて `Init` に渡す。nil のラッパーを使うエンドポイントは、クライアントはエラー、サーバは `500`。型で「足りない」を検出することは、Go の構造体リテラルでは省略できるのでできない。ラッパーが返すステータスは `comatype_init.S401(...)`（`comatype.RawResponse`）。
- **サーバ**: `s.Get(ep, handler)`…を登録し、`s.Handler()`（`net/http`）か `s.ListenAndServe`。静的なセグメントが動的より優先、末尾の `/` は無視、メソッド違いは `405`（`Allow` 付き）、無ければ `404`。handler の panic は `500`（`Config.OnError` に渡す）。同じルートの二重登録、メソッド違いのエンドポイントは `panic`。
- **cookie jar**: `c.Config.CookieJar`（`c.NewCookieJar()`）。TS と同じ仕様（Path と期限だけ）。
- 未実装: Go の `Partitioned` などの cookie 属性、複数の cookie の宣言、ストリーミングのボディ。

Python（`crates/comatype-gen-python`、`packages/python`）で決めた細部:

- **前提**: Python 3.10 以上、pydantic v2、httpx。ランタイムは `packages/python` の `comatype`（`from comatype import c, s, ComatypeWrap, Cookie`）。開発用の環境は、リポジトリ直下に `uv venv --python 3.12 .venv` で作り、`uv pip install --python .venv/bin/python pydantic httpx mypy pytest pytest-asyncio uvicorn` を入れる（`.venv` は git に入れない）。
- **生成物**: `<out>/models.py`（名前付きの型）、`<out>/comatype_init.py`（ラッパー・ctx・ラッパーのステータス）、`<out>/<module>.py`（`user/put__id` → `comatype_gen.user.put__id`）、各ディレクトリの `__init__.py`。import は相対なので、`out` の名前や場所に依存しない。`models` / `comatype_init` というモジュール・ディレクトリ、Python のキーワード、英数字と `_` 以外を含む名前はエラー。`get.comat` と `get/` のようにモジュールとディレクトリが重なるのもエラー。
- **型の対応**: `string` `bool` `int` はそのまま。`uuid*` は `uuid.UUID`（`uuidv4` / `uuidv7` はバージョンを検証）、`date` は `datetime.date`、`datetime` はタイムゾーン付きの `datetime`、`time` は `datetime.time`、`int64` は `int`（通信上は文字列）、`decimal` は `Decimal`（通信上は文字列）、`bytes` は `bytes`（通信上は base64）、`json` は `Any`。`email` `phone` `url` は検証付きの `str`（`Annotated`）。ユニオンはそのまま `Union[...]` にでき、文字列リテラルだけのユニオンは 1 つの `Literal[...]`。
- **フィールド**: 名前は snake_case で、通信上の名前は pydantic の `alias`（`populate_by_name=True` なので、どちらの名前でも作れる）。省略可能（`?`）は `Optional[T] = None`、送るときは `None` ならキーごと消す。`T | null` は `Optional[T]` で、必須のまま `null` を送る。`from` のようなキーワードや `json` のような `BaseModel` の属性名は末尾に `_` を付ける。
- **検証**: ボディは JSON の型に厳密（文字列の `"5"` を `int` にしない）。path・クエリ・ヘッダは文字列で届くので、`int` / `bool` / 配列に直してから検証する。送る前にも、`model_construct` で検証を飛ばして作った値まで含めて、もう一度検証する。入力の不正は `400`（`validation_error`、`path` は `body.name` のような形）、`.comat` に合わないレスポンスは `500`。
- **`Request`**: dataclass（`kw_only`）。`params` `search` `body` `headers` のうち、あるものだけ。全部任意のものは既定値があり、server のみ `ctx`。client は `Request` の `ctx` が無い。
- **ステータス**: `S200` は dataclass（`Status` を継承）。`status`（`Literal[200]`）、2xx は `data`、それ以外は `error`、ヘッダがあれば `headers`（必須のヘッダがあるときは必須の引数）、server で cookie on なら `cookie`。ボディとヘッダの型はモジュール直下の `S200Res` / `S200Headers`。`S200.Res` / `S200.Headers` は同じものの別名で、`S200.Res(code=...)` のように作るときに使う。`Response` は全ステータスの和。
- **クライアント**: `await c.put(path, Request(...), S200, S404)`。戻り値は渡したステータスの和（`match res.status` や `isinstance` で絞り込める）。リクエストの引数は、`params` / `search` があれば `Request`（省略はできない。全部任意なら `Request()`）、`body` だけなら `Body`、無ければ引数なし。ステータスは 6 個まで型が付く（`@overload`）。渡していないステータスは `UnexpectedStatusError`。`c.init(wrappers=, base_url=, cookies=True|CookieJar, headers=, client=)`、`c.with_headers({...})`。async のみ。
- **サーバ**: `@s.put(path)` でハンドラ（`async def` でも `def` でも）を登録する。引数の型は `Request`、戻り値の型は `Response` に型検査で合わせられる。`s` 自体が ASGI アプリなので `uvicorn.run(s)`。テストでは `httpx.ASGITransport(app=s)`。`Server()` で別のインスタンスも作れる。ルーティングの規則（静的優先・末尾の `/`・405 の `Allow`・重複登録のエラー）は TS・Go と同じ。例外は `500`（`s.init(on_error=)` に渡す）。
- **ラッパー**: `ComatypeWrap[AuthCtx](fn)`。`fn(req, next)` は async で、`req` は `RawRequest`（`headers` は大文字小文字を区別しない、`cookies`、`ctx`）、`await next(req)` で次へ。サーバでは `req.ctx = AuthCtx(...)` と書いてから `next` を呼ぶと、ハンドラの `req.ctx.user`（型付き）に入る。戻り値は `RawResponse` か `S401(...)`。`comatype_init.Wrappers(auth=...)` は必須の引数なので、足りなければ型検査で分かる。
- **mypy**: `pydantic.mypy` プラグインで、`init_typed = true` と `init_forbid_extra = true` を設定すると、`S200(data=1)` や `Body(uid=...)`（`uid: empty` のフィールド）が型エラーになる。
- **cookie**: `Cookie("値", max_age=3600)` / `Cookie.clear()` / 文字列。`c.init(cookies=True)` で jar（TS・Go と同じ仕様）。
- 未実装: 同期のクライアント、複数の cookie の宣言、`Partitioned` など。

`usage` の TypeScript の見本（`usage/node_server`、`usage/node_client`）:

- `usage` が pnpm のワークスペースのルート（`pnpm-workspace.yaml`）。`@comatype/typescript` は `link:../../packages/typescript` で、リポジトリのものを直接使う。`@/comatype/...` は各パッケージの `tsconfig.json` の `paths`。
- 生成物（`node_*/comatype`）はコミットする。`.comat` を変えたら `pnpm generate`（`comatype generate --lang ts`）。
- `node_server`: `s.get(path, handler)` のエンドポイントごとのファイル、`db.ts`（メモリ上）、`wrappers/auth.ts`（cookie の `session` か `Authorization: Bearer` で認証）、ログインで `Set-Cookie` を発行。`test/server.test.ts` は `s.handle(Request)` を直接呼ぶ（ネットワークなし）。
- `node_client`: `api.ts`（全エンドポイントを呼ぶ関数）、`init.ts`（cookie jar）、`wrappers/auth.ts`（`X-Client-Version` と `X-Request-Id` を付ける）。`test/e2e.test.ts` は `node_server` を別プロセスで起動して、本物の HTTP でつなぐ。
- 他の言語の見本（`go_*` など）は、書き方を示すもので、実行はしない。実行して確かめるのは `scripts/e2e-*.sh`。

言語サーバ（`comatype lsp`）で決めた細部:

- **通信**: 標準入出力、JSON-RPC 2.0（`Content-Length` 付き）。同期は全文（`TextDocumentSyncKind.Full`）。位置は LSP の決まりどおり UTF-16 の単位で、内部の「文字の数」と相互に変換する。
- **診断**: ファイルを開く・編集するたびに、そのファイルが属するプロジェクト（上に向かって探した `comatype.config.json`）を検査し直す。開いているファイルの**未保存の内容**を、ディスクより優先して読む（`comatype-core` の `check_config_with_overlay`）。結果は、診断のあったファイル全部に出す（開いていないファイルにも）。前回あって今回無いファイルには、空の診断を出して消す。設定ファイルが無い場所の `.comat` は、そのファイルだけの構文検査。
- **構文エラーがあるあいだ**: パーサの診断（`Diagnostic.syntax`）だけを出す。型が見つからないなどの意味のエラーは、入力の途中では多すぎて邪魔になるので、構文が直るまで出さない。
- **定義ジャンプ・ホバー・補完・アウトライン**は、構文木ではなく、テキストの行ごとの走査（宣言、import、単語の位置）で動く。入力の途中の、構文エラーがあるファイルでも使えるため。
- **未対応**: 名前の変更（rename）、参照の検索、コードアクション、フォーマット（`comatype fmt` と合わせて）、複数のエラー（パーサは最初のエラーで止まる）、ディスクに無い未保存の新規ファイル（プロジェクトの一員として数えない）、インクリメンタルな同期（編集のたびに全文を検査する。小さなプロジェクト向け）。

ステータスコード（`status.rs`、`comatype statuses`）で決めた細部:

- **登録表**: IANA に登録された標準のコード 62 個（100–103、200–208、226、300–305、307、308、400–418、421–426、428、429、431、451、500–508、510、511）と、メッセージ（`Not Found` など）。未使用のコード（306 など）は入れない。`comatype statuses`（`--json` / `--snippets`）で一覧を出せる。
- **未登録のコードはエラー**: `s499` と書くと `未定義` のエラー（`.comat` の `sNNN`、`wrapper` の中の `sNNN` の両方）。
- **`additionalStatusCodes`**: `comatype.config.json` の最上位に `"additionalStatusCodes": [{ "status": 299, "message": "Custom" }]` と書くと、コードを足せる。`status` は 100〜599、標準で定義済みのコードや、重複、空の `message` はエラー。足したコードは、本文を持てる普通のコードとして扱う。
- **既定の本文**: 型を省略した `s404`（`s404, { ... }` で、ヘッダだけ書くのも同じ）は、`{ message: string }`。メッセージ（`Not Found`）は本文の型には入れず、OpenAPI の説明やエディタの表示に使う。
- **本文を持てないコード**（1xx、204、205、304）: 型を省略すると `none`。`s204 User` のように本文を書くとエラー。
- **スニペット**: `editors/vscode/snippets/status.json` に、全コードの `s404` などが入る（`s404 { message: string, }`、本文なしは `s204 none`）。登録表から `scripts/gen-status-snippets.sh` で作り直す（テストで、登録表との一致を確かめている）。

OpenAPI（`comatype-openapi`）で決めた細部:

- **`comatype to-openapi [--config] [-o file] [--service name]`**: `.comat` を検査して、OpenAPI 3.0.3（YAML。`-o` が `.json` なら JSON）にする。パスは `/user/:id` → `/user/{id}`、`params` はパス、`search` はクエリ、`headerReq` はヘッダのパラメータ、`body` は `requestBody`（`application/json`）、`sNNN` は `responses`（説明は登録表のメッセージ）、型は `components.schemas`（enum も）。`?` は `required` に入れず、`T | null` は `nullable: true`。`int64` / `decimal` は通信上は文字列なので `type: string` + `pattern`、`phone` / `uuidv4` / `uuidv7` / `json` などは拡張キー `x-comatype` で元の型を残す（取り込みで戻せる）。
- **表せないもの**: OpenAPI 3.0 に QUERY メソッドは無いので、`x-comatype-query` のキーに入れる。ラッパー（`wrap`）と cookie は `x-comatype-wraps` / `x-comatype-cookie`（参考情報。取り込みでは戻さない）。
- **`comatype from-openapi <file> [--out DIR] [--target lang:role:root]... [--generate] [--force]`**: OpenAPI 3（YAML / JSON）から `comatfiles/`（エンドポイントと `init.comat`）、`types/`（型）、`comatype.config.json` を作る。作ったものを検査して、`--generate`（と `--target`）があれば続けてコードも生成する。`comatfiles` か設定ファイルが既にあれば、`--force` が無いと止まる。
  - ファイル名は path とメソッドから（`/user/{id}` の GET → `user/get_[id].comat`、`/pets` の GET → `get_pets.comat`）。途中に `{id}` がある path は、`path /a/:id/b` を明示して、`operationId` をファイル名にする。
  - 型: `allOf` は `...Base` で展開、`oneOf` / `anyOf` はユニオン、識別子にできる文字列の enum は `enum`、そうでない enum はリテラルのユニオン、`$ref` の先が単純な型（別名）なら inline。`format`（email / uuid / date / date-time / uri / byte）と `minLength` / `maxLength` / `minimum` / `maximum` / `pattern` は対応する型・制約に。
  - 本文が `{ message: string }` だけのレスポンスは、型を省略した `s404` に戻る。標準に無いコードは、`additionalStatusCodes` に（説明をメッセージにして）足す。
  - 表せないものは `json` にして、警告に出す: `number`（小数）、`additionalProperties`（map）、ユニオンの配列、JSON 以外の本文、`default` や `2XX` のレスポンス、`trace`。
- **確認**: `scripts/check-openapi.sh` が、`usage` から作った OpenAPI を公式のバリデータ（openapi-spec-validator）で検証し、取り込み → 検査 → もう一度書き出しまで通す。`cargo test -p comatype-openapi` に、往復（`.comat` → OpenAPI → `.comat` → OpenAPI で同じになる）のテストがある。
- **VS Code 拡張**: `Comatype: Export OpenAPI`（保存先を選ぶ）、`Comatype: Import OpenAPI`（ファイル・フォルダ・続けて生成する言語を選ぶ）、`Comatype: Show Status Codes`（一覧から選んで挿入）。
