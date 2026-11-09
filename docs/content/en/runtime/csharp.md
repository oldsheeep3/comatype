# C#

The C# runtime is the NuGet package `Comatype` (`packages/csharp`). It has **no external dependencies** (JSON is our own, the client is `System.Net.Http.HttpClient`, and the server is `System.Net.HttpListener`). It needs .NET 8 or later (records, pattern matching and nullable reference types). The generated code is in the namespace `ComatypeGen` by default (set the target's `package` to change it) and is compiled with the nullable context turned on.

## What is generated

```text
<out>/                       default is ComatypeGen
├─ Types.cs                  Named types (records and enums), in the static class Types
├─ Init.cs                   Wrappers, ctx and wrapper statuses, in the static class Init
└─ UserPutId.cs              One per endpoint (the static class name is a PascalCase joined name)
```

Add the generated directory to your project and the package to its references:

```bash
dotnet add package Comatype
```

## Client

<<< @/../usage/csharp_client/UserPutId.cs [UserPutId.cs]

- Calls are `async` (`C.GetAsync`, `PostAsync`, `PutAsync`, `PatchAsync`, `DeleteAsync`, `OptionsAsync`, `QueryAsync`, `HeadAsync`) and return `Task<Response>`.
- The argument is `Request` if there are `params` / `search` / headers, the body itself if there is only a `body`, and `NoArg.Instance` if there is neither.
- `Response` is an abstract record with one sealed record per status (`S200`, `S404`, ...), which you narrow with `switch` or `is`.
- A status that is not in the `.comat` is `ComatypeException.UnexpectedStatus`, and a validation error is `ValidationException` (`Path` and `Reason`).

<<< @/../usage/csharp_client/Init.cs [Init.cs]

<<< @/../usage/csharp_client/Wrappers/Auth.cs [Wrappers/Auth.cs]

## Server

<<< @/../usage/csharp_server/UserPutId.cs [UserPutId.cs]

- Register handlers on an instance of `S` (`s.Put(Endpoint, req => ...)`). A handler can be synchronous or `async`. For an endpoint with `cookie on` it returns `S.Reply<Response>` (`S.Reply<Response>.Of(res).WithCookie(CookieValue.Of(v).WithMaxAge(3600))`); a plain `Response` converts to it.
- `s.Serve("127.0.0.1", 3000)` runs on `HttpListener` (port `0` picks a free port, and the returned `Server` has `Port` and `Stop()`). It has no TLS, so terminate TLS at a proxy in front. `await s.HandleAsync(method, target, headers, body)` is the entry point you can call from any framework.

<<< @/../usage/csharp_server/Init.cs [Init.cs]

<<< @/../usage/csharp_server/Wrappers/Auth.cs [Wrappers/Auth.cs]

## Type mapping

- `uuid` `uuidv4` `uuidv7` are `Guid` (the version is validated), `date` is `DateOnly`, `time` is `TimeOnly`, `datetime` is `DateTimeOffset` (in UTC), `decimal` is `decimal` (up to 28 digits), `url` is `Uri`, `bytes` is `byte[]`, and `json` is `object?` (the parsed tree).
- `email` and `phone` are `Comatype.Email` / `Comatype.Phone` (records).
- `int` and `int64` are `long`. `int64` is a string on the wire.
- Optional (`?`) and `T | null` are `T?`. Every record can be copied with `with` (`Search.Empty() with { Limit = 10 }`), and has `Empty()` if everything is optional.
- An enum is a C# `enum` whose members carry `[WireName("...")]`; a union of string literals is a `string` that is validated.
- Arrays are `List<T>`.

## Notes

- Generated records and enums are named in PascalCase (`xResourceVersion` becomes `XResourceVersion`). A field whose name would clash with its record (or with `Validate`, `Encode`, `Decode`, `Empty`) gets a trailing `_`.
