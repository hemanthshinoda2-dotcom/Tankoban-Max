"""
Tor Proxy Manager for Tankoban Butterfly.

Manages the Tor process lifecycle and configures QWebEngineProfile
to route traffic through the Tor SOCKS5 proxy.

Ported from:
  - D:/Hemanth's Folder/aspect-browser/tor.js
  - main/domains/torProxy/index.js

Usage:
    tor = TorProxy(parent=qobject)
    tor.status_changed.connect(on_status)
    await tor.start()   # or tor.start_async()
    ...
    tor.stop()
"""

import os
import re
import shutil
import subprocess
import tempfile
import threading
import time
from pathlib import Path

from PySide6.QtCore import QObject, Signal, QTimer

import storage

# Port range (avoids conflict with system Tor on 9050)
_PORT_START = 9150
_PORT_END = 9159
_BOOTSTRAP_TIMEOUT_S = 60


def _find_tor_exe():
    """Locate tor.exe in resources/ or on PATH."""
    # Bundled: resources/tor/windows/tor.exe
    repo_root = Path(__file__).resolve().parent.parent
    bundled = repo_root / "resources" / "tor" / "windows" / "tor.exe"
    if bundled.is_file():
        return str(bundled)

    # System PATH
    found = shutil.which("tor")
    if found:
        return found

    return None


def _find_geoip_dir():
    """Find the directory containing geoip/geoip6 files."""
    repo_root = Path(__file__).resolve().parent.parent
    # Same directory as tor.exe for the expert bundle
    tor_dir = repo_root / "resources" / "tor" / "windows"
    if (tor_dir / "geoip").is_file():
        return str(tor_dir)
    # Also check a data/ subdirectory (some bundles use this)
    data_dir = repo_root / "resources" / "tor" / "data"
    if (data_dir / "geoip").is_file():
        return str(data_dir)
    return None


class TorProxy(QObject):
    """
    Manages a local Tor SOCKS5 proxy.

    Signals:
        status_changed(dict) — {active, connecting, bootstrapProgress, message}
    """

    status_changed = Signal(dict)

    def __init__(self, parent=None):
        super().__init__(parent)
        self._process = None
        self._port = 0
        self._active = False
        self._connecting = False
        self._bootstrap = 0
        self._message = ""
        self._data_dir = ""

    @property
    def active(self):
        return self._active

    @property
    def port(self):
        return self._port

    @property
    def socks_url(self):
        return f"socks5://127.0.0.1:{self._port}" if self._active else ""

    def get_status(self):
        return {
            "active": self._active,
            "connecting": self._connecting,
            "bootstrapProgress": self._bootstrap,
            "message": self._message,
            "port": self._port,
        }

    def start_async(self):
        """Start Tor in a background thread. Emits status_changed as it progresses."""
        if self._active or self._connecting:
            return
        self._connecting = True
        self._bootstrap = 0
        self._message = "Starting Tor..."
        self._emit_status()
        threading.Thread(target=self._start_bg, daemon=True).start()

    def _start_bg(self):
        """Background thread: find binary, try ports, bootstrap."""
        tor_exe = _find_tor_exe()
        if not tor_exe:
            self._connecting = False
            self._message = "Tor binary not found. Run: node tools/fetch_tor.js"
            self._emit_status()
            print("[tor] Tor binary not found")
            return

        geoip_dir = _find_geoip_dir()
        print(f"[tor] Binary: {tor_exe}")

        # Create data directory
        self._data_dir = os.path.join(
            storage.data_path(""), "tor-data-" + str(os.getpid())
        )
        os.makedirs(self._data_dir, exist_ok=True)

        for port in range(_PORT_START, _PORT_END + 1):
            ok = self._try_start(tor_exe, port, geoip_dir)
            if ok:
                return
            print(f"[tor] Port {port} failed, trying next...")

        self._connecting = False
        self._message = "All ports in use"
        self._emit_status()
        print("[tor] Failed to start on any port")

    def _try_start(self, tor_exe, port, geoip_dir):
        """Try to start Tor on a specific port. Returns True on success."""
        args = [
            tor_exe,
            "--SocksPort", str(port),
            "--DataDirectory", self._data_dir,
            "--Log", "notice stdout",
        ]
        if geoip_dir:
            geoip_file = os.path.join(geoip_dir, "geoip")
            geoip6_file = os.path.join(geoip_dir, "geoip6")
            if os.path.isfile(geoip_file):
                args.extend(["--GeoIPFile", geoip_file])
            if os.path.isfile(geoip6_file):
                args.extend(["--GeoIPv6File", geoip6_file])

        creation_flags = 0
        if os.name == "nt":
            creation_flags = subprocess.CREATE_NO_WINDOW

        try:
            proc = subprocess.Popen(
                args,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                stdin=subprocess.DEVNULL,
                creationflags=creation_flags,
            )
        except Exception as e:
            print(f"[tor] Spawn error on port {port}: {e}")
            return False

        # Read stdout for bootstrap progress
        deadline = time.time() + _BOOTSTRAP_TIMEOUT_S
        buffer = ""

        while time.time() < deadline:
            line = proc.stdout.readline()
            if not line:
                # Process exited
                code = proc.poll()
                if code is not None:
                    print(f"[tor] Exited with code {code} on port {port}")
                    return False
                continue

            text = line.decode("utf-8", errors="replace")
            match = re.search(r"Bootstrapped\s+(\d+)%", text)
            if match:
                self._bootstrap = int(match.group(1))
                self._message = f"Bootstrapping... {self._bootstrap}%"
                self._emit_status()

                if self._bootstrap >= 100:
                    self._process = proc
                    self._port = port
                    self._active = True
                    self._connecting = False
                    self._message = f"Connected (port {port})"
                    self._emit_status()
                    print(f"[tor] Bootstrapped on port {port}")

                    # Start a watcher thread for unexpected exit
                    threading.Thread(
                        target=self._watch_process, daemon=True
                    ).start()
                    return True

            # Check for port-in-use errors
            if "Address already in use" in text or "Could not bind" in text:
                try:
                    proc.kill()
                except Exception:
                    pass
                return False

        # Timeout
        try:
            proc.kill()
        except Exception:
            pass
        print(f"[tor] Bootstrap timeout on port {port}")
        return False

    def _watch_process(self):
        """Watch for unexpected Tor process exit."""
        if not self._process:
            return
        self._process.wait()
        if self._active:
            print("[tor] Tor process died unexpectedly")
            self._active = False
            self._connecting = False
            self._bootstrap = 0
            self._port = 0
            self._message = "Tor disconnected"
            self._process = None
            self._emit_status()

    def stop(self):
        """Stop Tor and clean up."""
        if not self._active and not self._connecting:
            return

        if self._process:
            try:
                self._process.terminate()
                try:
                    self._process.wait(timeout=3)
                except subprocess.TimeoutExpired:
                    self._process.kill()
            except Exception:
                pass
            self._process = None

        self._active = False
        self._connecting = False
        self._bootstrap = 0
        self._port = 0
        self._message = ""
        self._emit_status()

        # Clean up data directory
        if self._data_dir:
            try:
                shutil.rmtree(self._data_dir, ignore_errors=True)
            except Exception:
                pass
            self._data_dir = ""

        print("[tor] Stopped")

    def force_kill(self):
        """Synchronous kill for app shutdown."""
        if self._process:
            try:
                self._process.kill()
            except Exception:
                pass
            self._process = None
        self._active = False

    def _emit_status(self):
        """Emit status signal (thread-safe via singleShot)."""
        status = self.get_status()
        QTimer.singleShot(0, lambda: self.status_changed.emit(status))
