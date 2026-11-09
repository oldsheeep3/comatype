"""Endpoint descriptors and the status base class (used by generated code)."""

from __future__ import annotations

from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from typing import Any, ClassVar, Generic, Literal, TypeVar

from pydantic import BaseModel

from .cache import CacheSpec
from .cookie import CookieDef
from .raw import CtxT, Headers, RawRequest, RawResponse
from .wire import decode_strings, dump_json, encode_strings, parse_json

Arg = TypeVar("Arg")
Req = TypeVar("Req")
Res = TypeVar("Res")


class NoArg:
    """Arg for endpoints that take no request arguments."""


class Status:
    """A status response such as `S200`. Generated code subclasses this.

    The body is `data` for 2xx and `error` otherwise. If the body is `none`, neither exists.
    """

    status: int
    _kind: ClassVar[Literal["data", "error"]]
    _body: ClassVar[Any]  # body type; None if none
    _headers: ClassVar[type[BaseModel] | None]

    def to_raw(self) -> RawResponse:
        """Turn into the wire form (validate body and headers into JSON / strings). Cookies are not included."""
        raw = RawResponse(status=self.status, built=self)
        if self._body is not None:
            v = getattr(self, self._kind, None)
            if v is not None:
                raw.body = dump_json(self._body, v, self._kind)
                raw.headers["content-type"] = "application/json"
        h = getattr(self, "headers", None)
        if h is not None:
            for k, vs in encode_strings(h).items():
                raw.headers[k] = ", ".join(vs)
        return raw

    @classmethod
    def from_raw(cls, raw: RawResponse) -> Any:
        kwargs: dict[str, Any] = {}
        if cls._body is not None and raw.body:
            kwargs[cls._kind] = parse_json(cls._body, raw.body, cls._kind)
        if cls._headers is not None:
            hs: Headers = raw.headers
            kwargs["headers"] = decode_strings(
                cls._headers, lambda k: [hs[k]] if k in hs else None, split=True, prefix="headers"
            )
        return cls(**kwargs)


@dataclass
class Endpoint(Generic[Arg, Req, Res]):
    """The `path` of generated code. Arg is what the client passes, Req is the request a server handler receives, Res is the response."""

    method: str
    path: str
    module: str
    base_url: str | None = None
    wraps: tuple[str, ...] = ()
    cookie: bool = False
    cookie_def: CookieDef | None = None
    # `cache` setting (GET / QUERY only; None means no caching) and the names of declared request headers that go into the client cache key
    cache: CacheSpec | None = None
    cache_headers: tuple[str, ...] = ()
    params: type[BaseModel] | None = None
    search: type[BaseModel] | None = None
    body: Any = None  # body type (anything pydantic handles); None if absent
    request_headers: type[BaseModel] | None = None
    responses: tuple[type[Status], ...] = ()
    # shape of client arguments: "request" (has params / search), "body" (body only), "none"
    arg_form: Literal["request", "body", "none"] = "none"
    request_cls: Any = None
    # server: the type handlers read via req.ctx
    ctx_cls: Any = None


class ComatypeWrap(Generic[CtxT]):
    """A wrapper implementation. One per `wrapper <name>` in init.comat.

    ``async def fn(req, next)`` wraps this. `req` is the request; `await next(req)` goes to the next layer (finally the network call or the handler).
    Both request and response can be rewritten. A response is a RawResponse or a status object such as `S401(...)`.
    On the server, setting `req.ctx = AuthCtx(...)` before calling next makes it available as `req.ctx` to later wrappers and the handler.
    """

    def __init__(self, fn: Callable[[Any, Callable[[Any], Awaitable[Any]]], Awaitable[Any]]) -> None:
        self.fn = fn

    async def __call__(self, req: RawRequest[CtxT], next: Callable[[RawRequest[CtxT]], Awaitable[RawResponse]]) -> Any:
        return await self.fn(req, next)
