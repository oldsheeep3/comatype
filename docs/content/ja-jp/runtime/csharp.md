# C#

C# のランタイムは、NuGet のパッケージ `Comatype`（`packages/csharp`）です。**外部への依存はありません**（JSON は独自実装、クライアントは `System.Net.Http.HttpClient`、サーバは `System.Net.HttpListener`）。.NET 8 以上が必要です（record・パターンマッチ・null 許容参照型）。生成物は、既定では名前空間 `ComatypeGen` に入ります（ターゲットの `package` で変えられます）。nullable コンテキストを有効にしてコンパイルされます。

## 生成されるもの

```text
<out>/                       既定は ComatypeGen
├─ Types.cs                  名前付きの型（record・enum）。static クラス Types の中
├─ Init.cs                   ラッパー・ctx・ラッパーのステータス。static クラス Init の中
└─ UserPutId.cs              エンドポイントごと（static クラス名は PascalCase の連結名）
```

生成したディレクトリをプロジェクトに入れ、パッケージを参照に足します。

```bash
dotnet add package Comatype
```

## クライアント

<<< @/../usage/csharp_client/UserPutId.cs [UserPutId.cs]

- 呼び出しは `async` です（`C.GetAsync`、`PostAsync`、`PutAsync`、`PatchAsync`、`DeleteAsync`、`OptionsAsync`、`QueryAsync`、`HeadAsync`）。戻り値は `Task<Response>` です。
- 引数は、`params` / `search` / ヘッダがあれば `Request`、`body` だけならボディそのもの、無ければ `NoArg.Instance`。
- `Response` は abstract record で、ステータスごとの sealed な record（`S200`、`S404` ...）があります。`switch` や `is` で絞り込めます。
- `.comat` に無いステータスは `ComatypeException.UnexpectedStatus`、検証エラーは `ValidationException`（`Path` と `Reason`）。

<<< @/../usage/csharp_client/Init.cs [Init.cs]

<<< @/../usage/csharp_client/Wrappers/Auth.cs [Wrappers/Auth.cs]

## サーバ

<<< @/../usage/csharp_server/UserPutId.cs [UserPutId.cs]

- `S` のインスタンスに、ハンドラを登録します（`s.Put(Endpoint, req => ...)`）。ハンドラは同期でも `async` でも書けます。`cookie on` のエンドポイントでは `S.Reply<Response>` を返し（`S.Reply<Response>.Of(res).WithCookie(CookieValue.Of(v).WithMaxAge(3600))`）、ただの `Response` はそのまま変換されます。
- `s.Serve("127.0.0.1", 3000)` は `HttpListener` で動きます（ポート `0` で空いているポートを選び、戻り値の `Server` に `Port` と `Stop()` があります）。TLS は無いので、前段のプロキシで終端してください。`await s.HandleAsync(method, target, headers, body)` は任意のフレームワークから呼べる入口です。

<<< @/../usage/csharp_server/Init.cs [Init.cs]

<<< @/../usage/csharp_server/Wrappers/Auth.cs [Wrappers/Auth.cs]

## 型の対応

- `uuid` `uuidv4` `uuidv7` は `Guid`（バージョンも検証）、`date` は `DateOnly`、`time` は `TimeOnly`、`datetime` は `DateTimeOffset`（UTC）、`decimal` は `decimal`（28 桁まで）、`url` は `Uri`、`bytes` は `byte[]`、`json` は `object?`（パースした木）。
- `email` `phone` は `Comatype.Email` / `Comatype.Phone`（record）。
- `int` と `int64` は `long`。`int64` は通信上は文字列です。
- 省略可能（`?`）と `T | null` は `T?`。record は `with` でコピーでき（`Search.Empty() with { Limit = 10 }`）、全部が省略可能なら `Empty()` があります。
- enum は、メンバーに `[WireName("...")]` が付いた C# の `enum`。文字列リテラルのユニオンは、検証付きの `string` です。
- 配列は `List<T>` です。

## 注意

- 生成される record と enum は PascalCase の名前です（`xResourceVersion` は `XResourceVersion`）。record 自身の名前や `Validate` / `Encode` / `Decode` / `Empty` と衝突するフィールド名には、末尾に `_` が付きます。
