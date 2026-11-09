# Swift

The Swift runtime is the Swift Package `Comatype` (`packages/swift`). It depends only on Foundation. It needs macOS 12 / iOS 15 or later and Swift 5.9 or later. Put the generated code in the same package as the target `ComatypeGen` (the default output is `Sources/ComatypeGen`).

## What is generated

```text
<out>/
├─ Types.swift               Named types (structs and enums)
├─ Init.swift                ComatypeInit: wrappers, ctx and wrapper statuses
└─ UserPutId.swift           One per endpoint (the enum name is a PascalCase joined name)
```

```swift
// Package.swift
dependencies: [.package(path: "/path/to/comatype/packages/swift")],
targets: [
    .target(name: "ComatypeGen", dependencies: [.product(name: "Comatype", package: "swift")]),
]
```

## Client

<<< @/../usage/swift_client/user_put_id.swift [user_put_id.swift]

- The argument is `Request` if there are `params` / `search` / headers, the body itself if there is only a `body`, and `NoArg()` if there is neither. Optional properties have defaults.
- Calls are `async throws` (URLSession). The returned `Response` is an enum, which you narrow with `switch` (`case .s200(let body, let headers)`).
- A status that is not in the `.comat` is `ComatypeError.unexpectedStatus`, and a validation error is `ValidationError` (`path` and `reason`).

<<< @/../usage/swift_client/init.swift [init.swift]

<<< @/../usage/swift_client/wrappers/auth.swift [wrappers/auth.swift]

## Server

<<< @/../usage/swift_server/user_put_id.swift [user_put_id.swift]

- Register **async** handlers on an instance of `S` (wrappers are async too). A handler returns `S.Reply(.s200(body: ...))`, and cookies use `.withCookie(CookieValue("v", maxAge: 3600))`.
- `s.serve(host:port:)` is an HTTP/1.1 server on POSIX sockets (keep-alive, chunked bodies, the read timeout `readTimeout`, the body limit `maxBodySize`, and `stop()`). It has no TLS, so terminate TLS at a proxy in front. `await s.handle(method:target:headers:body:)` is the entry point for any framework.

<<< @/../usage/swift_server/init.swift [init.swift]

<<< @/../usage/swift_server/wrappers/auth.swift [wrappers/auth.swift]

## Type mapping

- `uuid` `uuidv4` `uuidv7` are `UUID`, `datetime` is `Date`, `decimal` is `Decimal`, `url` is `URL`, `bytes` is `Data`, `int` is `Int`, `int64` is `Int64` (a string on the wire), and `json` is `JSON` (an enum in the runtime).
- `date` and `time` are the own types `LocalDate` / `LocalTime`, and `email` and `phone` are `Email` / `Phone`.
- Optional (`?`) and `T | null` are `Optional`. An enum is a Swift enum with a `String` raw value.

## Notes

- The unit tests of the Swift runtime run with `swift run comatype-selftest` (they work even where XCTest is not available).
