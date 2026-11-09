from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any

import httpx
import pytest
from helpers import (
    COOKIE,
    ID,
    S200,
    S204,
    S401,
    S404,
    ApiError,
    Params,
    Request,
    RespHeaders,
    Search,
    User,
    endpoint,
    put,
    transport,
)

from comatype import (
    Client,
    ComatypeError,
    ComatypeValidationError,
    ComatypeWrap,
    Cookie,
    CookieDef,
    CookieJar,
    Headers,
    NoArg,
    RawRequest,
    Server,
    UnexpectedStatusError,
    serialize_set_cookie,
    wire,
)

NOW = datetime(2024, 1, 2, 3, 4, 5, tzinfo=timezone.utc)
USER = User(name="taro", followers=9007199254740993, uid=uuid.UUID(ID), createdAt=NOW, deleted=None)


# ---- wire ----


def test_to_wire_and_parse_roundtrip() -> None:
    data = wire.to_wire(User, USER)
    # int64 is a string, uuid is a string, alias keys, optional None is dropped, nullable None is kept
    assert data == {
        "name": "taro",
        "followers": "9007199254740993",
        "uid": ID,
        "createdAt": "2024-01-02T03:04:05Z",
        "deleted": None,
    }
    back = wire.parse_json(User, wire.dump_json(User, USER))
    assert back == USER


@pytest.mark.parametrize(
    "mutate, path",
    [
        (lambda d: d.pop("name"), "name"),
        (lambda d: d.update(name=""), "name"),
        (lambda d: d.update(name="toolong"), "name"),
        (lambda d: d.update(followers=1), "followers"),  # int64 is a string
        (lambda d: d.update(followers="x"), "followers"),
        (lambda d: d.update(uid="3f2b8c1e-5d4a-7b6e-9c1d-2a7f0e8b9c10"), "uid"),  # v7 is not uuidv4
        (lambda d: d.update(createdAt="2024-01-02T03:04:05"), "createdAt"),  # only with a timezone
        (lambda d: d.pop("deleted"), "deleted"),  # nullable but required
        (lambda d: d.update(name=5), "name"),
    ],
)
def test_parse_rejects(mutate: Any, path: str) -> None:
    import json

    d = wire.to_wire(User, USER)
    mutate(d)
    with pytest.raises(ComatypeValidationError) as e:
        wire.parse_json(User, json.dumps(d))
    assert e.value.path == path


def test_strict_json_does_not_coerce() -> None:
    from pydantic import BaseModel

    class M(BaseModel):
        n: int
        b: bool

    with pytest.raises(ComatypeValidationError):
        wire.parse_json(M, '{"n":"5","b":true}')
    with pytest.raises(ComatypeValidationError):
        wire.parse_json(M, '{"n":5,"b":"true"}')


def test_strings_roundtrip() -> None:
    s = Search(verbose=True, limit=5, tag=["a", "b c"])
    enc = wire.encode_strings(s)
    assert enc == {"verbose": ["true"], "limit": ["5"], "tag": ["a", "b c"]}
    assert wire.decode_strings(Search, enc.get) == s
    assert wire.encode_strings(Search()) == {}
    with pytest.raises(ComatypeValidationError):
        wire.decode_strings(Search, {"limit": ["x"]}.get, prefix="search")
    h = wire.decode_strings(RespHeaders, {"Allow": ["GET, PUT ,POST"], "X-Count": ["3"]}.get, split=True)
    assert h.allow == ["GET", "PUT", "POST"] and h.x_count == 3
    assert wire.encode_strings(h) == {"Allow": ["GET", "PUT", "POST"], "X-Count": ["3"]}
    with pytest.raises(ComatypeValidationError):
        wire.decode_strings(RespHeaders, {}.get, split=True)


# ---- cookie ----


def test_set_cookie() -> None:
    assert serialize_set_cookie(COOKIE, "a b") == "session=a%20b; Path=/; HttpOnly; Secure; SameSite=Lax"
    assert "Max-Age=10;" in serialize_set_cookie(COOKIE, Cookie("x", max_age=10)) + ";"
    assert (
        serialize_set_cookie(COOKIE, Cookie.clear())
        == "session=; Path=/; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; Secure; SameSite=Lax"
    )
    assert "Expires=Wed, 02 Jan 2030 03:04:05 GMT" in serialize_set_cookie(
        COOKIE, Cookie("x", expires=datetime(2030, 1, 2, 3, 4, 5, tzinfo=timezone.utc))
    )
    with pytest.raises(ComatypeError):
        serialize_set_cookie(COOKIE, Cookie("x", path="/a; Domain=evil"))
    with pytest.raises(ComatypeError):
        serialize_set_cookie(None, "x")
    assert serialize_set_cookie(CookieDef(name="a"), "v") == "a=v; Path=/"


