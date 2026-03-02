"""
FlareSolverr-compatible HTTP server for Prowlarr integration.

Prowlarr natively supports FlareSolverr as an indexer proxy.  This module
implements a minimal FlareSolverr-compatible API that routes Cloudflare
challenge solving through our CfSolver (hidden QWebEngineView).

The server runs on a random local port and exposes:
  POST /v1  — FlareSolverr solve endpoint
  GET  /    — health check (returns version info)

Usage:
    server = FlareSolverrBridge(profile, parent=qobject)
    server.start()          # starts HTTP server in background thread
    print(server.port)      # port number for Prowlarr config
    server.stop()           # shutdown
"""

import json
import socket
import threading
import time
from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse

from PySide6.QtCore import QObject, Signal, Slot, QTimer, QUrl
from PySide6.QtWebEngineCore import QWebEngineProfile

from cf_solver import CfSolver

# FlareSolverr version we pretend to be
_VERSION = "3.3.21"


def _find_free_port(lo=11000, hi=11100):
    """Find a free TCP port in the given range."""
    for port in range(lo, hi):
        try:
            with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
                s.bind(("127.0.0.1", port))
                return port
        except OSError:
            continue
    # Fallback: let OS pick
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


class _SolveRequest:
    """Tracks one pending solve request from the HTTP thread."""

    def __init__(self, url, max_timeout):
        self.url = url
        self.max_timeout = max_timeout
        self.event = threading.Event()
        self.result = None  # set by main thread
        self.error = None   # set by main thread
        self.cookies = []   # list of cookie dicts
        self.user_agent = ""


