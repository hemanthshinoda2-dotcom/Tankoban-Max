"""
Project Butterfly — Torrent Service Layer

Manages Prowlarr and qBittorrent as invisible background subprocesses.
Provides Python API wrappers for both services (stdlib only, no dependencies).

Classes:
  SubprocessManager — generic start/stop/health-check for bundled executables
  QBitClient — qBittorrent Web API wrapper (torrents CRUD, transfer info)
  ProwlarrClient — Prowlarr API wrapper (search, indexers, health)
"""

import json
import os
import random
import shutil
import socket
import string
import subprocess
import sys
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from xml.etree import ElementTree

import storage

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

_HERE = Path(__file__).resolve().parent
_RESOURCES = _HERE.parent / "resources"

# Default port ranges (localhost only)
QBIT_PORT_RANGE = (10200, 10300)
PROWLARR_PORT_RANGE = (10300, 10400)

# Startup health-check timeout
HEALTH_TIMEOUT_S = 30
HEALTH_POLL_INTERVAL_S = 0.5


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _find_free_port(start: int, end: int) -> int:
    """Scan for a free TCP port in the given range."""
    for port in range(start, end):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            try:
                s.bind(("127.0.0.1", port))
                return port
            except OSError:
                continue
    raise RuntimeError(f"No free port in range {start}-{end}")


def _http_get(url: str, headers: dict | None = None, timeout: float = 10) -> tuple[int, str]:
    """Simple HTTP GET returning (status_code, body_text). Returns (-1, '') on error."""
    req = urllib.request.Request(url, headers=headers or {})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return resp.status, resp.read().decode("utf-8", errors="replace")
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode("utf-8", errors="replace") if e.fp else ""
    except Exception:
        return -1, ""


