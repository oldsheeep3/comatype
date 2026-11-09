# Java

Java のランタイムは、パッケージ `comatype`（`packages/java`）です。**外部依存はありません**（JSON も自前、HTTP は `java.net.http`、サーバは JDK の `com.sun.net.httpserver`）。JDK 21 以上が必要です（record・sealed interface・パターンマッチ）。

## 生成されるもの

```text
<out>/                       既定は src/main/java/comatype/gen（パッケージ名は out から決める。target の package で指定もできる）
├─ Types.java                名前付きの型（record・enum）
├─ Init.java                 ラッパー・ctx・ラッパーのステータス
└─ UserPutId.java            エンドポイントごと（クラス名は PascalCase の連結名）
```

ビルドは `javac -d out $(find packages/java/src/main -name '*.java') $(find <out> -name '*.java') ...` のように、ランタイムと生成物を一緒にコンパイルします。

## クライアント

<<< @/../usage/java_client/src/main/java/app/Api.java [Api.java]

- 引数は、`params` / `search` / ヘッダがあれば `Request`、`body` だけならボディそのもの、無ければ `comatype.NoArg.INSTANCE`。
- 戻り値は `Response`（sealed interface）。`S200` `S404` ... の record で、`instanceof` やパターンマッチで絞り込めます。
- `.comat` に無いステータスは `ComatypeException.UnexpectedStatus`、検証エラーは `ValidationException`（`path` と `reason`）。

<<< @/../usage/java_client/src/main/java/app/InitComatype.java [InitComatype.java]

<<< @/../usage/java_client/src/main/java/app/Auth.java [Auth.java]

## サーバ

<<< @/../usage/java_server/src/main/java/app/UserPutIdHandler.java [UserPutIdHandler.java]

- `S` のインスタンスにハンドラを登録します（`s.put(ENDPOINT, req -> ...)`）。`cookie on` のエンドポイントでは `S.Reply<Response>`（`S.Reply.of(res).withCookie(CookieValue.of(v).maxAge(3600))`）。
- `s.handle(method, target, headers, body)` は任意のフレームワークから呼べる入口、`s.serve("127.0.0.1", 3000)` は JDK のサーバです。

<<< @/../usage/java_server/src/main/java/app/InitComatype.java [InitComatype.java]

<<< @/../usage/java_server/src/main/java/app/Auth.java [Auth.java]

## 型の対応

- `uuid` `uuidv4` `uuidv7` は `java.util.UUID`（バージョンは検証）、`date` は `LocalDate`、`time` は `LocalTime`、`datetime` は `Instant`、`decimal` は `BigDecimal`、`url` は `URI`、`bytes` は `byte[]`、`json` は `Object`（パース済みの木）。
- `email` `phone` は `comatype.Email` / `comatype.Phone`（record）。
- `int` と `int64` は `long`（省略可能なら `Long`）。`int64` は通信上は文字列です。
- 省略可能（`?`）と `T | null` は `null` になれる箱の型。各 record には `withXxx()` と、全部任意なら `empty()` があります。
