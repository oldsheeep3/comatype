# Go

Go の生成物は、ランタイム `github.com/oldsheeep3/comatype/packages/go` の 3 つのパッケージ（共有の `comatype`、クライアントの `c`、サーバの `s`）に依存します。

## 生成されるもの

```text
<out>/
├─ types/types.go                   名前付きの型（package types）
├─ init/init.go                     ラッパー・ctx・ラッパーのステータス（package comatype_init）
└─ user/put__id/endpoint.go         エンドポイントごと（package user_put_id）
```

`client` と `server` で、`init` と `endpoint` の中身が違います。生成先の import path は、`comatype.config.json` の `importPath`、無ければ `go.mod` の `module` から決めます。

## クライアント

```go
res, err := c.Put(ctx, user_put_id.Endpoint, user_put_id.Request{
    Params: user_put_id.Params{ID: comatype.Uuidv4(id)},
    Body:   userInput,
})
if err != nil { return err }

switch res.Status {
case 200:
    _ = res.S200 // *user_put_id.S200Res
case 404:
    _ = res.S404
}
```

- 引数は、`params` / `search` があれば `Request`、`body` だけなら `Body`、無ければ省略できます（`c.Options(ctx, ep)`）。
- 戻り値は `*Response`。`Status` と、ステータスごとのフィールド（`S200` `S200Headers` ...）です。ボディが無ければ `nil`。
- `.comat` に無いステータスは、`*comatype.UnexpectedStatusError`。
- 検証エラーは `*comatype.ValidationError`（`Path` と `Reason`）。

```go
c.Init(c.Config{
    Wrappers:  comatype_init.Wrappers{Auth: wrappers.Auth},
    CookieJar: c.NewCookieJar(),
})
```

## サーバ

```go
s.Put(user_put_id.Endpoint, func(req user_put_id.Request) user_put_id.Response {
    // req.Params.ID, req.Body, req.Ctx.User（wrap auth が有効なとき）
    if !ok {
        return user_put_id.S404(&user_put_id.S404Res{Code: "not_found", Message: "not found"})
    }
    return user_put_id.S200(&user)
})

s.Init(s.Config{Wrappers: comatype_init.Wrappers{Auth: wrappers.Auth}})
http.ListenAndServe(":3000", s.Handler())
```

- コンストラクタは `S200(body)`。ボディが `none` なら `S204()`。**必須**のレスポンスヘッダがあるときだけ、引数に取ります（`S200(nil, &S200Headers{...})`）。任意のヘッダは `.WithS200Headers(&S200Headers{...})`。
- cookie は `.WithCookie(value, comatype.MaxAge(3600))` / `.ClearCookie()`。

## 型の対応

- `uuid` `email` などは、文字列を包んだ**別の型**です。`string` からは変換が要ります（`comatype.Uuidv4(id)`）。`Validate()` で形式を確かめます。
- `int64` は `comatype.Int64`、`datetime` は `time.Time`、`bytes` は `[]byte`、`json` は `json.RawMessage`。
- 省略可能（`?`）のフィールドは、ポインタ（`*string`）です。`c.Ptr(true)` で作れます。
- 制約は構造体のタグ（`min` `max` `pattern` `oneof`）に入ります。
- フィールド名は Go の慣習（`ID` `UID` `URL`）で、宣言した型の名前はそのままです。

## 注意

- ラッパーが足りないことを、型では検出できません（構造体のリテラルは省略できるため）。使うエンドポイントを呼ぶときに、クライアントはエラー、サーバは `500` になります。
- ユニオン型は、`T | null` と文字列リテラルだけのユニオンに対応しています。

## 実例

<<< @/../usage/go_client/user_put_id.go

<<< @/../usage/go_server/user_put_id.go
