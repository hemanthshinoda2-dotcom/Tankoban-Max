"""
qBittorrent Process Manager for Tankoban Butterfly.

Manages a bundled qBittorrent portable instance that runs headless
and is controlled via its Web API.  Pattern follows tor_proxy.py.

Usage:
    mgr = QBitProcessManager()
    if mgr.ensure_running():
        client = QBitClient(mgr.base_url)
        client.login()
        ...
    mgr.stop()
"""

import os
import shutil
import subprocess
import threading
import time
from pathlib import Path

from PySide6.QtCore import QObject, Signal, QTimer

import storage

# Port range — avoids conflict with user's own qBittorrent (8080)
_PORT_START = 18080
_PORT_END = 18089
_STARTUP_TIMEOUT_S = 15
_POLL_INTERVAL_S = 0.4

_WEBUI_USERNAME = "admin"
_WEBUI_PASSWORD = "tankoban"


def _find_qbit_exe():
    """Locate qbittorrent.exe in resources/ or on PATH."""
    repo_root = Path(__file__).resolve().parent.parent
    bundled = repo_root / "resources" / "qbittorrent" / "qbittorrent.exe"
    if bundled.is_file():
        return str(bundled)

    found = shutil.which("qbittorrent")
    if found:
        return found

    return None


def _probe_webui(port):
    """Check if qBittorrent WebUI is responding on a port. Returns True if reachable."""
    import urllib.request
    import urllib.error
    try:
        req = urllib.request.Request(f"http://127.0.0.1:{port}/api/v2/app/version")
        with urllib.request.urlopen(req, timeout=2) as resp:
            return 200 <= resp.status < 400
    except Exception:
        return False


