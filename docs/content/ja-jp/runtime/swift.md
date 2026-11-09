# Swift

Swift のランタイムは、Swift Package の `Comatype`（`packages/swift`）です。Foundation だけに依存します。macOS 12 / iOS 15 以上、Swift 5.9 以上。生成物は、ターゲット `ComatypeGen`（既定の出力先は `Sources/ComatypeGen`）として同じ package に置きます。

## 生成されるもの

```text
<out>/
├─ Types.swift               名前付きの型（struct・enum）
├─ Init.swift                ComatypeInit: ラッパー・ctx・ラッパーのステータス
└─ UserPutId.swift           エンドポイントごと（enum 名は PascalCase の連結名）
```

```swift
// Package.swift
dependencies: [.package(path: "/path/to/comatype/packages/swift")],
targets: [
    .target(name: "ComatypeGen", dependencies: [.product(name: "Comatype", package: "swift")]),
]
```

## クライアント

<<< @/../usage/swift_client/user_put_id.swift [user_put_id.swift]

- 引数は、`params` / `search` / ヘッダがあれば `Request`、`body` だけならボディそのもの、無ければ `NoArg()`。任意のプロパティには既定値があります。
- 呼び出しは `async throws`（URLSession）。戻り値の `Response` は enum で、`switch` で絞り込めます（`case .s200(let body, let headers)`）。
- `.comat` に無いステータスは `ComatypeError.unexpectedStatus`、検証エラーは `ValidationError`（`path` と `reason`）。

<<< @/../usage/swift_client/init.swift [init.swift]

<<< @/../usage/swift_client/wrappers/auth.swift [wrappers/auth.swift]

## サーバ

<<< @/../usage/swift_server/user_put_id.swift [user_put_id.swift]

- `S` のインスタンスに、**async** のハンドラを登録します（ラッパーも async です）。ハンドラは `S.Reply(.s200(body: ...))` を返し、cookie は `.withCookie(CookieValue("v", maxAge: 3600))`。
- `s.serve(host:port:)` は POSIX ソケットの HTTP/1.1 サーバです（keep-alive、チャンク転送のボディ、読み取りのタイムアウト `readTimeout`、ボディの上限 `maxBodySize`、`stop()`）。TLS は無いので、前段のプロキシで終端してください。`await s.handle(method:target:headers:body:)` は任意のフレームワーク用の入口です。

<<< @/../usage/swift_server/init.swift [init.swift]

<<< @/../usage/swift_server/wrappers/auth.swift [wrappers/auth.swift]

## 型の対応

- `uuid` `uuidv4` `uuidv7` は `UUID`、`datetime` は `Date`、`decimal` は `Decimal`、`url` は `URL`、`bytes` は `Data`、`int` は `Int`、`int64` は `Int64`（通信上は文字列）、`json` は `JSON`（ランタイムの enum）。
- `date` `time` は独自型 `LocalDate` / `LocalTime`、`email` `phone` は `Email` / `Phone`。
- 省略可能（`?`）と `T | null` は `Optional`。enum は `String` の raw value を持つ Swift の enum です。

## 注意

- Swift のランタイムの単体テストは `swift run comatype-selftest`（XCTest が無い環境でも動きます）。
