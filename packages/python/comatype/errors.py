from __future__ import annotations

from typing import Any


class ComatypeError(Exception):
    """Misuse of Comatype (missing wrapper, wrong method, etc.)."""


class ComatypeValidationError(ComatypeError):
    """Input or output does not match the types in .comat."""

    def __init__(self, path: str, reason: str) -> None:
        self.path = path
        self.reason = reason
        super().__init__(f"{path}: {reason}" if path else reason)


class UnexpectedStatusError(ComatypeError):
    """A response with a status not passed to c.xxx() was returned."""

    def __init__(self, status: int, body: Any) -> None:
        self.status = status
        self.body = body
        super().__init__(f"想定していないステータス {status} が返りました（c.xxx に渡していない S{status} かもしれません）")