def test_cookie_jar() -> None:
    now = [1_000_000.0]
    jar = CookieJar(now=lambda: now[0])
    jar.store(
        [
            "session=tok%20en; Path=/; HttpOnly",
            "scoped=1; Path=/admin",
            "short=1; Max-Age=10",
            "dated=1; Expires=Thu, 01 Jan 2099 00:00:00 GMT",
            "broken",
        ]
    )
    assert jar.get("/user") == {"session": "tok en", "short": "1", "dated": "1"}
    assert jar.get("/admin/x")["scoped"] == "1"
    assert "scoped" not in jar.get("/administrator")
    now[0] += 11
    assert "short" not in jar.get("/user")
    jar.store(["session=; Max-Age=0; Path=/"])
    assert "session" not in jar.get("/")


# ---- server ----


async def call(server: Server, method: str, path: str, **kw: Any) -> httpx.Response:
    async with transport(server) as http:
        return await http.request(method, path, **kw)


def new_server() -> Server:
    return Server()


async def test_routing() -> None:
    s = new_server()
    s.get(endpoint("get", "/user/:id", params=Params, arg_form="request", request_cls=lambda **kw: kw))(
        lambda req: S404(error=ApiError(code="id:" + str(req["params"].id)))
    )
    s.get(endpoint("get", "/user/me"))(lambda req: S404(error=ApiError(code="me")))
    s.post(endpoint("post", "/user/me"))(lambda req: S204())

    # static segments take precedence over dynamic ones
    assert (await call(s, "GET", "/user/me")).json() == {"code": "me"}
    assert (await call(s, "GET", f"/user/{ID}")).json() == {"code": "id:" + ID}
    assert (await call(s, "GET", "/user/me/")).json() == {"code": "me"}  # trailing / is ignored
    assert (await call(s, "GET", "/none")).status_code == 404
    r = await call(s, "DELETE", "/user/me")
    assert r.status_code == 405 and r.headers["allow"] == "GET, POST"
    r = await call(s, "GET", "/user/not-a-uuid")  # path validation error
    assert r.status_code == 400 and r.json()["code"] == "validation_error" and r.json()["path"] == "params.id"


async def test_register_errors() -> None:
    s = new_server()
    ep = endpoint("get", "/dup")
    s.get(ep)(lambda req: S204())
    with pytest.raises(ComatypeError):
        s.get(ep)(lambda req: S204())
    with pytest.raises(ComatypeError):
        s.post(ep)


async def test_request_parsing_and_response() -> None:
    s = new_server()
    seen: list[Request] = []

    @s.put(put)
    async def handler(req: Request) -> S200:
        seen.append(req)
        return S200(data=req.body, headers=RespHeaders(Allow=["GET", "PUT"], **{"X-Count": 2}))

    body = wire.to_wire(User, USER)
    r = await call(s, "PUT", f"/user/{ID}?verbose=true&limit=5&tag=a&tag=b", json=body, headers={"x-n": "7"})
    assert r.status_code == 200
    req = seen[0]
    assert str(req.params.id) == ID and req.search == Search(verbose=True, limit=5, tag=["a", "b"])
    assert req.body == USER and req.headers.x_n == 7
    assert r.json() == body
    assert r.headers["allow"] == "GET, PUT" and r.headers["x-count"] == "2"

    for bad, code in [
        ({**body, "name": ""}, "body.name"),
        ({**{k: v for k, v in body.items() if k != "uid"}}, "body.uid"),
    ]:
        r = await call(s, "PUT", f"/user/{ID}", json=bad)
        assert r.status_code == 400 and r.json()["path"] == code
    assert (await call(s, "PUT", f"/user/{ID}")).json()["path"] == "body"  # no body
    assert (await call(s, "PUT", f"/user/{ID}", content=b"{oops")).status_code == 400
    assert (await call(s, "PUT", f"/user/{ID}?limit=x", json=body)).json()["path"] == "search.limit"


async def test_bad_responses_become_500() -> None:
    s = new_server()
    errors: list[BaseException] = []
    s.init(on_error=errors.append)
    s.get(endpoint("get", "/a"))(
        lambda req: S200(
            data=User.model_construct(name="", followers=1, uid=uuid.UUID(ID), created_at=NOW, deleted=None),
            headers=RespHeaders(Allow=[]),
        )
    )  # body that does not match the .comat
    s.get(endpoint("get", "/b"))(lambda req: "nope")
    s.get(endpoint("get", "/c", responses=(S204,)))(lambda req: S404(error=ApiError(code="x")))  # undeclared status
    s.get(endpoint("get", "/d"))(lambda req: 1 / 0)
    for p in "abcd":
        r = await call(s, "GET", "/" + p)
        assert r.status_code == 500 and r.json() == {"code": "internal_error", "message": "Internal Server Error"}, p
    assert len(errors) == 4


