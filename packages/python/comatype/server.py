"""Server `s`: an ASGI app. Handlers are registered with decorators.

    from comatype import s
    @s.put(path)
    async def user_put_id(req: Request): ...

    uvicorn.run(s)      # s itself is the ASGI app
"""

from __future__ import annotations

import inspect
import json
import logging
import re
from collections.abc import Awaitable, Callable
from typing import Any, TypeVar
from urllib.parse import parse_qs, unquote, urlencode

from .cache import MemoryCache, cacheable, server_cache_key
from .cookie import serialize_set_cookie
from .endpoint import Endpoint, Status
from .errors import ComatypeError, ComatypeValidationError
from .raw import Headers, RawRequest, RawResponse
from .wire import decode_strings, parse_json

log = logging.getLogger("comatype")

ReqT = TypeVar("ReqT")
ResT = TypeVar("ResT")
HandlerOf = Callable[[ReqT], "ResT | Awaitable[ResT]"]
Next = Callable[[RawRequest[Any]], Awaitable[RawResponse]]
_COOKIE_SPLIT = re.compile(r";\s*")
_NO_BODY = {101, 204, 205, 304}


def _json_response(status: int, body: Any, **headers: str) -> RawResponse:
    r = RawResponse(status=status, body=json.dumps(body, ensure_ascii=False).encode())
    r.headers["content-type"] = "application/json"
    for k, v in headers.items():
        r.headers[k] = v
    return r


def _internal_error(err: BaseException | None) -> RawResponse:
    r = _json_response(500, {"code": "internal_error", "message": "Internal Server Error"})
    r.error = err
    return r


class _Route:
    def __init__(self, ep: Endpoint[Any, Any, Any], handler: Callable[..., Any]) -> None:
        self.ep = ep
        self.handler = handler
        self.segs = [s for s in ep.path.split("/") if s]
        self.statics = sum(1 for s in self.segs if not s.startswith(":"))

    def shape(self) -> str:
        return self.ep.method + " /" + "/".join(":" if s.startswith(":") else s for s in self.segs)


