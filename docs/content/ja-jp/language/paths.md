# path の決め方

path は、`comatDir` からのディレクトリと、ファイル名から**自動で決まります**。

## ディレクトリとファイル名

| ファイル（`comatDir` 以下） | メソッド | path |
|---|---|---|
| `post_user.comat` | POST | `/user` |
| `users/post_uid.comat` | POST | `/users/uid` |
| `users/[uid]/post.comat` | POST | `/users/:uid`（動的パス。**推奨**） |
| `users/post_[uid].comat` | POST | `/users/:uid`（動的パス。非推奨） |
| `users/posts/[id]/get.comat` | GET | `/users/posts/:id` |
| `users/get.comat` | GET | `/users`（メソッド名だけ = ディレクトリ自体） |
| `get.comat` | GET | `/` |
| `(noauth)/get_user.comat` | GET | `/user`（グループは path に含まれない） |

- ファイル名は `<method>_<segment>`。最初の `_` までがメソッド、残りが**1 つ分**のセグメントです（`get_user_list` は `/user_list`）。
- 深い階層は、ディレクトリで表します。
- ファイル名がメソッド名だけ（`get.comat`、`post.comat`）なら、ディレクトリ自体の path です。

## 動的なセグメント（`[名前]`）

動的なセグメントは、`[名前]` で書きます。Next.js・Nuxt・SvelteKit・Astro などのファイルルーティングと同じ書き方で、Windows のファイル名にも使えます。名前の型は、そのファイルの `params` で宣言します。

| 書き方 | 状態 | 例 |
|---|---|---|
| ディレクトリ名 `[id]/get.comat` | **推奨** | `path/[id]/user/[userid]/get.comat` → `GET /path/:id/user/:userid` |
| ファイル名 `get_[id].comat` | 許可（非推奨） | `path/[id]/user/get_[userid].comat` → `GET /path/:id/user/:userid` |
| ファイル名 `get__id.comat`（`__`） | **廃止**（エラー） | |
| ファイル名 `get_:id.comat`（`:`） | **廃止**（エラー）。path の明示では書ける | |
| ディレクトリ名 `:id/` / `__id/` | **廃止**（エラー） | |

- 名前は英数字・`-`・`_` で、`_` では始められません。
- `[...rest]`（残り全部に合う）や `[[id]]`（省略可能）は、使えません（エラー）。
- 同じ path になる 2 つのファイル（`a/[id]/get.comat` と `a/get_[id].comat`）は、重複エラーです。
- 生成されるコードのモジュール名・ファイル名では、`[id]` を `__id` にそろえます（`path/[id]/get.comat` → `path/__id/get`、`user/put_[id].comat` → `user/put__id`）。そのため、生成物に `[` `]` は入りません。

`comatype format` で、非推奨・廃止の書き方を、推奨の形に直せます（[CLI](/reference/cli)）。

::: tip シェルで書くとき
`[` `]` は、シェルのパターンとして解釈されます。`ls path/[id]` や `mkdir path/[id]` は、引用符で囲んでください（`mkdir 'path/[id]'`）。
:::

## path を明示する（非推奨）

ファイルの中に `path` を書くと、そちらが優先されます。`comatype check` は警告を出します。

| 書き方 | 意味 |
|---|---|
| `path /fix/path` | **固定**。ディレクトリの位置に関係なく、その path |
| `path ./relative/path` | **相対**。そのファイルのあるディレクトリの path からの相対 |

引用符は付けても付けなくても構いません（`path '/user'`）。**path の明示では、動的なセグメントを `:名前` で書けます**（`path /user/:id`）。

<<< @/../usage/comatfiles/user/get_me.comat

<<< @/../usage/comatfiles/user/(noauth)/get_ping.comat

## グループ `(名前)`

ディレクトリ名を `(名前)` のように括弧で囲むと、**グループ**になります。

- そのグループの `defaults.comat` は、**配下だけ**に効きます。
- グループの名前は、path にも、生成されるコードのモジュール名にも**含まれません**。

たとえば `(noauth)/defaults.comat` に `wrap auth off` と書けば、`(noauth)` の下のエンドポイントだけ、認証のラッパーが外れます。

<<< @/../usage/comatfiles/(noauth)/defaults.comat

## 全パターン

| パターン | ファイル | path |
|---|---|---|
| `comatDir` 直下 | `post_user.comat` / `options_user.comat` / `query_user.comat` | `/user` |
| path を明示（非推奨） | `get_user.comat` | `/user/:id` |
| ディレクトリ自体 | `user/get.comat` | `/user` |
| 静的なセグメント | `user/(noauth)/post_login.comat` | `/user/login` |
| 動的なセグメント | `user/[id]/put.comat`（推奨）/ `user/put_[id].comat` | `/user/:id` |
| ネストしたディレクトリ | `user/profile/get.comat` | `/user/profile` |
| グループ（直下） | `(noauth)/post_user.comat` | `/user` |
| 固定のパス | `user/(noauth)/get_ping.comat`（`path /ping`） | `/ping` |
| 相対のパス | `user/get_me.comat`（`path ./me`） | `/user/me` |

## エラーになるもの

- `fetch_a.comat` のように、ファイル名のメソッドが不正
- path の `:id` が `params` に無い（または `params` にあって path に無い）
- 同じメソッドと path のエンドポイントが複数ある
- 生成されるモジュール名が重複する

途中に動的なセグメントがある path（`/pets/:petId/photos/:photoId`）は、ディレクトリでは表せないので、`path` を明示します。
