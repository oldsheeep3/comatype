# Python

You need Python 3.10 or later, pydantic v2 and httpx. The output goes into `comatype_gen/`, and its imports are relative, so it does not depend on the name or location of `out`.

## What is generated

```text
comatype_gen/
├─ models.py                Named types (pydantic models and enums)
├─ comatype_init.py         Wrappers, ctx and wrapper statuses
├─ user/put__id.py          One per endpoint (from comatype_gen.user.put__id import ...)
└─ __init__.py ...
```

## Client

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

- The return value is the union of the statuses you passed (narrow it with `match` / `isinstance`). Up to 6 statuses are typed.
- A status you did not pass raises `UnexpectedStatusError`.
- The request is `Request` if there are `params` / `search` (`Request()` if all are optional), the body itself if there is only a `body`, and no argument if there is neither.
- `async` only.

```python
c.init(
    wrappers=Wrappers(auth=auth),   # mypy tells you if one is missing
    cookies=True,                   # or CookieJar()
    base_url="https://api.example.com",
)
```

## Server

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

- `s` itself is an ASGI app. Run `uvicorn.run(s)`, and in tests use `httpx.ASGITransport(app=s)`.
- The type checker can match the handler's argument and return value to the endpoint's `Request` and `Response`.
- Cookies use `S200(data=..., cookie=Cookie(token, max_age=3600))` / `Cookie.clear()`.

## Type mapping

- `uuid*` is `uuid.UUID`, `date` is `datetime.date`, `datetime` is a time-zone-aware `datetime`, `int64` is `int` (a string on the wire), `decimal` is `Decimal`, and `bytes` is `bytes`.
- Field names are snake_case, and the name on the wire is the `alias` (`populate_by_name=True`).
- Bodies are validated strictly against JSON types (the string `"5"` is not turned into an `int`).
- Use `S200Res` / `S200Headers` for type annotations (`S200.Res` / `S200.Headers` are aliases for writing `S200.Res(...)`).

## mypy

Enable the `pydantic.mypy` plugin with `init_typed = true` and `init_forbid_extra = true`, and `S200(data=1)` or an assignment to a field with `uid: empty` becomes a type error.

```toml
[tool.mypy]
strict = true
plugins = ["pydantic.mypy"]

[tool.pydantic-mypy]
init_typed = true
init_forbid_extra = true
```

## Real example

<<< @/../usage/python_client/user_put_id.py

<<< @/../usage/python_server/user_put_id.py
