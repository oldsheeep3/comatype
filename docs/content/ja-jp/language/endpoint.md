# エンドポイント

1 つの `.comat`（`init.comat` と `defaults.comat` 以外）が、1 つのエンドポイントです。メソッドと path は**ファイルの置き場所と名前**から決まります（[path の決め方](/language/paths)）。

## 書けるもの

| 文 | 内容 |
|---|---|
| `import 型 from パス` | 別のファイルの型を使う（パスはこのファイルからの相対） |
| `path /fix/path` / `path ./relative` | path の明示（非推奨）。[path の決め方](/language/paths)を参照 |
| `params { ... }` | path パラメータ（`[id]` のディレクトリ名・ファイル名に対応） |
| `search { ... }` | クエリ文字列 |
| `body 型` / `body { ... }` | リクエストのボディ。**エンドポイントに 1 つ**。無ければボディなし |
| `header { }` `headerReq { }` `headerRes { }` | ヘッダ（[ヘッダと cookie](/language/headers-cookies)） |
| `sNNN 型` | ステータスごとのレスポンスのボディ（[ステータスコード](/language/status-codes)） |
| `wrap 名前` / `wrap 名前 off` | ラッパーの有効・無効（[init / defaults / ラッパー](/language/init-defaults-wrappers)） |
| `cookie on` / `cookie off` | cookie を送受信するか |
| `cache off` / `cache 5000` / `cache 5000 cookie` | GET / QUERY のレスポンスのキャッシュ（[キャッシュ](/language/cache)）。`defaults.comat` に書いても効きません |

`defaults.comat` に書ける `wrap` `cookie` ヘッダ `sNNN` は、ここに書いても構いません（エンドポイント側が勝ちます）。

## 例: `PUT /user/:id`

<<< @/../usage/comatfiles/user/put_[id].comat

- `params { id: uuidv4 }` は、path の `[id]` の型を宣言します。path にある `:id` と `params` は、過不足なく一致しなければエラーです。
- `body UserData` は、`UserData` 型のボディを受け取ります。
- `s200 UserData` と `s404 ApiError` は、ステータスごとのレスポンスです。

## 例: クエリ文字列と省略可能なフィールド

<<< @/../usage/comatfiles/get_user.comat

`verbose?: bool` の `?` は、省略できるという意味です。

## 例: ボディの組み立て（`...` と `empty`）

<<< @/../usage/comatfiles/(noauth)/post_user.comat

- `...UserData` は、`UserData` のフィールドをその場に展開します。
- `uid: empty` は、そのフィールドを**消します**（キーごと省略。送れません）。「登録のとき、`uid` はサーバが決める」といった型を、`UserData` から作れます。

## メソッド

`get` `post` `put` `patch` `delete` `options` `query` `head`。`query` は HTTP の QUERY メソッド（検索条件をボディで送る、安全で冪等な呼び出し）です。

<<< @/../usage/comatfiles/query_user.comat

<<< @/../usage/comatfiles/options_user.comat

## 規則

- 同じメソッドと path が 2 つあると、エラーです（グループが違っても）。
- `body` が 2 つあるとエラーです。
- `params` に省略可能なフィールドは書けません。
- `defaults.comat` に `body` `params` `search` `path` は書けません。
