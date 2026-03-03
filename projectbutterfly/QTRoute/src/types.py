"""Type contracts for QTRoute service orchestration."""

from __future__ import annotations

from typing import Any, Dict, Literal, Protocol


MediaKind = Literal["comics", "books", "video"]


class QTRouteProfile(Protocol):
    """Profile contract used by QTRouteService."""

    kind: MediaKind

    def get_state(self, opts: Any | None = None) -> Dict[str, Any]:
        ...

    def scan(self, force: bool = False, opts: Any | None = None) -> Dict[str, Any]:
        ...

    def cancel_scan(self) -> Dict[str, Any]:
        ...

    def mutate_config(self, action: str, payload: Any = None) -> Dict[str, Any]:
        ...

    def lookup_from_path(self, path: str) -> Dict[str, Any]:
        ...

    def observe_runtime(self) -> Dict[str, Any]:
        ...

