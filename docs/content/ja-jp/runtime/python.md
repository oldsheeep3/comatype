# Python

Python 3.10 以上、pydantic v2、httpx が必要です。生成物は `comatype_gen/` に作られ、import は相対なので、`out` の名前や場所に依存しません。

## 生成されるもの

```text
comatype_gen/
├─ models.py                名前付きの型（pydantic のモデル・enum）
├─ comatype_init.py         ラッパー・ctx・ラッパーのステータス
├─ user/put__id.py          エンドポイントごと（from comatype_gen.user.put__id import ...）
└─ __init__.py ...
```

## クライアント

```python
from comatype import c
from comatype_gen.user.put__id import path, S200, S404, Request, Params

res = await c.put(path, Request(params=Params(id=uid), body=user), S200, S404)

match res.status:
    case 200:
        res.data    # UserData
    case 404:
        res.error   # ApiError
```

- 戻り値は、渡したステータスの和（`match` / `isinstance` で絞り込めます）。ステータスは 6 個まで型が付きます。
- 渡していないステータスは `UnexpectedStatusError`。
- リクエストは、`params` / `search` があれば `Request`（全部任意なら `Request()`）、`body` だけならボディそのもの、無ければ引数なし。
- `async` のみです。

```python
c.init(
    wrappers=Wrappers(auth=auth),   # 足りないと mypy が教える
    cookies=True,                   # または CookieJar()
    base_url="https://api.example.com",
)
```

## サーバ

```python
from comatype import s
from comatype_gen.user.put__id import path, S200, S404, Request

@s.put(path)
async def put_user(req: Request):
    # req.params.id: uuid.UUID, req.body: UserData, req.ctx.user
    if not ok:
        return S404(error=S404.Res(code="not_found", message="not found"))
    return S200(data=user)
```

- `s` 自体が ASGI アプリです。`uvicorn.run(s)`、テストは `httpx.ASGITransport(app=s)`。
- ハンドラの引数と戻り値は、エンドポイントの `Request` と `Response` に型検査で合わせられます。
- cookie は `S200(data=..., cookie=Cookie(token, max_age=3600))` / `Cookie.clear()`。

## 型の対応

- `uuid*` は `uuid.UUID`、`date` は `datetime.date`、`datetime` はタイムゾーン付きの `datetime`、`int64` は `int`（通信上は文字列）、`decimal` は `Decimal`、`bytes` は `bytes`。
- フィールド名は snake_case で、通信上の名前は `alias`（`populate_by_name=True`）。
- ボディは JSON の型に厳密に検証します（文字列の `"5"` を `int` にはしません）。
- 型注釈には `S200Res` / `S200Headers` を使います（`S200.Res` / `S200.Headers` は、`S200.Res(...)` と作るための別名です）。

## mypy

`pydantic.mypy` プラグインを、`init_typed = true` と `init_forbid_extra = true` で有効にすると、`S200(data=1)` や、`uid: empty` のフィールドへの代入が型エラーになります。

```toml
[tool.mypy]
strict = true
plugins = ["pydantic.mypy"]

[tool.pydantic-mypy]
init_typed = true
init_forbid_extra = true
```

## 実例

<<< @/../usage/python_client/user_put_id.py

<<< @/../usage/python_server/user_put_id.py
