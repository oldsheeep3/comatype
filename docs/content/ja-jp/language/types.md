# 型

## 型の宣言

`名前 { フィールド }` で宣言します。フィールドはカンマ区切りで、最後のカンマは付けても付けなくても構いません。

<<< @/../usage/types/UserData.comat

`?` を付けたフィールドは**省略可能**（キーが無くてもよい）です。`T | null` は**null を許す**（キーは必須）で、別の意味です。

```comat
User {
    name: string,
    nickname?: string,           // キーを省略できる
    deletedAt: datetime | null,  // キーは必須で、null を許す
    tags: string[],              // 配列
}
```

## 組み込みの型

| 型 | 通信上の形式 | 補足 |
|---|---|---|
| `string` / `bool` / `int` | JSON の文字列 / 真偽値 / 数値 | |
| `email` | 文字列 | メールアドレスの形式を検証 |
| `phone` | 文字列 | E.164（`+819012345678`） |
| `uuid` | 文字列 | バージョン不問 |
| `uuidv4` / `uuidv7` | 文字列 | バージョンを検証 |
| `date` | `YYYY-MM-DD` | |
| `datetime` | RFC 3339（タイムゾーン付き） | |
| `time` | `HH:MM:SS` | |
| `int64` | **文字列** | JavaScript で 2^53 を超えると精度が落ちるため |
| `decimal` | **文字列** | 金額など。誤差を避ける |
| `url` | 文字列 | |
| `bytes` | base64 の文字列 | |
| `json` | 任意の JSON | |

### 言語ごとの対応

| 型 | TypeScript | Go | Python |
|---|---|---|---|
| `string` `bool` `int` | `string` `boolean` `number` | `string` `bool` `int` | `str` `bool` `int` |
| `email` `phone` `url` | `Email` `Phone` `URL` | `comatype.Email` `Phone` `Url` | 検証付きの `str` |
| `uuid` `uuidv4` `uuidv7` | `Uuid` `Uuidv4` `Uuidv7`（`string` の別名） | `comatype.Uuid` `Uuidv4` `Uuidv7`（`string` を包んだ型） | `uuid.UUID` |
| `date` | `DateStr`（別名） | `comatype.Date` | `datetime.date` |
| `datetime` | `DateTimeStr`（別名） | `time.Time` | `datetime`（タイムゾーン付き） |
| `time` | `TimeStr`（別名） | `comatype.Time` | `datetime.time` |
| `int64` | `bigint` | `comatype.Int64` | `int` |
| `decimal` | `Decimal`（文字列の別名） | `comatype.Decimal` | `decimal.Decimal` |
| `bytes` | `Uint8Array` | `[]byte` | `bytes` |
| `json` | `unknown` | `json.RawMessage` | `Any` |

::: tip TypeScript では別名です
`uuid` などは、TypeScript では `string` の別名です（ブランドは付けません）。`{ id }` に `string` をそのまま渡せる使いやすさを優先しました。形式の検証は、ランタイムが実行時に行います。
:::

## enum とリテラルのユニオン

```comat
enum Role {
    admin,
    member,
    guest,
}

Profile {
    role: Role,
    status: "active" | "banned",   // その場で書くリテラルのユニオン
}
```

## 制約

| 書き方 | 意味 |
|---|---|
| `string(1..50)` | 文字数 |
| `int(0..150)` | 値の範囲（片方は省略できる: `int(0..)` `int(..150)`） |
| `string(pattern: "^[0-9]{3}-[0-9]{4}$")` | 正規表現 |

制約は、送る前と受け取った後の検証に使います。言語上の型は変わりません（`string(1..50)` も `string` です）。

<<< @/../usage/types/Profile.comat

## オブジェクトの組み立て

`...Type` はフィールドの展開、`empty` はフィールドを消します（後ろに書いたものが勝つ）。

```comat
body {
    ...UserData,    // name, email, phone, uid が入る
    uid: empty,     // uid を消す
    password: string,
}
```

## 型の解決

`import` した名前、または同じファイルで宣言した型だけが使えます。

```comat
import UserData from ../types/UserData.comat
```

パスは、書いたファイルからの相対です。型の宣言だけを書いたファイルは、`comatDir` の外（`types/` など）に置きます。

::: warning 注意
- 型名は、プロジェクトの中で一意にしてください（TypeScript と Python は、1 つのファイルにまとめるため）。
- `...Type` が循環している（A が B を、B が A を展開する）とエラーです。
- Go は、`T | null` と文字列リテラルだけのユニオンに対応しています。それ以外のユニオン（`string | int` など）は、生成時にエラーになります。
:::
