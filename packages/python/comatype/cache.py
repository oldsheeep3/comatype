"""Cache (`cache` in `.comat`): an in-memory TTL cache and the encoding used to store entries in cookies. Applies to GET / QUERY only.。"""

from __future__ import annotations

import base64
import time
from collections import OrderedDict
from collections.abc import Callable, Mapping
from dataclasses import dataclass
from typing import Literal

from .raw import Headers, RawResponse

# Name prefix of cache cookies. The client does not send cookies with this prefix back to the server.
CACHE_COOKIE_PREFIX = "comatype_cache_"
# Maximum length of one cookie value. Larger responses are not cached in a cookie.
CACHE_COOKIE_MAX = 3800


@dataclass(frozen=True)
class CacheSpec:
    """The `cache` setting. mode is off (never cache) / memory (keep in memory for ttl) / cookie (keep in a cookie for ttl; client only)."""

    mode: Literal["off", "memory", "cookie"]
    ttl_ms: int = 0

    @property
    def memory(self) -> bool:
        return self.mode == "memory" and self.ttl_ms > 0

    @property
    def cookie(self) -> bool:
        return self.mode == "cookie" and self.ttl_ms > 0


def _clone(r: RawResponse) -> RawResponse:
    return RawResponse(status=r.status, headers=Headers(dict(r.headers.items())), body=r.body)


class MemoryCache:
    """In-memory cache with a ttl (expired entries are dropped on lookup; over the size limit, the oldest are dropped first)."""

    def __init__(self, max_entries: int = 1000, now: Callable[[], float] = time.monotonic) -> None:
        self._max = max_entries
        self._now = now
        self._d: OrderedDict[str, tuple[RawResponse, float]] = OrderedDict()

    def get(self, key: str) -> RawResponse | None:
        e = self._d.get(key)
        if e is None:
            return None
        if e[1] <= self._now():
            del self._d[key]
            return None
        return _clone(e[0])

    def set(self, key: str, res: RawResponse, ttl_ms: int) -> None:
        self._d.pop(key, None)
        self._d[key] = (_clone(res), self._now() + ttl_ms / 1000)
        while len(self._d) > self._max:
            self._d.popitem(last=False)

    def clear(self) -> None:
        self._d.clear()

    def __len__(self) -> int:
        return len(self._d)


def cacheable(res: RawResponse) -> bool:
    """Whether a response may be cached (2xx, no Set-Cookie)."""
    return 200 <= res.status < 300 and not res.set_cookies


def client_cache_key(method: str, url: str, body: bytes, declared: tuple[str, ...], headers: Mapping[str, str]) -> str:
    """Client cache key: method, URL (path and query) and body, plus the request headers declared in `.comat`.
    Headers added by wrappers or init (Authorization etc.) are not included."""
    lower = {k.lower(): v for k, v in headers.items()}
    hs = "\n".join(f"{n}:{lower.get(n, '')}" for n in sorted(h.lower() for h in declared))
    return f"{method}\n{url}\n{hs}\n\n{body.decode('utf-8', 'surrogateescape')}"


def server_cache_key(method: str, target: str, headers: Mapping[str, str], body: bytes) -> str:
    """Server cache key: an exact match of the request (method, path, query, all headers, body)."""
    hs = "\n".join(f"{k.lower()}:{v}" for k, v in sorted(headers.items(), key=lambda kv: kv[0].lower()))
    return f"{method}\n{target}\n{hs}\n\n{body.decode('utf-8', 'surrogateescape')}"


def cache_cookie_name(key: str) -> str:
    """Build a cookie name from the key (FNV-1a, 64-bit)."""
    h = 0xCBF29CE484222325
    for b in key.encode("utf-8", "surrogateescape"):
        h = ((h ^ b) * 0x100000001B3) & 0xFFFFFFFFFFFFFFFF
    return f"{CACHE_COOKIE_PREFIX}{h:016x}"


def encode_cache_cookie(res: RawResponse) -> str | None:
    """Encode a response as a cookie value (base64url of `status\\nname\\tvalue\\n...\\n\\nbody`). None if too large."""
    head = f"{res.status}\n" + "".join(f"{k}\t{v}\n" for k, v in res.headers.items())
    v = base64.urlsafe_b64encode(head.encode() + b"\n" + res.body).decode().rstrip("=")
    return v if len(v) <= CACHE_COOKIE_MAX else None


def decode_cache_cookie(value: str) -> RawResponse | None:
    try:
        raw = base64.urlsafe_b64decode(value + "=" * (-len(value) % 4))
        head, sep, body = raw.partition(b"\n\n")
        if not sep:
            return None
        lines = head.decode().split("\n")
        out = RawResponse(status=int(lines[0]), body=body)
        for ln in lines[1:]:
            k, tab, v = ln.partition("\t")
            if tab:
                out.headers[k] = v
        return out
    except Exception:  # noqa: BLE001
        return None
