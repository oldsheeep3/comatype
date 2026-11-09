# init / defaults / ラッパー

## `init.comat`

`comatDir` の直下に **1 つだけ**置く、プロジェクト共通の設定です。

<<< @/../usage/comatfiles/init.comat

| 文 | 内容 |
|---|---|
| `baseUrl URL` | 全エンドポイントの base url。実行時に環境変数 `COMATYPE_BASE_URL` や init の引数で上書きできる |
| `cookie 名前 { ... }` | 発行する cookie の設定（[ヘッダと cookie](/language/headers-cookies)） |
| `wrapper 名前 { ... }` | ラッパーの宣言 |

## `wrapper`

認証のような、複数のエンドポイントに共通する処理を**ラッパー**として宣言します。宣言には、ラッパーがハンドラに渡す値（`ctx`）の型と、ラッパー自身が返せるステータスを書きます。

```comat
wrapper auth {
    ctx {
        user: UserData,
    }
    s401 ApiError
}
```

実装は、各言語のコードで書きます（[ラッパーと cookie](/runtime/wrappers-cookies)）。`init` に渡す実装が、宣言と合っていないと、型検査でエラーになります（Go を除く）。

## `defaults.comat`

**どのディレクトリにも置ける**、既定値のファイルです。そのディレクトリと配下のエンドポイントに効きます。

<<< @/../usage/comatfiles/defaults.comat

書けるもの: `wrap` / `cookie on|off` / `header` `headerReq` `headerRes` / `sNNN`（共通のステータス）。`path` や `body` は書けません。`cache` は書いても効かず、警告が出ます（エンドポイントごとに書いてください）。

### 合成の順

**親の `defaults.comat` → そのディレクトリの `defaults.comat`（グループを含む）→ エンドポイント**の順に合成し、後ろが勝ちます。

| 項目 | 合成のしかた |
|---|---|
| `wrap` | 名前ごと。`wrap auth` は有効に、`wrap auth off` は外す |
| `cookie` | エンドポイント側が勝つ |
| ヘッダ | ヘッダ名ごと |
| `sNNN` | コードごと。`wrapper` のステータスは、そのラッパーが有効なエンドポイントに加わる |

## `wrap` の順序（複数のラッパー）

複数のラッパーが有効なときは、**外側から内側**へ、次の順に重なります。

1. ディレクトリが**上**のファイルほど外側（親の `defaults.comat` ＞ 子の `defaults.comat` ＞ エンドポイント）
2. 同じ階層では、`defaults.comat` が外側
3. 同じファイルの中では、**上に書いた `wrap` ほど外側**

外側のラッパーが先に動き、レスポンスは内側から外側へ戻ります。`wrap 名前 off` は、その名前を取り除くだけで、残りの順は変わりません。下位で同じ名前をもう一度 `wrap` すると、下位の位置（内側）に置き直されます。

## グループで切り替える

`(noauth)` のようなグループの `defaults.comat` に `wrap auth off` と書くと、その配下だけ認証が外れます。

<<< @/../usage/comatfiles/user/(noauth)/post_login.comat

ここでは `wrap auth` が外れているので、ラッパーの `s401` は加わりません。ログイン失敗のために、`s401` を自分で宣言しています。
