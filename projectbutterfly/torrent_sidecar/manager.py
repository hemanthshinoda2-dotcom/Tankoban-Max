"""Torrent sidecar manager (Phase 2 runtime).

Starts and monitors the local Node/WebTorrent sidecar used by WebTorrentBridge.
"""

from __future__ import annotations

import json
import os
import shutil
import subprocess
import time
import urllib.error
import urllib.request
from dataclasses import dataclass
from pathlib import Path


@dataclass
class SidecarStatus:
    ok: bool
    running: bool
    base_url: str
    message: str
    pid: int


class TorrentSidecarManager:
    """Lifecycle helper for local torrent sidecar service."""

    def __init__(self, host: str = "127.0.0.1", port: int = 8765):
        self.host = str(host or "127.0.0.1")
        self.port = int(port or 8765)
        self._proc: subprocess.Popen | None = None
        self._last_message = "not_started"

    @property
    def base_url(self) -> str:
        return f"http://{self.host}:{self.port}"

    def _probe_health(self, timeout_sec: float = 1.2) -> bool:
        url = f"{self.base_url}/health"
        req = urllib.request.Request(url, method="GET")
        try:
            with urllib.request.urlopen(req, timeout=timeout_sec) as resp:
                body = resp.read().decode("utf-8", errors="replace")
            data = json.loads(body)
            if not isinstance(data, dict):
                return False
            if data.get("ok") is not True:
                return False
            # Sidecar must report ready=true; old Python scaffold uses ready=false.
            return bool(data.get("ready") is True)
        except Exception:
            return False

    def ensure_running(self, start_if_needed: bool = False, timeout_ms: int = 2500) -> bool:
        if self._probe_health():
            self._last_message = "healthy"
            return True

        if not start_if_needed:
            self._last_message = "sidecar_unavailable"
            return False

        if self._proc is None or self._proc.poll() is not None:
            # Phase 2 runtime: Node/WebTorrent sidecar only.
            node_bin = shutil.which("node") or shutil.which("node.exe")
            node_script = Path(__file__).with_name("service_node.js")
            args = None
            if node_bin and node_script.exists():
                data_dir = ""
                try:
                    import storage
                    data_dir = storage.data_path("torrent_sidecar")
                except Exception:
                    data_dir = ""
                args = [
                    str(node_bin),
                    str(node_script),
                    "--host",
                    self.host,
                    "--port",
                    str(self.port),
                ]
                if data_dir:
                    args.extend(["--data-dir", data_dir])
            elif not node_bin:
                self._last_message = "node_not_found"
                return False
            elif not node_script.exists():
                self._last_message = "service_node_missing"
                return False
            if not args:
                self._last_message = "service_script_missing"
                return False

            creationflags = 0
            startupinfo = None
            if os.name == "nt":
                creationflags = getattr(subprocess, "CREATE_NO_WINDOW", 0)
                try:
                    creationflags |= getattr(subprocess, "DETACHED_PROCESS", 0)
                except Exception:
                    pass
                try:
                    startupinfo = subprocess.STARTUPINFO()
                    startupinfo.dwFlags |= subprocess.STARTF_USESHOWWINDOW
                    startupinfo.wShowWindow = 0
                except Exception:
                    startupinfo = None

            try:
                self._proc = subprocess.Popen(
                    args,
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.DEVNULL,
                    stdin=subprocess.DEVNULL,
                    creationflags=creationflags,
                    startupinfo=startupinfo,
                )
            except Exception as e:
                self._last_message = f"start_failed: {e}"
                return False

        deadline = time.time() + (max(1000, int(timeout_ms or 6000)) / 1000.0)
        while time.time() < deadline:
            if self._probe_health(timeout_sec=0.8):
                self._last_message = "healthy"
                return True
            if self._proc is not None and self._proc.poll() is not None:
                self._last_message = f"exited_{self._proc.returncode}"
                return False
            time.sleep(0.12)

        self._last_message = "health_timeout"
        return False

    def stop(self):
        proc = self._proc
        self._proc = None
        if not proc:
            return
        try:
            proc.terminate()
        except Exception:
            pass

    def get_status(self) -> dict:
        running = bool(self._proc is not None and self._proc.poll() is None)
        pid = int(self._proc.pid) if running and self._proc else 0
        return SidecarStatus(
            ok=running and self._probe_health(timeout_sec=0.8),
            running=running,
            base_url=self.base_url,
            message=str(self._last_message or ""),
            pid=pid,
        ).__dict__.copy()

