"""
Project Butterfly — App Shell

PySide6 replacement for main.js + main/index.js.
Creates QMainWindow with QStackedWidget hosting:
  - Index 0: QWebEngineView (existing renderer UI from src/index.html)
  - Index 1: MpvRenderHost (native mpv widget for inline video playback)

Handles:
  - App lifecycle, single-instance lock (QLocalServer)
  - Window creation (frameless, maximized, dark background)
  - Section-based boot routing (?appSection= query parameter)
  - QWebChannel bridge wiring (bridge.py)
  - Bridge Qt object injection (PlayerBridge, WebFindBridge, etc.)
  - DevTools policy
  - Quit cleanup (player shutdown, tor kill, flush writes)
"""

import argparse
import json
import os
import subprocess
import sys
import threading
import time
from pathlib import Path

from PySide6.QtCore import Qt, QUrl, QTimer
from PySide6.QtGui import QColor, QIcon
from PySide6.QtNetwork import QLocalServer, QLocalSocket
from PySide6.QtWidgets import QApplication, QMainWindow, QStackedWidget, QWidget
from PySide6.QtWebEngineWidgets import QWebEngineView
from PySide6.QtWebEngineCore import QWebEnginePage, QWebEngineProfile, QWebEngineSettings

import storage
import bridge as bridge_module
from player_ui import MpvContainer
from flaresolverr_bridge import FlareSolverrBridge

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

APP_NAME = "Tankoban"
SOCKET_NAME = "TankobanButterfly"

# Resolve paths relative to the project root (one level up from projectbutterfly/)
_HERE = Path(__file__).resolve().parent
PROJECT_ROOT = _HERE.parent
SRC_DIR = PROJECT_ROOT / "src"
INDEX_HTML = SRC_DIR / "index.html"
ICON_PATH = PROJECT_ROOT / "build" / "icon.png"

# ---------------------------------------------------------------------------
# Section aliases (mirrored from main/index.js)
# ---------------------------------------------------------------------------

APP_SECTION_ALIASES = {
    "comics": "comic",
    "comic-reader": "comic",
    "reader": "comic",
    "books": "book",
    "book-reader": "book",
    "audiobooks": "audiobook",
    "audiobook-reader": "audiobook",
    "videos": "video",
    "video-player": "video",
    "web": "browser",
    "web-browser": "browser",
    "sources": "sources",
}

VALID_SECTIONS = frozenset(
    ["shell", "library", "comic", "book", "audiobook", "video", "browser", "sources", "torrent"]
)

VIDEO_EXTENSIONS = frozenset(
    [".mp4", ".mkv", ".avi", ".mov", ".m4v", ".webm", ".ts", ".m2ts",
     ".wmv", ".flv", ".mpeg", ".mpg", ".3gp"]
)

COMIC_EXTENSIONS = frozenset([".cbz", ".cbr"])
BOOK_EXTENSIONS = frozenset(getattr(
    bridge_module,
    "BOOK_EXTENSIONS",
    [".epub", ".pdf", ".txt", ".mobi", ".fb2"],
))


def normalize_section(raw: str) -> str:
    key = (raw or "").strip().lower()
    if not key:
        return ""
    mapped = APP_SECTION_ALIASES.get(key, key)
    return mapped if mapped in VALID_SECTIONS else ""


def is_video_path(p: str) -> bool:
    return Path(p).suffix.lower() in VIDEO_EXTENSIONS


def is_comic_path(p: str) -> bool:
    return Path(p).suffix.lower() in COMIC_EXTENSIONS


def is_book_path(p: str) -> bool:
    return Path(p).suffix.lower() in BOOK_EXTENSIONS


# ---------------------------------------------------------------------------
# User data directory selection
# Mirrors pickUserDataDir() from main/index.js — picks the most data-rich
# candidate across historical app name variants.
# ---------------------------------------------------------------------------

