"""HTTP client shim for the Node WebTorrent sidecar.

This exposes a qBittorrent-like subset used by WebTorrentBridge so we can
switch backends without rewriting the whole bridge at once.
"""

from __future__ import annotations

import base64
import json
import urllib.error
import urllib.request


class WebTorrentSidecarClient:
    """qBit-compatible method surface over local sidecar HTTP endpoints."""

    def __init__(self, base_url: str):
        self._base = str(base_url or "").rstrip("/")

    def _post(self, endpoint: str, payload: dict | None = None, timeout_sec: float = 20.0):
        url = self._base + endpoint
        raw = json.dumps(payload or {}).encode("utf-8")
        req = urllib.request.Request(
            url,
            data=raw,
            method="POST",
            headers={"Content-Type": "application/json; charset=utf-8"},
        )
        try:
            with urllib.request.urlopen(req, timeout=timeout_sec) as resp:
                body = resp.read().decode("utf-8", errors="replace")
            parsed = json.loads(body) if body else {}
            return parsed if isinstance(parsed, dict) else {"ok": False, "error": "bad_response"}
        except urllib.error.HTTPError as e:
            try:
                msg = e.read().decode("utf-8", errors="replace")
            except Exception:
                msg = str(e)
            try:
                parsed = json.loads(msg)
                if isinstance(parsed, dict):
                    return parsed
            except Exception:
                pass
            return {"ok": False, "error": msg or str(e)}
        except Exception as e:
            return {"ok": False, "error": str(e)}

    def _get(self, endpoint: str, timeout_sec: float = 6.0):
        url = self._base + endpoint
        req = urllib.request.Request(url, method="GET")
        try:
            with urllib.request.urlopen(req, timeout=timeout_sec) as resp:
                body = resp.read().decode("utf-8", errors="replace")
            parsed = json.loads(body) if body else {}
            return parsed if isinstance(parsed, dict) else {"ok": False, "error": "bad_response"}
        except Exception as e:
            return {"ok": False, "error": str(e)}

    # ---- qBit-like methods expected by WebTorrentBridge ----

    def login(self, username: str = "", password: str = "") -> bool:
        # Sidecar is local-only and does not use qBit auth semantics.
        return bool(self.app_version())

    def app_version(self) -> str:
        out = self._get("/health", timeout_sec=2.0)
        if not out.get("ok"):
            return ""
        return str(out.get("version", "") or "")

    def add_torrent(
        self,
        urls: str = "",
        torrent_file: bytes | None = None,
        save_path: str = "",
        is_stopped: bool = False,
        sequential: bool = False,
        stop_condition: str = "",
    ) -> bool:
        payload = {
            "urls": str(urls or ""),
            "save_path": str(save_path or ""),
            "is_stopped": bool(is_stopped),
            "sequential": bool(sequential),
            "stop_condition": str(stop_condition or ""),
        }
        if torrent_file:
            payload["torrent_file_b64"] = base64.b64encode(torrent_file).decode("ascii")
        out = self._post("/rpc/add_torrent", payload, timeout_sec=30.0)
        return bool(out.get("ok"))

    def torrent_info(self, hashes: str = "") -> list[dict]:
        out = self._post("/rpc/torrent_info", {"hashes": str(hashes or "")}, timeout_sec=8.0)
        if not out.get("ok"):
            return []
        data = out.get("torrents")
        return data if isinstance(data, list) else []

    def torrent_files(self, info_hash: str) -> list[dict]:
        out = self._post("/rpc/torrent_files", {"hash": str(info_hash or "")}, timeout_sec=8.0)
        if not out.get("ok"):
            return []
        data = out.get("files")
        return data if isinstance(data, list) else []

    def set_file_priority(self, info_hash: str, file_ids: list[int], priority: int) -> bool:
        out = self._post(
            "/rpc/set_file_priority",
            {
                "hash": str(info_hash or ""),
                "ids": [int(x) for x in (file_ids or [])],
                "priority": int(priority),
            },
            timeout_sec=8.0,
        )
        return bool(out.get("ok"))

    def toggle_sequential(self, hashes: str) -> bool:
        out = self._post("/rpc/toggle_sequential", {"hashes": str(hashes or "")}, timeout_sec=6.0)
        return bool(out.get("ok"))

    def set_location(self, hashes: str, location: str) -> bool:
        out = self._post(
            "/rpc/set_location",
            {"hashes": str(hashes or ""), "location": str(location or "")},
            timeout_sec=8.0,
        )
        return bool(out.get("ok"))

    def pause(self, hashes: str | list[str]) -> bool:
        h = "|".join(hashes) if isinstance(hashes, list) else str(hashes or "")
        out = self._post("/rpc/pause", {"hashes": h}, timeout_sec=6.0)
        return bool(out.get("ok"))

    def resume(self, hashes: str | list[str]) -> bool:
        h = "|".join(hashes) if isinstance(hashes, list) else str(hashes or "")
        out = self._post("/rpc/resume", {"hashes": h}, timeout_sec=6.0)
        return bool(out.get("ok"))

    def delete(self, hashes: str | list[str], delete_files: bool = False) -> bool:
        h = "|".join(hashes) if isinstance(hashes, list) else str(hashes or "")
        out = self._post(
            "/rpc/delete",
            {"hashes": h, "delete_files": bool(delete_files)},
            timeout_sec=10.0,
        )
        return bool(out.get("ok"))

    def torrent_peers(self, info_hash: str) -> dict:
        out = self._post("/rpc/torrent_peers", {"hash": str(info_hash or "")}, timeout_sec=6.0)
        if not out.get("ok"):
            return {"peers": {}}
        peers = out.get("peers")
        if isinstance(peers, dict):
            return {"peers": peers}
        return {"peers": {}}

    def transfer_info(self) -> dict:
        out = self._post("/rpc/transfer_info", {}, timeout_sec=4.0)
        if not out.get("ok"):
            return {}
        info = out.get("info")
        return info if isinstance(info, dict) else {}
