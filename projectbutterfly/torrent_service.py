"""
Project Butterfly — Torrent Service Layer

Provides Python API wrappers for Jackett (search) and qBittorrent (downloads).
Both services are user-installed — NOT bundled or managed by this app.
We detect running instances on localhost and communicate via their Web APIs.

Classes:
  QBitClient — qBittorrent Web API wrapper (torrents CRUD, transfer info)
  JackettClient — Jackett Torznab API wrapper (search, indexers)
"""

import json
import os
import re
import urllib.error
import urllib.parse
import urllib.request

import storage

# ---------------------------------------------------------------------------
# HTTP Helpers
# ---------------------------------------------------------------------------

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


# ---------------------------------------------------------------------------
# XML Helpers (for Torznab parsing)
# ---------------------------------------------------------------------------

def _xml_text(xml: str, tag: str) -> str:
    """Extract text content of an XML tag."""
    m = re.search(rf'<{tag}\b[^>]*>(.*?)</{tag}>', xml, re.IGNORECASE | re.DOTALL)
    if m:
        text = m.group(1).strip()
        cdata = re.match(r'<!\[CDATA\[(.*?)\]\]>', text, re.DOTALL)
        if cdata:
            return cdata.group(1)
        return _xml_unescape(text)
    return ""


def _xml_torznab_attr(xml: str, name: str) -> str:
    """Extract a torznab:attr value from XML item."""
    m = re.search(rf'<torznab:attr\s+name="{name}"\s+value="([^"]*)"', xml, re.IGNORECASE)
    if m:
        return _xml_unescape(m.group(1))
    m = re.search(rf'<newznab:attr\s+name="{name}"\s+value="([^"]*)"', xml, re.IGNORECASE)
    if m:
        return _xml_unescape(m.group(1))
    return ""


def _xml_unescape(s: str) -> str:
    """Unescape basic XML entities."""
    return (s.replace("&amp;", "&").replace("&lt;", "<")
             .replace("&gt;", ">").replace("&quot;", '"')
             .replace("&apos;", "'"))


# ---------------------------------------------------------------------------
# QBitClient — qBittorrent Web API
# ---------------------------------------------------------------------------

class QBitClient:
    """
    qBittorrent Web API client (v2 API).

    Communicates via HTTP to the user's running qBittorrent WebUI on localhost.
    Uses stdlib urllib only — no third-party dependencies.
    """

    def __init__(self, base_url: str):
        self._base = base_url.rstrip("/")
        self._sid: str | None = None

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
        """Get list of torrents."""
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
        """Add a torrent via magnet URI."""
        data = {"urls": uri}
        if save_path:
            data["savepath"] = save_path
        status, _ = _http_post(
            self._url("/api/v2/torrents/add"),
            data=data,
            headers=self._headers(),
        )
        return status == 200

    def pause(self, hashes: str | list[str]) -> bool:
        if isinstance(hashes, list):
            hashes = "|".join(hashes)
        status, _ = _http_post(
            self._url("/api/v2/torrents/pause"),
            data={"hashes": hashes},
            headers=self._headers(),
        )
        return status == 200

    def resume(self, hashes: str | list[str]) -> bool:
        if isinstance(hashes, list):
            hashes = "|".join(hashes)
        status, _ = _http_post(
            self._url("/api/v2/torrents/resume"),
            data={"hashes": hashes},
            headers=self._headers(),
        )
        return status == 200

    def delete(self, hashes: str | list[str], delete_files: bool = False) -> bool:
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


# ---------------------------------------------------------------------------
# JackettClient — Jackett Torznab API
# ---------------------------------------------------------------------------

