"""Shared scan lifecycle runtime for route services."""

from __future__ import annotations

import threading
import time
from typing import Any, Dict

from .types import MediaKind


class QTRouteScanRuntime:
    """Tracks scan lifecycle and host runtime state for one media route."""

    def __init__(self, kind: MediaKind):
        self.kind = kind
        self.last_action_at_ms = 0
        self.scan_requests = 0
        self.scan_starts = 0
        self.scan_finishes = 0
        self.scan_cancels = 0
        self.last_force = False
        self.current_scan_id = 0
        self.current_scanning = False
        self.current_thread_name = ""
        self.has_cancel_event = False
        self.last_error = ""

    def _touch(self):
        self.last_action_at_ms = int(time.time() * 1000)

    def note_scan_request(self, force: bool):
        self.scan_requests += 1
        self.last_force = bool(force)
        self._touch()

    def note_scan_started(self):
        self.scan_starts += 1
        self._touch()

    def note_scan_finished(self):
        self.scan_finishes += 1
        self._touch()

    def note_scan_canceled(self):
        self.scan_cancels += 1
        self._touch()

    def note_error(self, err: Any):
        self.last_error = str(err or "")
        self._touch()

    def observe_host_state(self, state: Dict[str, Any] | None):
        s = state or {}
        self.current_scanning = bool(s.get("scanning"))
        self.current_scan_id = int(s.get("scanId") or self.current_scan_id or 0)
        thread_obj = s.get("thread")
        if isinstance(thread_obj, threading.Thread):
            self.current_thread_name = thread_obj.name or ""
        else:
            self.current_thread_name = ""
        self.has_cancel_event = bool(s.get("cancelEvent") is not None)
        self._touch()

    def snapshot(self) -> Dict[str, Any]:
        return {
            "kind": self.kind,
            "lastActionAtMs": self.last_action_at_ms,
            "scanRequests": self.scan_requests,
            "scanStarts": self.scan_starts,
            "scanFinishes": self.scan_finishes,
            "scanCancels": self.scan_cancels,
            "lastForce": self.last_force,
            "currentScanId": self.current_scan_id,
            "currentScanning": self.current_scanning,
            "currentThreadName": self.current_thread_name,
            "hasCancelEvent": self.has_cancel_event,
            "lastError": self.last_error,
        }

