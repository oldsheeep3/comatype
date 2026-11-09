"""Client `c`: builds typed HTTP calls from endpoint descriptors and status classes."""

from __future__ import annotations

import inspect
import os
from collections.abc import Awaitable, Callable
from typing import Any, TypeVar, overload

import httpx

from .cache import (
    CACHE_COOKIE_PREFIX,
    MemoryCache,
    cache_cookie_name,
    cacheable,
    client_cache_key,
    decode_cache_cookie,
    encode_cache_cookie,
)
from .cookie import CookieJar
from .endpoint import ComatypeWrap, Endpoint, NoArg, Status
from .errors import ComatypeError, UnexpectedStatusError
from .raw import Headers, RawRequest, RawResponse
from .wire import dump_json, encode_strings

A = TypeVar("A")
R1 = TypeVar("R1", bound=Status)
R2 = TypeVar("R2", bound=Status)
R3 = TypeVar("R3", bound=Status)
R4 = TypeVar("R4", bound=Status)
R5 = TypeVar("R5", bound=Status)
R6 = TypeVar("R6", bound=Status)

Next = Callable[[RawRequest[Any]], Awaitable[RawResponse]]


def _is_status(x: Any) -> bool:
    return inspect.isclass(x) and issubclass(x, Status)


class Client:
    def __init__(self) -> None:
        self._wrappers: Any = None
        self._base_url: str | None = None
        self._jar: CookieJar | None = None
        self._headers: dict[str, str] = {}
        self._http: httpx.AsyncClient | None = None
        self._extra_headers: dict[str, str] = {}
        self._parent: Client | None = None
        self._cache = MemoryCache()
        self._cache_cookies: set[str] = set()

    def init(
        self,
        *,
        wrappers: Any = None,
        base_url: str | None = None,
        cookies: bool | CookieJar = False,
        headers: dict[str, str] | None = None,
        client: httpx.AsyncClient | None = None,
    ) -> None:
        """Call once at startup.

        base_url precedence: this argument > env COMATYPE_BASE_URL > baseUrl in init.comat.
        cookies=True (or a CookieJar) keeps Set-Cookie from `cookie on` endpoints and sends it back.
        """
        self._wrappers = wrappers
        self._base_url = base_url
        self._jar = CookieJar() if cookies is True else (cookies or None)
        self._headers = dict(headers or {})
        self._http = client

    def clear_cache(self) -> None:
        """Discard the cache (memory and entries stored in the cookie jar), e.g. on logout."""
        conf = self._conf()
        conf._cache.clear()
        if conf._jar is not None:
            for name in conf._cache_cookies:
                conf._jar.store([f"{name}=; Path=/; Max-Age=0"])
        conf._cache_cookies.clear()

    def with_headers(self, headers: dict[str, str]) -> Client:
        """A new client with extra headers. Settings (init) are shared with the original client."""
        child = Client()
        child._parent = self._conf()
        child._extra_headers = {**self._extra_headers, **headers}
        return child

    def _conf(self) -> Client:
        return self._parent or self

    def _wrapper(self, name: str) -> Any:
        w = self._conf()._wrappers
        found = w.get(name) if isinstance(w, dict) else getattr(w, name, None)
        if found is None:
            raise ComatypeError(f"ラッパー {name} が init に渡されていません")
        return found

    async def _call(self, method: str, ep: Endpoint[Any, Any, Any], args: tuple[Any, ...]) -> Any:
        if ep.method != method:
            raise ComatypeError(f"c.{method}() に {ep.method} のエンドポイント（{ep.module}）は渡せません")
        n = 0
        while n < len(args) and not _is_status(args[n]):
            n += 1
        if n > 1:
            raise ComatypeError("リクエストの引数が多すぎます")
        statuses: tuple[type[Status], ...] = args[n:]
        arg = args[0] if n == 1 else None
        conf = self._conf()
        wraps = [self._wrapper(name) for name in ep.wraps]  # before any request, find missing wrappers

        raw = self._build(ep, arg)
        raw.headers.setdefault("accept", "application/json")
        for k, v in {**conf._headers, **self._extra_headers}.items():
            raw.headers.setdefault(k, v)
        if ep.cookie and conf._jar is not None:
            # cache cookies are not sent back to the server
            raw.cookies.update({k: v for k, v in conf._jar.get(raw.path).items() if not k.startswith(CACHE_COOKIE_PREFIX)})

        async def send(r: RawRequest[Any]) -> RawResponse:
            return await self._send(ep, r)

        nxt: Next = send
        for w in reversed(wraps):
            nxt = self._layer(w, nxt)
        res = await nxt(raw)
        if res.built is not None:
            return res.built
        for cls in statuses:
            if cls.status == res.status:
                return cls.from_raw(res)
        raise UnexpectedStatusError(res.status, res.body)

    @staticmethod
    def _layer(w: Any, inner: Next) -> Next:
        async def run(r: RawRequest[Any]) -> RawResponse:
            out = await w(r, inner)
            return out.to_raw() if isinstance(out, Status) else out

        return run

    def _build(self, ep: Endpoint[Any, Any, Any], arg: Any) -> RawRequest[Any]:
        if ep.arg_form == "request":
            params, search, body, headers = (getattr(arg, k, None) for k in ("params", "search", "body", "headers"))
        elif ep.arg_form == "body":
            params = search = headers = None
            body = arg
        else:
            params = search = body = headers = None
        if ep.params is not None and params is None:
            raise ComatypeError(f"params が必要です（{ep.module}）")
        path = ep.path
        raw: RawRequest[Any] = RawRequest(method=ep.method, path=path)
        for name, vals in encode_strings(params).items():
            raw.params[name] = vals[0]
        segs = []
        for seg in path.split("/"):
            if seg.startswith(":"):
                if seg[1:] not in raw.params:
                    raise ComatypeError(f"path の {seg} に値がありません")
                from urllib.parse import quote

                seg = quote(raw.params[seg[1:]], safe="")
            segs.append(seg)
        raw.path = "/".join(segs)
        raw.query = encode_strings(search)
        for k, vs in encode_strings(headers).items():
            raw.headers[k] = ", ".join(vs)
        if ep.body is not None:
            if body is None:
                raise ComatypeError(f"body が必要です（{ep.module}）")
            raw.body = dump_json(ep.body, body, "body")
            raw.headers["content-type"] = "application/json"
        return raw

    async def _send(self, ep: Endpoint[Any, Any, Any], r: RawRequest[Any]) -> RawResponse:
        conf = self._conf()
        base = conf._base_url or os.environ.get("COMATYPE_BASE_URL") or ep.base_url
        if not base:
            raise ComatypeError("base url がありません（init の base_url、環境変数 COMATYPE_BASE_URL、init.comat の baseUrl のどれかで指定してください）")
        url = base.rstrip("/") + r.path
        headers = dict(r.headers.items())
        if r.cookies and not any(k.lower() == "cookie" for k in headers):
            from urllib.parse import quote

            headers["cookie"] = "; ".join(f"{k}={quote(v, safe='')}" for k, v in sorted(r.cookies.items()))
        params: list[tuple[str, str | int | float | bool | None]] = [(k, v) for k, vs in r.query.items() for v in vs]
        # Cache (GET / QUERY): memory or cookie. The key is method, URL, body and the declared request headers
        cache_key: str | None = None
        spec = ep.cache
        if spec is not None and (spec.memory or (spec.cookie and conf._jar is not None)):
            from urllib.parse import urlencode

            cache_key = client_cache_key(r.method, url + "?" + urlencode(params), r.body, ep.cache_headers, headers)
            if spec.memory:
                hit = conf._cache.get(cache_key)
            else:
                assert conf._jar is not None
                v = conf._jar.get("/").get(cache_cookie_name(cache_key))
                hit = decode_cache_cookie(v) if v else None
            if hit is not None:
                return hit
        http = conf._http or _default_http()
        resp = await http.request(r.method.upper(), url, params=params, content=r.body or None, headers=headers)
        out = RawResponse(
            status=resp.status_code,
            headers=Headers(dict(resp.headers.items())),
            body=resp.content,
            set_cookies=resp.headers.get_list("set-cookie"),
        )
        if ep.cookie and conf._jar is not None and out.set_cookies:
            conf._jar.store(out.set_cookies)
        if cache_key is not None and spec is not None and cacheable(out):
            if spec.memory:
                conf._cache.set(cache_key, out, spec.ttl_ms)
            elif conf._jar is not None and (v := encode_cache_cookie(out)) is not None:
                name = cache_cookie_name(cache_key)
                conf._jar.store([f"{name}={v}; Path=/; Max-Age={max(1, -(-spec.ttl_ms // 1000))}"])  # cookie ttl is in seconds (rounded up)
                conf._cache_cookies.add(name)
        return out

    @overload
    async def get(self, ep: Endpoint[NoArg, Any, Any], s1: type[R1], /) -> R1: ...

    @overload
    async def get(self, ep: Endpoint[NoArg, Any, Any], s1: type[R1], s2: type[R2], /) -> R1 | R2: ...

    @overload
    async def get(self, ep: Endpoint[NoArg, Any, Any], s1: type[R1], s2: type[R2], s3: type[R3], /) -> R1 | R2 | R3: ...

    @overload
    async def get(self, ep: Endpoint[NoArg, Any, Any], s1: type[R1], s2: type[R2], s3: type[R3], s4: type[R4], /) -> R1 | R2 | R3 | R4: ...

    @overload
    async def get(self, ep: Endpoint[NoArg, Any, Any], s1: type[R1], s2: type[R2], s3: type[R3], s4: type[R4], s5: type[R5], /) -> R1 | R2 | R3 | R4 | R5: ...

    @overload
    async def get(self, ep: Endpoint[NoArg, Any, Any], s1: type[R1], s2: type[R2], s3: type[R3], s4: type[R4], s5: type[R5], s6: type[R6], /) -> R1 | R2 | R3 | R4 | R5 | R6: ...

    @overload
    async def get(self, ep: Endpoint[A, Any, Any], arg: A, s1: type[R1], /) -> R1: ...

    @overload
    async def get(self, ep: Endpoint[A, Any, Any], arg: A, s1: type[R1], s2: type[R2], /) -> R1 | R2: ...

    @overload
    async def get(self, ep: Endpoint[A, Any, Any], arg: A, s1: type[R1], s2: type[R2], s3: type[R3], /) -> R1 | R2 | R3: ...

    @overload
    async def get(self, ep: Endpoint[A, Any, Any], arg: A, s1: type[R1], s2: type[R2], s3: type[R3], s4: type[R4], /) -> R1 | R2 | R3 | R4: ...

    @overload
    async def get(self, ep: Endpoint[A, Any, Any], arg: A, s1: type[R1], s2: type[R2], s3: type[R3], s4: type[R4], s5: type[R5], /) -> R1 | R2 | R3 | R4 | R5: ...

    @overload
    async def get(self, ep: Endpoint[A, Any, Any], arg: A, s1: type[R1], s2: type[R2], s3: type[R3], s4: type[R4], s5: type[R5], s6: type[R6], /) -> R1 | R2 | R3 | R4 | R5 | R6: ...

    async def get(self, ep: Endpoint[Any, Any, Any], *args: Any) -> Any:
        return await self._call("get", ep, args)

    @overload
    async def post(self, ep: Endpoint[NoArg, Any, Any], s1: type[R1], /) -> R1: ...

    @overload
    async def post(self, ep: Endpoint[NoArg, Any, Any], s1: type[R1], s2: type[R2], /) -> R1 | R2: ...

    @overload
    async def post(self, ep: Endpoint[NoArg, Any, Any], s1: type[R1], s2: type[R2], s3: type[R3], /) -> R1 | R2 | R3: ...

    @overload
    async def post(self, ep: Endpoint[NoArg, Any, Any], s1: type[R1], s2: type[R2], s3: type[R3], s4: type[R4], /) -> R1 | R2 | R3 | R4: ...

    @overload
    async def post(self, ep: Endpoint[NoArg, Any, Any], s1: type[R1], s2: type[R2], s3: type[R3], s4: type[R4], s5: type[R5], /) -> R1 | R2 | R3 | R4 | R5: ...

    @overload
    async def post(self, ep: Endpoint[NoArg, Any, Any], s1: type[R1], s2: type[R2], s3: type[R3], s4: type[R4], s5: type[R5], s6: type[R6], /) -> R1 | R2 | R3 | R4 | R5 | R6: ...

    @overload
    async def post(self, ep: Endpoint[A, Any, Any], arg: A, s1: type[R1], /) -> R1: ...

    @overload
    async def post(self, ep: Endpoint[A, Any, Any], arg: A, s1: type[R1], s2: type[R2], /) -> R1 | R2: ...

    @overload
    async def post(self, ep: Endpoint[A, Any, Any], arg: A, s1: type[R1], s2: type[R2], s3: type[R3], /) -> R1 | R2 | R3: ...

    @overload
    async def post(self, ep: Endpoint[A, Any, Any], arg: A, s1: type[R1], s2: type[R2], s3: type[R3], s4: type[R4], /) -> R1 | R2 | R3 | R4: ...

    @overload
    async def post(self, ep: Endpoint[A, Any, Any], arg: A, s1: type[R1], s2: type[R2], s3: type[R3], s4: type[R4], s5: type[R5], /) -> R1 | R2 | R3 | R4 | R5: ...

    @overload
    async def post(self, ep: Endpoint[A, Any, Any], arg: A, s1: type[R1], s2: type[R2], s3: type[R3], s4: type[R4], s5: type[R5], s6: type[R6], /) -> R1 | R2 | R3 | R4 | R5 | R6: ...

    async def post(self, ep: Endpoint[Any, Any, Any], *args: Any) -> Any:
        return await self._call("post", ep, args)

    @overload
    async def put(self, ep: Endpoint[NoArg, Any, Any], s1: type[R1], /) -> R1: ...

    @overload
    async def put(self, ep: Endpoint[NoArg, Any, Any], s1: type[R1], s2: type[R2], /) -> R1 | R2: ...

    @overload
    async def put(self, ep: Endpoint[NoArg, Any, Any], s1: type[R1], s2: type[R2], s3: type[R3], /) -> R1 | R2 | R3: ...

    @overload
    async def put(self, ep: Endpoint[NoArg, Any, Any], s1: type[R1], s2: type[R2], s3: type[R3], s4: type[R4], /) -> R1 | R2 | R3 | R4: ...

    @overload
    async def put(self, ep: Endpoint[NoArg, Any, Any], s1: type[R1], s2: type[R2], s3: type[R3], s4: type[R4], s5: type[R5], /) -> R1 | R2 | R3 | R4 | R5: ...

    @overload
    async def put(self, ep: Endpoint[NoArg, Any, Any], s1: type[R1], s2: type[R2], s3: type[R3], s4: type[R4], s5: type[R5], s6: type[R6], /) -> R1 | R2 | R3 | R4 | R5 | R6: ...

    @overload
    async def put(self, ep: Endpoint[A, Any, Any], arg: A, s1: type[R1], /) -> R1: ...

    @overload
    async def put(self, ep: Endpoint[A, Any, Any], arg: A, s1: type[R1], s2: type[R2], /) -> R1 | R2: ...

    @overload
    async def put(self, ep: Endpoint[A, Any, Any], arg: A, s1: type[R1], s2: type[R2], s3: type[R3], /) -> R1 | R2 | R3: ...

    @overload
    async def put(self, ep: Endpoint[A, Any, Any], arg: A, s1: type[R1], s2: type[R2], s3: type[R3], s4: type[R4], /) -> R1 | R2 | R3 | R4: ...

    @overload
    async def put(self, ep: Endpoint[A, Any, Any], arg: A, s1: type[R1], s2: type[R2], s3: type[R3], s4: type[R4], s5: type[R5], /) -> R1 | R2 | R3 | R4 | R5: ...

    @overload
    async def put(self, ep: Endpoint[A, Any, Any], arg: A, s1: type[R1], s2: type[R2], s3: type[R3], s4: type[R4], s5: type[R5], s6: type[R6], /) -> R1 | R2 | R3 | R4 | R5 | R6: ...

    async def put(self, ep: Endpoint[Any, Any, Any], *args: Any) -> Any:
        return await self._call("put", ep, args)

    @overload
    async def patch(self, ep: Endpoint[NoArg, Any, Any], s1: type[R1], /) -> R1: ...

    @overload
    async def patch(self, ep: Endpoint[NoArg, Any, Any], s1: type[R1], s2: type[R2], /) -> R1 | R2: ...

    @overload
    async def patch(self, ep: Endpoint[NoArg, Any, Any], s1: type[R1], s2: type[R2], s3: type[R3], /) -> R1 | R2 | R3: ...

    @overload
    async def patch(self, ep: Endpoint[NoArg, Any, Any], s1: type[R1], s2: type[R2], s3: type[R3], s4: type[R4], /) -> R1 | R2 | R3 | R4: ...

    @overload
    async def patch(self, ep: Endpoint[NoArg, Any, Any], s1: type[R1], s2: type[R2], s3: type[R3], s4: type[R4], s5: type[R5], /) -> R1 | R2 | R3 | R4 | R5: ...

    @overload
    async def patch(self, ep: Endpoint[NoArg, Any, Any], s1: type[R1], s2: type[R2], s3: type[R3], s4: type[R4], s5: type[R5], s6: type[R6], /) -> R1 | R2 | R3 | R4 | R5 | R6: ...

    @overload
    async def patch(self, ep: Endpoint[A, Any, Any], arg: A, s1: type[R1], /) -> R1: ...

    @overload
    async def patch(self, ep: Endpoint[A, Any, Any], arg: A, s1: type[R1], s2: type[R2], /) -> R1 | R2: ...

    @overload
    async def patch(self, ep: Endpoint[A, Any, Any], arg: A, s1: type[R1], s2: type[R2], s3: type[R3], /) -> R1 | R2 | R3: ...

    @overload
    async def patch(self, ep: Endpoint[A, Any, Any], arg: A, s1: type[R1], s2: type[R2], s3: type[R3], s4: type[R4], /) -> R1 | R2 | R3 | R4: ...

    @overload
    async def patch(self, ep: Endpoint[A, Any, Any], arg: A, s1: type[R1], s2: type[R2], s3: type[R3], s4: type[R4], s5: type[R5], /) -> R1 | R2 | R3 | R4 | R5: ...

    @overload
    async def patch(self, ep: Endpoint[A, Any, Any], arg: A, s1: type[R1], s2: type[R2], s3: type[R3], s4: type[R4], s5: type[R5], s6: type[R6], /) -> R1 | R2 | R3 | R4 | R5 | R6: ...

    async def patch(self, ep: Endpoint[Any, Any, Any], *args: Any) -> Any:
        return await self._call("patch", ep, args)

    @overload
    async def delete(self, ep: Endpoint[NoArg, Any, Any], s1: type[R1], /) -> R1: ...

    @overload
    async def delete(self, ep: Endpoint[NoArg, Any, Any], s1: type[R1], s2: type[R2], /) -> R1 | R2: ...

    @overload
    async def delete(self, ep: Endpoint[NoArg, Any, Any], s1: type[R1], s2: type[R2], s3: type[R3], /) -> R1 | R2 | R3: ...

    @overload
    async def delete(self, ep: Endpoint[NoArg, Any, Any], s1: type[R1], s2: type[R2], s3: type[R3], s4: type[R4], /) -> R1 | R2 | R3 | R4: ...

    @overload
    async def delete(self, ep: Endpoint[NoArg, Any, Any], s1: type[R1], s2: type[R2], s3: type[R3], s4: type[R4], s5: type[R5], /) -> R1 | R2 | R3 | R4 | R5: ...

    @overload
    async def delete(self, ep: Endpoint[NoArg, Any, Any], s1: type[R1], s2: type[R2], s3: type[R3], s4: type[R4], s5: type[R5], s6: type[R6], /) -> R1 | R2 | R3 | R4 | R5 | R6: ...

    @overload
    async def delete(self, ep: Endpoint[A, Any, Any], arg: A, s1: type[R1], /) -> R1: ...

    @overload
    async def delete(self, ep: Endpoint[A, Any, Any], arg: A, s1: type[R1], s2: type[R2], /) -> R1 | R2: ...

    @overload
    async def delete(self, ep: Endpoint[A, Any, Any], arg: A, s1: type[R1], s2: type[R2], s3: type[R3], /) -> R1 | R2 | R3: ...

    @overload
    async def delete(self, ep: Endpoint[A, Any, Any], arg: A, s1: type[R1], s2: type[R2], s3: type[R3], s4: type[R4], /) -> R1 | R2 | R3 | R4: ...

    @overload
    async def delete(self, ep: Endpoint[A, Any, Any], arg: A, s1: type[R1], s2: type[R2], s3: type[R3], s4: type[R4], s5: type[R5], /) -> R1 | R2 | R3 | R4 | R5: ...

    @overload
    async def delete(self, ep: Endpoint[A, Any, Any], arg: A, s1: type[R1], s2: type[R2], s3: type[R3], s4: type[R4], s5: type[R5], s6: type[R6], /) -> R1 | R2 | R3 | R4 | R5 | R6: ...

    async def delete(self, ep: Endpoint[Any, Any, Any], *args: Any) -> Any:
        return await self._call("delete", ep, args)

    @overload
    async def options(self, ep: Endpoint[NoArg, Any, Any], s1: type[R1], /) -> R1: ...

    @overload
    async def options(self, ep: Endpoint[NoArg, Any, Any], s1: type[R1], s2: type[R2], /) -> R1 | R2: ...

    @overload
    async def options(self, ep: Endpoint[NoArg, Any, Any], s1: type[R1], s2: type[R2], s3: type[R3], /) -> R1 | R2 | R3: ...

    @overload
    async def options(self, ep: Endpoint[NoArg, Any, Any], s1: type[R1], s2: type[R2], s3: type[R3], s4: type[R4], /) -> R1 | R2 | R3 | R4: ...

    @overload
    async def options(self, ep: Endpoint[NoArg, Any, Any], s1: type[R1], s2: type[R2], s3: type[R3], s4: type[R4], s5: type[R5], /) -> R1 | R2 | R3 | R4 | R5: ...

    @overload
    async def options(self, ep: Endpoint[NoArg, Any, Any], s1: type[R1], s2: type[R2], s3: type[R3], s4: type[R4], s5: type[R5], s6: type[R6], /) -> R1 | R2 | R3 | R4 | R5 | R6: ...

    @overload
    async def options(self, ep: Endpoint[A, Any, Any], arg: A, s1: type[R1], /) -> R1: ...

    @overload
    async def options(self, ep: Endpoint[A, Any, Any], arg: A, s1: type[R1], s2: type[R2], /) -> R1 | R2: ...

    @overload
    async def options(self, ep: Endpoint[A, Any, Any], arg: A, s1: type[R1], s2: type[R2], s3: type[R3], /) -> R1 | R2 | R3: ...

    @overload
    async def options(self, ep: Endpoint[A, Any, Any], arg: A, s1: type[R1], s2: type[R2], s3: type[R3], s4: type[R4], /) -> R1 | R2 | R3 | R4: ...

    @overload
    async def options(self, ep: Endpoint[A, Any, Any], arg: A, s1: type[R1], s2: type[R2], s3: type[R3], s4: type[R4], s5: type[R5], /) -> R1 | R2 | R3 | R4 | R5: ...

    @overload
    async def options(self, ep: Endpoint[A, Any, Any], arg: A, s1: type[R1], s2: type[R2], s3: type[R3], s4: type[R4], s5: type[R5], s6: type[R6], /) -> R1 | R2 | R3 | R4 | R5 | R6: ...

    async def options(self, ep: Endpoint[Any, Any, Any], *args: Any) -> Any:
        return await self._call("options", ep, args)

    @overload
    async def query(self, ep: Endpoint[NoArg, Any, Any], s1: type[R1], /) -> R1: ...

    @overload
    async def query(self, ep: Endpoint[NoArg, Any, Any], s1: type[R1], s2: type[R2], /) -> R1 | R2: ...

    @overload
    async def query(self, ep: Endpoint[NoArg, Any, Any], s1: type[R1], s2: type[R2], s3: type[R3], /) -> R1 | R2 | R3: ...

    @overload
    async def query(self, ep: Endpoint[NoArg, Any, Any], s1: type[R1], s2: type[R2], s3: type[R3], s4: type[R4], /) -> R1 | R2 | R3 | R4: ...

    @overload
    async def query(self, ep: Endpoint[NoArg, Any, Any], s1: type[R1], s2: type[R2], s3: type[R3], s4: type[R4], s5: type[R5], /) -> R1 | R2 | R3 | R4 | R5: ...

    @overload
    async def query(self, ep: Endpoint[NoArg, Any, Any], s1: type[R1], s2: type[R2], s3: type[R3], s4: type[R4], s5: type[R5], s6: type[R6], /) -> R1 | R2 | R3 | R4 | R5 | R6: ...

    @overload
    async def query(self, ep: Endpoint[A, Any, Any], arg: A, s1: type[R1], /) -> R1: ...

    @overload
    async def query(self, ep: Endpoint[A, Any, Any], arg: A, s1: type[R1], s2: type[R2], /) -> R1 | R2: ...

    @overload
    async def query(self, ep: Endpoint[A, Any, Any], arg: A, s1: type[R1], s2: type[R2], s3: type[R3], /) -> R1 | R2 | R3: ...

    @overload
    async def query(self, ep: Endpoint[A, Any, Any], arg: A, s1: type[R1], s2: type[R2], s3: type[R3], s4: type[R4], /) -> R1 | R2 | R3 | R4: ...

    @overload
    async def query(self, ep: Endpoint[A, Any, Any], arg: A, s1: type[R1], s2: type[R2], s3: type[R3], s4: type[R4], s5: type[R5], /) -> R1 | R2 | R3 | R4 | R5: ...

    @overload
    async def query(self, ep: Endpoint[A, Any, Any], arg: A, s1: type[R1], s2: type[R2], s3: type[R3], s4: type[R4], s5: type[R5], s6: type[R6], /) -> R1 | R2 | R3 | R4 | R5 | R6: ...

    async def query(self, ep: Endpoint[Any, Any, Any], *args: Any) -> Any:
        return await self._call("query", ep, args)

    @overload
    async def head(self, ep: Endpoint[NoArg, Any, Any], s1: type[R1], /) -> R1: ...

    @overload
    async def head(self, ep: Endpoint[NoArg, Any, Any], s1: type[R1], s2: type[R2], /) -> R1 | R2: ...

    @overload
    async def head(self, ep: Endpoint[NoArg, Any, Any], s1: type[R1], s2: type[R2], s3: type[R3], /) -> R1 | R2 | R3: ...

    @overload
    async def head(self, ep: Endpoint[NoArg, Any, Any], s1: type[R1], s2: type[R2], s3: type[R3], s4: type[R4], /) -> R1 | R2 | R3 | R4: ...

    @overload
    async def head(self, ep: Endpoint[NoArg, Any, Any], s1: type[R1], s2: type[R2], s3: type[R3], s4: type[R4], s5: type[R5], /) -> R1 | R2 | R3 | R4 | R5: ...

    @overload
    async def head(self, ep: Endpoint[NoArg, Any, Any], s1: type[R1], s2: type[R2], s3: type[R3], s4: type[R4], s5: type[R5], s6: type[R6], /) -> R1 | R2 | R3 | R4 | R5 | R6: ...

    @overload
    async def head(self, ep: Endpoint[A, Any, Any], arg: A, s1: type[R1], /) -> R1: ...

    @overload
    async def head(self, ep: Endpoint[A, Any, Any], arg: A, s1: type[R1], s2: type[R2], /) -> R1 | R2: ...

    @overload
    async def head(self, ep: Endpoint[A, Any, Any], arg: A, s1: type[R1], s2: type[R2], s3: type[R3], /) -> R1 | R2 | R3: ...

    @overload
    async def head(self, ep: Endpoint[A, Any, Any], arg: A, s1: type[R1], s2: type[R2], s3: type[R3], s4: type[R4], /) -> R1 | R2 | R3 | R4: ...

    @overload
    async def head(self, ep: Endpoint[A, Any, Any], arg: A, s1: type[R1], s2: type[R2], s3: type[R3], s4: type[R4], s5: type[R5], /) -> R1 | R2 | R3 | R4 | R5: ...

    @overload
    async def head(self, ep: Endpoint[A, Any, Any], arg: A, s1: type[R1], s2: type[R2], s3: type[R3], s4: type[R4], s5: type[R5], s6: type[R6], /) -> R1 | R2 | R3 | R4 | R5 | R6: ...

    async def head(self, ep: Endpoint[Any, Any, Any], *args: Any) -> Any:
        return await self._call("head", ep, args)


_http: httpx.AsyncClient | None = None


def _default_http() -> httpx.AsyncClient:
    global _http
    if _http is None:
        _http = httpx.AsyncClient()
    return _http


c = Client()