def _score_user_data_dir(d: str) -> int:
    """Score a userData candidate by how much real user data it contains."""
    dp = Path(d)
    if not dp.is_dir():
        return -1

    score = 0

    def stat_score(filename: str, weight: float) -> int:
        fp = dp / filename
        try:
            sz = fp.stat().st_size
            return int(min(200, sz // 1024) * weight)
        except OSError:
            return 0

    score += stat_score("library_state.json", 1)
    score += stat_score("library_index.json", 1)
    score += stat_score("video_index.json", 1)
    score += stat_score("progress.json", 0.5)

    def read_json_safe(filename: str):
        try:
            with open(dp / filename, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            return None

    lib_state = read_json_safe("library_state.json")
    if isinstance(lib_state, dict):
        score += 50
        for key in ("rootFolders", "seriesFolders", "videoFolders"):
            items = lib_state.get(key, [])
            if isinstance(items, list) and items:
                score += 500 + len(items) * 10

    lib_index = read_json_safe("library_index.json")
    if isinstance(lib_index, dict):
        score += 25
        books = lib_index.get("books", [])
        series = lib_index.get("series", [])
        if isinstance(books, list):
            score += min(500, len(books)) * 2
        if isinstance(series, list):
            score += min(200, len(series)) * 5

    video_index = read_json_safe("video_index.json")
    if isinstance(video_index, dict):
        score += 25
        shows = video_index.get("shows", [])
        episodes = video_index.get("episodes", [])
        if isinstance(shows, list):
            score += min(200, len(shows)) * 5
        if isinstance(episodes, list):
            score += min(500, len(episodes)) * 1

    return score


def pick_user_data_dir() -> str:
    """Pick the userData dir with the most real user data across name variants."""
    if sys.platform == "win32":
        base = Path(os.environ.get("APPDATA", Path.home() / "AppData" / "Roaming"))
    elif sys.platform == "darwin":
        base = Path.home() / "Library" / "Application Support"
    else:
        base = Path(os.environ.get("XDG_CONFIG_HOME", Path.home() / ".config"))

    candidates = [
        base / "Tankoban",
        base / "Tankoban Max",
        base / "Tankoban Pro",
        base / "Tankoban Plus",
        base / "TankobanPlus",
        base / "manga-scroller",
        base / "manga_scroller",
        base / "Manga-Scroller",
    ]

    # De-dup preserving order
    seen = set()
    unique = []
    for c in candidates:
        s = str(c)
        if s not in seen:
            seen.add(s)
            unique.append(s)

    best = unique[0]
    best_score = _score_user_data_dir(best)
    for c in unique[1:]:
        s = _score_user_data_dir(c)
        if s > best_score:
            best_score = s
            best = c

    return best


# ---------------------------------------------------------------------------
# WebEngine page that logs console messages (mirrors Electron's console-message)
# ---------------------------------------------------------------------------

class TankobanWebPage(QWebEnginePage):
    """Custom page to intercept console messages and navigation."""

    def javaScriptConsoleMessage(self, level, message, line, source):
        # Mirror Electron: pipe [TTS-BAR] logs to stdout
        if "[TTS-BAR]" in message:
            print(message)


# ---------------------------------------------------------------------------
# Main Window
# ---------------------------------------------------------------------------

class TankobanWindow(QMainWindow):
    """
    Main application window.

    QStackedWidget with two layers:
      index 0 = QWebEngineView  (existing renderer UI)
      index 1 = MpvContainer    (mpv native render surface)
    """

    def __init__(self, app_section: str = "", dev_tools: bool = False):
        super().__init__()

        self._app_section = app_section  # Stored for post-load routing
        self._renderer_loaded = False
        self._pending_open_queue = []
        self._pending_sources_activate = False

        self.setWindowTitle(APP_NAME)
        self.setMinimumSize(800, 600)
        self.resize(1200, 800)
        self.setStyleSheet("background-color: #000000;")

        # Window icon
        if ICON_PATH.exists():
            self.setWindowIcon(QIcon(str(ICON_PATH)))

        # Frameless window (matches Electron's frame: false)
        self.setWindowFlags(
            Qt.WindowType.Window
            | Qt.WindowType.FramelessWindowHint
            | Qt.WindowType.WindowMinMaxButtonsHint
        )

        # --- Stacked widget ---
        self._stack = QStackedWidget()
        self.setCentralWidget(self._stack)

        # --- QWebEngineView (layer 0) ---
        self._profile = QWebEngineProfile.defaultProfile()
        self._profile.setPersistentStoragePath(
            os.path.join(storage.data_path(""), "WebEngine")
        )
        # Set a real Chrome User-Agent so sites don't flag us as a bot.
        # Default QtWebEngine UA contains "QtWebEngine" which triggers captchas.
        self._profile.setHttpUserAgent(
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/131.0.0.0 Safari/537.36"
        )

        self._web_page = TankobanWebPage(self._profile, self)
        self._web_page.setBackgroundColor(QColor(32, 33, 36))  # prevent blank flash on minimize/restore
        self._web_view = QWebEngineView()
        self._web_view.setPage(self._web_page)
        self._web_view.setAttribute(Qt.WidgetAttribute.WA_OpaquePaintEvent, True)

        # Web settings matching Electron's BrowserWindow webPreferences
        settings = self._web_view.settings()
        settings.setAttribute(QWebEngineSettings.WebAttribute.LocalContentCanAccessRemoteUrls, True)
        settings.setAttribute(QWebEngineSettings.WebAttribute.LocalContentCanAccessFileUrls, True)
        settings.setAttribute(QWebEngineSettings.WebAttribute.JavascriptEnabled, True)
        settings.setAttribute(QWebEngineSettings.WebAttribute.LocalStorageEnabled, True)

        self._stack.addWidget(self._web_view)  # index 0

        # --- QWebChannel bridge (replaces Electron preload + ipcMain) ---
        # Must be created before MpvContainer so player bridge exists.
        self._bridge = bridge_module.setup_bridge(self._web_view, self)

        # --- MpvContainer (layer 1) ---
        # Hosts the mpv render surface + control widgets as direct siblings.
        # No covering overlay — controls are raised above the native HWND.
        self._mpv_container = MpvContainer(self._bridge.player, self)
        self._stack.addWidget(self._mpv_container)  # index 1

        # --- External Tanko Browser launcher state ---
        self._aspect_proc: subprocess.Popen | None = None
        self._aspect_launch_lock = threading.Lock()

        # --- FlareSolverr bridge (Cloudflare solver for Prowlarr) ---
        # Must be created on main thread (uses QWebEngineProfile).
        # Uses same profile as browser tabs so cookies are shared.
        self._flaresolverr = FlareSolverrBridge(self._profile, parent=self)
        self._flaresolverr.start()

        # --- Wire bridge instances with live Qt objects ---
        self._bridge.player.setMpvWidget(
            self._mpv_container.get_render_widget(),
            self.show_player,
            self.show_web_view,
        )
        self._bridge.player.setProgressDomain(self._bridge.videoProgress)

        # Wire MpvContainer signals
        self._mpv_container.request_fullscreen.connect(self.toggle_fullscreen)
        self._mpv_container.request_minimize.connect(self.showMinimized)
        self._mpv_container.request_back.connect(self.show_web_view)

        self._bridge.webFind.setPage(self._web_page)
        self._bridge.webBrowserActions.setPage(self._web_page)
        self._bridge.webData.setProfile(self._profile)

        # --- DevTools ---
        self._dev_tools = dev_tools
        self._dev_tools_view: QWebEngineView | None = None

        # --- Load renderer ---
        url = QUrl.fromLocalFile(str(INDEX_HTML))
        query_parts = []
        if app_section and app_section != "shell":
            query_parts.append(f"appSection={app_section}")
        if query_parts:
            url.setQuery("&".join(query_parts))

        self._web_view.load(url)

        # Show maximized once page loads (mirrors Electron: show(), maximize())
        self._web_view.loadFinished.connect(self._on_load_finished)

    def _on_load_finished(self, ok: bool):
        if ok:
            self._renderer_loaded = True
            self.show()
            self.showMaximized()
            QTimer.singleShot(350, self._flush_open_file_queue)
            if self._pending_sources_activate:
                QTimer.singleShot(0, self.activate_sources_mode)
            # Periodic compositor keepalive — nudge the QWebEngineView every
            # 30 s so Chromium never classifies the page as frozen/occluded.
            # Belt-and-suspenders alongside the --disable-renderer-backgrounding
            # flags, because Qt's Chromium can still stall on Windows (QTBUG-56016).
            self._keepalive = QTimer(self)
            self._keepalive.timeout.connect(self._nudge_web_view)
            self._keepalive.start(30_000)
        else:
            print(f"[butterfly] Failed to load renderer: {INDEX_HTML}")
            self.show()

    # --- Player widget switching ---

    def show_web_view(self):
        """Switch to the web UI layer."""
        self._stack.setCurrentIndex(0)

    def activate_sources_mode(self):
        """
        Activate in-app Sources mode inside the renderer shell.

        This keeps Sources as a first-class app section (same window/shell),
        without spawning an external browser process.
        """
        self.show_web_view()
        if not self._renderer_loaded:
            self._pending_sources_activate = True
            return {"ok": True, "deferred": True, "mode": "sources"}

        self._pending_sources_activate = False
        js = r"""
            (function () {
              function _ensureWebModules() {
                try {
                  var d = window.Tanko && window.Tanko.deferred ? window.Tanko.deferred : null;
                  if (d && typeof d.ensureWebModulesLoadedLegacy === 'function') {
                    return Promise.resolve(d.ensureWebModulesLoadedLegacy());
                  }
                  if (d && typeof d.ensureWebModulesLoaded === 'function') {
                    return Promise.resolve(d.ensureWebModulesLoaded());
                  }
                } catch (_e) {}
                return Promise.resolve();
              }
              _ensureWebModules().then(function () {
                try {
                  if (window.Tanko && window.Tanko.modeRouter && typeof window.Tanko.modeRouter.setMode === 'function') {
                    window.Tanko.modeRouter.setMode('sources', { force: true });
                  } else if (typeof window.setMode === 'function') {
                    window.setMode('sources');
                  }
                } catch (_eMode) {}
                try {
                  if (window.Tanko && window.Tanko.sources && typeof window.Tanko.sources.openSources === 'function') {
                    window.Tanko.sources.openSources();
                  }
                } catch (_eSources) {}
              });
            })();
        """
        try:
            self._web_page.runJavaScript(js)
            return {"ok": True, "mode": "sources"}
        except Exception as e:
            return {"ok": False, "error": str(e)}

    def show_player(self):
        """Switch to the mpv player layer and give keyboard focus to container."""
        self._stack.setCurrentIndex(1)
        try:
            self._mpv_container.setFocus(Qt.FocusReason.OtherFocusReason)
            self._mpv_container._show_controls()
        except Exception:
            pass

    # --- External open / argv forwarding ---

    def queue_open_files(self, paths, source: str = "os"):
        clean = []
        for p in paths or []:
            s = str(p or "").strip()
            if s:
                clean.append(s)
        if not clean:
            return False
        self._pending_open_queue.append({
            "paths": clean,
            "source": str(source or "os"),
        })
        if self._renderer_loaded:
            QTimer.singleShot(0, self._flush_open_file_queue)
        return True

    def _flush_open_file_queue(self):
        if not self._pending_open_queue:
            return
        while self._pending_open_queue:
            item = self._pending_open_queue.pop(0)
            try:
                self._dispatch_open_files(item.get("paths", []), item.get("source", "os"))
            except Exception as e:
                print(f"[butterfly] Failed to dispatch open files: {e}")

    def _dispatch_open_files(self, paths, source: str = "os"):
        # First supported file wins, mirroring renderer external-open behavior.
        for raw in paths or []:
            p = str(raw or "").strip()
            if not p:
                continue
            if is_comic_path(p):
                self.show_web_view()
                self._bridge.library.emit_app_open_files([p], source=source)
                return True
            if is_book_path(p):
                self.show_web_view()
                self._bridge.library.emit_app_open_files([p], source=source)
                return True
            if is_video_path(p):
                out = self._open_video_path(p, source=source)
                return bool(isinstance(out, dict) and out.get("ok"))
        print(f"[butterfly] No supported files in payload: {paths}")
        return False

    def _open_video_path(self, file_path: str, source: str = "os"):
        payload = {
            "filePath": str(file_path),
            "startSeconds": 0,
            "sessionId": str(int(time.time() * 1000)),
            "source": str(source or "os"),
        }
        raw = self._bridge.player.launchQt(json.dumps(payload))
        try:
            out = json.loads(raw) if isinstance(raw, str) else raw
        except Exception:
            out = {"ok": False, "error": "invalid_player_response"}
        if not isinstance(out, dict):
            out = {"ok": False, "error": "invalid_player_response"}
        if not out.get("ok"):
            print(f"[butterfly] Video launch failed: {out}")
        return out

    # --- External Tanko Browser launch ---

    def _resolve_aspect_browser_dir(self) -> Path | None:
        env_dir = str(os.environ.get("TANKO_BROWSER_DIR", "") or "").strip()
        candidates = []
        if env_dir:
            candidates.append(Path(env_dir))
        candidates.extend([
            PROJECT_ROOT.parent / "aspect-browser",
            PROJECT_ROOT / "apps" / "aspect-browser",
            Path(r"D:\Hemanth's Folder\aspect-browser"),
        ])
        for c in candidates:
            try:
                if c.is_dir():
                    return c
            except Exception:
                continue
        return None

    def _spawn_detached(self, argv, cwd: Path | None = None) -> subprocess.Popen:
        kwargs = {
            "stdin": subprocess.DEVNULL,
            "stdout": subprocess.DEVNULL,
            "stderr": subprocess.DEVNULL,
            "cwd": str(cwd) if cwd else None,
        }
        if sys.platform == "win32":
            flags = getattr(subprocess, "DETACHED_PROCESS", 0) | getattr(subprocess, "CREATE_NEW_PROCESS_GROUP", 0)
            kwargs["creationflags"] = flags
        return subprocess.Popen(argv, **kwargs)

    def launch_tanko_browser(self):
        """
        Launch external Aspect browser (Tanko Browser).
        Reuses an existing spawned process if it is still running.
        """
        with self._aspect_launch_lock:
            if self._aspect_proc is not None:
                try:
                    if self._aspect_proc.poll() is None:
                        return {"ok": True, "alreadyRunning": True}
                except Exception:
                    pass
                self._aspect_proc = None

            aspect_dir = self._resolve_aspect_browser_dir()
            if not aspect_dir:
                return {
                    "ok": False,
                    "error": "Aspect browser directory not found. Set TANKO_BROWSER_DIR or place it at D:\\Hemanth's Folder\\aspect-browser",
                }

            package_json = aspect_dir / "package.json"
            if package_json.is_file():
                try:
                    electron_exe_candidates = [
                        aspect_dir / "node_modules" / "electron" / "dist" / "electron.exe",
                        aspect_dir / "node_modules" / ".bin" / "electron.exe",
                    ]
                    electron_exe = None
                    for c in electron_exe_candidates:
                        if c.is_file():
                            electron_exe = c
                            break
                    if electron_exe:
                        self._aspect_proc = self._spawn_detached([str(electron_exe), "."], cwd=aspect_dir)
                        print(f"[tanko-browser] launched via electron binary: {electron_exe}")
                        return {"ok": True, "launcher": "electron", "cwd": str(aspect_dir)}
                except Exception as e:
                    return {"ok": False, "error": f"Failed to launch Aspect via local electron binary: {e}"}

            exe_candidates = [
                aspect_dir / "Tankoban Browser.exe",
                aspect_dir / "TankoBrowser.exe",
                aspect_dir / "Aspect Browser.exe",
                aspect_dir / "dist" / "Tankoban Browser.exe",
                aspect_dir / "dist" / "TankoBrowser.exe",
                aspect_dir / "dist" / "Aspect Browser.exe",
                aspect_dir / "dist" / "win-unpacked" / "Tankoban Browser.exe",
                aspect_dir / "dist" / "win-unpacked" / "TankoBrowser.exe",
                aspect_dir / "dist" / "win-unpacked" / "Aspect Browser.exe",
            ]
            for exe in exe_candidates:
                try:
                    if exe.is_file():
                        self._aspect_proc = self._spawn_detached([str(exe)], cwd=exe.parent)
                        print(f"[tanko-browser] launched via executable: {exe}")
                        return {"ok": True, "launcher": "exe", "path": str(exe)}
                except Exception as e:
                    return {"ok": False, "error": f"Failed to launch {exe}: {e}"}

            return {
                "ok": False,
                "error": f"No launch target found in {aspect_dir}. Expected *.exe or package.json",
            }

    # --- DevTools ---

    def toggle_dev_tools(self):
        if not self._dev_tools:
            return
        if self._dev_tools_view is None:
            self._dev_tools_view = QWebEngineView()
            self._web_page.setDevToolsPage(self._dev_tools_view.page())
        if self._dev_tools_view.isVisible():
            self._dev_tools_view.hide()
        else:
            self._dev_tools_view.show()

    # --- Window controls (called from bridge.py via QWebChannel) ---

    def set_fullscreen(self, on: bool):
        if on:
            self.showFullScreen()
        else:
            self.showMaximized()

    def toggle_fullscreen(self):
        self.set_fullscreen(not self.isFullScreen())

    # Handle window state transitions:
    # 1. Restore to maximized when leaving fullscreen (matches Electron behavior)
    # 2. Nudge QWebEngineView after restore from minimized (Chromium compositor
    #    stops submitting frames while occluded — QTBUG-56016 / QTBUG-50818)
    def changeEvent(self, event):
        super().changeEvent(event)
        if event.type() == event.Type.WindowStateChange:
            old = event.oldState()
            cur = self.windowState()

            # Left fullscreen → restore to maximized
            if (old & Qt.WindowState.WindowFullScreen) and not (cur & Qt.WindowState.WindowFullScreen):
                if not (cur & Qt.WindowState.WindowMaximized):
                    QTimer.singleShot(0, self.showMaximized)

            # Restored from minimized → nudge web view to unfreeze Chromium
            if (old & Qt.WindowState.WindowMinimized) and not (cur & Qt.WindowState.WindowMinimized):
                QTimer.singleShot(0, self._nudge_web_view)

    def _nudge_web_view(self):
        """Force Chromium compositor to resume rendering after minimize/restore."""
        v = self._web_view
        v.resize(v.width() + 1, v.height())
        v.resize(v.width() - 1, v.height())

    def closeEvent(self, event):
        """Shutdown player/tor/torrent services and flush pending writes before quitting."""
        try:
            self._bridge.player.shutdown()
        except Exception:
            pass
        try:
            self._bridge.torProxy.forceKill()
        except Exception:
            pass
        # Stop FlareSolverr bridge
        try:
            self._flaresolverr.stop()
        except Exception:
            pass
        storage.flush_all_writes()
        super().closeEvent(event)


# ---------------------------------------------------------------------------
# Single-instance lock via QLocalServer
# (mirrors Electron's app.requestSingleInstanceLock)
# ---------------------------------------------------------------------------

class SingleInstanceGuard:
    """Ensures only one app instance runs. Forwards argv to the existing instance."""

    def __init__(self):
        self._server: QLocalServer | None = None

    def try_lock(self, on_second_instance=None) -> bool:
        """
        Returns True if this is the first instance.
        If another instance is running, sends argv to it and returns False.
        """
        # Try connecting to existing instance
        socket = QLocalSocket()
        socket.connectToServer(SOCKET_NAME)
        if socket.waitForConnected(500):
            # Another instance is running — send our argv
            payload = json.dumps(sys.argv).encode("utf-8")
            socket.write(payload)
            socket.waitForBytesWritten(1000)
            socket.disconnectFromServer()
            return False

        # No existing instance — become the server
        # Clean up stale socket on Linux/macOS
        QLocalServer.removeServer(SOCKET_NAME)

        self._server = QLocalServer()
        self._server.listen(SOCKET_NAME)
        if on_second_instance:
            self._server.newConnection.connect(
                lambda: self._handle_connection(on_second_instance)
            )
        return True

    def _handle_connection(self, callback):
        if not self._server:
            return
        conn = self._server.nextPendingConnection()
        if not conn:
            return
        conn.waitForReadyRead(1000)
        data = conn.readAll().data()
        conn.disconnectFromServer()
        try:
            argv = json.loads(data.decode("utf-8"))
        except Exception:
            argv = []
        callback(argv)


# ---------------------------------------------------------------------------
# CLI argument parsing
# ---------------------------------------------------------------------------

def parse_args(argv=None):
    parser = argparse.ArgumentParser(description="Tankoban — Project Butterfly")
    parser.add_argument(
        "--app-section", "--section", "--app",
        dest="app_section", default="",
        help="Boot directly into a section (library, comic, book, audiobook, video, browser, sources, torrent). browser/sources/torrent route to in-app Sources mode."
    )
    parser.add_argument(
        "--dev-tools", action="store_true", default=False,
        help="Enable DevTools (Ctrl+Shift+I / F12)"
    )
    parser.add_argument(
        "--show-library", action="store_true", default=False,
        help="Focus the main library shell in the existing window"
    )
    parser.add_argument(
        "files", nargs="*", default=[],
        help="Files to open (video, comic, or book)"
    )
    return parser.parse_known_args(argv)


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

def main():
    args, _unknown = parse_args(sys.argv[1:])

    # Resolve boot section from args or env
    app_section = normalize_section(args.app_section)
    if not app_section:
        app_section = normalize_section(os.environ.get("TANKOBAN_APP_SECTION", ""))

    dev_tools = args.dev_tools or os.environ.get("TANKOBAN_DEVTOOLS") == "1"

    # Enable GPU-accelerated rendering in Chromium (QWebEngineView).
    # These must be set BEFORE QApplication is created.
    os.environ["QTWEBENGINE_CHROMIUM_FLAGS"] = " ".join([
        "--enable-gpu-rasterization",
        "--enable-zero-copy",
        "--enable-native-gpu-memory-buffers",
        "--ignore-gpu-blocklist",
        # Anti-bot detection: disable automation flags that captcha services
        # (Yandex SmartCaptcha, Cloudflare, hCaptcha) use to fingerprint bots
        "--disable-blink-features=AutomationControlled",
        # Prevent Chromium from freezing the compositor after ~5 minutes.
        # Without these, Chromium treats the QWebEngineView as a "background"
        # page and stops producing visual frames (QTBUG-56016 / QTBUG-50818).
        "--disable-renderer-backgrounding",
        "--disable-background-timer-throttling",
        "--disable-backgrounding-occluded-windows",
    ])

    # Init Qt app
    app = QApplication(sys.argv)
    app.setApplicationName(APP_NAME)
    app.setOrganizationName("Tankoban")

    # Pick userData directory (preserve data across renames)
    user_data = pick_user_data_dir()
    storage.init_data_dir(user_data)
    print(f"[butterfly] userData: {user_data}")

    # Single-instance lock
    guard = SingleInstanceGuard()

    def on_second_instance(argv):
        """Handle second instance: show/focus existing window."""
        if win is None:
            return
        forwarded = list(argv[1:]) if isinstance(argv, list) and argv else []
        second_args, _ = parse_args(forwarded)
        if second_args.show_library:
            win.show_web_view()
        if second_args.files:
            win.queue_open_files(second_args.files, source="second-instance")
        if win.isMinimized():
            win.showNormal()
        win.show()
        win.activateWindow()
        win.raise_()

    if not guard.try_lock(on_second_instance):
        print("[butterfly] Another instance is running. Forwarded argv and exiting.")
        sys.exit(0)

    # Create main window
    win = TankobanWindow(app_section=app_section, dev_tools=dev_tools)
    if args.show_library:
        win.show_web_view()
    if args.files:
        win.queue_open_files(args.files, source="cli")

    # --- Keyboard shortcuts ---
    if dev_tools:
        from PySide6.QtGui import QShortcut, QKeySequence
        QShortcut(QKeySequence("Ctrl+Shift+I"), win, win.toggle_dev_tools)
        QShortcut(QKeySequence("F12"), win, win.toggle_dev_tools)

    # --- App quit cleanup ---
    def _on_about_to_quit():
        try:
            win._bridge.player.shutdown()
        except Exception:
            pass
        try:
            win._bridge.webTabManager.shutdown()
        except Exception:
            pass
        try:
            win._bridge.torProxy.forceKill()
        except Exception:
            pass
        try:
            win._bridge.webTorrent.shutdown()
        except Exception:
            pass
        try:
            win._flaresolverr.stop()
        except Exception:
            pass
        storage.flush_all_writes()

    app.aboutToQuit.connect(_on_about_to_quit)

    sys.exit(app.exec())


if __name__ == "__main__":
    main()