async def test_wrappers_order_ctx_and_short_circuit() -> None:
    from dataclasses import dataclass

    @dataclass
    class A:
        a: int

    @dataclass
    class B:
        b: int

    log: list[str] = []

    async def wa(req: Any, nxt: Any) -> Any:
        log.append("a")
        req.ctx = A(a=1)
        res = await nxt(req)
        res.headers["x-a"] = "1"
        return res

    async def wb(req: Any, nxt: Any) -> Any:
        log.append("b")
        if "x-deny" in req.headers:
            return S401(error=ApiError(code="denied"))
        req.ctx = B(b=2)
        return await nxt(req)

    class Ctx(A, B):
        pass

    got: dict[str, Any] = {}

    def handler(req: Any) -> Any:
        got["ctx"] = (req.ctx.a, req.ctx.b)
        return S204()

    s = new_server()
    s.init(wrappers={"a": ComatypeWrap[A](wa), "b": ComatypeWrap[B](wb)})
    s.get(endpoint("get", "/w", wraps=("a", "b"), request_cls=lambda **kw: type("R", (), kw)(), ctx_cls=Ctx))(handler)
    r = await call(s, "GET", "/w")
    assert r.status_code == 204 and log == ["a", "b"] and got["ctx"] == (1, 2) and r.headers["x-a"] == "1"
    r = await call(s, "GET", "/w", headers={"x-deny": "1"})  # b short-circuits; the outer a sees the return
    assert r.status_code == 401 and r.json() == {"code": "denied"} and r.headers["x-a"] == "1"

    s.init(wrappers={"a": ComatypeWrap[A](wa)}, on_error=lambda e: None)  # b is missing
    assert (await call(s, "GET", "/w")).status_code == 500


async def test_server_cookie() -> None:
    s = new_server()
    s.get(endpoint("get", "/in"))(lambda req: S401(error=ApiError(code="x"), cookie=Cookie("tok", max_age=30)))
    s.get(endpoint("get", "/out"))(lambda req: S401(error=ApiError(code="x"), cookie=Cookie.clear()))
    s.get(endpoint("get", "/off", cookie=False, cookie_def=None))(lambda req: S401(error=ApiError(code="x"), cookie="x"))
    s.init(on_error=lambda e: None)
    r = await call(s, "GET", "/in")
    assert r.headers["set-cookie"] == "session=tok; Path=/; Max-Age=30; HttpOnly; Secure; SameSite=Lax"
    assert (await call(s, "GET", "/out")).headers["set-cookie"].startswith("session=; Path=/; Max-Age=0")
    r = await call(s, "GET", "/off")
    assert r.status_code == 500 and "set-cookie" not in r.headers


# ---- client ----


def pair(**client_kw: Any) -> tuple[Client, Server]:
    s = new_server()
    c = Client()
    c.init(base_url="http://test", client=transport(s), **client_kw)
    return c, s


async def test_client_put_roundtrip() -> None:
    c, s = pair()

    @s.put(put)
    def handler(req: Request) -> Any:
        if str(req.params.id) != ID:
            return S404(error=ApiError(code="nf"))
        return S200(data=req.body, headers=RespHeaders(Allow=["GET"], **{"X-Count": 3}))

    res = await c.put(put, Request(params=Params(id=uuid.UUID(ID)), body=USER, search=Search(verbose=True)), S200, S404)
    assert isinstance(res, S200) and res.status == 200 and res.data == USER
    assert res.headers.allow == ["GET"] and res.headers.x_count == 3
    res = await c.put(put, Request(params=Params(id=uuid.uuid4()), body=USER), S200, S404)
    assert isinstance(res, S404) and res.error == ApiError(code="nf")

    with pytest.raises(UnexpectedStatusError) as e:
        await c.put(put, Request(params=Params(id=uuid.uuid4()), body=USER), S200)  # S404 is not passed
    assert e.value.status == 404
    with pytest.raises(ComatypeError):
        await c.get(put, Request(params=Params(id=uuid.UUID(ID)), body=USER), S200)  # wrong method


async def test_client_validates_before_sending() -> None:
    c, s = pair()
    hit: list[int] = []
    s.put(put)(lambda req: hit.append(1) or S204())
    with pytest.raises(Exception):  # pydantic validates at construction
        Request(params=Params(id="nope"), body=USER)  # type: ignore[arg-type]
    bad = User.model_construct(name="", followers=1, uid=uuid.UUID(ID), created_at=NOW, deleted=None)  # a value built without validation
    with pytest.raises(ComatypeValidationError) as e:
        await c.put(put, Request(params=Params(id=uuid.UUID(ID)), body=bad), S204)
    assert e.value.path.startswith("body")
    assert hit == []


