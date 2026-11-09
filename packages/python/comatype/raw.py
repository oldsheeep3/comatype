"""Raw request/response seen by wrappers (wire form, with no per-endpoint types)."""

from __future__ import annotations

from collections.abc import Iterator, MutableMapping
from dataclasses import dataclass, field
from typing import Any, Generic, TypeVar

CtxT = TypeVar("CtxT")


class Headers(MutableMapping[str, str]):
    """Case-insensitive headers."""

    def __init__(self, items: dict[str, str] | None = None) -> None:
        self._d: dict[str, tuple[str, str]] = {}
        for k, v in (items or {}).items():
            self[k] = v

    def __getitem__(self, key: str) -> str:
        return self._d[key.lower()][1]

    def __setitem__(self, key: str, value: str) -> None:
        self._d[key.lower()] = (key, value)

    def __delitem__(self, key: str) -> None:
        del self._d[key.lower()]

    def __iter__(self) -> Iterator[str]:
        return (k for k, _ in self._d.values())

    def __len__(self) -> int:
        return len(self._d)

    def __repr__(self) -> str:
        return f"Headers({dict(self.items())!r})"


@dataclass
class RawRequest(Generic[CtxT]):
    method: str  # lowercase (get, post, ...)
    path: str  # client: path after params are filled in / server: path as received
    headers: Headers = field(default_factory=Headers)
    query: dict[str, list[str]] = field(default_factory=dict)
    params: dict[str, str] = field(default_factory=dict)
    body: bytes = b""
    cookies: dict[str, str] = field(default_factory=dict)
    # Value added by server wrappers. A wrapper sets `req.ctx = AuthCtx(...)` and then calls next(req).
    ctx: CtxT | None = None
    # wrapper name -> ctx (managed by the server)
    contexts: dict[str, Any] = field(default_factory=dict)

    def cookie(self, name: str) -> str | None:
        return self.cookies.get(name)


@dataclass
class RawResponse:
    status: int
    headers: Headers = field(default_factory=Headers)
    body: bytes = b""
    # Set-Cookie lines to emit (server) / lines received (client)
    set_cookies: list[str] = field(default_factory=list)
    # cause of a server-side error (not exposed in the response)
    error: BaseException | None = None
    # the source status object (e.g. `S200(...)`) when built from one; the client returns it as is
    built: Any = None
