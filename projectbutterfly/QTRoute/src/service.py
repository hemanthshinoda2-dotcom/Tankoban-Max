"""QTRoute orchestration service."""

from __future__ import annotations

from typing import Any, Dict

from .runtime import QTRouteScanRuntime
from .types import QTRouteProfile


class QTRouteService:
    """Shared service façade consumed by bridge namespace wrappers."""

    def __init__(self, profile: QTRouteProfile, runtime: QTRouteScanRuntime):
        self._profile = profile
        self._runtime = runtime

    @property
    def kind(self):
        return self._profile.kind

    def runtime_snapshot(self) -> Dict[str, Any]:
        self._observe_runtime()
        return self._runtime.snapshot()

    def get_state(self, opts: Any | None = None) -> Dict[str, Any]:
        self._observe_runtime()
        out = self._profile.get_state(opts)
        self._observe_runtime()
        return out

    def scan(self, force: bool = False, opts: Any | None = None) -> Dict[str, Any]:
        self._observe_runtime()
        out = self._profile.scan(force=force, opts=opts)
        self._observe_runtime()
        return out

    def cancel_scan(self) -> Dict[str, Any]:
        self._observe_runtime()
        out = self._profile.cancel_scan()
        self._observe_runtime()
        return out

    def mutate_config(self, action: str, payload: Any = None) -> Dict[str, Any]:
        self._observe_runtime()
        out = self._profile.mutate_config(action, payload)
        self._observe_runtime()
        return out

    def lookup_from_path(self, path: str) -> Dict[str, Any]:
        self._observe_runtime()
        out = self._profile.lookup_from_path(path)
        self._observe_runtime()
        return out

    def _observe_runtime(self):
        try:
            st = self._profile.observe_runtime()
        except Exception as e:
            self._runtime.note_error(e)
            st = {}
        self._runtime.observe_host_state(st)
