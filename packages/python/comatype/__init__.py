"""Comatype runtime: provides the client `c` and server `s` used by generated code (comatype_gen)."""

from . import scalars
from .cache import CacheSpec, MemoryCache
from .client import Client, c
from .cookie import Cookie, CookieDef, CookieJar, serialize_set_cookie
from .endpoint import ComatypeWrap, Endpoint, NoArg, Status
from .errors import ComatypeError, ComatypeValidationError, UnexpectedStatusError
from .raw import CtxT, Headers, RawRequest, RawResponse
from .server import Server, s

__all__ = [
    "CacheSpec",
    "MemoryCache",
    "Client",
    "ComatypeError",
    "ComatypeValidationError",
    "ComatypeWrap",
    "Cookie",
    "CookieDef",
    "CookieJar",
    "CtxT",
    "Endpoint",
    "Headers",
    "NoArg",
    "RawRequest",
    "RawResponse",
    "Server",
    "Status",
    "UnexpectedStatusError",
    "c",
    "s",
    "scalars",
    "serialize_set_cookie",
]