class FlareSolverrBridge(QObject):
    """
    Bridges Prowlarr's FlareSolverr requests to our CfSolver.

    Must be created on the main Qt thread (needs QWebEngineProfile access).
    The HTTP server runs in a daemon thread; solve requests are dispatched
    back to the main thread via Qt signals.
    """

    # Internal signal: HTTP thread -> main thread
    _solve_requested = Signal(object)  # _SolveRequest

    def __init__(self, profile: QWebEngineProfile, parent=None):
        super().__init__(parent)
        self._profile = profile
        self._port = 0
        self._server = None
        self._thread = None
        self._solver = None
        self._current_request = None

        # Connect internal signal
        self._solve_requested.connect(self._on_solve_requested)

    @property
    def port(self):
        return self._port

    @property
    def url(self):
        return f"http://127.0.0.1:{self._port}" if self._port else ""

    def start(self):
        """Start the HTTP server on a background thread."""
        self._port = _find_free_port()
        bridge = self  # captured by handler

        class Handler(BaseHTTPRequestHandler):
            def log_message(self, fmt, *args):
                pass  # suppress request logs

            def do_GET(self):
                # Health check
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                resp = {
                    "msg": "FlareSolverr is ready!",
                    "version": _VERSION,
                    "userAgent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                                 "AppleWebKit/537.36 (KHTML, like Gecko) "
                                 "Chrome/131.0.0.0 Safari/537.36",
                }
                self.wfile.write(json.dumps(resp).encode())

            def do_POST(self):
                length = int(self.headers.get("Content-Length", 0))
                body = self.rfile.read(length) if length else b""
                try:
                    data = json.loads(body) if body else {}
                except Exception:
                    data = {}

                cmd = data.get("cmd", "")
                url = data.get("url", "")
                max_timeout = data.get("maxTimeout", 60000)

                if cmd not in ("request.get", "request.post"):
                    self.send_response(200)
                    self.send_header("Content-Type", "application/json")
                    self.end_headers()
                    resp = {
                        "status": "error",
                        "message": f"Unknown command: {cmd}",
                        "solution": {},
                    }
                    self.wfile.write(json.dumps(resp).encode())
                    return

                if not url:
                    self.send_response(200)
                    self.send_header("Content-Type", "application/json")
                    self.end_headers()
                    resp = {
                        "status": "error",
                        "message": "No URL provided",
                        "solution": {},
                    }
                    self.wfile.write(json.dumps(resp).encode())
                    return

                print(f"[flaresolverr] Solving CF challenge for: {url}")

                # Create request object and dispatch to main thread
                req = _SolveRequest(url, max_timeout)
                bridge._solve_requested.emit(req)

                # Wait for the main thread to solve it
                timeout_s = (max_timeout / 1000) + 5  # extra buffer
                req.event.wait(timeout=timeout_s)

                if req.error:
                    print(f"[flaresolverr] Solve failed: {req.error}")
                    self.send_response(200)
                    self.send_header("Content-Type", "application/json")
                    self.end_headers()
                    resp = {
                        "status": "error",
                        "message": req.error,
                        "solution": {},
                    }
                    self.wfile.write(json.dumps(resp).encode())
                    return

                # Build FlareSolverr response
                parsed = urlparse(url)
                resp = {
                    "status": "ok",
                    "message": "",
                    "startTimestamp": int(time.time() * 1000) - max_timeout,
                    "endTimestamp": int(time.time() * 1000),
                    "version": _VERSION,
                    "solution": {
                        "url": url,
                        "status": 200,
                        "headers": {},
                        "response": "",
                        "cookies": req.cookies,
                        "userAgent": req.user_agent or (
                            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                            "AppleWebKit/537.36 (KHTML, like Gecko) "
                            "Chrome/131.0.0.0 Safari/537.36"
                        ),
                    },
                }

                print(f"[flaresolverr] Solved! Returning {len(req.cookies)} cookies")
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(json.dumps(resp).encode())

        self._server = HTTPServer(("127.0.0.1", self._port), Handler)
        self._thread = threading.Thread(target=self._server.serve_forever, daemon=True)
        self._thread.start()
        print(f"[flaresolverr] FlareSolverr bridge listening on port {self._port}")

    def stop(self):
        """Shutdown the HTTP server."""
        if self._server:
            self._server.shutdown()
            self._server = None
        if self._solver:
            self._solver.cancel()
            self._solver = None

    @Slot(object)
    def _on_solve_requested(self, req: _SolveRequest):
        """Main-thread handler: starts CfSolver for the request."""
        self._current_request = req

        # Create solver (reuse profile so cookies are shared)
        if self._solver:
            self._solver.cancel()

        self._solver = CfSolver(self._profile, parent=self)
        self._solver.solved.connect(lambda url: self._on_solved(url, req))
        self._solver.failed.connect(lambda url, reason: self._on_failed(url, reason, req))

        # Use the request's timeout
        self._solver.solve(req.url, timeout_ms=req.max_timeout)

    def _on_solved(self, url, req):
        """Called on main thread when CF challenge is solved."""
        req.user_agent = (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/131.0.0.0 Safari/537.36"
        )

        parsed = urlparse(url)
        domain = parsed.hostname or ""

        # Collect cookies asynchronously via loadAllCookies + cookieAdded
        store = self._profile.cookieStore()
        collected = []

        def _domain_match(cookie_domain, target):
            """Check if a cookie domain matches the target (handles leading dots)."""
            cd = cookie_domain.lstrip(".")
            td = target.lstrip(".")
            return cd == td or td.endswith("." + cd) or cd.endswith("." + td)

        def on_cookie(cookie):
            c_domain = bytes(cookie.domain()).decode("utf-8", errors="replace")
            if not _domain_match(c_domain, domain):
                return
            collected.append({
                "name": bytes(cookie.name()).decode("utf-8", errors="replace"),
                "value": bytes(cookie.value()).decode("utf-8", errors="replace"),
                "domain": c_domain,
                "path": bytes(cookie.path()).decode("utf-8", errors="replace"),
                "secure": cookie.isSecure(),
                "httpOnly": cookie.isHttpOnly(),
                "sameSite": "None",
                "expiry": -1,
            })

        store.cookieAdded.connect(on_cookie)
        store.loadAllCookies()

        def finalize():
            try:
                store.cookieAdded.disconnect(on_cookie)
            except (RuntimeError, TypeError):
                pass
            req.cookies = collected
            print(f"[flaresolverr] Collected {len(collected)} cookies for {domain}")
            req.event.set()

        QTimer.singleShot(500, finalize)

    def _on_failed(self, url, reason, req):
        """Called on main thread when CF solve fails."""
        req.error = f"Challenge solving failed: {reason}"
        req.event.set()
