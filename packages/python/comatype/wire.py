"""Conversion between the wire form (JSON, strings) and pydantic types."""

from __future__ import annotations

import json
import types
import typing
from collections.abc import Callable
from typing import Any

from pydantic import BaseModel, TypeAdapter, ValidationError

from .errors import ComatypeValidationError

_adapters: dict[Any, TypeAdapter[Any]] = {}


def adapter(tp: Any) -> TypeAdapter[Any]:
    try:
        a = _adapters.get(tp)
    except TypeError:  # the type is not hashable
        return TypeAdapter(tp)
    if a is None:
        a = _adapters[tp] = TypeAdapter(tp)
    return a


def _join(prefix: str, loc: tuple[int | str, ...]) -> str:
    path = prefix
    for part in loc:
        path = f"{path}[{part}]" if isinstance(part, int) else (f"{path}.{part}" if path else str(part))
    return path


def _convert(e: ValidationError, prefix: str = "") -> ComatypeValidationError:
    err = e.errors()[0]
    msg = str(err["msg"])
    if msg.startswith("Value error, "):
        msg = msg[len("Value error, ") :]
    return ComatypeValidationError(_join(prefix, tuple(err["loc"])), msg)


def parse_json(tp: Any, data: bytes | str, prefix: str = "") -> Any:
    """Read JSON as type tp. Strict about JSON types (the string "5" is not coerced to int)."""
    try:
        return adapter(tp).validate_json(data, strict=True)
    except ValidationError as e:
        raise _convert(e, prefix) from None


def _omit_none(model: type[BaseModel], name: str) -> bool:
    extra = model.model_fields[name].json_schema_extra
    return isinstance(extra, dict) and bool(extra.get("omit_none"))


def _prune(data: Any, value: Any) -> Any:
    """Drop None for optional (`?`) fields, key included. None for fields that allow null is kept."""
    if isinstance(value, BaseModel) and isinstance(data, dict):
        cls = type(value)
        for name, finfo in cls.model_fields.items():
            key = finfo.alias or name
            if key not in data:
                continue
            if data[key] is None and _omit_none(cls, name):
                del data[key]
            else:
                data[key] = _prune(data[key], getattr(value, name))
    elif isinstance(value, (list, tuple)) and isinstance(data, list):
        for i, (d, v) in enumerate(zip(data, value)):
            data[i] = _prune(d, v)
    return data


def to_wire(tp: Any, value: Any, prefix: str = "") -> Any:
    """Validate a Python value and turn it into a JSON-able value (dict / list / str ...)."""
    a = adapter(tp)
    try:
        # dump to Python values and validate again (this also checks values built without validation, e.g. via model_construct)
        try:
            plain = a.dump_python(value, mode="python", by_alias=True, warnings=False)
        except Exception:  # noqa: BLE001  a value of the wrong type is validated as is and reported
            plain = value
        checked = a.validate_python(plain)
        data = a.dump_python(checked, mode="json", by_alias=True)
    except ValidationError as e:
        raise _convert(e, prefix) from None
    return _prune(data, checked)


def dump_json(tp: Any, value: Any, prefix: str = "") -> bytes:
    return json.dumps(to_wire(tp, value, prefix), ensure_ascii=False, separators=(",", ":")).encode()


# ---- values that arrive as strings (path, query, headers)----


def _is_list(annotation: Any) -> bool:
    origin = typing.get_origin(annotation)
    if origin in (typing.Union, types.UnionType):
        return any(_is_list(a) for a in typing.get_args(annotation))
    return origin in (list, set, tuple) or annotation in (list, set, tuple)


def decode_strings(
    model: type[BaseModel],
    lookup: Callable[[str], list[str] | None],
    *,
    split: bool = False,
    prefix: str = "",
) -> Any:
    """Read name -> string(s) into a model and validate it. `split` is for headers where an array arrives as one ", "-separated value."""
    data: dict[str, Any] = {}
    for name, finfo in model.model_fields.items():
        key = finfo.alias or name
        vals = lookup(key)
        if not vals:
            continue
        if _is_list(finfo.annotation):
            if split and len(vals) == 1:
                vals = [p.strip() for p in vals[0].split(",")] if vals[0].strip() else []
            data[key] = vals
        else:
            data[key] = vals[0]
    try:
        return model.model_validate(data)
    except ValidationError as e:
        raise _convert(e, prefix) from None


def _scalar(v: Any) -> str:
    if isinstance(v, bool):
        return "true" if v else "false"
    return str(v)


def encode_strings(value: BaseModel | None) -> dict[str, list[str]]:
    """Turn a model into name -> list of strings. Omitted fields are not included."""
    if value is None:
        return {}
    data = to_wire(type(value), value)
    out: dict[str, list[str]] = {}
    for k, v in data.items():
        if v is None:
            continue
        out[k] = [_scalar(x) for x in v] if isinstance(v, list) else [_scalar(v)]
    return out
