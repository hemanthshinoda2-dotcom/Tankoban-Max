"""
Project Butterfly — Ebook Reader Page

Standalone QWebEngineView that loads ebook_reader.html with the full
foliate-js renderer and all reader modules (TTS, audiobook pairing,
annotations, search, etc.).

The page receives books via open_book(file_path) from app.py.
The bridge shim provides window.electronAPI so all renderer JS works
unchanged — same bridge classes as the main view.

Architecture:
  - ebook_reader.html loads foliate-js + 24 reader modules
  - QWebChannel wires through the same BridgeRoot
  - reader_standalone_boot.js initialises the reader without the shell
"""

import json
import os
from pathlib import Path

from PySide6.QtCore import Qt, QUrl, Signal, Slot, QObject, QTimer
from PySide6.QtGui import QColor
from PySide6.QtWidgets import QWidget, QVBoxLayout
from PySide6.QtWebEngineCore import (
    QWebEnginePage, QWebEngineProfile, QWebEngineScript, QWebEngineSettings,
)
from PySide6.QtWebEngineWidgets import QWebEngineView
from PySide6.QtWebChannel import QWebChannel

import bridge as bridge_module


# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

_HERE = Path(__file__).resolve().parent
PROJECT_ROOT = _HERE.parent
SRC_DIR = PROJECT_ROOT / "src"
EBOOK_HTML = SRC_DIR / "ebook_reader.html"


# ---------------------------------------------------------------------------
# Bridge for ebook ↔ app navigation
# ---------------------------------------------------------------------------

class EbookNavBridge(QObject):
    """
    Tiny bridge for reader → app navigation.
    JS calls ebookNav.requestClose() when the user clicks "Back".
    Python emits closeRequested so app.py can switch the stack.
    """

    closeRequested = Signal()

    def __init__(self, parent=None):
        super().__init__(parent)

    @Slot(result=str)
    def requestClose(self):
        """Called from JS when user clicks back / close button."""
        self.closeRequested.emit()
        return json.dumps({"ok": True})


# ---------------------------------------------------------------------------
# Custom page (mirrors TankobanWebPage from app.py)
# ---------------------------------------------------------------------------

class EbookWebPage(QWebEnginePage):
    """Custom page to pipe console messages to stdout."""

    def javaScriptConsoleMessage(self, level, message, line, source):
        tag = ""
        if "[TTS" in message or "[ebook" in message or "[reader" in message:
            tag = "[ebook] "
        if tag or level >= QWebEnginePage.JavaScriptConsoleMessageLevel.WarningMessageLevel:
            print(f"{tag}{message}")


# ---------------------------------------------------------------------------
# EbookPage widget
# ---------------------------------------------------------------------------

