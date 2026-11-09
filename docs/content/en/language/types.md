# Types

## Declaring a type

Declare a type as `Name { fields }`. Fields are separated by commas; the last comma is optional.

<<< @/../usage/types/UserData.comat

A field with `?` is **optional** (the key may be missing). `T | null` **allows null** (the key is required). They mean different things.

```comat
User {
    name: string,
    nickname?: string,           // the key may be omitted
    deletedAt: datetime | null,  // the key is required, and null is allowed
    tags: string[],              // an array
}
```

## Built-in types

| Type | Wire format | Notes |
|---|---|---|
| `string` / `bool` / `int` | JSON string / boolean / number | |
| `email` | string | The email address format is validated |
| `phone` | string | E.164 (`+819012345678`) |
| `uuid` | string | Any version |
| `uuidv4` / `uuidv7` | string | The version is validated |
| `date` | `YYYY-MM-DD` | |
| `datetime` | RFC 3339 (with time zone) | |
| `time` | `HH:MM:SS` | |
| `int64` | **string** | JavaScript loses precision above 2^53 |
| `decimal` | **string** | For money and the like. Avoids rounding errors |
| `url` | string | |
| `bytes` | base64 string | |
| `json` | any JSON | |

### Mapping per language

| Type | TypeScript | Go | Python |
|---|---|---|---|
| `string` `bool` `int` | `string` `boolean` `number` | `string` `bool` `int` | `str` `bool` `int` |
| `email` `phone` `url` | `Email` `Phone` `URL` | `comatype.Email` `Phone` `Url` | `str` with validation |
| `uuid` `uuidv4` `uuidv7` | `Uuid` `Uuidv4` `Uuidv7` (aliases of `string`) | `comatype.Uuid` `Uuidv4` `Uuidv7` (types wrapping `string`) | `uuid.UUID` |
| `date` | `DateStr` (alias) | `comatype.Date` | `datetime.date` |
| `datetime` | `DateTimeStr` (alias) | `time.Time` | `datetime` (with time zone) |
| `time` | `TimeStr` (alias) | `comatype.Time` | `datetime.time` |
| `int64` | `bigint` | `comatype.Int64` | `int` |
| `decimal` | `Decimal` (alias of string) | `comatype.Decimal` | `decimal.Decimal` |
| `bytes` | `Uint8Array` | `[]byte` | `bytes` |
| `json` | `unknown` | `json.RawMessage` | `Any` |

::: tip They are aliases in TypeScript
`uuid` and the like are aliases of `string` in TypeScript (no brand is attached). Being able to pass a plain `string` as `{ id }` was preferred for ease of use. The runtime validates the format at run time.
:::

## enum and literal unions

```comat
enum Role {
    admin,
    member,
    guest,
}

Profile {
    role: Role,
    status: "active" | "banned",   // a literal union written in place
}
```

## Constraints

| Notation | Meaning |
|---|---|
| `string(1..50)` | Number of characters |
| `int(0..150)` | Range of values (one side can be omitted: `int(0..)` `int(..150)`) |
| `string(pattern: "^[0-9]{3}-[0-9]{4}$")` | Regular expression |

Constraints are used to validate before sending and after receiving. The type in the language does not change (`string(1..50)` is still `string`).

<<< @/../usage/types/Profile.comat

## Building objects

`...Type` expands fields, and `empty` removes a field (what comes later wins).

```comat
body {
    ...UserData,    // name, email, phone and uid come in
    uid: empty,     // remove uid
    password: string,
}
```

## Resolving types

Only names that you `import`, or types declared in the same file, can be used.

```comat
import UserData from ../types/UserData.comat
```

The path is relative to the file that contains it. Put files that only declare types outside `comatDir` (in `types/` and the like).

::: warning Notes
- Keep type names unique within the project (TypeScript and Python gather them into one file).
- A cyclic `...Type` (A expands B and B expands A) is an error.
- Go supports `T | null` and unions of only string literals. Other unions (such as `string | int`) are an error at generation time.
:::