class Server:
    def __init__(self) -> None:
        self._routes: list[_Route] = []
        self._wrappers: Any = None
        self._on_error: Callable[[BaseException], None] | None = None
        # Responses of `cache <ttl>` (memory) endpoints; hit on an exact request match
        self._cache = MemoryCache()

    def init(self, *, wrappers: Any = None, on_error: Callable[[BaseException], None] | None = None) -> None:
        """Call once at startup. on_error receives exceptions from handlers/wrappers and the cause of responses that do not match the .comat (default: logging)."""
        self._wrappers = wrappers
        self._on_error = on_error

    def reset(self) -> None:
        """Discard registered routes and settings (for tests)."""
        self._routes.clear()
        self._wrappers = None
        self._on_error = None
        self._cache.clear()

    # ---- registration ----

    def _register(
        self, method: str, ep: Endpoint[Any, ReqT, ResT]
    ) -> Callable[[HandlerOf[ReqT, ResT]], HandlerOf[ReqT, ResT]]:
        if ep.method != method:
            raise ComatypeError(f"s.{method}() に {ep.method} のエンドポイント（{ep.module}）は渡せません")

        def deco(fn: HandlerOf[ReqT, ResT]) -> HandlerOf[ReqT, ResT]:
            route = _Route(ep, fn)
            for o in self._routes:
                if o.shape() == route.shape():
                    raise ComatypeError(f"{route.shape()} が重複しています（{o.ep.module} と {ep.module}）")
            self._routes.append(route)
            return fn

        return deco

    def get(self, ep: Endpoint[Any, ReqT, ResT]) -> Callable[[HandlerOf[ReqT, ResT]], HandlerOf[ReqT, ResT]]:
        return self._register("get", ep)

    def post(self, ep: Endpoint[Any, ReqT, ResT]) -> Callable[[HandlerOf[ReqT, ResT]], HandlerOf[ReqT, ResT]]:
        return self._register("post", ep)

    def put(self, ep: Endpoint[Any, ReqT, ResT]) -> Callable[[HandlerOf[ReqT, ResT]], HandlerOf[ReqT, ResT]]:
        return self._register("put", ep)

    def patch(self, ep: Endpoint[Any, ReqT, ResT]) -> Callable[[HandlerOf[ReqT, ResT]], HandlerOf[ReqT, ResT]]:
        return self._register("patch", ep)

    def delete(self, ep: Endpoint[Any, ReqT, ResT]) -> Callable[[HandlerOf[ReqT, ResT]], HandlerOf[ReqT, ResT]]:
        return self._register("delete", ep)

    def options(self, ep: Endpoint[Any, ReqT, ResT]) -> Callable[[HandlerOf[ReqT, ResT]], HandlerOf[ReqT, ResT]]:
        return self._register("options", ep)

    def query(self, ep: Endpoint[Any, ReqT, ResT]) -> Callable[[HandlerOf[ReqT, ResT]], HandlerOf[ReqT, ResT]]:
        return self._register("query", ep)

    def head(self, ep: Endpoint[Any, ReqT, ResT]) -> Callable[[HandlerOf[ReqT, ResT]], HandlerOf[ReqT, ResT]]:
        return self._register("head", ep)

    # ---- routing ----

    def _find(self, method: str, segs: list[str]) -> tuple[_Route, dict[str, str]] | None:
        best: tuple[_Route, dict[str, str]] | None = None
        for r in self._routes:
            if r.ep.method != method or len(r.segs) != len(segs):
                continue
            params: dict[str, str] = {}
            ok = True
            for want, got in zip(r.segs, segs):
                if want.startswith(":"):
                    params[want[1:]] = got
                elif want != got:
                    ok = False
                    break
            if ok and (best is None or r.statics > best[0].statics):
                best = (r, params)
        return best

    def _report(self, err: BaseException) -> None:
        if self._on_error is not None:
            self._on_error(err)
        else:
            log.error("[comatype] %s", err, exc_info=err)

    # ---- request handling ----

    def _wrapper(self, name: str) -> Any:
        w = self._wrappers
        found = w.get(name) if isinstance(w, dict) else getattr(w, name, None)
        if found is None:
            raise ComatypeError(f"ラッパー {name} が init に渡されていません")
        return found

    def _finish(self, ep: Endpoint[Any, Any, Any], out: Any) -> RawResponse:
        """Turn a handler/wrapper return value (Status or RawResponse) into its wire form."""
        if isinstance(out, RawResponse):
            return out
        if isinstance(out, Status):
            if not any(c.status == out.status for c in ep.responses):
                raise ComatypeError(f"S{out.status} は {ep.module} に宣言されていません（.comat に追加してください）")
            raw = out.to_raw()
            cookie = getattr(out, "cookie", None)
            if cookie is not None:
                raw.set_cookies.append(serialize_set_cookie(ep.cookie_def, cookie))
            return raw
        raise ComatypeError(f"ハンドラの戻り値が Status でも RawResponse でもありません: {type(out).__name__}（{ep.module}）")

    def _parse_request(self, ep: Endpoint[Any, Any, Any], raw: RawRequest[Any]) -> Any:
        kw: dict[str, Any] = {}
        if ep.params is not None:
            kw["params"] = decode_strings(ep.params, lambda k: [raw.params[k]] if k in raw.params else None, prefix="params")
        if ep.search is not None:
            kw["search"] = decode_strings(ep.search, lambda k: raw.query.get(k), prefix="search")
        if ep.request_headers is not None:
            kw["headers"] = decode_strings(
                ep.request_headers, lambda k: [raw.headers[k]] if k in raw.headers else None, split=True, prefix="headers"
            )
        if ep.body is not None:
            if not raw.body:
                raise ComatypeValidationError("body", "必須です")
            kw["body"] = parse_json(ep.body, raw.body, "body")
        if ep.ctx_cls is not None:
            ctx = object.__new__(ep.ctx_cls)
            for name in ep.wraps:
                v = raw.contexts.get(name)
                if v is not None:
                    ctx.__dict__.update(vars(v))
            kw["ctx"] = ctx
        return ep.request_cls(**kw)

    async def _core(self, route: _Route, raw: RawRequest[Any]) -> RawResponse:
        try:
            req = self._parse_request(route.ep, raw)
        except ComatypeValidationError as e:
            return _json_response(400, {"code": "validation_error", "message": str(e), "path": e.path})
        out = route.handler(req)
        if inspect.isawaitable(out):
            out = await out
        try:
            return self._finish(route.ep, out)
        except ComatypeError as e:  # a response that does not match the .comat is the server's own error
            return _internal_error(e)

    async def handle(self, raw: RawRequest[Any]) -> RawResponse:
        """Handle a request (for calling without ASGI)."""
        segs = [s for s in raw.path.split("/") if s]
        try:
            segs = [unquote(s) for s in segs]
        except Exception:  # noqa: BLE001
            return _json_response(400, {"code": "bad_request", "message": "path が不正です"})
        hit = self._find(raw.method, segs)
        if hit is None:
            allow = sorted({r.ep.method.upper() for r in self._routes if self._find(r.ep.method, segs)})
            if allow:
                return _json_response(405, {"code": "method_not_allowed", "message": "使えるメソッド: " + ", ".join(allow)}, allow=", ".join(allow))
            return _json_response(404, {"code": "not_found", "message": raw.path})
        route, params = hit
        raw.params = params
        ep = route.ep

        # Cache (GET / QUERY, memory only; cookie caching is client-only). Looked up before wrappers, so the key includes all headers (auth too)
        cache_key: str | None = None
        if ep.cache is not None and ep.cache.memory:
            q = urlencode([(k, v) for k, vs in raw.query.items() for v in vs])
            cache_key = server_cache_key(raw.method, raw.path + ("?" + q if q else ""), dict(raw.headers.items()), raw.body)
            cached = self._cache.get(cache_key)
            if cached is not None:
                return cached

        def wrap(w: Any, name: str, inner: Next) -> Next:
            async def run(r: RawRequest[Any]) -> RawResponse:
                r.ctx = None
                async def after(r2: RawRequest[Any]) -> RawResponse:
                    r2.contexts[name] = r2.ctx  # ctx added by this wrapper
                    r2.ctx = None
                    return await inner(r2)

                out = await w(r, after)
                return self._finish(ep, out)

            return run

        try:
            wraps = [(name, self._wrapper(name)) for name in ep.wraps]
            nxt: Next = lambda r: self._core(route, r)  # noqa: E731
            for name, w in reversed(wraps):
                nxt = wrap(w, name, nxt)
            res = await nxt(raw)
        except Exception as e:  # noqa: BLE001
            self._report(e)
            return _internal_error(e)
        if res.error is not None:
            self._report(res.error)
        elif cache_key is not None and ep.cache is not None and cacheable(res):
            self._cache.set(cache_key, res, ep.cache.ttl_ms)
        return res

    # ---- ASGI ----

    async def __call__(self, scope: dict[str, Any], receive: Callable[[], Awaitable[Any]], send: Callable[[Any], Awaitable[None]]) -> None:
        if scope["type"] == "lifespan":
            while True:
                msg = await receive()
                if msg["type"] == "lifespan.startup":
                    await send({"type": "lifespan.startup.complete"})
                elif msg["type"] == "lifespan.shutdown":
                    await send({"type": "lifespan.shutdown.complete"})
                    return
        if scope["type"] != "http":
            return
        body = b""
        while True:
            msg = await receive()
            body += msg.get("body", b"")
            if not msg.get("more_body"):
                break
        headers = Headers()
        for k, v in scope["headers"]:
            name = k.decode("latin-1")
            val = v.decode("latin-1")
            headers[name] = f"{headers[name]}, {val}" if name in headers else val
        cookies: dict[str, str] = {}
        for part in _COOKIE_SPLIT.split(headers.get("cookie", "")):
            k, sep, v = part.partition("=")
            if sep and k and k not in cookies:
                cookies[k] = unquote(v.strip('"'))
        raw: RawRequest[Any] = RawRequest(
            method=scope["method"].lower(),
            path=scope["path"],
            headers=headers,
            query={k: v for k, v in parse_qs(scope["query_string"].decode(), keep_blank_values=True).items()},
            body=body,
            cookies=cookies,
        )
        res = await self.handle(raw)
        out_headers = [(k.lower().encode("latin-1"), v.encode("latin-1")) for k, v in res.headers.items()]
        out_headers += [(b"set-cookie", c.encode("latin-1")) for c in res.set_cookies]
        has_body = res.status not in _NO_BODY and bool(res.body)
        await send({"type": "http.response.start", "status": res.status, "headers": out_headers})
        await send({"type": "http.response.body", "body": res.body if has_body else b""})


s = Server()
