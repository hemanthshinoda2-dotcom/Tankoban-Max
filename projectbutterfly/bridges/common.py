"""Shared bridge helper exports during staged-facade modularization."""

from ._legacy_bridge_impl import (
    _ok,
    _err,
    _p,
    _stub,
    JsonCrudMixin,
)

__all__ = [
    "_ok",
    "_err",
    "_p",
    "_stub",
    "JsonCrudMixin",
]
