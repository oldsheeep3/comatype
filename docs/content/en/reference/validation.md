# Validation and errors

Comatype validates on **both sides** of the wire, using the same schema.

| When | What is validated | If invalid |
|---|---|---|
| Before the client sends | `params` `search` headers `body` | Throws a validation error without any network call |
| After the server receives | Same as above | Returns `400` without calling the handler |
| Before the server responds | The handler's return value (status, body, headers) | Returns `500` (the details are not shown) |
| After the client receives | Body and headers | Throws a validation error |

## Shape of a validation error

An error says **where** it is wrong.

| Language | Type | Location |
|---|---|---|
| TypeScript | `ValidationError` | `path` (`body.email`, `params.id`, `tags[0]`) |
| Go | `*comatype.ValidationError` | `Path` |
| Python | `ComatypeValidationError` | `path` |
| Rust | `comatype::Error::Validation(ValidationError)` | `path` |
| Java / Kotlin | `comatype.ValidationException` | `path` |
| Swift | `ValidationError` | `path` |
| Ruby | `Comatype::ValidationError` | `path` |

## What the server answers

| Situation | Response |
|---|---|
| Invalid input | `400` `{ "code": "validation_error", "message": "...", "path": "body.email" }` |
| The body is not JSON | `400` `{ "code": "invalid_json", ... }` |
| The path does not match | `404` `{ "code": "not_found", ... }` |
| The path matches but the method differs | `405` (with an `Allow` header) |
| An exception in a handler, or a response that does not match the `.comat` | `500` `{ "code": "internal_error", "message": "Internal Server Error" }` |

This `400` is not part of the `Response` of the `.comat`.

## Strictness

- Bodies are **strict** about JSON types. The string `"5"` is not turned into an `int` (the same in Python, TypeScript and Go).
- Paths, queries and headers arrive as strings, so they are converted to `int` / `bool` / arrays before validation.
- `int64` and `decimal` are **strings** on the wire, and sending them as numbers is invalid.
- Extra keys are skipped (they are not an error).
- A missing required key, or `null` where `null` is not allowed, is invalid.

## Exceptions on the client

| Exception | Meaning |
|---|---|
| Validation error | The input before sending is invalid, or the response received is invalid |
| `UnexpectedStatusError` | A status you did not pass to the call came back (it has `status` and `body`) |
| `ComatypeError` | Wrong usage (the wrong method, a missing wrapper, no base url, and so on) |
