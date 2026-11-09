"""cookie: emitting Set-Cookie (server) and keeping received cookies (client)."""

from __future__ import annotations

import time as _time
from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import datetime, timezone
from email.utils import format_datetime, parsedate_to_datetime
from urllib.parse import quote, unquote

from .errors import ComatypeError


@dataclass(frozen=True)
class CookieDef:
    """`cookie <name> { ... }` from init.comat. Placed in the generated endpoint."""

    name: str
    http_only: bool = False
    secure: bool = False
    same_site: str | None = None  # lax | strict | none
    path: str | None = None
    domain: str | None = None
    max_age: int | None = None  # seconds


@dataclass(frozen=True)
class Cookie:
    """A cookie to emit (`S200(data=..., cookie=Cookie("token", max_age=3600))`). A plain string also works."""

    value: str = ""
    max_age: int | None = None
    expires: datetime | None = None
    path: str | None = None
    domain: str | None = None
    delete: bool = False

    @staticmethod
    def clear() -> Cookie:
        """Delete the cookie."""
        return Cookie(delete=True)


_EPOCH = "Thu, 01 Jan 1970 00:00:00 GMT"


def _attr(what: str, v: str) -> str:
    if any(c in v for c in ";\r\n"):
        raise ComatypeError(f"cookie の {what} に使えない文字があります: {v!r}")
    return v


def serialize_set_cookie(definition: CookieDef | None, cookie: str | Cookie) -> str:
    if definition is None:
        raise ComatypeError("このエンドポイントは cookie を発行できません（cookie off、または init.comat に cookie の宣言がありません）")
    c = Cookie(cookie) if isinstance(cookie, str) else cookie
    parts = [f"{definition.name}={quote('' if c.delete else c.value, safe='')}"]
    parts.append("Path=" + _attr("path", c.path or definition.path or "/"))
    domain = c.domain or definition.domain
    if domain:
        parts.append("Domain=" + _attr("domain", domain))
    if c.delete:
        parts += ["Max-Age=0", f"Expires={_EPOCH}"]
    else:
        max_age = c.max_age if c.max_age is not None else definition.max_age
        if max_age is not None:
            if max_age < 0:
                raise ComatypeError(f"cookie の max_age が不正です: {max_age}")
            parts.append(f"Max-Age={max_age}")
        if c.expires is not None:
            parts.append("Expires=" + format_datetime(c.expires.astimezone(timezone.utc), usegmt=True))
    if definition.http_only:
        parts.append("HttpOnly")
    if definition.secure:
        parts.append("Secure")
    if definition.same_site:
        parts.append("SameSite=" + definition.same_site.capitalize())
    return "; ".join(parts)


@dataclass
class _Stored:
    value: str
    path: str
    expires: float | None  # epoch seconds; None means a session cookie


@dataclass
class CookieJar:
    """A jar for HTTP clients that do not keep cookies. Ignores Domain; only Path and expiry are checked."""

    now: Callable[[], float] = _time.time
    _m: dict[str, _Stored] = field(default_factory=dict)

    def get(self, path: str) -> dict[str, str]:
        out: dict[str, str] = {}
        for name, c in list(self._m.items()):
            if c.expires is not None and c.expires <= self.now():
                del self._m[name]
                continue
            prefix = c.path if c.path.endswith("/") else c.path + "/"
            if c.path == "/" or path == c.path or path.startswith(prefix):
                out[name] = c.value
        return out

    def store(self, lines: list[str]) -> None:
        for line in lines:
            segs = [s.strip() for s in line.split(";")]
            name, sep, value = segs[0].partition("=")
            if not sep or not name:
                continue
            path = "/"
            expires: float | None = None
            max_age: int | None = None
            for a in segs[1:]:
                k, _, v = a.partition("=")
                k = k.lower()
                if k == "path" and v.startswith("/"):
                    path = v
                elif k == "max-age":
                    try:
                        max_age = int(v)
                    except ValueError:
                        pass
                elif k == "expires":
                    try:
                        expires = parsedate_to_datetime(v).timestamp()
                    except (TypeError, ValueError):
                        pass
            if max_age is not None:  # Max-Age takes precedence over Expires
                expires = self.now() + max_age
            if expires is not None and expires <= self.now():
                self._m.pop(name, None)
            else:
                self._m[name] = _Stored(unquote(value), path, expires)

    def clear(self) -> None:
        self._m.clear()
