# Kotlin

Kotlin output is written with data classes and sealed interfaces. There are two runtimes: types, validation, cookies and endpoints come from Java's `comatype` (`packages/java`), and the c / s that you write with coroutines (`suspend`) come from Kotlin's `comatype.ktx` (`packages/kotlin`). Both are written with the standard library only, and kotlinx.coroutines is not needed. You need JDK 21 or later and `kotlinc`.

## What is generated

```text
<out>/                       default is src/main/kotlin/comatype/gen (the package name is decided from out; you can also set it with the target's package)
├─ Types.kt                  Named types (data classes and enum classes)
├─ Init.kt                   Wrappers, ctx and wrapper statuses
└─ UserPutId.kt              One per endpoint (the object name is a PascalCase joined name)
```

## Client

<<< @/../usage/kotlin_client/user_put_id.kt [user_put_id.kt]

- The argument is `Request` if there are `params` / `search` / headers, the body itself if there is only a `body`, and `comatype.NoArg.INSTANCE` if there is neither. Optional properties have a default (`null`), so you can use named arguments, as in `Request(params = ...)`.
- The return value is `Response` (a sealed interface). Narrow it with `when`.
- A status that is not in the `.comat` is `ComatypeException.UnexpectedStatus`, and a validation error is `ValidationException`.
- `CK.get` / `CK.put` ... are **suspend functions**. Communication uses `HttpClient.sendAsync` (it does not block the thread). Wrappers are suspend functions too (`CWrap`).

<<< @/../usage/kotlin_client/init.kt [init.kt]

<<< @/../usage/kotlin_client/wrappers/auth.kt [wrappers/auth.kt]

## Server

<<< @/../usage/kotlin_server/user_put_id.kt [user_put_id.kt]

- Register **suspend handlers** on `comatype.S` with `s.coGet` / `s.coPut` ... (synchronous handlers use `s.get` / `s.put`). A handler for an endpoint with `cookie on` returns `S.Reply<Response>`.
- `s.serve("127.0.0.1", 3000)` is the JDK server, and `s.handle(...)` is the entry point for any framework. It uses one thread per request and waits for the handler to finish.

<<< @/../usage/kotlin_server/init.kt [init.kt]

<<< @/../usage/kotlin_server/wrappers/auth.kt [wrappers/auth.kt]

## Type mapping

The mapping is the same as [Java](/runtime/java) (`UUID` `LocalDate` `Instant` `BigDecimal` `URI` `ByteArray`; `int` and `int64` are `Long`). Optional and `T | null` are `T?`.

## Building

```bash
javac -d rt $(find packages/java/src/main -name '*.java')
kotlinc -cp rt -include-runtime -d app.jar <out> packages/kotlin/src/main/kotlin src/...
java -cp app.jar:rt MainKt
```