async def test_client_wrappers_and_short_circuit() -> None:
    c, s = pair()
    seen: list[str | None] = []
    ep = endpoint("get", "/me", wraps=("auth",))
    s.get(ep)(lambda req: seen.append("hit") or S204())

    async def auth(req: Any, nxt: Any) -> Any:
        if req.headers.get("x-skip"):
            return S401(error=ApiError(code="login"))
        req.headers["Authorization"] = "Bearer t"
        return await nxt(req)

    async def passthrough(req: Any, nxt: Any) -> Any:
        return await nxt(req)

    s.init(wrappers={"auth": ComatypeWrap(passthrough)})
    c.init(base_url="http://test", client=transport(s), wrappers={"auth": ComatypeWrap(auth)})
    assert isinstance(await c.get(ep, S204), S204)
    res = await c.with_headers({"x-skip": "1"}).get(ep, S204)  # when the wrapper returns S401, it returns without any request
    assert isinstance(res, S401) and seen == ["hit"]

    c.init(base_url="http://test", client=transport(s))
    with pytest.raises(ComatypeError):
        await c.get(ep, S204)


async def test_client_cookie_jar_roundtrip() -> None:
    jar = CookieJar()
    c, s = pair(cookies=jar)
    login = endpoint("post", "/login")
    me = endpoint("get", "/me")
    plain = endpoint("get", "/plain", cookie=False, cookie_def=None)
    out = endpoint("post", "/logout")
    got: list[str | None] = []
    s.post(login)(lambda req: S401(error=ApiError(code="x"), cookie="tok-1"))
    s.get(me)(lambda req: got.append("me") or S204())
    s.get(plain)(lambda req: S204())
    s.post(out)(lambda req: S401(error=ApiError(code="x"), cookie=Cookie.clear()))

    async def whoami(request: httpx.Request) -> None:
        got.append(request.headers.get("cookie"))

    s.get(endpoint("get", "/echo"))(lambda req: S204())
    await c.post(login, S401)
    assert jar.get("/") == {"session": "tok-1"}  # the jar keeps it even if HttpOnly

    # look at the cookie the server received
    seen_cookie: list[str | None] = []
    s.get(endpoint("get", "/who"))(lambda req: (seen_cookie.append(None), S204())[1])
    c2 = Client()
    c2.init(
        base_url="http://test",
        client=httpx.AsyncClient(
            transport=httpx.MockTransport(lambda r: (seen_cookie.append(r.headers.get("cookie")), httpx.Response(204))[1])
        ),
        cookies=jar,
    )
    await c2.get(endpoint("get", "/who"), S204)
    await c2.get(plain, S204)  # not sent to cookie off
    assert seen_cookie[-2:] == ["session=tok-1", None]
    await c.post(out, S401)
    assert jar.get("/") == {}


async def test_client_headers_and_base_url_priority(monkeypatch: pytest.MonkeyPatch) -> None:
    ep = endpoint("get", "/p", base_url="http://127.0.0.1:1")
    s = new_server()
    s.get(ep)(lambda req: S204())
    c = Client()
    c.init(base_url="http://test", client=transport(s), headers={"x-a": "1"})
    assert isinstance(await c.get(ep, S204), S204)

    c.init(client=transport(s))
    monkeypatch.setenv("COMATYPE_BASE_URL", "http://test")
    assert isinstance(await c.get(ep, S204), S204)  # environment variable
    monkeypatch.delenv("COMATYPE_BASE_URL")
    with pytest.raises(httpx.HTTPError):
        await Client().get(ep, S204)  # baseUrl from init.comat (an unreachable value)
    ep2 = endpoint("get", "/q")
    with pytest.raises(ComatypeError):
        await Client().get(ep2, S204)  # not set anywhere


def test_no_arg_is_exported() -> None:
    assert NoArg is not None and Headers({"A": "b"})["a"] == "b" and RawRequest(method="get", path="/").cookie("x") is None


def test_bytes_and_decimal_scalars() -> None:
    import decimal

    from pydantic import BaseModel

    from comatype import scalars as sc

    class M(BaseModel):
        blob: sc.Bytes
        d: sc.Decimal
        big: sc.Int64

    m = M(blob=b"hi", d=decimal.Decimal("1.50"), big=5)
    assert wire.to_wire(M, m) == {"blob": "aGk=", "d": "1.50", "big": "5"}
    assert wire.parse_json(M, '{"blob":"aGk=","d":"1.50","big":"5"}') == m
    for bad in [
        '{"blob":"%","d":"1","big":"1"}',
        '{"blob":"aGk=","d":1.5,"big":"1"}',
        '{"blob":"aGk=","d":"1","big":1}',
    ]:
        with pytest.raises(ComatypeValidationError):
            wire.parse_json(M, bad)
