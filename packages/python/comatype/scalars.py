"""Built-in scalar types. Pydantic Annotated types that carry validation and conversion."""

from __future__ import annotations

import base64 as _b64
import binascii as _binascii
import datetime as _dt
import decimal as _decimal
import re
import uuid as _uuid
from typing import Annotated, Any
from urllib.parse import urlsplit

from pydantic import AfterValidator, AwareDatetime, BeforeValidator, PlainSerializer, ValidationInfo

_EMAIL = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")
_PHONE = re.compile(r"^\+[1-9]\d{1,14}$")
_DECIMAL = re.compile(r"^-?\d+(\.\d+)?$")


def _email(v: str) -> str:
    if not _EMAIL.match(v):
        raise ValueError("email の形式が不正です")
    return v


def _phone(v: str) -> str:
    if not _PHONE.match(v):
        raise ValueError("phone は E.164 の形式にしてください")
    return v


def _url(v: str) -> str:
    u = urlsplit(v)
    if not u.scheme or not u.netloc:
        raise ValueError("url は http(s)://host/... の形式にしてください")
    return v


def _uuid_str(v: Any, info: ValidationInfo) -> Any:
    # on the wire only strings are accepted (UUID instances are ones built on the Python side)
    if isinstance(v, str) or (isinstance(v, _uuid.UUID) and info.mode != "json"):
        return v
    raise ValueError("uuid は文字列で送ってください")


def _uuid_version(version: int):  # type: ignore[no-untyped-def]
    def check(v: _uuid.UUID) -> _uuid.UUID:
        if v.version != version or v.variant != _uuid.RFC_4122:
            raise ValueError(f"uuidv{version} の形式が不正です")
        return v

    return check


def _int64(v: Any, info: ValidationInfo) -> Any:
    # a string of digits on the wire; the Python side (constructor) also accepts int
    if info.mode == "json" and not isinstance(v, str):
        raise ValueError("int64 は整数の文字列で送ってください")
    if isinstance(v, str):
        if not re.fullmatch(r"-?\d+", v):
            raise ValueError("int64 は整数の文字列で送ってください")
        n = int(v)
    elif isinstance(v, int) and not isinstance(v, bool):
        n = v
    else:
        raise ValueError("int64 は整数の文字列で送ってください")
    if not -(2**63) <= n < 2**63:
        raise ValueError("int64 の範囲外です")
    return n


def _decimal_in(v: Any, info: ValidationInfo) -> Any:
    if info.mode == "json" and not isinstance(v, str):
        raise ValueError("decimal は数値の文字列で送ってください")
    if isinstance(v, str):
        if not _DECIMAL.match(v):
            raise ValueError("decimal は数値の文字列で送ってください")
        return _decimal.Decimal(v)
    if isinstance(v, (_decimal.Decimal, int)) and not isinstance(v, bool):
        return v
    raise ValueError("decimal は数値の文字列で送ってください")


Email = Annotated[str, AfterValidator(_email)]
Phone = Annotated[str, AfterValidator(_phone)]
Url = Annotated[str, AfterValidator(_url)]

Uuid = Annotated[_uuid.UUID, BeforeValidator(_uuid_str)]
Uuidv4 = Annotated[_uuid.UUID, BeforeValidator(_uuid_str), AfterValidator(_uuid_version(4))]
Uuidv7 = Annotated[_uuid.UUID, BeforeValidator(_uuid_str), AfterValidator(_uuid_version(7))]

# date / time use pydantic's standard validation (date is YYYY-MM-DD, time is HH:MM[:SS])
Date = _dt.date
DateTime = AwareDatetime
Time = _dt.time

# a string on the wire, int / Decimal in Python
Int64 = Annotated[int, BeforeValidator(_int64), PlainSerializer(lambda v: str(v), return_type=str, when_used="json")]
Decimal = Annotated[
    _decimal.Decimal,
    BeforeValidator(_decimal_in),
    PlainSerializer(lambda v: format(v, "f"), return_type=str, when_used="json"),
]


def _bytes_in(v: Any, info: ValidationInfo) -> Any:
    # a base64 string on the wire; bytes (raw bytes) in Python
    if isinstance(v, (bytes, bytearray)) and info.mode != "json":
        return bytes(v)
    if isinstance(v, str):
        try:
            return _b64.b64decode(v, validate=True)
        except (_binascii.Error, ValueError):
            raise ValueError("bytes は base64 の文字列で送ってください") from None
    raise ValueError("bytes は base64 の文字列で送ってください")


# base64 string <-> bytes
Bytes = Annotated[
    bytes,
    BeforeValidator(_bytes_in),
    PlainSerializer(lambda v: _b64.b64encode(v).decode("ascii"), return_type=str, when_used="json"),
]
Json = Any
