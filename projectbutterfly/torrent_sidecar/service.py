"""Minimal torrent sidecar HTTP scaffold (Phase 2).

Current implementation only exposes health + placeholder endpoints.
It is intentionally non-destructive and does not yet run a torrent engine.
"""

from __future__ import annotations

import argparse
import json
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer


class SidecarHandler(BaseHTTPRequestHandler):
    server_version = "TankoTorrentSidecar/0.1"

    def _write_json(self, code: int, payload: dict):
        body = json.dumps(payload).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _read_json_body(self):
        length = int(self.headers.get("Content-Length", "0") or 0)
        if length <= 0:
            return {}
        data = self.rfile.read(length)
        try:
            obj = json.loads(data.decode("utf-8", errors="replace"))
            return obj if isinstance(obj, dict) else {}
        except Exception:
            return {}

    def do_GET(self):
        if self.path == "/health":
            self._write_json(200, {"ok": True, "service": "torrent_sidecar", "version": "0.1", "ready": False})
            return
        self._write_json(404, {"ok": False, "error": "not_found"})

    def do_POST(self):
        payload = self._read_json_body()
        if self.path in (
            "/resolve/start",
            "/resolve/status",
            "/resolve/cancel",
            "/torrents/start-configured",
            "/torrents/select-files",
            "/torrents/set-destination",
            "/torrents/add-to-video-library",
            "/torrents/list-active",
            "/torrents/list-history",
            "/torrents/remove",
            "/torrents/stream-file",
        ):
            self._write_json(501, {
                "ok": False,
                "error": "not_implemented",
                "path": self.path,
                "payloadEcho": payload,
            })
            return
        self._write_json(404, {"ok": False, "error": "not_found"})

    def log_message(self, fmt, *args):
        # Keep the sidecar silent in normal app runs.
        return


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8765)
    args = parser.parse_args()

    server = ThreadingHTTPServer((args.host, int(args.port)), SidecarHandler)
    try:
        server.serve_forever(poll_interval=0.5)
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
