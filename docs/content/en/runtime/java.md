# Java

The Java runtime is the package `comatype` (`packages/java`). It has **no external dependencies** (JSON is our own, HTTP is `java.net.http`, and the server is the JDK's `com.sun.net.httpserver`). It needs JDK 21 or later (records, sealed interfaces and pattern matching).

## What is generated

```text
<out>/                       default is src/main/java/comatype/gen (the package name is decided from out; you can also set it with the target's package)
├─ Types.java                Named types (records and enums)
├─ Init.java                 Wrappers, ctx and wrapper statuses
└─ UserPutId.java            One per endpoint (the class name is a PascalCase joined name)
```

To build, compile the runtime and the generated code together, as in `javac -d out $(find packages/java/src/main -name '*.java') $(find <out> -name '*.java') ...`.

## Client

<<< @/../usage/java_client/src/main/java/app/Api.java [Api.java]

- The argument is `Request` if there are `params` / `search` / headers, the body itself if there is only a `body`, and `comatype.NoArg.INSTANCE` if there is neither.
- The return value is `Response` (a sealed interface) made of records `S200` `S404` ..., which you can narrow with `instanceof` or pattern matching.
- A status that is not in the `.comat` is `ComatypeException.UnexpectedStatus`, and a validation error is `ValidationException` (`path` and `reason`).

<<< @/../usage/java_client/src/main/java/app/InitComatype.java [InitComatype.java]

<<< @/../usage/java_client/src/main/java/app/Auth.java [Auth.java]

## Server

<<< @/../usage/java_server/src/main/java/app/UserPutIdHandler.java [UserPutIdHandler.java]

- Register handlers on an instance of `S` (`s.put(ENDPOINT, req -> ...)`). For an endpoint with `cookie on` it is `S.Reply<Response>` (`S.Reply.of(res).withCookie(CookieValue.of(v).maxAge(3600))`).
- `s.handle(method, target, headers, body)` is an entry point you can call from any framework, and `s.serve("127.0.0.1", 3000)` is the JDK server.

<<< @/../usage/java_server/src/main/java/app/InitComatype.java [InitComatype.java]

<<< @/../usage/java_server/src/main/java/app/Auth.java [Auth.java]

## Type mapping

- `uuid` `uuidv4` `uuidv7` are `java.util.UUID` (the version is validated), `date` is `LocalDate`, `time` is `LocalTime`, `datetime` is `Instant`, `decimal` is `BigDecimal`, `url` is `URI`, `bytes` is `byte[]`, and `json` is `Object` (the parsed tree).
- `email` and `phone` are `comatype.Email` / `comatype.Phone` (records).
- `int` and `int64` are `long` (`Long` if optional). `int64` is a string on the wire.
- Optional (`?`) and `T | null` use boxed types that can be `null`. Every record has `withXxx()`, and `empty()` if everything is optional.