def _http_post(url: str, data: dict | bytes | None = None,
               headers: dict | None = None, timeout: float = 10) -> tuple[int, str]:
    """Simple HTTP POST. data can be dict (form-encoded) or bytes."""
    hdrs = headers or {}
    if isinstance(data, dict):
        body = urllib.parse.urlencode(data).encode("utf-8")
        hdrs.setdefault("Content-Type", "application/x-www-form-urlencoded")
    elif isinstance(data, bytes):
        body = data
    else:
        body = b""
    req = urllib.request.Request(url, data=body, headers=hdrs, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return resp.status, resp.read().decode("utf-8", errors="replace")
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode("utf-8", errors="replace") if e.fp else ""
    except Exception:
        return -1, ""


def _random_string(length: int = 32) -> str:
    return "".join(random.choices(string.ascii_letters + string.digits, k=length))


# ---------------------------------------------------------------------------
# SubprocessManager
# ---------------------------------------------------------------------------

class SubprocessManager:
    """
    Manages a single background subprocess (start/stop/health-check).

    On Windows, launches with CREATE_NO_WINDOW to keep it invisible.
    """

    def __init__(self, name: str, exe_path: str, args_fn=None,
                 health_url_fn=None, port_range: tuple[int, int] = (10000, 10100)):
        self.name = name
        self.exe_path = exe_path
        self._args_fn = args_fn          # fn(port) -> list[str]
        self._health_url_fn = health_url_fn  # fn(port) -> str
        self._port_range = port_range
        self._process: subprocess.Popen | None = None
        self._port: int | None = None
        self._lock = threading.Lock()

    @property
    def port(self) -> int | None:
        return self._port

    @property
    def base_url(self) -> str:
        return f"http://127.0.0.1:{self._port}" if self._port else ""

    def start(self) -> bool:
        """Start the subprocess. Returns True if healthy within timeout."""
        with self._lock:
            if self._process and self._process.poll() is None:
                return True  # Already running

            if not os.path.isfile(self.exe_path):
                print(f"[torrent] {self.name}: executable not found at {self.exe_path}")
                return False

            try:
                self._port = _find_free_port(*self._port_range)
            except RuntimeError as e:
                print(f"[torrent] {self.name}: {e}")
                return False

            args = [self.exe_path]
            if self._args_fn:
                args += self._args_fn(self._port)

            creation_flags = 0
            if sys.platform == "win32":
                creation_flags = subprocess.CREATE_NO_WINDOW

            try:
                self._process = subprocess.Popen(
                    args,
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.DEVNULL,
                    creationflags=creation_flags,
                )
                print(f"[torrent] {self.name}: started on port {self._port} (PID {self._process.pid})")
            except Exception as e:
                print(f"[torrent] {self.name}: failed to start: {e}")
                self._process = None
                return False

        # Poll health outside lock
        if self._health_url_fn:
            health_url = self._health_url_fn(self._port)
            deadline = time.monotonic() + HEALTH_TIMEOUT_S
            while time.monotonic() < deadline:
                poll = self._process.poll() if self._process else None
                if poll is not None and poll != 0:
                    # Non-zero exit = real failure
                    print(f"[torrent] {self.name}: process exited with error (code {poll})")
                    return False
                status, _ = _http_get(health_url, timeout=2)
                if 200 <= status < 400:
                    print(f"[torrent] {self.name}: healthy")
                    return True
                if poll == 0:
                    # Process exited cleanly (e.g. single-instance handoff) but
                    # health not reachable — no point waiting further
                    print(f"[torrent] {self.name}: process exited (code 0) and health not reachable")
                    return False
                time.sleep(HEALTH_POLL_INTERVAL_S)
            print(f"[torrent] {self.name}: health check timed out after {HEALTH_TIMEOUT_S}s")
            return False

        return True

    def stop(self):
        """Stop the subprocess gracefully, then force-kill if needed."""
        with self._lock:
            proc = self._process
            self._process = None

        if proc is None:
            return

        if proc.poll() is not None:
            print(f"[torrent] {self.name}: already exited")
            return

        print(f"[torrent] {self.name}: stopping (PID {proc.pid})...")
        try:
            proc.terminate()
            proc.wait(timeout=5)
            print(f"[torrent] {self.name}: terminated cleanly")
        except subprocess.TimeoutExpired:
            print(f"[torrent] {self.name}: force-killing...")
            proc.kill()
            proc.wait(timeout=3)

    def is_running(self) -> bool:
        with self._lock:
            return self._process is not None and self._process.poll() is None


# ---------------------------------------------------------------------------
# QBitClient — qBittorrent Web API
# ---------------------------------------------------------------------------

class QBitClient:
    """
    qBittorrent Web API client (v2 API).

    Communicates via HTTP to the qBittorrent WebUI running on localhost.
    Uses stdlib urllib only — no third-party dependencies.
    """

    def __init__(self, base_url: str):
        self._base = base_url.rstrip("/")
        self._sid: str | None = None  # Session ID cookie

    def _url(self, path: str) -> str:
        return f"{self._base}{path}"

    def _headers(self) -> dict:
        h = {}
        if self._sid:
            h["Cookie"] = f"SID={self._sid}"
        return h

    def login(self, username: str = "admin", password: str = "") -> bool:
        """Authenticate and store session cookie. Returns True on success."""
        status, body = _http_post(
            self._url("/api/v2/auth/login"),
            data={"username": username, "password": password},
        )
        if status == 200 and "Ok" in body:
            # Extract SID from response (qBittorrent sends Set-Cookie: SID=xxx)
            # Since we're using urllib, we handle cookies manually
            try:
                req = urllib.request.Request(
                    self._url("/api/v2/auth/login"),
                    data=urllib.parse.urlencode({"username": username, "password": password}).encode(),
                    method="POST",
                )
                with urllib.request.urlopen(req, timeout=10) as resp:
                    cookie_header = resp.headers.get("Set-Cookie", "")
                    for part in cookie_header.split(";"):
                        part = part.strip()
                        if part.startswith("SID="):
                            self._sid = part[4:]
                            break
                    return True
            except Exception:
                pass
        # Try without auth (if WebUI has auth disabled)
        self._sid = None
        return self._check_connection()

    def _check_connection(self) -> bool:
        status, _ = _http_get(self._url("/api/v2/app/version"), self._headers())
        return status == 200

    def app_version(self) -> str:
        status, body = _http_get(self._url("/api/v2/app/version"), self._headers())
        return body.strip() if status == 200 else ""

    def list_torrents(self, filter_str: str = "all") -> list[dict]:
        """Get list of torrents. filter: all, downloading, seeding, completed, paused, etc."""
        status, body = _http_get(
            self._url(f"/api/v2/torrents/info?filter={filter_str}"),
            self._headers(),
        )
        if status == 200:
            try:
                return json.loads(body)
            except json.JSONDecodeError:
                pass
        return []

    def add_magnet(self, uri: str, save_path: str = "") -> bool:
        """Add a torrent via magnet URI. Returns True on success."""
        data = {"urls": uri}
        if save_path:
            data["savepath"] = save_path
        status, _ = _http_post(
            self._url("/api/v2/torrents/add"),
            data=data,
            headers=self._headers(),
        )
        return status == 200

    def add_torrent_file(self, file_path: str, save_path: str = "") -> bool:
        """Add a torrent from a .torrent file."""
        # Multipart form upload for torrent files
        boundary = f"----TankobanBoundary{_random_string(16)}"
        body_parts = []

        if save_path:
            body_parts.append(
                f'--{boundary}\r\n'
                f'Content-Disposition: form-data; name="savepath"\r\n\r\n'
                f'{save_path}\r\n'
            )

        with open(file_path, "rb") as f:
            file_data = f.read()
        filename = os.path.basename(file_path)
        body_parts.append(
            f'--{boundary}\r\n'
            f'Content-Disposition: form-data; name="torrents"; filename="{filename}"\r\n'
            f'Content-Type: application/x-bittorrent\r\n\r\n'
        )

        # Build final body as bytes
        body = b""
        for part in body_parts[:-1]:
            body += part.encode("utf-8")
        body += body_parts[-1].encode("utf-8")
        body += file_data
        body += f"\r\n--{boundary}--\r\n".encode("utf-8")

        headers = self._headers()
        headers["Content-Type"] = f"multipart/form-data; boundary={boundary}"
        status, _ = _http_post(self._url("/api/v2/torrents/add"), data=body, headers=headers)
        return status == 200

    def pause(self, hashes: str | list[str]) -> bool:
        """Pause torrents. hashes can be 'all' or a list of hashes."""
        if isinstance(hashes, list):
            hashes = "|".join(hashes)
        status, _ = _http_post(
            self._url("/api/v2/torrents/pause"),
            data={"hashes": hashes},
            headers=self._headers(),
        )
        return status == 200

    def resume(self, hashes: str | list[str]) -> bool:
        """Resume torrents."""
        if isinstance(hashes, list):
            hashes = "|".join(hashes)
        status, _ = _http_post(
            self._url("/api/v2/torrents/resume"),
            data={"hashes": hashes},
            headers=self._headers(),
        )
        return status == 200

    def delete(self, hashes: str | list[str], delete_files: bool = False) -> bool:
        """Delete torrents. Optionally delete downloaded files."""
        if isinstance(hashes, list):
            hashes = "|".join(hashes)
        status, _ = _http_post(
            self._url("/api/v2/torrents/delete"),
            data={"hashes": hashes, "deleteFiles": str(delete_files).lower()},
            headers=self._headers(),
        )
        return status == 200

    def transfer_info(self) -> dict:
        """Get global transfer info (speed, connection status)."""
        status, body = _http_get(self._url("/api/v2/transfer/info"), self._headers())
        if status == 200:
            try:
                return json.loads(body)
            except json.JSONDecodeError:
                pass
        return {}

    def get_torrent_properties(self, hash_: str) -> dict:
        """Get detailed properties of a single torrent."""
        status, body = _http_get(
            self._url(f"/api/v2/torrents/properties?hash={hash_}"),
            self._headers(),
        )
        if status == 200:
            try:
                return json.loads(body)
            except json.JSONDecodeError:
                pass
        return {}


# ---------------------------------------------------------------------------
# ProwlarrClient — Prowlarr API
# ---------------------------------------------------------------------------

class ProwlarrClient:
    """
    Prowlarr API client (v1 API).

    Communicates via HTTP to the Prowlarr instance running on localhost.
    """

    def __init__(self, base_url: str, api_key: str):
        self._base = base_url.rstrip("/")
        self._api_key = api_key

    def _url(self, path: str) -> str:
        return f"{self._base}{path}"

    def _headers(self) -> dict:
        return {"X-Api-Key": self._api_key}

    def health(self) -> bool:
        """Check if Prowlarr is reachable and healthy."""
        status, _ = _http_get(self._url("/api/v1/health"), self._headers())
        return 200 <= status < 400

    def search(self, query: str, indexer_ids: list[int] | None = None,
               categories: list[int] | None = None, limit: int = 40) -> list[dict]:
        """
        Search for torrents via Prowlarr.
        Returns normalized results: [{title, sizeBytes, seeders, magnetUri, sourceName, ...}]
        """
        results, _ = self.search_with_status(query, indexer_ids, categories, limit)
        return results

    def search_with_status(self, query: str, indexer_ids: list[int] | None = None,
                           categories: list[int] | None = None,
                           limit: int = 40) -> tuple[list[dict], str]:
        """
        Search with status info.  Returns (results, status_str).
        status_str is "ok", "cf_blocked", or "error".
        """
        params = {"query": query, "limit": str(limit), "type": "search"}
        if indexer_ids:
            params["indexerIds"] = ",".join(str(i) for i in indexer_ids)
        if categories:
            params["categories"] = ",".join(str(c) for c in categories)

        qs = urllib.parse.urlencode(params)
        status, body = _http_get(self._url(f"/api/v1/search?{qs}"), self._headers(),
                                 timeout=30)
        if status == 403 or (status == 200 and "cf_clearance" in body.lower()):
            return [], "cf_blocked"
        if status != 200:
            # Check body for CF indicators
            body_lower = body.lower()
            if "cloudflare" in body_lower or "cf-ray" in body_lower:
                return [], "cf_blocked"
            return [], "error"

        try:
            raw = json.loads(body)
        except json.JSONDecodeError:
            return [], "error"

        results = []
        for item in raw:
            # Prowlarr search results have varying shapes; normalize
            result = {
                "id": item.get("guid", ""),
                "title": item.get("title", ""),
                "sizeBytes": item.get("size", 0),
                "seeders": item.get("seeders", 0),
                "leechers": item.get("leechers", 0),
                "magnetUri": "",
                "downloadUrl": item.get("downloadUrl", ""),
                "sourceName": item.get("indexer", ""),
                "categories": [c.get("name", "") for c in item.get("categories", [])],
            }
            # Extract magnet URI from downloadUrl or magnetUrl
            mag = item.get("magnetUrl", "") or item.get("magnetUri", "")
            if not mag and result["downloadUrl"].startswith("magnet:"):
                mag = result["downloadUrl"]
            result["magnetUri"] = mag
            results.append(result)

        return results, "ok"

    def list_indexers(self) -> list[dict]:
        """Get list of configured indexers with base URLs."""
        status, body = _http_get(self._url("/api/v1/indexer"), self._headers())
        if status != 200:
            return []
        try:
            raw = json.loads(body)
            results = []
            for ix in raw:
                # Extract baseUrl from fields array
                base_url = ""
                for field in ix.get("fields", []):
                    if field.get("name") == "baseUrl":
                        base_url = field.get("value", "")
                        break
                results.append({
                    "id": ix.get("id"),
                    "name": ix.get("name", ""),
                    "enabled": ix.get("enable", False),
                    "baseUrl": base_url,
                })
            return results
        except (json.JSONDecodeError, TypeError):
            return []

    def test_indexer(self, indexer_id: int) -> bool:
        """Test if an indexer is working."""
        status, _ = _http_post(
            self._url(f"/api/v1/indexer/test"),
            data=json.dumps({"id": indexer_id}).encode("utf-8"),
            headers={**self._headers(), "Content-Type": "application/json"},
        )
        return status == 200


# ---------------------------------------------------------------------------
# Config / Bootstrap helpers
# ---------------------------------------------------------------------------

def _qbit_profile_dir() -> str:
    """Return the qBittorrent profile directory inside userData."""
    return storage.data_path("qbittorrent_data")


def _prowlarr_data_dir() -> str:
    """Return the Prowlarr data directory inside userData."""
    return storage.data_path("prowlarr_data")


def _prowlarr_config_path() -> str:
    """Path to our Prowlarr config cache (stores the API key)."""
    return storage.data_path("prowlarr_config.json")


def seed_qbit_config(port: int):
    """
    Pre-seed qBittorrent config to enable WebUI on the chosen port,
    disable authentication, and set a sane default save path.
    """
    profile_dir = _qbit_profile_dir()
    config_dir = os.path.join(profile_dir, "qBittorrent", "config")
    os.makedirs(config_dir, exist_ok=True)

    config_file = os.path.join(config_dir, "qBittorrent.conf")

    # Default download path
    downloads = str(Path.home() / "Downloads" / "Tankoban")
    os.makedirs(downloads, exist_ok=True)

    config_content = f"""[Preferences]
WebUI\\Enabled=true
WebUI\\Port={port}
WebUI\\Address=127.0.0.1
WebUI\\LocalHostAuth=false
WebUI\\AuthSubnetWhitelistEnabled=true
WebUI\\AuthSubnetWhitelist=127.0.0.0/8
Downloads\\SavePath={downloads}
General\\Locale=en

[BitTorrent]
Session\\DefaultSavePath={downloads}
"""

    # Only write if file doesn't exist (don't overwrite user changes)
    if not os.path.isfile(config_file):
        with open(config_file, "w", encoding="utf-8") as f:
            f.write(config_content)
        print(f"[torrent] Seeded qBittorrent config at {config_file}")
    else:
        # Update port in existing config
        try:
            with open(config_file, "r", encoding="utf-8") as f:
                content = f.read()
            # Update WebUI port
            import re
            content = re.sub(r"WebUI\\Port=\d+", f"WebUI\\Port={port}", content)
            with open(config_file, "w", encoding="utf-8") as f:
                f.write(content)
        except Exception:
            pass


def seed_prowlarr_config() -> str:
    """
    Ensure Prowlarr config.xml exists with a known API key.
    Returns the API key.
    """
    data_dir = _prowlarr_data_dir()
    os.makedirs(data_dir, exist_ok=True)
    config_xml = os.path.join(data_dir, "config.xml")
    cache_path = _prowlarr_config_path()

    # Check if we already have a cached API key
    cached = storage.read_json(cache_path, {})
    api_key = cached.get("api_key", "")

    if not api_key:
        api_key = _random_string(32)

    # Write config.xml if it doesn't exist
    if not os.path.isfile(config_xml):
        xml_content = f"""<Config>
  <BindAddress>127.0.0.1</BindAddress>
  <Port>0</Port>
  <ApiKey>{api_key}</ApiKey>
  <AuthenticationMethod>None</AuthenticationMethod>
  <AnalyticsEnabled>False</AnalyticsEnabled>
  <LogLevel>info</LogLevel>
  <Branch>main</Branch>
  <LaunchBrowser>False</LaunchBrowser>
</Config>"""
        with open(config_xml, "w", encoding="utf-8") as f:
            f.write(xml_content)
        print(f"[torrent] Seeded Prowlarr config at {config_xml}")
    else:
        # Read existing API key from config.xml
        try:
            tree = ElementTree.parse(config_xml)
            root = tree.getroot()
            existing_key = root.findtext("ApiKey", "")
            if existing_key:
                api_key = existing_key
        except Exception:
            pass

    # Cache API key for Python to use
    storage.write_json_sync(cache_path, {"api_key": api_key})
    return api_key


# ---------------------------------------------------------------------------
# Factory: create managers for qBittorrent and Prowlarr
# ---------------------------------------------------------------------------

def find_qbit_exe() -> str | None:
    """
    Locate the qBittorrent executable. Returns None if not found.

    ONLY uses the bundled portable version in resources/.
    System-installed qBittorrent is a GUI single-instance app that can't
    run headlessly, so we never launch it — we only detect its WebUI
    if the user already has it running with WebUI enabled.
    """
    bundled = _RESOURCES / "qbittorrent" / "qbittorrent.exe"
    if bundled.is_file():
        return str(bundled)
    return None


def find_prowlarr_exe() -> str | None:
    """Locate the Prowlarr executable. Returns None if not found."""
    bundled = _RESOURCES / "prowlarr" / "Prowlarr.exe"
    if bundled.is_file():
        return str(bundled)

    # Check common install locations on Windows
    if sys.platform == "win32":
        candidates = []
        for base in [
            os.environ.get("PROGRAMFILES", "C:\\Program Files"),
            os.environ.get("PROGRAMFILES(X86)", "C:\\Program Files (x86)"),
            os.environ.get("LOCALAPPDATA", ""),
            os.environ.get("PROGRAMDATA", "C:\\ProgramData"),
        ]:
            if not base:
                continue
            candidates.append(os.path.join(base, "Prowlarr", "Prowlarr.exe"))
            candidates.append(os.path.join(base, "Prowlarr", "bin", "Prowlarr.exe"))

        for candidate in candidates:
            if os.path.isfile(candidate):
                print(f"[torrent] Found Prowlarr at {candidate}")
                return candidate

    found = shutil.which("Prowlarr")
    if found:
        return found
    return None


def _detect_running_qbit() -> int | None:
    """Check if qBittorrent WebUI is already running on a known port."""
    for port in [8080, 8081, 9090]:
        status, _ = _http_get(f"http://127.0.0.1:{port}/api/v2/app/version", timeout=1)
        if 200 <= status < 400:
            return port
    return None


def _detect_running_prowlarr() -> tuple[int, str] | None:
    """Check if Prowlarr is already running on a known port. Returns (port, api_key_if_known)."""
    for port in [9696, 9697]:
        status, _ = _http_get(f"http://127.0.0.1:{port}/ping", timeout=1)
        if 200 <= status < 400:
            return port, ""
    return None


def create_qbit_manager() -> SubprocessManager:
    """Create a SubprocessManager for qBittorrent."""
    exe = find_qbit_exe()
    if not exe:
        print("[torrent] qBittorrent: not found on system")
    profile_dir = _qbit_profile_dir()

    def args_fn(port: int) -> list[str]:
        seed_qbit_config(port)
        return [
            f"--webui-port={port}",
            f"--profile={profile_dir}",
        ]

    def health_fn(port: int) -> str:
        return f"http://127.0.0.1:{port}/api/v2/app/version"

    return SubprocessManager(
        name="qBittorrent",
        exe_path=exe or "",
        args_fn=args_fn,
        health_url_fn=health_fn,
        port_range=QBIT_PORT_RANGE,
    )


def create_prowlarr_manager() -> tuple[SubprocessManager, str]:
    """
    Create a SubprocessManager for Prowlarr.
    Returns (manager, api_key).
    """
    exe = find_prowlarr_exe()
    if not exe:
        print("[torrent] Prowlarr: not found on system")
    data_dir = _prowlarr_data_dir()
    api_key = seed_prowlarr_config()

    def args_fn(port: int) -> list[str]:
        # Update port in config.xml
        config_xml = os.path.join(data_dir, "config.xml")
        try:
            tree = ElementTree.parse(config_xml)
            root = tree.getroot()
            port_elem = root.find("Port")
            if port_elem is not None:
                port_elem.text = str(port)
            else:
                port_elem = ElementTree.SubElement(root, "Port")
                port_elem.text = str(port)
            tree.write(config_xml, xml_declaration=False)
        except Exception:
            pass
        return [f"-data={data_dir}", f"-port={port}", "-nobrowser"]

    def health_fn(port: int) -> str:
        # /ping doesn't require API key auth, unlike /api/v1/health
        return f"http://127.0.0.1:{port}/ping"

    mgr = SubprocessManager(
        name="Prowlarr",
        exe_path=exe,
        args_fn=args_fn,
        health_url_fn=health_fn,
        port_range=PROWLARR_PORT_RANGE,
    )
    return mgr, api_key
