# Rust

The Rust runtime is the crate `comatype` (`packages/rust`). It depends on serde / serde_json (JSON), regex (format and pattern validation) and ureq (the HTTP client, synchronous).

## What is generated

```text
<out>/                       default is src/comatype_gen
├─ mod.rs                    Declares each module
├─ types.rs                  Named types (structs and enums, with serde derives)
├─ init.rs                   Wrappers, ctx and wrapper statuses
└─ user_put_id.rs            One per endpoint (the module name is a snake_case joined name)
```

Write `mod comatype_gen;` in `main.rs` and you can use it. Generated `.rs` files are formatted if `rustfmt` is available.

## Client

<<< @/../usage/rust_client/src/user_put_id.rs [user_put_id.rs]

- The argument is `Request` if there are `params` / `search` / headers (it implements `Default`, so `..Default::default()` works), the body itself if there is only a `body`, and `comatype::NoArg` if there is neither.
- The return value is `Result<Response, comatype::Error>`. `Response` is an enum whose variants, like `S200(body, headers)`, carry only the body and headers that exist.
- A status that is not in the `.comat` is `Error::UnexpectedStatus`, and a validation error is `Error::Validation` (`path` and `reason`).
- The client is **synchronous** (ureq).

<<< @/../usage/rust_client/src/init.rs [init.rs]

## Server

<<< @/../usage/rust_server/src/user_put_id.rs [user_put_id.rs]

- Register handlers on `s::Server`. A handler is `Fn(Request) -> Response`. For an endpoint with `cookie on` it is `Reply` (`.into()` from a `Response`; cookies use `.with_cookie(CookieValue::new(v).max_age(3600))` / `.clear_cookie()`).
- `server.handle(method, target, headers, body)` is an entry point you can call from any framework. `server.serve("127.0.0.1:3000", |addr| ...)` is a simple server built on the standard library only (one thread per connection).
- A panic in a handler becomes `500` (the cause is passed to `on_error`).

<<< @/../usage/rust_server/src/init.rs [init.rs]

<<< @/../usage/rust_server/src/auth.rs [auth.rs]

## Type mapping

- `email` `phone` `uuid` `uuidv4` `uuidv7` `date` `time` `datetime` `decimal` `url` are **own types** that wrap a string (`comatype::Email` and so on). Make them with `.into()` / `::new()`, and check the format with `validate`.
- `int` is `i64`, `int64` is `comatype::Int64` (a string on the wire), `bytes` is `comatype::Bytes` (base64), and `json` is `serde_json::Value`.
- Optional (`?`) and `T | null` are `Option<T>`. Field names are snake_case (`serde(rename)` restores the original name).
- Constraints (`min` `max` `pattern`) are checked by the generated `Validate` implementation.

## Notes

- Union types support `T | null` and unions of only string literals. Recursive types (types that contain themselves) are not supported.
- A missing wrapper is found at compile time, because the fields of the `Wrappers` struct are required.
