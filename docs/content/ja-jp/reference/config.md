# 設定ファイル

`comatype.config.json` は、`comatype` を実行する側のリポジトリのルートに置きます。

```json
{
  "services": {
    "api": {
      "comatDir": "./comatfiles",
      "targets": [
        { "lang": "ts", "role": "client", "root": "./web" },
        { "lang": "go", "role": "server", "root": "./server", "out": "./server/internal/comatype", "importPath": "example.com/app/internal/comatype" }
      ]
    }
  },
  "additionalStatusCodes": [
    { "status": 299, "message": "Custom Thing" }
  ]
}
```

## 項目

### `services`

名前を付けた API の単位です。1 つの service は、1 つの `comatDir` と、複数の `targets` を持ちます。モノレポで複数の API を扱えます。

| キー | 内容 |
|---|---|
| `comatDir` | その service の `.comat` を置く場所。`comatype generate` はここを走査する |
| `targets` | 生成の対象の一覧 |

### `targets[]`

| キー | 必須 | 内容 |
|---|---|---|
| `lang` | ✅ | `ts` / `go` / `python` / `rust` / `java` / `kotlin` / `swift` / `ruby` / `csharp`（`dart` は書けるが、生成は未対応） |
| `role` | ✅ | `client` / `server` |
| `root` | ✅ | その言語のプロジェクトの場所 |
| `out` | | 出力先。省略すると、言語ごとの既定（下） |
| `package` | | Java / Kotlin / C# だけ。生成物のパッケージ名（C# は名前空間）。省略すると、`out` の `src/main/java/`（Kotlin は `src/main/kotlin/`）以降のパス（無ければ `comatype.gen`。C# は `ComatypeGen`） |
| `importPath` | | Go だけ。生成先の import path。省略すると、`root` から上へ探した `go.mod` の `module` と、`go.mod` から `out` までの相対パスで決める |

#### 出力先の既定

| 言語 | 既定の `out`（`root` の下） |
|---|---|
| TypeScript、Go | `comatype` |
| Python、Ruby | `comatype_gen` |
| Rust | `src/comatype_gen` |
| Java | `src/main/java/comatype/gen` |
| Kotlin | `src/main/kotlin/comatype/gen` |
| Swift | `Sources/ComatypeGen` |
| C# | `ComatypeGen` |
| Dart | `lib/comatype_gen` |

- 同じ `root` に、同じ言語の複数の service があると、`<既定>/<service>` になります。
- 同じ `root` に、同じ言語の client と server があると、`<既定>/client` / `<既定>/server` になります。
- `out` を明示した場合は、それを使います。

### `additionalStatusCodes`

標準に無いステータスコードを足します。

| キー | 内容 |
|---|---|
| `status` | 100〜599 の整数。標準で定義済みのコードや重複は、エラー |
| `message` | メッセージ。空はエラー |

[ステータスコード](/language/status-codes)を見てください。

## エディタの補完（`$schema`）

この設定ファイルの JSON Schema は、リポジトリの `schema/comatype.config.schema.json` にあります。先頭の行で指すと、VS Code などのエディタで補完・説明・検証が使えます。

```json
{
  "$schema": "./node_modules/comatype/schema/comatype.config.schema.json",
  "services": { }
}
```

パスは設定ファイルからの相対です（このリポジトリなら、たとえば `../schema/comatype.config.schema.json`）。Comatype 自体は `$schema` を無視します。

## 検査されること

`comatype check` と言語サーバは、設定ファイルも検査します。

- `lang` / `role` の値
- `additionalStatusCodes` の範囲・重複・空のメッセージ
- `comatDir` の存在
