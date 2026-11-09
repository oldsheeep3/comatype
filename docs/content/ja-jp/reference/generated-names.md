# 生成されるコードの名前

## モジュール名（ファイルごと）

`.comat` ごとに 1 つのモジュールができます。名前は、グループを除いたディレクトリとファイル名の単語をつないだものです（`__` は動的パスの印なので取り除きます）。

| `.comat` | TypeScript の import | Go（パッケージ） | Python |
|---|---|---|---|
| `post_user.comat` | `@/comatype/post_user` | `post_user` | `comatype_gen.post_user` |
| `user/get.comat` | `@/comatype/user/get` | `user_get` | `comatype_gen.user.get` |
| `user/post_login.comat` | `@/comatype/user/post_login` | `user_post_login` | `comatype_gen.user.post_login` |
| `user/put_[id].comat` | `@/comatype/user/put__id` | `user_put_id` | `comatype_gen.user.put__id` |
| `user/profile/get.comat` | `@/comatype/user/profile/get` | `user_profile_get` | `comatype_gen.user.profile.get` |

- TS と Python は、ファイルの置き場所がそのまま import のパスになります。
- Go は、ディレクトリがパッケージのパス、パッケージ名は snake_case の連結名（`package user_put_id`）です。
- Rust は snake_case の連結名のモジュール（`user_put_id`）、Java / Kotlin / Swift / Ruby は PascalCase の連結名（`UserPutId`）です。
- 次の名前は予約されています: TypeScript と Go の `types` / `init`、Python の `models` / `comatype_init`（`.comat` のモジュール名にできません）。Java / Kotlin は `Types` / `Init`、Swift は `ComatypeInit` と宣言した型の名前、Rust は `types` / `init` です。Python では、キーワード（`class` など）やハイフンを含む名前もエラーです。

## モジュールの中の名前

役割で名前が決まります。サーバ側かクライアント側かの印は付けません。

| 名前 | 意味 |
|---|---|
| `path` / `endpoint` | path とメソッド（記述子） |
| `Body` | リクエストのボディ（`body` の行） |
| `Request` | リクエスト全体（`params` `search` `body` `headers`） |
| `Response` | 全ステータスのレスポンスの和 |
| `s200`（関数）/ `S200`（型・クラス） | ステータス 200 のレスポンスを作る |
| `s200.Res` / `S200.Res` / `S200Res` | ステータス 200 のレスポンスのボディの型 |
| `s200.Headers` / `S200Headers` | ステータス 200 のレスポンスヘッダの型 |

- 先頭の `s` / `S` はステータス（status）の頭文字で、サーバ（server）とは無関係です。
- TypeScript は `s200.Res`（型）。Go は `S200Res`（入れ子にできないため）。Python は `S200Res`（型注釈用）と `S200.Res`（作るとき用）。
- 命名は言語の慣習に合わせます（Go は大文字で公開、Python はフィールドを snake_case）。

## `init` のモジュール

`init.comat` からは、`init` のモジュール（TS は `@/comatype/init`、Go は `comatype_init`、Python は `comatype_init`）ができます。

| 名前 | 内容 |
|---|---|
| `AuthCtx` | `wrapper auth { ctx { ... } }` の ctx の型（ラッパー名 + `Ctx`） |
| `s401` / `S401` | ラッパーが返せるステータス |
| `Wrappers` | `init` に渡す、ラッパーの実装の型 |
