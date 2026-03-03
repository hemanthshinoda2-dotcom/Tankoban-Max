"""
Browser state persistence and compatibility migrations.

This module centralizes read/write access for browser settings, session state,
and permission decisions so browser widgets do not depend on bridge internals.
"""

from __future__ import annotations

import json


SESSION_SCHEMA_VERSION = 2

DEFAULT_SETTINGS = {
    "defaultSearchEngine": "google",
    "blockThirdPartyCookies": False,
    "antiFingerprintProtection": True,
    "theme": "dark",
}

DEFAULT_SESSION = {
    "version": SESSION_SCHEMA_VERSION,
    "tabs": [],
    "activeTabId": "",
    "closedTabs": [],
    "uiState": {
        "bookmarksBarVisible": False,
        "windowState": "normal",
    },
}


def _decode_json_payload(raw):
    if isinstance(raw, dict):
        return raw
    if not isinstance(raw, str):
        return {}
    s = raw.strip()
    if not s:
        return {}
    try:
        out = json.loads(s)
        return out if isinstance(out, dict) else {}
    except Exception:
        return {}


class BrowserStateStore:
    """
    Typed browser persistence facade over bridge namespaces.
    """

    def __init__(self, bridge_root=None):
        self._bridge = bridge_root

    def _get_ns(self, name):
        if not self._bridge:
            return None
        return getattr(self._bridge, name, None)

    def _call_json(self, namespace, method, *args):
        ns = self._get_ns(namespace)
        if not ns:
            return {}
        fn = getattr(ns, method, None)
        if not callable(fn):
            return {}
        try:
            raw = fn(*args)
        except Exception:
            return {}
        return _decode_json_payload(raw)

    def load_settings(self):
        payload = self._call_json("webBrowserSettings", "get")
        settings = payload.get("settings", {}) if payload.get("ok") else {}
        if not isinstance(settings, dict):
            settings = {}
        merged = dict(DEFAULT_SETTINGS)
        merged.update(settings)
        return merged

    def save_settings(self, settings):
        if not isinstance(settings, dict):
            return False
        out = self._call_json("webBrowserSettings", "save", json.dumps(settings))
        return bool(out.get("ok"))

    def migrate_session(self, raw_state):
        src = raw_state if isinstance(raw_state, dict) else {}
        out = dict(DEFAULT_SESSION)
        out["uiState"] = dict(DEFAULT_SESSION["uiState"])

        version = int(src.get("version", 1) or 1)
        tabs = src.get("tabs", [])
        active_tab = src.get("activeTabId", "")
        closed_tabs = src.get("closedTabs", [])
        ui_state = src.get("uiState", {})

        if version <= 1:
            # Older snapshots may store tabs as URL strings.
            upgraded_tabs = []
            for t in tabs if isinstance(tabs, list) else []:
                if isinstance(t, str):
                    upgraded_tabs.append({
                        "id": "",
                        "url": t,
                        "title": "",
                        "pinned": False,
                        "muted": False,
                        "zoom": 1.0,
                        "internal": False,
                    })
                elif isinstance(t, dict):
                    upgraded_tabs.append({
                        "id": str(t.get("id", "") or ""),
                        "url": str(t.get("url", "") or ""),
                        "title": str(t.get("title", "") or ""),
                        "pinned": bool(t.get("pinned")),
                        "muted": bool(t.get("muted")),
                        "zoom": float(t.get("zoom", 1.0) or 1.0),
                        "internal": bool(t.get("internal")),
                    })
            tabs = upgraded_tabs
            if not isinstance(closed_tabs, list):
                closed_tabs = []
            upgraded_closed = []
            for c in closed_tabs:
                if isinstance(c, str):
                    upgraded_closed.append({
                        "id": "",
                        "url": c,
                        "title": "",
                        "pinned": False,
                        "muted": False,
                        "zoom": 1.0,
                        "internal": False,
                    })
                elif isinstance(c, dict):
                    upgraded_closed.append({
                        "id": str(c.get("id", "") or ""),
                        "url": str(c.get("url", "") or ""),
                        "title": str(c.get("title", "") or ""),
                        "pinned": bool(c.get("pinned")),
                        "muted": bool(c.get("muted")),
                        "zoom": float(c.get("zoom", 1.0) or 1.0),
                        "internal": bool(c.get("internal")),
                    })
            closed_tabs = upgraded_closed

        # Normalize tabs.
        normalized_tabs = []
        if isinstance(tabs, list):
            for t in tabs:
                if not isinstance(t, dict):
                    continue
                u = str(t.get("url", "") or "")
                if not u:
                    continue
                normalized_tabs.append({
                    "id": str(t.get("id", "") or ""),
                    "url": u,
                    "title": str(t.get("title", "") or ""),
                    "pinned": bool(t.get("pinned")),
                    "muted": bool(t.get("muted")),
                    "zoom": float(t.get("zoom", 1.0) or 1.0),
                    "internal": bool(t.get("internal")),
                })

        normalized_closed = []
        if isinstance(closed_tabs, list):
            for t in closed_tabs:
                if isinstance(t, str):
                    u = t
                    t = {"url": u}
                if not isinstance(t, dict):
                    continue
                u = str(t.get("url", "") or "")
                if not u:
                    continue
                normalized_closed.append({
                    "id": str(t.get("id", "") or ""),
                    "url": u,
                    "title": str(t.get("title", "") or ""),
                    "pinned": bool(t.get("pinned")),
                    "muted": bool(t.get("muted")),
                    "zoom": float(t.get("zoom", 1.0) or 1.0),
                    "internal": bool(t.get("internal")),
                })

        out["tabs"] = normalized_tabs
        out["closedTabs"] = normalized_closed

        active = str(active_tab or "")
        active_id = ""
        if active:
            # Newer schema: direct tab id.
            for t in normalized_tabs:
                if str(t.get("id", "") or "") == active:
                    active_id = active
                    break
            # Older schema: active index encoded as string.
            if not active_id and active.isdigit():
                idx = int(active)
                if 0 <= idx < len(normalized_tabs):
                    maybe_id = str(normalized_tabs[idx].get("id", "") or "")
                    active_id = maybe_id or active
        if not active_id and normalized_tabs:
            first_id = str(normalized_tabs[0].get("id", "") or "")
            active_id = first_id or "0"
        out["activeTabId"] = active_id

        if isinstance(ui_state, dict):
            out["uiState"]["bookmarksBarVisible"] = bool(ui_state.get("bookmarksBarVisible"))
            ws = str(ui_state.get("windowState", "normal") or "normal").strip().lower()
            out["uiState"]["windowState"] = ws if ws in ("normal", "maximized", "fullscreen") else "normal"

        out["version"] = SESSION_SCHEMA_VERSION
        return out

    def load_session(self):
        payload = self._call_json("webSession", "get")
        state = payload.get("state", {}) if payload.get("ok") else {}
        return self.migrate_session(state)

    def save_session(self, state):
        normalized = self.migrate_session(state)
        out = self._call_json("webSession", "save", json.dumps(normalized))
        return bool(out.get("ok"))

    def get_permission_decision(self, origin, permission):
        payload = self._call_json(
            "webPermissions",
            "getDecision",
            json.dumps({"origin": str(origin or ""), "permission": str(permission or "")}),
        )
        if not payload.get("ok"):
            return "ask"
        decision = str(payload.get("decision", "ask") or "ask").strip().lower()
        return decision if decision in ("allow", "deny", "ask") else "ask"

    def set_permission_decision(self, origin, permission, decision):
        out = self._call_json(
            "webPermissions",
            "set",
            json.dumps({
                "origin": str(origin or ""),
                "permission": str(permission or ""),
                "decision": str(decision or "ask"),
            }),
        )
        return bool(out.get("ok"))

    def list_download_history(self):
        payload = self._call_json("webSources", "getDownloadHistory")
        if not payload.get("ok"):
            return []
        rows = payload.get("downloads", [])
        return rows if isinstance(rows, list) else []
