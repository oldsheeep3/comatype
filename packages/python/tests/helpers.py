"""Hand-written endpoints shaped like generated code."""

from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from typing import Any, ClassVar, Literal, Optional

import httpx
from pydantic import BaseModel, ConfigDict, Field

from comatype import CookieDef, Endpoint, Status, scalars as sc
from comatype import Cookie


class User(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    name: str = Field(min_length=1, max_length=5)
    followers: sc.Int64
    uid: sc.Uuidv4
    created_at: sc.DateTime = Field(alias="createdAt")
    nick: Optional[str] = Field(default=None, json_schema_extra={"omit_none": True})
    deleted: Optional[str]  # nullable (required)


class ApiError(BaseModel):
    code: str


class Params(BaseModel):
    id: sc.Uuidv4


class Search(BaseModel):
    verbose: Optional[bool] = Field(default=None, json_schema_extra={"omit_none": True})
    limit: Optional[int] = Field(default=None, json_schema_extra={"omit_none": True})
    tag: Optional[list[str]] = Field(default=None, json_schema_extra={"omit_none": True})


class ReqHeaders(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    x_n: Optional[int] = Field(default=None, alias="X-N", json_schema_extra={"omit_none": True})


class RespHeaders(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    allow: list[str] = Field(alias="Allow")
    x_count: Optional[int] = Field(default=None, alias="X-Count", json_schema_extra={"omit_none": True})


@dataclass(kw_only=True)
class S200(Status):
    status: Literal[200] = field(default=200, init=False)
    _kind: ClassVar[Literal["data", "error"]] = "data"
    _body: ClassVar[Any] = User
    _headers: ClassVar[Any] = RespHeaders
    Res = User
    Headers = RespHeaders
    data: Optional[User] = None
    headers: RespHeaders
    cookie: str | Cookie | None = None


@dataclass(kw_only=True)
class S204(Status):
    status: Literal[204] = field(default=204, init=False)
    _kind: ClassVar[Literal["data", "error"]] = "data"
    _body: ClassVar[Any] = None
    _headers: ClassVar[Any] = None


@dataclass(kw_only=True)
class S404(Status):
    status: Literal[404] = field(default=404, init=False)
    _kind: ClassVar[Literal["data", "error"]] = "error"
    _body: ClassVar[Any] = ApiError
    _headers: ClassVar[Any] = None
    Res = ApiError
    error: Optional[ApiError] = None


@dataclass(kw_only=True)
class S401(Status):
    status: Literal[401] = field(default=401, init=False)
    _kind: ClassVar[Literal["data", "error"]] = "error"
    _body: ClassVar[Any] = ApiError
    _headers: ClassVar[Any] = None
    error: Optional[ApiError] = None
    cookie: str | Cookie | None = None


@dataclass(kw_only=True)
class Request:
    params: Params
    search: Search = field(default_factory=Search)
    body: User
    headers: ReqHeaders = field(default_factory=ReqHeaders)
    ctx: Any = None


COOKIE = CookieDef(name="session", http_only=True, secure=True, same_site="lax")


def endpoint(method: str, path: str, **kw: Any) -> Endpoint[Any, Any, Any]:
    base: dict[str, Any] = dict(method=method, path=path, module=f"{method}{path}", responses=(S200, S204, S404, S401), cookie=True, cookie_def=COOKIE, request_cls=lambda **kw: kw)
    base.update(kw)
    return Endpoint(**base)


put = endpoint(
    "put",
    "/user/:id",
    params=Params,
    search=Search,
    body=User,
    request_headers=ReqHeaders,
    arg_form="request",
    request_cls=Request,
)


def transport(server: Any) -> httpx.AsyncClient:
    return httpx.AsyncClient(transport=httpx.ASGITransport(app=server), base_url="http://test")


ID = str(uuid.UUID("3f2b8c1e-5d4a-4b6e-9c1d-2a7f0e8b9c10"))
