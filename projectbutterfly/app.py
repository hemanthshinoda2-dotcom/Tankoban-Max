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
  - QWebChannel bridge wiring (bridge.py — all 46 namespaces)
  - Bridge Qt object injection (PlayerBridge, WebFindBridge, etc.)
  - DevTools policy
  - Quit cleanup (player shutdown, tor kill, flush writes)
"""

import argparse
import json
import os
import sys
from pathlib import Path

from PySide6.QtCore import Qt, QUrl, QTimer
from PySide6.QtGui import QIcon
from PySide6.QtNetwork import QLocalServer, QLocalSocket
from PySide6.QtWidgets import QApplication, QMainWindow, QStackedWidget, QWidget
from PySide6.QtWebEngineWidgets import QWebEngineView
from PySide6.QtWebEngineCore import QWebEnginePage, QWebEngineProfile, QWebEngineSettings

import storage
import bridge as bridge_module

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
}

VALID_SECTIONS = frozenset(
    ["shell", "library", "comic", "book", "audiobook", "video", "browser", "torrent"]
)

VIDEO_EXTENSIONS = frozenset(
    [".mp4", ".mkv", ".avi", ".mov", ".m4v", ".webm", ".ts", ".m2ts",
     ".wmv", ".flv", ".mpeg", ".mpg", ".3gp"]
)

COMIC_EXTENSIONS = frozenset([".cbz", ".cbr"])


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
      index 1 = QWidget          (mpv native render surface)
    """

    def __init__(self, app_section: str = "", dev_tools: bool = False):
        super().__init__()

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

        # Browser tab profile — isolated session (replaces Electron partition="persist:webmode")
        self._browser_profile = QWebEngineProfile("webmode", self)
        self._browser_profile.setPersistentStoragePath(
            os.path.join(storage.data_path(""), "WebEngine_browser")
        )

        self._web_page = TankobanWebPage(self._profile, self)
        self._web_view = QWebEngineView()
        self._web_view.setPage(self._web_page)

        # Web settings matching Electron's BrowserWindow webPreferences
        settings = self._web_view.settings()
        settings.setAttribute(QWebEngineSettings.WebAttribute.LocalContentCanAccessRemoteUrls, True)
        settings.setAttribute(QWebEngineSettings.WebAttribute.LocalContentCanAccessFileUrls, True)
        settings.setAttribute(QWebEngineSettings.WebAttribute.JavascriptEnabled, True)
        settings.setAttribute(QWebEngineSettings.WebAttribute.LocalStorageEnabled, True)

        self._stack.addWidget(self._web_view)  # index 0

        # --- MpvRenderHost (layer 1) ---
        # Plain QWidget whose winId() is passed to mpv for native rendering.
        self._mpv_host = QWidget()
        self._mpv_host.setStyleSheet("background-color: #000000;")
        self._stack.addWidget(self._mpv_host)  # index 1

        # --- QWebChannel bridge (replaces Electron preload + ipcMain) ---
        self._bridge = bridge_module.setup_bridge(self._web_view, self)

        # --- Wire bridge instances with live Qt objects ---
        self._bridge.player.setMpvWidget(
            self._mpv_host,
            self.show_player,
            self.show_web_view,
        )
        self._bridge.player.setProgressDomain(self._bridge.videoProgress)
        self._bridge.webFind.setPage(self._web_page)
        self._bridge.webBrowserActions.setPage(self._web_page)
        self._bridge.webData.setProfile(self._profile)

        # Wire browser tab manager with isolated profile
        self._bridge.webTabManager.setup(
            self._browser_profile,
            self._web_view,    # parent for overlay QWebEngineViews
            self._web_view,    # coordinate reference
        )

        # Wire browser download handler
        self._browser_profile.downloadRequested.connect(
            self._bridge.webSources.handleDownloadRequested
        )

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
            self.show()
            self.showMaximized()
        else:
            print(f"[butterfly] Failed to load renderer: {INDEX_HTML}")
            self.show()

    # --- Player widget switching ---

    def show_web_view(self):
        """Switch to the web UI layer."""
        self._stack.setCurrentIndex(0)

    def show_player(self):
        """Switch to the mpv player layer."""
        self._stack.setCurrentIndex(1)

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

    # Restore to maximized when leaving fullscreen (matches Electron behavior)
    def changeEvent(self, event):
        super().changeEvent(event)
        if event.type() == event.Type.WindowStateChange:
            if not (self.windowState() & Qt.WindowState.WindowFullScreen):
                # Left fullscreen — restore to maximized
                if not (self.windowState() & Qt.WindowState.WindowMaximized):
                    QTimer.singleShot(0, self.showMaximized)

    def closeEvent(self, event):
        """Shutdown player/tor/tabs and flush pending writes before quitting."""
        try:
            self._bridge.webTabManager.shutdown()
        except Exception:
            pass
        try:
            self._bridge.player.shutdown()
        except Exception:
            pass
        try:
            self._bridge.torProxy.forceKill()
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

def parse_args():
    parser = argparse.ArgumentParser(description="Tankoban — Project Butterfly")
    parser.add_argument(
        "--app-section", "--section", "--app",
        dest="app_section", default="",
        help="Boot directly into a section (library, comic, book, audiobook, video, browser, torrent)"
    )
    parser.add_argument(
        "--dev-tools", action="store_true", default=False,
        help="Enable DevTools (Ctrl+Shift+I / F12)"
    )
    parser.add_argument(
        "files", nargs="*", default=[],
        help="Files to open (video or comic archives)"
    )
    return parser.parse_known_args()


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

def main():
    args, _unknown = parse_args()

    # Resolve boot section from args or env
    app_section = normalize_section(args.app_section)
    if not app_section:
        app_section = normalize_section(os.environ.get("TANKOBAN_APP_SECTION", ""))

    dev_tools = args.dev_tools or os.environ.get("TANKOBAN_DEVTOOLS") == "1"

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
        # TODO: handle --show-library flag, video file forwarding, comic open
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

    # --- Keyboard shortcuts ---
    if dev_tools:
        from PySide6.QtGui import QShortcut, QKeySequence
        QShortcut(QKeySequence("Ctrl+Shift+I"), win, win.toggle_dev_tools)
        QShortcut(QKeySequence("F12"), win, win.toggle_dev_tools)

    # --- App quit cleanup ---
    def _on_about_to_quit():
        try:
            win._bridge.webTabManager.shutdown()
        except Exception:
            pass
        try:
            win._bridge.player.shutdown()
        except Exception:
            pass
        try:
            win._bridge.torProxy.forceKill()
        except Exception:
            pass
        storage.flush_all_writes()

    app.aboutToQuit.connect(_on_about_to_quit)

    sys.exit(app.exec())


if __name__ == "__main__":
    main()