class JackettClient:
    """
    Jackett Torznab API client.

    Communicates via HTTP to the user's running Jackett instance on localhost.
    Parses Torznab XML responses (same format used by Sonarr/Radarr).
    """

    def __init__(self, base_url: str, api_key: str):
        self._base = base_url.rstrip("/")
        self._api_key = api_key

    def _url(self, path: str) -> str:
        return f"{self._base}{path}"

    def health(self) -> bool:
        """Check if Jackett is reachable."""
        url = self._url(f"/api/v2.0/indexers/all/results/torznab/api?t=caps&apikey={urllib.parse.quote(self._api_key)}")
        status, _ = _http_get(url, timeout=5)
        return 200 <= status < 400

    def search(self, query: str, indexer: str = "all",
               categories: str = "", limit: int = 40) -> list[dict]:
        """Search via Jackett Torznab API."""
        params = {
            "apikey": self._api_key,
            "t": "search",
            "q": query,
            "limit": str(limit),
        }
        if categories:
            params["cat"] = categories

        qs = urllib.parse.urlencode(params)
        url = self._url(f"/api/v2.0/indexers/{urllib.parse.quote(indexer)}/results/torznab/api?{qs}")
        status, body = _http_get(url, timeout=30)

        if status != 200:
            return []

        return self._parse_torznab_xml(body)

    def list_indexers(self) -> list[dict]:
        """Get list of configured indexers from Jackett."""
        url = self._url(f"/api/v2.0/indexers?apikey={urllib.parse.quote(self._api_key)}&configured=true")
        status, body = _http_get(url, timeout=10)
        if status != 200:
            return []
        try:
            raw = json.loads(body)
            results = []
            seen = set()
            for row in raw:
                ix_id = str(row.get("id", row.get("ID", row.get("identifier", ""))))
                if not ix_id or ix_id.lower() in seen:
                    continue
                seen.add(ix_id.lower())
                name = str(row.get("title", row.get("name", row.get("displayName", "")))) or ix_id
                results.append({
                    "id": ix_id,
                    "name": name,
                    "enabled": True,
                    "provider": "jackett",
                })
            return results
        except (json.JSONDecodeError, TypeError):
            return []

    @staticmethod
    def _parse_torznab_xml(xml: str) -> list[dict]:
        """Parse Torznab XML response into normalized result dicts."""
        results = []
        item_re = re.compile(r'<item\b[\s\S]*?</item>', re.IGNORECASE)
        for m in item_re.finditer(xml):
            item = m.group(0)

            title = _xml_text(item, "title")
            if not title:
                continue

            enc_match = re.search(r'<enclosure[^>]*url="(magnet:[^"]+)"', item, re.IGNORECASE)
            link = _xml_text(item, "link")
            magnet = ""
            if enc_match:
                magnet = _xml_unescape(enc_match.group(1))
            elif link and link.startswith("magnet:"):
                magnet = link

            if not magnet:
                continue

            size = _xml_torznab_attr(item, "size") or _xml_text(item, "size")
            seeders = _xml_torznab_attr(item, "seeders")
            files = _xml_torznab_attr(item, "files")
            source = _xml_torznab_attr(item, "indexer") or _xml_torznab_attr(item, "tracker") or ""

            results.append({
                "id": f"jackett_{hash(title + magnet) & 0xFFFFFFFF:08x}",
                "title": title,
                "sizeBytes": int(size) if size and size.isdigit() else 0,
                "seeders": int(seeders) if seeders and seeders.isdigit() else 0,
                "fileCount": int(files) if files and files.isdigit() else None,
                "magnetUri": magnet,
                "downloadUrl": magnet,
                "sourceName": source or "Jackett",
                "provider": "jackett",
            })

        return results


# ---------------------------------------------------------------------------
# Detection helpers (user's running instances)
# ---------------------------------------------------------------------------

def _detect_running_qbit() -> int | None:
    """Check if qBittorrent WebUI is already running on a known port."""
    for port in [8080, 8081, 9090]:
        status, _ = _http_get(f"http://127.0.0.1:{port}/api/v2/app/version", timeout=1)
        if 200 <= status < 400:
            return port
    return None


def _detect_running_jackett() -> tuple[int, str] | None:
    """Check if Jackett is already running on a known port. Returns (port, "")."""
    for port in [9117, 9118]:
        status, _ = _http_get(f"http://127.0.0.1:{port}/api/v2.0/server/config", timeout=2)
        if 200 <= status < 400:
            return port, ""
    return None


def _jackett_config_path() -> str:
    """Path to our Jackett config cache (stores base_url and api_key)."""
    return storage.data_path("jackett_config.json")


def detect_jackett() -> JackettClient | None:
    """
    Detect a running Jackett instance.

    Jackett is NOT bundled — the user must install it themselves.
    We detect it if it's already running on common ports,
    or if the user has configured it manually in settings.
    """
    cache_path = _jackett_config_path()
    cached = storage.read_json(cache_path, {})
    base_url = cached.get("base_url", "")
    api_key = cached.get("api_key", "")

    if base_url and api_key:
        client = JackettClient(base_url, api_key)
        if client.health():
            print(f"[torrent] Jackett: using saved config at {base_url}")
            return client

    result = _detect_running_jackett()
    if result:
        port, _ = result
        base_url = f"http://127.0.0.1:{port}"
        status, body = _http_get(f"{base_url}/api/v2.0/server/config", timeout=5)
        if status == 200:
            try:
                cfg = json.loads(body)
                api_key = cfg.get("api_key", "") or cfg.get("APIKey", "")
            except (json.JSONDecodeError, TypeError):
                pass

        if api_key:
            storage.write_json_sync(cache_path, {"base_url": base_url, "api_key": api_key})
            client = JackettClient(base_url, api_key)
            print(f"[torrent] Jackett: detected at {base_url}")
            return client
        else:
            print(f"[torrent] Jackett: found at port {port} but no API key")
            return None

    return None
