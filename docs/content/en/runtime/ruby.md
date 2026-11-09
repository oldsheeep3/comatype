# Ruby

You need Ruby 3.1 or later. The runtime `comatype` (`packages/ruby`) works with **the standard library only** (json, net/http, bigdecimal, socket and so on). Ruby is a dynamic language, so the generated code writes out a "description of the types", and the runtime does conversion and validation.

## What is generated

```text
comatype_gen/
├─ types.rb                 Named types (subclasses of Comatype::Model / Comatype::Enum)  ComatypeGen::Types
├─ init.rb                  Wrappers, ctx and wrapper statuses                            ComatypeGen::Init
├─ user_put_id.rb           One per endpoint                                              ComatypeGen::UserPutId
└─ all.rb                   Requires everything
```

Load it with `require_relative "comatype_gen/all"`.

## Client

<<< @/../usage/ruby_client/user_put_id.rb [user_put_id.rb]

- The arguments are `params:` `search:` `headers:` `body:` (a Model instance, or a hash keyed by attribute names). Leave them out if there are none.
- The return value is an instance of `S200` `S404` ... (`res.status` `res.body` `res.headers`). Narrow it with `case` / `when`.
- A status that is not in the `.comat` is `Comatype::UnexpectedStatusError`, and a validation error is `Comatype::ValidationError` (`path` and `reason`).
- Communication uses `Net::HTTP` (synchronous).

<<< @/../usage/ruby_client/init.rb [init.rb]

<<< @/../usage/ruby_client/wrappers/auth.rb [wrappers/auth.rb]

## Server

<<< @/../usage/ruby_server/user_put_id.rb [user_put_id.rb]

- Register handlers as blocks on an instance of `Comatype::S`. The return value is a response such as `S200.new(body, headers: {...})`. Cookies use `.with_cookie(value, max_age: 3600)` / `.clear_cookie`.
- `s` is **Rack compatible** (`run s`). `s.handle(method, target, headers, body)` is the entry point for any framework, and `s.serve(port: 3000)` is a simple server built on the standard library only.

<<< @/../usage/ruby_server/init.rb [init.rb]

<<< @/../usage/ruby_server/wrappers/auth.rb [wrappers/auth.rb]

## Type mapping

- `string` `bool` `int` are `String` `true`/`false` `Integer`. `int64` is `Integer` (a string on the wire).
- `date` is `Date`, `datetime` is `Time`, `decimal` is `BigDecimal`, `url` is `URI`, `bytes` is `String` (binary), and `json` is `Hash` / `Array`.
- The `uuid` family, `email`, `phone` and `time` are `String`s with a validated format (uuids are normalized to lower case).
- Optional (`?`) and `T | null` can be `nil`. Attribute names are snake_case (`X-Request-Id` → `x_request_id`).
- Constraints (`min` `max` `pattern`) are checked by the runtime when reading and when sending.