class EbookPage(QWidget):
    """
    Full-screen ebook reader widget.

    Contains a QWebEngineView that loads ebook_reader.html with foliate-js.
    Shares the same BridgeRoot as the main view so all book bridge classes
    (progress, bookmarks, annotations, TTS, audiobook) are available.
    """

    # Emitted when the reader wants to close (user clicked back)
    closeRequested = Signal()

    def __init__(self, bridge_root: bridge_module.BridgeRoot, parent=None):
        super().__init__(parent)
        self._bridge_root = bridge_root
        self._loaded = False
        self._pending_book = None  # file path to open after page load

        # Navigation bridge
        self._nav_bridge = EbookNavBridge(self)
        self._nav_bridge.closeRequested.connect(self.closeRequested.emit)

        self._setup_ui()

    def _setup_ui(self):
        layout = QVBoxLayout(self)
        layout.setContentsMargins(0, 0, 0, 0)
        layout.setSpacing(0)

        # Profile — use default (shares storage with main view)
        profile = QWebEngineProfile.defaultProfile()

        # Page
        self._page = EbookWebPage(profile, self)
        self._page.setBackgroundColor(QColor(16, 18, 22))  # match reader dark bg

        # WebEngine settings
        settings = self._page.settings()
        settings.setAttribute(QWebEngineSettings.WebAttribute.LocalContentCanAccessRemoteUrls, True)
        settings.setAttribute(QWebEngineSettings.WebAttribute.LocalContentCanAccessFileUrls, True)
        settings.setAttribute(QWebEngineSettings.WebAttribute.JavascriptEnabled, True)
        settings.setAttribute(QWebEngineSettings.WebAttribute.LocalStorageEnabled, True)

        # QWebChannel — reuse the same bridge root + add nav bridge
        channel = QWebChannel(self._page)
        channel.registerObject("bridge", self._bridge_root)
        channel.registerObject("ebookNav", self._nav_bridge)

        # Register child namespaces (same list as bridge.setup_bridge)
        _child_names = [
            "window", "shell", "clipboard", "progress", "seriesSettings",
            "booksProgress", "booksTtsProgress", "booksBookmarks",
            "booksAnnotations", "booksDisplayNames", "booksSettings", "booksUi",
            "videoProgress", "videoSettings", "videoDisplayNames", "videoUi",
            "webBrowserSettings", "webSession", "webHistory", "webBookmarks",
            "webPermissions", "webSearch", "build14", "files", "thumbs",
            "videoPoster", "booksOpds", "webAdblock", "archives", "export",
            "webUserscripts", "torrentSearch", "library", "books", "video",
            "audiobooks", "webSources", "webData", "webFind", "webTabManager",
            "webBrowserActions", "booksTtsEdge", "torProxy", "webTorrent",
            "player", "mpv", "holyGrail",
        ]
        for name in _child_names:
            obj = getattr(self._bridge_root, name, None)
            if obj is not None:
                channel.registerObject(name, obj)

        self._page.setWebChannel(channel)
        self._channel = channel  # prevent GC

        # Inject bridge shim script (qwebchannel.js + BRIDGE_SHIM_JS + ebookNav shim)
        combined = getattr(self._bridge_root, "_bridge_shim_combined", "")
        if not combined:
            # Fallback: build from bridge module
            combined = bridge_module.BRIDGE_SHIM_JS

        # Append ebookNav shim so JS can call window.ebookNav.requestClose()
        ebook_nav_shim = r"""
;(function() {
  // Wait for QWebChannel to be ready, then expose ebookNav
  var _waitNav = setInterval(function() {
    if (window.__tankoButterfly && window.electronAPI) {
      clearInterval(_waitNav);
      // ebookNav is registered as a separate QWebChannel object
      if (typeof qt !== 'undefined' && qt.webChannelTransport) {
        new QWebChannel(qt.webChannelTransport, function(channel) {
          var nav = channel.objects.ebookNav;
          if (nav) {
            window.__ebookNav = {
              requestClose: function() {
                return new Promise(function(resolve) {
                  nav.requestClose(function(r) {
                    try { resolve(JSON.parse(r)); } catch(e) { resolve(r); }
                  });
                });
              }
            };
          }
        });
      }
    }
  }, 50);
  setTimeout(function() { clearInterval(_waitNav); }, 10000);
})();
"""
        full_shim = combined + "\n" + ebook_nav_shim

        script = QWebEngineScript()
        script.setName("ebook_bridge_shim")
        script.setSourceCode(full_shim)
        script.setInjectionPoint(QWebEngineScript.InjectionPoint.DocumentCreation)
        script.setWorldId(QWebEngineScript.ScriptWorldId.MainWorld)
        script.setRunsOnSubFrames(False)
        self._page.scripts().insert(script)

        # View
        self._view = QWebEngineView()
        self._view.setPage(self._page)
        layout.addWidget(self._view)

        # Load finished handler
        self._page.loadFinished.connect(self._on_load_finished)

    def load(self):
        """Load the ebook reader HTML. Called once on first use."""
        if not self._loaded:
            url = QUrl.fromLocalFile(str(EBOOK_HTML))
            self._view.load(url)

    def open_book(self, file_path: str):
        """
        Open a book file in the reader.
        If the page isn't loaded yet, queue the path and open after load.
        """
        if self._loaded:
            self._send_open_book(file_path)
        else:
            self._pending_book = file_path
            self.load()

    def _on_load_finished(self, ok: bool):
        if ok:
            self._loaded = True
            print(f"[ebook] Reader page loaded: {EBOOK_HTML}")
            if self._pending_book:
                # Small delay to let JS initialise
                path = self._pending_book
                self._pending_book = None
                QTimer.singleShot(300, lambda: self._send_open_book(path))
        else:
            print(f"[ebook] Failed to load reader page: {EBOOK_HTML}")

    def _send_open_book(self, file_path: str):
        """Execute JS to open a book in the reader."""
        escaped = file_path.replace("\\", "\\\\").replace("'", "\\'")
        js = f"if (window.__ebookOpenBook) window.__ebookOpenBook('{escaped}');"
        self._page.runJavaScript(js)

    def nudge(self):
        """Force Chromium compositor to resume rendering."""
        v = self._view
        v.resize(v.width() + 1, v.height())
        v.resize(v.width() - 1, v.height())
