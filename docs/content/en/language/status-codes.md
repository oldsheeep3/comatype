# Status codes

An endpoint's responses are written **per status** with `sNNN` (`s200`, `s404` ...).

```comat
s200 UserData
s404 ApiError
s204 none
```

## Only registered codes can be used

What you can write in `sNNN` is **only registered codes**.

- The 62 standard codes (registered with IANA)
- Codes added with `additionalStatusCodes` in the config file

Anything else (`s499`, or the unused `s306`) is an **error** in `comatype check` and in the editor. The same goes for an `sNNN` inside a `wrapper`.

The list is on the [Status code list](/reference/status-codes) page. You can also print it with a command.

```bash
comatype statuses            # list
comatype statuses --json     # JSON
```

### Adding codes

Write codes that are not standard at the top level of `comatype.config.json`.

```json
{
  "services": { "api": { "comatDir": "./comatfiles" } },
  "additionalStatusCodes": [
    { "status": 299, "message": "Custom Thing" },
    { "status": 499, "message": "Client Closed Request" }
  ]
}
```

- `status` is an integer from 100 to 599.
- A code that is already defined as standard, a duplicate, or an empty `message` is a config error.
- An added code is treated as an ordinary code that can have a body.

## Omitting the body type

An `sNNN` with no body type gets the **default body**.

```comat
s400
s404
s500
```

is the same as the following.

```comat
s400 { message: string }
s404 { message: string }
s500 { message: string }
```

The status message (such as `Not Found`) is not part of the body type. It is used for OpenAPI descriptions and for hover and completion in the editor.

You can also omit the type and write only headers.

```comat
s404, {
    "X-Reason"?: string,
}
```

## Codes that cannot have a body

1xx, 204, 205 and 304 cannot have a body under the HTTP rules.

- Omitting the type makes it `none` (`s204` and `s204 none` are the same).
- Writing a body, as in `s204 UserData`, is an **error**.

```comat
s204 none
s304
```

## Response headers

The second block in `sNNN Type, { ... }` is the response headers for that status only.

<<< @/../usage/comatfiles/options_user.comat

See also [Headers and cookies](/language/headers-cookies).

## Shared statuses

Statuses written in `defaults.comat` are added to every endpoint below it (if an endpoint writes the same code, the endpoint wins).

<<< @/../usage/comatfiles/defaults.comat

Statuses declared by a `wrapper` (such as `s401`) are added only to endpoints where that wrapper is enabled.

## From the caller's side

The body of a 2xx goes into `data`, and anything else into `error`. Each status has its own type, so you can narrow by `status`.

```ts
const res = await c.put(path, { params: { id }, body: user }, s200, s404)
if (res.status === 200) res.data   // UserData
if (res.status === 404) res.error  // ApiError
```