class QBitProcessManager(QObject):
    """
    Manages a local qBittorrent instance for torrent operations.

    Signals:
        status_changed(dict) — {ready, port, message}
    """

    status_changed = Signal(dict)

    def __init__(self, parent=None):
        super().__init__(parent)
        self._process = None
        self._port = 0
        self._ready = False
        self._starting = False
        self._message = ""
        self._profile_dir = ""

    @property
    def port(self):
        return self._port

    @property
    def ready(self):
        return self._ready

    @property
    def base_url(self):
        return f"http://127.0.0.1:{self._port}" if self._port else ""

    def get_status(self):
        return {
            "ready": self._ready,
            "port": self._port,
            "message": self._message,
        }

    def ensure_running(self):
        """Start qBittorrent if not already running. Blocking. Returns True if ready."""
        if self._ready:
            # Quick health check
            if _probe_webui(self._port):
                return True
            # Lost connection — mark not ready and retry
            self._ready = False

        if self._starting:
            return False

        self._starting = True
        try:
            return self._do_start()
        finally:
            self._starting = False

    def _do_start(self):
        """Find binary, try ports, wait for WebUI."""
        # Check if already running on our port range (e.g., from a previous crash)
        for port in range(_PORT_START, _PORT_END + 1):
            if _probe_webui(port):
                print(f"[qbit] Found existing instance on port {port}")
                self._port = port
                self._ready = True
                self._message = f"Connected (port {port})"
                self._emit_status()
                return True

        exe = _find_qbit_exe()
        if not exe:
            self._message = "qBittorrent binary not found in resources/qbittorrent/"
            self._emit_status()
            print("[qbit] qBittorrent binary not found")
            return False

        # Isolated profile directory
        self._profile_dir = storage.data_path("qbit-profile")
        os.makedirs(self._profile_dir, exist_ok=True)

        print(f"[qbit] Binary: {exe}")

        for port in range(_PORT_START, _PORT_END + 1):
            ok = self._try_start(exe, port)
            if ok:
                self._configure_webui(port)
                return True
            print(f"[qbit] Port {port} failed, trying next...")

        self._message = "Failed to start qBittorrent on any port"
        self._emit_status()
        print("[qbit] Failed to start on any port")
        return False

    def _try_start(self, exe, port):
        """Spawn qbittorrent.exe on a specific port, wait for WebUI ready."""
        args = [
            exe,
            f"--webui-port={port}",
            f"--profile={self._profile_dir}",
        ]

        creation_flags = 0
        if os.name == "nt":
            creation_flags = subprocess.CREATE_NO_WINDOW

        try:
            proc = subprocess.Popen(
                args,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                stdin=subprocess.DEVNULL,
                creationflags=creation_flags,
            )
        except Exception as e:
            print(f"[qbit] Spawn error on port {port}: {e}")
            return False

        # Poll for WebUI readiness
        deadline = time.time() + _STARTUP_TIMEOUT_S
        while time.time() < deadline:
            # Check if process died
            if proc.poll() is not None:
                print(f"[qbit] Process exited with code {proc.returncode} on port {port}")
                return False

            if _probe_webui(port):
                self._process = proc
                self._port = port
                self._ready = True
                self._message = f"qBittorrent ready (port {port})"
                self._emit_status()
                print(f"[qbit] WebUI ready on port {port}")

                # Watch for unexpected exit
                threading.Thread(target=self._watch_process, daemon=True).start()
                return True

            time.sleep(_POLL_INTERVAL_S)

        # Timeout — kill the process
        try:
            proc.kill()
        except Exception:
            pass
        print(f"[qbit] Startup timeout on port {port}")
        return False

    def _configure_webui(self, port):
        """Disable WebUI authentication for localhost convenience."""
        import urllib.request
        import urllib.error
        import json

        url = f"http://127.0.0.1:{port}/api/v2/app/setPreferences"
        prefs = json.dumps({
            "web_ui_username": _WEBUI_USERNAME,
            "web_ui_password": _WEBUI_PASSWORD,
            "bypass_local_auth": True,
            "bypass_auth_subnet_whitelist_enabled": True,
            "bypass_auth_subnet_whitelist": "127.0.0.0/8",
        })
        data = f"json={prefs}".encode("utf-8")

        # Try to login first (default credentials: admin / empty or admin / adminadmin)
        for default_pw in ["", "adminadmin"]:
            try:
                login_url = f"http://127.0.0.1:{port}/api/v2/auth/login"
                login_data = f"username=admin&password={default_pw}".encode("utf-8")
                req = urllib.request.Request(login_url, data=login_data, method="POST")
                with urllib.request.urlopen(req, timeout=5) as resp:
                    cookie = resp.headers.get("Set-Cookie", "")
                    if "SID=" in cookie:
                        sid = ""
                        for part in cookie.split(";"):
                            part = part.strip()
                            if part.startswith("SID="):
                                sid = part[4:]
                                break
                        # Set preferences with session cookie
                        pref_req = urllib.request.Request(url, data=data, method="POST")
                        pref_req.add_header("Cookie", f"SID={sid}")
                        pref_req.add_header("Content-Type", "application/x-www-form-urlencoded")
                        with urllib.request.urlopen(pref_req, timeout=5):
                            print(f"[qbit] WebUI configured (auth bypass enabled)")
                            return
            except Exception:
                pass

        # If login failed, try unauthenticated (some versions allow it)
        try:
            req = urllib.request.Request(url, data=data, method="POST")
            req.add_header("Content-Type", "application/x-www-form-urlencoded")
            with urllib.request.urlopen(req, timeout=5):
                print("[qbit] WebUI configured (no auth)")
        except Exception as e:
            print(f"[qbit] Warning: could not configure WebUI: {e}")

    def _watch_process(self):
        """Watch for unexpected qBittorrent process exit."""
        if not self._process:
            return
        self._process.wait()
        if self._ready:
            print("[qbit] qBittorrent process died unexpectedly")
            self._ready = False
            self._port = 0
            self._message = "qBittorrent disconnected"
            self._process = None
            self._emit_status()

    def stop(self):
        """Graceful shutdown via API, then kill if needed."""
        if not self._ready and not self._process:
            return

        # Try graceful shutdown via API
        if self._port:
            import urllib.request
            import urllib.error
            try:
                url = f"http://127.0.0.1:{self._port}/api/v2/app/shutdown"
                req = urllib.request.Request(url, data=b"", method="POST")
                urllib.request.urlopen(req, timeout=3)
            except Exception:
                pass

        # Wait up to 3 seconds for process to exit
        if self._process:
            try:
                self._process.wait(timeout=3)
            except subprocess.TimeoutExpired:
                try:
                    self._process.kill()
                except Exception:
                    pass
            self._process = None

        self._ready = False
        self._port = 0
        self._message = ""
        self._emit_status()
        print("[qbit] Stopped")

    def force_kill(self):
        """Synchronous kill for app shutdown."""
        if self._process:
            try:
                self._process.kill()
            except Exception:
                pass
            self._process = None
        self._ready = False

    def _emit_status(self):
        """Emit status signal (thread-safe via singleShot)."""
        status = self.get_status()
        QTimer.singleShot(0, lambda: self.status_changed.emit(status))
