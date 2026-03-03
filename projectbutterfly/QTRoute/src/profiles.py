"""Bridge-bound route profiles."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Callable, Dict

from .types import MediaKind


@dataclass
class BridgeRouteProfile:
    """Callback-backed profile used to wrap existing bridge behavior."""

    kind: MediaKind
    get_state_cb: Callable[[Any | None], Dict[str, Any]]
    scan_cb: Callable[[bool, Any | None], Dict[str, Any]]
    cancel_scan_cb: Callable[[], Dict[str, Any]]
    mutate_config_cb: Callable[[str, Any], Dict[str, Any]]
    lookup_from_path_cb: Callable[[str], Dict[str, Any]]
    observe_runtime_cb: Callable[[], Dict[str, Any]]

    def get_state(self, opts: Any | None = None) -> Dict[str, Any]:
        return self.get_state_cb(opts)

    def scan(self, force: bool = False, opts: Any | None = None) -> Dict[str, Any]:
        return self.scan_cb(force, opts)

    def cancel_scan(self) -> Dict[str, Any]:
        return self.cancel_scan_cb()

    def mutate_config(self, action: str, payload: Any = None) -> Dict[str, Any]:
        return self.mutate_config_cb(action, payload)

    def lookup_from_path(self, path: str) -> Dict[str, Any]:
        return self.lookup_from_path_cb(path)

    def observe_runtime(self) -> Dict[str, Any]:
        return self.observe_runtime_cb()


def _build_profile(kind: MediaKind, host) -> BridgeRouteProfile:
    return BridgeRouteProfile(
        kind=kind,
        get_state_cb=host._route_get_state,
        scan_cb=host._route_scan,
        cancel_scan_cb=host._route_cancel_scan,
        mutate_config_cb=host._route_mutate_config,
        lookup_from_path_cb=host._route_lookup_from_path,
        observe_runtime_cb=host._route_observe_runtime,
    )


def make_comics_profile(host) -> BridgeRouteProfile:
    return _build_profile("comics", host)


def make_books_profile(host) -> BridgeRouteProfile:
    return _build_profile("books", host)


def make_video_profile(host) -> BridgeRouteProfile:
    return _build_profile("video", host)

