# Kotlin

Kotlin の生成物は、data class と sealed interface で書かれます。ランタイムは 2 つで、型・検証・cookie・エンドポイントは Java の `comatype`（`packages/java`）、コルーチン（`suspend`）で書ける c / s は Kotlin の `comatype.ktx`（`packages/kotlin`）です。どちらも標準ライブラリだけで書いてあり、kotlinx.coroutines は要りません。JDK 21 以上と `kotlinc` が必要です。

## 生成されるもの

```text
<out>/                       既定は src/main/kotlin/comatype/gen（パッケージ名は out から決める。target の package で指定もできる）
├─ Types.kt                  名前付きの型（data class・enum class）
├─ Init.kt                   ラッパー・ctx・ラッパーのステータス
└─ UserPutId.kt              エンドポイントごと（object 名は PascalCase の連結名）
```

## クライアント

<<< @/../usage/kotlin_client/user_put_id.kt [user_put_id.kt]

- 引数は、`params` / `search` / ヘッダがあれば `Request`、`body` だけならボディそのもの、無ければ `comatype.NoArg.INSTANCE`。任意のプロパティには既定値（`null`）があるので、`Request(params = ...)` のように名前付き引数で書けます。
- 戻り値は `Response`（sealed interface）。`when` で絞り込めます。
- `.comat` に無いステータスは `ComatypeException.UnexpectedStatus`、検証エラーは `ValidationException`。
- `CK.get` / `CK.put` ... は **suspend 関数**です。通信は `HttpClient.sendAsync`（スレッドをブロックしません）。ラッパーも suspend の関数（`CWrap`）です。

<<< @/../usage/kotlin_client/init.kt [init.kt]

<<< @/../usage/kotlin_client/wrappers/auth.kt [wrappers/auth.kt]

## サーバ

<<< @/../usage/kotlin_server/user_put_id.kt [user_put_id.kt]

- `comatype.S` に、`s.coGet` / `s.coPut` ... で **suspend のハンドラ**を登録します（同期のハンドラは `s.get` / `s.put`）。`cookie on` のエンドポイントのハンドラは `S.Reply<Response>` を返します。
- `s.serve("127.0.0.1", 3000)` は JDK のサーバ、`s.handle(...)` は任意のフレームワーク用の入口です。リクエストごとのスレッドで、ハンドラの完了を待ちます。

<<< @/../usage/kotlin_server/init.kt [init.kt]

<<< @/../usage/kotlin_server/wrappers/auth.kt [wrappers/auth.kt]

## 型の対応

型の対応は [Java](/runtime/java) と同じです（`UUID` `LocalDate` `Instant` `BigDecimal` `URI` `ByteArray`、`int` と `int64` は `Long`）。省略可能と `T | null` は `T?` です。

## ビルド

```bash
javac -d rt $(find packages/java/src/main -name '*.java')
kotlinc -cp rt -include-runtime -d app.jar <out> packages/kotlin/src/main/kotlin src/...
java -cp app.jar:rt MainKt
```
