"""
Project Butterfly — QWebChannel Bridge

Replaces: preload/index.js + preload/namespaces/*.js + main/ipc/ (all 46 register files)

Architecture:
  - Python QObject classes expose @Slot methods callable from JS
  - Python Signals push events to JS (replaces ipcRenderer.on)
  - A JS shim (injected before page load) creates window.electronAPI from the
    QWebChannel object, so src/services/api_gateway.js works UNTOUCHED
  - Domain implementations are plugged in via set_domain() — stubs return
    { ok: false, error: 'not_implemented' } until the domain module is ported

The renderer never knows it's not running in Electron. It calls
window.Tanko.api.progress.save(bookId, data) and gets a response, same as before.

QWebChannel transport:
  - @Slot methods = ipcRenderer.invoke (request/response)
  - Signal = ipcRenderer.on (push events from Python to JS)
"""

import json
import os
import subprocess
import sys
from typing import Any

from PySide6.QtCore import QObject, Signal, Slot
from PySide6.QtWebChannel import QWebChannel
from PySide6.QtWebEngineWidgets import QWebEngineView

import storage


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _ok(data=None):
    """Standard success response."""
    if data is None:
        return {"ok": True}
    if isinstance(data, dict):
        return {**data, "ok": True}
    return {"ok": True, "data": data}


def _err(msg="not_implemented"):
    """Standard error response."""
    return {"ok": False, "error": msg}


def _stub():
    """Placeholder for unimplemented domain methods."""
    return _err("not_implemented")


# ---------------------------------------------------------------------------
# Generic JSON CRUD mixin
#
# Most domains (progress, booksProgress, videoSettings, etc.) are identical:
# a JSON file keyed by some ID with getAll/get/save/clear/clearAll.
# This mixin generates the @Slot implementations from a filename.
# ---------------------------------------------------------------------------

class JsonCrudMixin:
    """
    Provides getAll/get/save/clear/clearAll for a single JSON file.
    Subclass must set _crud_file = 'filename.json' and _crud_debounce = True/False.
    """

    _crud_file: str = ""
    _crud_debounce: bool = True

    def _crud_path(self) -> str:
        return storage.data_path(self._crud_file)

    def _crud_read(self) -> dict:
        return storage.read_json(self._crud_path(), {})

    def _crud_write(self, data: dict):
        p = self._crud_path()
        if self._crud_debounce:
            storage.write_json_debounced(p, data)
        else:
            storage.write_json_sync(p, data)

    def crud_get_all(self) -> dict:
        return _ok(self._crud_read())

    def crud_get(self, key: str) -> dict:
        data = self._crud_read()
        return _ok({"value": data.get(key)})

    def crud_save(self, key: str, value) -> dict:
        data = self._crud_read()
        data[key] = value
        self._crud_write(data)
        return _ok()

    def crud_clear(self, key: str) -> dict:
        data = self._crud_read()
        data.pop(key, None)
        self._crud_write(data)
        return _ok()

    def crud_clear_all(self) -> dict:
        self._crud_write({})
        return _ok()


# ═══════════════════════════════════════════════════════════════════════════
# NAMESPACE QOBJECTS
# One class per preload namespace. @Slot methods match the JS API surface.
# ═══════════════════════════════════════════════════════════════════════════


# ---------------------------------------------------------------------------
# window
# ---------------------------------------------------------------------------

class WindowBridge(QObject):
    """Replaces preload/namespaces/window.js. Needs reference to QMainWindow."""

    def __init__(self, parent=None):
        super().__init__(parent)
        self._win = None  # set by setup_bridge()

    def set_window(self, win):
        self._win = win

    @Slot(result=str)
    def isFullscreen(self):
        return json.dumps(self._win.isFullScreen() if self._win else False)

    @Slot(result=str)
    def isMaximized(self):
        return json.dumps(self._win.isMaximized() if self._win else False)

    @Slot(result=str)
    def toggleFullscreen(self):
        if self._win:
            self._win.toggle_fullscreen()
        return json.dumps(_ok())

    @Slot(str, result=str)
    def setFullscreen(self, v):
        if self._win:
            self._win.set_fullscreen(json.loads(v) if v else False)
        return json.dumps(_ok())

    @Slot(result=str)
    def toggleMaximize(self):
        if self._win:
            if self._win.isMaximized():
                self._win.showNormal()
            else:
                self._win.showMaximized()
        return json.dumps(_ok())

    @Slot(result=str)
    def isAlwaysOnTop(self):
        from PySide6.QtCore import Qt
        on = bool(self._win and (self._win.windowFlags() & Qt.WindowType.WindowStaysOnTopHint))
        return json.dumps(on)

    @Slot(result=str)
    def toggleAlwaysOnTop(self):
        if self._win:
            from PySide6.QtCore import Qt
            flags = self._win.windowFlags()
            if flags & Qt.WindowType.WindowStaysOnTopHint:
                self._win.setWindowFlags(flags & ~Qt.WindowType.WindowStaysOnTopHint)
            else:
                self._win.setWindowFlags(flags | Qt.WindowType.WindowStaysOnTopHint)
            self._win.show()
        return json.dumps(_ok())

    @Slot(result=str)
    def minimize(self):
        if self._win:
            self._win.showMinimized()
        return json.dumps(_ok())

    @Slot(result=str)
    def close(self):
        if self._win:
            self._win.close()
        return json.dumps(_ok())

    @Slot(result=str)
    def hide(self):
        if self._win:
            self._win.hide()
        return json.dumps(_ok())

    @Slot(result=str)
    def show(self):
        if self._win:
            self._win.show()
        return json.dumps(_ok())

    @Slot(result=str)
    def takeScreenshot(self):
        return json.dumps(_stub())

    @Slot(result=str)
    def openSubtitleDialog(self):
        return json.dumps(_stub())

    @Slot(str, result=str)
    def openBookInNewWindow(self, book_id):
        return json.dumps(_stub())

    @Slot(str, result=str)
    def openVideoShell(self, payload):
        return json.dumps(_stub())


# ---------------------------------------------------------------------------
# shell
# ---------------------------------------------------------------------------

class ShellBridge(QObject):
    """Replaces preload/namespaces/shell.js."""

    @Slot(str, result=str)
    def revealPath(self, path):
        try:
            if sys.platform == "win32":
                subprocess.Popen(["explorer", "/select,", os.path.normpath(path)])
            elif sys.platform == "darwin":
                subprocess.Popen(["open", "-R", path])
            else:
                subprocess.Popen(["xdg-open", os.path.dirname(path)])
            return json.dumps(_ok())
        except Exception as e:
            return json.dumps(_err(str(e)))

    @Slot(str, result=str)
    def openPath(self, path):
        try:
            if sys.platform == "win32":
                os.startfile(path)
            elif sys.platform == "darwin":
                subprocess.Popen(["open", path])
            else:
                subprocess.Popen(["xdg-open", path])
            return json.dumps(_ok())
        except Exception as e:
            return json.dumps(_err(str(e)))


# ---------------------------------------------------------------------------
# clipboard
# ---------------------------------------------------------------------------

class ClipboardBridge(QObject):
    """Replaces clipboard namespace."""

    @Slot(str, result=str)
    def copyText(self, text):
        from PySide6.QtWidgets import QApplication
        QApplication.clipboard().setText(text or "")
        return json.dumps(_ok())


# ---------------------------------------------------------------------------
# progress (comics)
# ---------------------------------------------------------------------------

class ProgressBridge(QObject, JsonCrudMixin):
    _crud_file = "progress.json"

    @Slot(result=str)
    def getAll(self):
        return json.dumps(self.crud_get_all())

    @Slot(str, result=str)
    def get(self, book_id):
        return json.dumps(self.crud_get(book_id))

    @Slot(str, str, result=str)
    def save(self, book_id, progress_json):
        return json.dumps(self.crud_save(book_id, json.loads(progress_json)))

    @Slot(str, result=str)
    def clear(self, book_id):
        return json.dumps(self.crud_clear(book_id))

    @Slot(result=str)
    def clearAll(self):
        return json.dumps(self.crud_clear_all())


# ---------------------------------------------------------------------------
# seriesSettings
# ---------------------------------------------------------------------------

class SeriesSettingsBridge(QObject, JsonCrudMixin):
    _crud_file = "series_settings.json"

    @Slot(str, result=str)
    def get(self, series_id):
        return json.dumps(self.crud_get(series_id))

    @Slot(str, str, result=str)
    def save(self, series_id, settings_json):
        return json.dumps(self.crud_save(series_id, json.loads(settings_json)))

    @Slot(str, result=str)
    def clear(self, series_id):
        return json.dumps(self.crud_clear(series_id))


# ---------------------------------------------------------------------------
# booksProgress
# ---------------------------------------------------------------------------

class BooksProgressBridge(QObject, JsonCrudMixin):
    _crud_file = "books_progress.json"

    @Slot(result=str)
    def getAll(self):
        return json.dumps(self.crud_get_all())

    @Slot(str, result=str)
    def get(self, book_id):
        return json.dumps(self.crud_get(book_id))

    @Slot(str, str, result=str)
    def save(self, book_id, progress_json):
        return json.dumps(self.crud_save(book_id, json.loads(progress_json)))

    @Slot(str, result=str)
    def clear(self, book_id):
        return json.dumps(self.crud_clear(book_id))

    @Slot(result=str)
    def clearAll(self):
        return json.dumps(self.crud_clear_all())


# ---------------------------------------------------------------------------
# booksTtsProgress
# ---------------------------------------------------------------------------

class BooksTtsProgressBridge(QObject, JsonCrudMixin):
    _crud_file = "books_tts_progress.json"

    @Slot(result=str)
    def getAll(self):
        return json.dumps(self.crud_get_all())

    @Slot(str, result=str)
    def get(self, book_id):
        return json.dumps(self.crud_get(book_id))

    @Slot(str, str, result=str)
    def save(self, book_id, entry_json):
        return json.dumps(self.crud_save(book_id, json.loads(entry_json)))

    @Slot(str, result=str)
    def clear(self, book_id):
        return json.dumps(self.crud_clear(book_id))


# ---------------------------------------------------------------------------
# booksBookmarks
# ---------------------------------------------------------------------------

class BooksBookmarksBridge(QObject, JsonCrudMixin):
    _crud_file = "books_bookmarks.json"

    @Slot(str, result=str)
    def get(self, book_id):
        return json.dumps(self.crud_get(book_id))

    @Slot(str, str, result=str)
    def save(self, book_id, bookmark_json):
        return json.dumps(self.crud_save(book_id, json.loads(bookmark_json)))

    @Slot(str, str, result=str)
    def delete(self, book_id, bookmark_id):
        data = self._crud_read()
        items = data.get(book_id, [])
        if isinstance(items, list):
            data[book_id] = [b for b in items if b.get("id") != bookmark_id]
            self._crud_write(data)
        return json.dumps(_ok())

    @Slot(str, result=str)
    def clear(self, book_id):
        return json.dumps(self.crud_clear(book_id))


# ---------------------------------------------------------------------------
# booksAnnotations
# ---------------------------------------------------------------------------

class BooksAnnotationsBridge(QObject, JsonCrudMixin):
    _crud_file = "books_annotations.json"

    @Slot(str, result=str)
    def get(self, book_id):
        return json.dumps(self.crud_get(book_id))

    @Slot(str, str, result=str)
    def save(self, book_id, annotation_json):
        return json.dumps(self.crud_save(book_id, json.loads(annotation_json)))

    @Slot(str, str, result=str)
    def delete(self, book_id, annotation_id):
        data = self._crud_read()
        items = data.get(book_id, [])
        if isinstance(items, list):
            data[book_id] = [a for a in items if a.get("id") != annotation_id]
            self._crud_write(data)
        return json.dumps(_ok())

    @Slot(str, result=str)
    def clear(self, book_id):
        return json.dumps(self.crud_clear(book_id))


# ---------------------------------------------------------------------------
# booksDisplayNames
# ---------------------------------------------------------------------------

class BooksDisplayNamesBridge(QObject, JsonCrudMixin):
    _crud_file = "books_display_names.json"

    @Slot(result=str)
    def getAll(self):
        return json.dumps(self.crud_get_all())

    @Slot(str, str, result=str)
    def save(self, book_id, name):
        return json.dumps(self.crud_save(book_id, name))

    @Slot(str, result=str)
    def clear(self, book_id):
        return json.dumps(self.crud_clear(book_id))


# ---------------------------------------------------------------------------
# booksSettings
# ---------------------------------------------------------------------------

class BooksSettingsBridge(QObject, JsonCrudMixin):
    _crud_file = "books_reader_settings.json"
    _crud_debounce = False

    @Slot(result=str)
    def get(self):
        data = self._crud_read()
        return json.dumps(_ok({"settings": data}))

    @Slot(str, result=str)
    def save(self, settings_json):
        data = json.loads(settings_json)
        storage.write_json_sync(self._crud_path(), data)
        return json.dumps(_ok())

    @Slot(result=str)
    def clear(self):
        return json.dumps(self.crud_clear_all())


# ---------------------------------------------------------------------------
# booksUi
# ---------------------------------------------------------------------------

class BooksUiBridge(QObject, JsonCrudMixin):
    _crud_file = "books_ui_state.json"

    @Slot(result=str)
    def get(self):
        data = self._crud_read()
        return json.dumps(_ok({"state": data}))

    @Slot(str, result=str)
    def save(self, ui_json):
        data = json.loads(ui_json)
        storage.write_json_debounced(self._crud_path(), data)
        return json.dumps(_ok())

    @Slot(result=str)
    def clear(self):
        return json.dumps(self.crud_clear_all())


# ---------------------------------------------------------------------------
# videoProgress
# ---------------------------------------------------------------------------

class VideoProgressBridge(QObject, JsonCrudMixin):
    _crud_file = "video_progress.json"

    # Push event: VIDEO_PROGRESS_UPDATED
    progressUpdated = Signal(str)

    @Slot(result=str)
    def getAll(self):
        return json.dumps(self.crud_get_all())

    @Slot(str, result=str)
    def get(self, video_id):
        return json.dumps(self.crud_get(video_id))

    @Slot(str, str, result=str)
    def save(self, video_id, progress_json):
        result = self.crud_save(video_id, json.loads(progress_json))
        self.progressUpdated.emit(json.dumps({"videoId": video_id}))
        return json.dumps(result)

    @Slot(str, result=str)
    def clear(self, video_id):
        result = self.crud_clear(video_id)
        self.progressUpdated.emit(json.dumps({"videoId": video_id, "cleared": True}))
        return json.dumps(result)

    @Slot(result=str)
    def clearAll(self):
        result = self.crud_clear_all()
        self.progressUpdated.emit(json.dumps({"clearedAll": True}))
        return json.dumps(result)


# ---------------------------------------------------------------------------
# videoSettings
# ---------------------------------------------------------------------------

class VideoSettingsBridge(QObject, JsonCrudMixin):
    _crud_file = "video_prefs.json"
    _crud_debounce = False

    @Slot(result=str)
    def get(self):
        data = self._crud_read()
        return json.dumps(_ok({"settings": data}))

    @Slot(str, result=str)
    def save(self, settings_json):
        storage.write_json_sync(self._crud_path(), json.loads(settings_json))
        return json.dumps(_ok())

    @Slot(result=str)
    def clear(self):
        return json.dumps(self.crud_clear_all())


# ---------------------------------------------------------------------------
# videoDisplayNames
# ---------------------------------------------------------------------------

class VideoDisplayNamesBridge(QObject, JsonCrudMixin):
    _crud_file = "video_display_names.json"

    @Slot(result=str)
    def getAll(self):
        return json.dumps(self.crud_get_all())

    @Slot(str, str, result=str)
    def save(self, show_id, name):
        return json.dumps(self.crud_save(show_id, name))

    @Slot(str, result=str)
    def clear(self, show_id):
        return json.dumps(self.crud_clear(show_id))


# ---------------------------------------------------------------------------
# videoUi
# ---------------------------------------------------------------------------

class VideoUiBridge(QObject, JsonCrudMixin):
    _crud_file = "video_ui_state.json"

    @Slot(result=str)
    def getState(self):
        data = self._crud_read()
        return json.dumps(_ok({"state": data}))

    @Slot(str, result=str)
    def saveState(self, ui_json):
        storage.write_json_debounced(self._crud_path(), json.loads(ui_json))
        return json.dumps(_ok())

    @Slot(result=str)
    def clearState(self):
        return json.dumps(self.crud_clear_all())


# ---------------------------------------------------------------------------
# Stub namespaces — complex domains not yet ported
# These return _stub() for every method so the renderer doesn't crash.
# They'll be replaced by real implementations as domains are ported.
# ---------------------------------------------------------------------------

class StubNamespace(QObject):
    """Base for namespaces that aren't implemented yet. All @Slot methods
    are defined on the JS shim side to return { ok: false, error: 'not_implemented' }."""
    pass


class LibraryBridge(StubNamespace):
    """Stub: library scan/state. Needs: main/domains/library port."""
    libraryUpdated = Signal(str)
    scanStatus = Signal(str)

    @Slot(result=str)
    def getState(self):
        return json.dumps(_err("not_implemented"))

    @Slot(str, result=str)
    def scan(self, opts):
        return json.dumps(_stub())

    @Slot(result=str)
    def cancelScan(self):
        return json.dumps(_stub())

    @Slot(str, result=str)
    def setScanIgnore(self, patterns):
        return json.dumps(_stub())

    @Slot(result=str)
    def addRootFolder(self):
        return json.dumps(_stub())

    @Slot(result=str)
    def addSeriesFolder(self):
        return json.dumps(_stub())

    @Slot(str, result=str)
    def removeSeriesFolder(self, folder):
        return json.dumps(_stub())

    @Slot(str, result=str)
    def removeRootFolder(self, root_path):
        return json.dumps(_stub())

    @Slot(str, result=str)
    def unignoreSeries(self, folder):
        return json.dumps(_stub())

    @Slot(result=str)
    def clearIgnoredSeries(self):
        return json.dumps(_stub())

    @Slot(result=str)
    def openComicFileDialog(self):
        return json.dumps(_stub())

    @Slot(str, result=str)
    def bookFromPath(self, file_path):
        return json.dumps(_stub())


class BooksBridge(StubNamespace):
    """Stub: books library scan/state."""
    booksUpdated = Signal(str)
    scanStatus = Signal(str)

    @Slot(result=str)
    def getState(self):
        return json.dumps(_stub())

    @Slot(str, result=str)
    def scan(self, opts):
        return json.dumps(_stub())

    @Slot(result=str)
    def cancelScan(self):
        return json.dumps(_stub())

    @Slot(str, result=str)
    def setScanIgnore(self, p):
        return json.dumps(_stub())

    @Slot(result=str)
    def addRootFolder(self):
        return json.dumps(_stub())

    @Slot(str, result=str)
    def removeRootFolder(self, p):
        return json.dumps(_stub())

    @Slot(result=str)
    def addSeriesFolder(self):
        return json.dumps(_stub())

    @Slot(str, result=str)
    def removeSeriesFolder(self, p):
        return json.dumps(_stub())

    @Slot(result=str)
    def addFiles(self):
        return json.dumps(_stub())

    @Slot(str, result=str)
    def removeFile(self, p):
        return json.dumps(_stub())

    @Slot(result=str)
    def openFileDialog(self):
        return json.dumps(_stub())

    @Slot(str, result=str)
    def bookFromPath(self, p):
        return json.dumps(_stub())


class BooksTtsEdgeBridge(StubNamespace):
    """Stub: Edge TTS."""

    @Slot(str, result=str)
    def probe(self, p):
        return json.dumps(_stub())

    @Slot(str, result=str)
    def getVoices(self, p):
        return json.dumps(_stub())

    @Slot(str, result=str)
    def synth(self, p):
        return json.dumps(_stub())

    @Slot(str, result=str)
    def warmup(self, p):
        return json.dumps(_stub())

    @Slot(result=str)
    def resetInstance(self):
        return json.dumps(_stub())

    @Slot(result=str)
    def cacheClear(self):
        return json.dumps(_stub())

    @Slot(result=str)
    def cacheInfo(self):
        return json.dumps(_stub())


class BooksOpdsBridge(QObject):
    """OPDS feeds storage + HTTP fetch proxy for Books mode."""
    feedsUpdated = Signal(str)

    _CONFIG_FILE = "books_opds_feeds.json"
    _MAX_FEEDS = 100

    def __init__(self, parent=None):
        super().__init__(parent)
        self._cache = None

    def _ensure_cache(self):
        if self._cache is not None:
            return self._cache
        p = storage.data_path(self._CONFIG_FILE)
        raw = storage.read_json(p, None)
        if raw and isinstance(raw.get("feeds"), list):
            self._cache = {"feeds": raw["feeds"], "updatedAt": raw.get("updatedAt", 0) or 0}
        else:
            self._cache = {"feeds": [], "updatedAt": 0}
        return self._cache

    def _write(self):
        storage.write_json_sync(storage.data_path(self._CONFIG_FILE), self._ensure_cache())

    def _emit_updated(self):
        c = self._ensure_cache()
        self.feedsUpdated.emit(json.dumps({"feeds": c["feeds"]}))

    @staticmethod
    def _norm_url(u):
        s = str(u or "").strip()
        if not s:
            return ""
        try:
            from urllib.parse import urlparse
            parsed = urlparse(s)
            if parsed.scheme not in ("http", "https"):
                return ""
            return s
        except Exception:
            return ""

    @Slot(result=str)
    def getFeeds(self):
        c = self._ensure_cache()
        return json.dumps(_ok({"feeds": c["feeds"]}))

    @Slot(str, result=str)
    def addFeed(self, payload_json):
        payload = json.loads(payload_json) if payload_json else {}
        url = self._norm_url(payload.get("url"))
        if not url:
            return json.dumps(_err("Invalid feed URL"))
        name = str(payload.get("name", "") or "").strip()
        c = self._ensure_cache()
        for f in c["feeds"]:
            if str(f.get("url", "")) == url:
                return json.dumps(_err("Feed already exists"))
        import time, random, string
        now = int(time.time() * 1000)
        rand = "".join(random.choices(string.ascii_lowercase + string.digits, k=5))
        feed = {"id": f"opds_{now}_{rand}", "url": url, "name": name, "createdAt": now}
        c["feeds"].insert(0, feed)
        if len(c["feeds"]) > self._MAX_FEEDS:
            c["feeds"] = c["feeds"][:self._MAX_FEEDS]
        c["updatedAt"] = now
        self._write()
        self._emit_updated()
        return json.dumps(_ok({"feed": feed}))

    @Slot(str, result=str)
    def updateFeed(self, payload_json):
        payload = json.loads(payload_json) if payload_json else {}
        fid = str(payload.get("id", "") or "").strip()
        if not fid:
            return json.dumps(_err("Missing id"))
        c = self._ensure_cache()
        found = None
        for f in c["feeds"]:
            if str(f.get("id", "")) == fid:
                found = f
                break
        if not found:
            return json.dumps(_err("Feed not found"))
        if payload.get("url") is not None:
            next_url = self._norm_url(payload["url"])
            if not next_url:
                return json.dumps(_err("Invalid feed URL"))
            found["url"] = next_url
        if payload.get("name") is not None:
            found["name"] = str(payload["name"] or "").strip()
        import time
        found["updatedAt"] = int(time.time() * 1000)
        c["updatedAt"] = found["updatedAt"]
        self._write()
        self._emit_updated()
        return json.dumps(_ok({"feed": found}))

    @Slot(str, result=str)
    def removeFeed(self, payload_json):
        payload = json.loads(payload_json) if payload_json else {}
        fid = str(payload.get("id", "") or "").strip()
        if not fid:
            return json.dumps(_err("Missing id"))
        c = self._ensure_cache()
        before = len(c["feeds"])
        c["feeds"] = [f for f in c["feeds"] if str(f.get("id", "")) != fid]
        if len(c["feeds"]) == before:
            return json.dumps(_err("Feed not found"))
        import time
        c["updatedAt"] = int(time.time() * 1000)
        self._write()
        self._emit_updated()
        return json.dumps(_ok())

    @Slot(str, result=str)
    def fetchCatalog(self, payload_json):
        payload = json.loads(payload_json) if payload_json else {}
        url = self._norm_url(payload.get("url"))
        if not url:
            return json.dumps(_err("Invalid URL"))
        accept = ", ".join([
            "application/opds+json", "application/opds-publication+json",
            "application/atom+xml", "application/xml", "text/xml",
            "application/json", "text/html", "*/*",
        ])
        try:
            import urllib.request
            req = urllib.request.Request(url, headers={
                "Accept": accept,
                "User-Agent": "Tankoban-Max/OPDS (+Butterfly)",
            })
            with urllib.request.urlopen(req, timeout=30) as resp:
                body = resp.read().decode("utf-8", errors="replace")
                ct = resp.headers.get("Content-Type", "")
                etag = resp.headers.get("ETag", "")
                lm = resp.headers.get("Last-Modified", "")
                return json.dumps({
                    "ok": True, "status": resp.status, "statusText": resp.reason or "",
                    "url": resp.url or url, "contentType": ct, "body": body,
                    "headers": {"etag": etag, "lastModified": lm},
                })
        except Exception as e:
            return json.dumps(_err(str(e)))


class VideoBridge(StubNamespace):
    """Stub: video library scan/state."""
    videoUpdated = Signal(str)
    scanStatus = Signal(str)
    shellPlay = Signal(str)
    folderThumbnailUpdated = Signal(str)

    @Slot(str, result=str)
    def getState(self, opts=""):
        return json.dumps(_stub())

    @Slot(str, result=str)
    def scan(self, opts=""):
        return json.dumps(_stub())

    @Slot(str, result=str)
    def scanShow(self, p):
        return json.dumps(_stub())

    @Slot(str, str, result=str)
    def generateShowThumbnail(self, show_id, opts=""):
        return json.dumps(_stub())

    @Slot(result=str)
    def cancelScan(self):
        return json.dumps(_stub())

    @Slot(result=str)
    def addFolder(self):
        return json.dumps(_stub())

    @Slot(result=str)
    def addShowFolder(self):
        return json.dumps(_stub())

    @Slot(str, result=str)
    def addShowFolderPath(self, p):
        return json.dumps(_stub())

    @Slot(str, result=str)
    def removeFolder(self, p):
        return json.dumps(_stub())

    @Slot(str, result=str)
    def removeStreamableFolder(self, p):
        return json.dumps(_stub())

    @Slot(str, result=str)
    def hideShow(self, show_id):
        return json.dumps(_stub())

    @Slot(result=str)
    def openFileDialog(self):
        return json.dumps(_stub())

    @Slot(result=str)
    def openSubtitleFileDialog(self):
        return json.dumps(_stub())

    @Slot(result=str)
    def addFiles(self):
        return json.dumps(_stub())

    @Slot(str, result=str)
    def removeFile(self, p):
        return json.dumps(_stub())

    @Slot(result=str)
    def restoreAllHiddenShows(self):
        return json.dumps(_stub())

    @Slot(str, result=str)
    def restoreHiddenShowsForRoot(self, root_id):
        return json.dumps(_stub())

    @Slot(str, result=str)
    def getEpisodesForShow(self, show_id):
        return json.dumps(_stub())

    @Slot(str, result=str)
    def getEpisodesForRoot(self, root_id):
        return json.dumps(_stub())

    @Slot(str, result=str)
    def getEpisodesByIds(self, ids_json):
        return json.dumps(_stub())


class VideoPosterBridge(QObject):
    """Video poster images — JPEG/PNG per show ID, filesystem-based."""

    def __init__(self, parent=None):
        super().__init__(parent)

    @staticmethod
    def _safe_id(show_id):
        import re
        return re.sub(r'[^a-zA-Z0-9_-]', '_', str(show_id or 'unknown'))

    @staticmethod
    def _poster_dir():
        return storage.data_path("video_posters")

    def _poster_paths(self, show_id):
        sid = self._safe_id(show_id)
        d = self._poster_dir()
        return {"dir": d, "jpg": os.path.join(d, f"{sid}.jpg"), "png": os.path.join(d, f"{sid}.png")}

    def _existing_path(self, show_id):
        p = self._poster_paths(show_id)
        if os.path.exists(p["jpg"]):
            return p["jpg"]
        if os.path.exists(p["png"]):
            return p["png"]
        return None

    @staticmethod
    def _file_url(p):
        from pathlib import Path
        return Path(p).as_uri()

    @Slot(str, result=str)
    def get(self, show_id):
        try:
            p = self._existing_path(show_id)
            if not p:
                return json.dumps(None)
            return json.dumps(self._file_url(p))
        except Exception:
            return json.dumps(None)

    @Slot(str, result=str)
    def has(self, show_id):
        try:
            return json.dumps(self._existing_path(show_id) is not None)
        except Exception:
            return json.dumps(False)

    @Slot(str, str, result=str)
    def save(self, show_id, data_url):
        try:
            import base64, re
            m = re.match(r'^data:image/jpeg;base64,(.+)$', str(data_url or ""))
            if not m:
                return json.dumps(_err("Invalid data URL"))
            data = base64.b64decode(m.group(1))
            p = self._poster_paths(show_id)
            os.makedirs(p["dir"], exist_ok=True)
            with open(p["jpg"], "wb") as f:
                f.write(data)
            # Remove old png variant for deterministic get()
            if os.path.exists(p["png"]):
                os.unlink(p["png"])
            return json.dumps(_ok({"url": self._file_url(p["jpg"])}))
        except Exception:
            return json.dumps(_err("save_failed"))

    @Slot(str, result=str)
    def delete(self, show_id):
        try:
            p = self._poster_paths(show_id)
            if os.path.exists(p["jpg"]):
                os.unlink(p["jpg"])
            if os.path.exists(p["png"]):
                os.unlink(p["png"])
            # Clean video_index.json thumbPath references
            try:
                idx_path = storage.data_path("video_index.json")
                if os.path.exists(idx_path):
                    idx = storage.read_json(idx_path, None)
                    shows = idx.get("shows") if isinstance(idx, dict) else None
                    if isinstance(shows, list):
                        norm = lambda v: str(v or "").replace("\\", "/").lower()
                        tj = norm(p["jpg"])
                        tp = norm(p["png"])
                        changed = False
                        for s in shows:
                            if not isinstance(s, dict):
                                continue
                            tp_val = norm(s.get("thumbPath"))
                            if tp_val and (tp_val == tj or tp_val == tp):
                                s["thumbPath"] = None
                                changed = True
                        if changed:
                            storage.write_json_sync(idx_path, idx)
            except Exception:
                pass
            return json.dumps(_ok())
        except Exception:
            return json.dumps(_err("delete_failed"))

    @Slot(str, result=str)
    def paste(self, show_id):
        try:
            from PySide6.QtWidgets import QApplication
            from PySide6.QtCore import QBuffer, QIODevice
            clipboard = QApplication.clipboard()
            img = clipboard.image()
            if img.isNull():
                return json.dumps(_err("no_image"))
            p = self._poster_paths(show_id)
            os.makedirs(p["dir"], exist_ok=True)
            # Try JPEG first, fallback to PNG
            buf = QBuffer()
            buf.open(QIODevice.WriteOnly)
            saved = img.save(buf, "JPEG", 82)
            out_path = p["jpg"]
            if not saved or buf.size() == 0:
                buf2 = QBuffer()
                buf2.open(QIODevice.WriteOnly)
                saved = img.save(buf2, "PNG")
                if not saved or buf2.size() == 0:
                    return json.dumps(_err("encode_failed"))
                with open(p["png"], "wb") as f:
                    f.write(bytes(buf2.data()))
                out_path = p["png"]
                buf2.close()
            else:
                with open(p["jpg"], "wb") as f:
                    f.write(bytes(buf.data()))
            buf.close()
            # Clean up the other format
            if out_path.endswith(".png") and os.path.exists(p["jpg"]):
                os.unlink(p["jpg"])
            if out_path.endswith(".jpg") and os.path.exists(p["png"]):
                os.unlink(p["png"])
            return json.dumps(_ok({"url": self._file_url(out_path)}))
        except Exception:
            return json.dumps(_err("error"))


class ThumbsBridge(QObject):
    """Book cover + page thumbnail caching (filesystem-based)."""

    def __init__(self, parent=None):
        super().__init__(parent)

    @staticmethod
    def _thumb_path(book_id):
        return os.path.join(storage.data_path("thumbs"), f"{book_id}.jpg")

    @staticmethod
    def _page_thumb_path(book_id, page_index):
        safe_book = str(book_id or "unknown")
        safe_idx = str(page_index or "0")
        return os.path.join(storage.data_path("page_thumbs"), safe_book, f"{safe_idx}.jpg")

    @staticmethod
    def _file_url(p):
        from pathlib import Path
        return Path(p).as_uri()

    @staticmethod
    def _decode_data_url(data_url):
        """Extract base64 bytes from a data:image/jpeg;base64,... URL."""
        import base64, re
        m = re.match(r'^data:image/jpe?g;base64,(.+)$', str(data_url or ""))
        if not m:
            return None
        return base64.b64decode(m.group(1))

    # --- Book cover thumbnails ---

    @Slot(str, result=str)
    def has(self, book_id):
        try:
            return json.dumps(os.path.exists(self._thumb_path(book_id)))
        except Exception:
            return json.dumps(False)

    @Slot(str, result=str)
    def get(self, book_id):
        try:
            p = self._thumb_path(book_id)
            if not os.path.exists(p):
                return json.dumps(None)
            return json.dumps(self._file_url(p))
        except Exception:
            return json.dumps(None)

    @Slot(str, str, result=str)
    def save(self, book_id, data_url):
        try:
            data = self._decode_data_url(data_url)
            if not data:
                return json.dumps(_err("Invalid data URL"))
            p = self._thumb_path(book_id)
            os.makedirs(os.path.dirname(p), exist_ok=True)
            with open(p, "wb") as f:
                f.write(data)
            return json.dumps(_ok())
        except Exception:
            return json.dumps(_err("save_failed"))

    @Slot(str, result=str)
    def delete(self, book_id):
        try:
            p = self._thumb_path(book_id)
            if os.path.exists(p):
                os.unlink(p)
            return json.dumps(_ok())
        except Exception:
            return json.dumps(_err("delete_failed"))

    # --- Page thumbnails ---

    @Slot(str, str, result=str)
    def hasPage(self, book_id, page_index):
        try:
            return json.dumps(os.path.exists(self._page_thumb_path(book_id, page_index)))
        except Exception:
            return json.dumps(False)

    @Slot(str, str, result=str)
    def getPage(self, book_id, page_index):
        try:
            p = self._page_thumb_path(book_id, page_index)
            if not os.path.exists(p):
                return json.dumps(None)
            return json.dumps(self._file_url(p))
        except Exception:
            return json.dumps(None)

    @Slot(str, str, str, result=str)
    def savePage(self, book_id, page_index, data_url):
        try:
            data = self._decode_data_url(data_url)
            if not data:
                return json.dumps(_err("Invalid data URL"))
            p = self._page_thumb_path(book_id, page_index)
            os.makedirs(os.path.dirname(p), exist_ok=True)
            with open(p, "wb") as f:
                f.write(data)
            return json.dumps(_ok())
        except Exception:
            return json.dumps(_err("save_failed"))


class ArchivesBridge(QObject):
    """CBZ/CBR archive session management — ZIP via zipfile, RAR via rarfile."""

    _CBZ_MAX = 3
    _CBR_MAX = 3

    def __init__(self, parent=None):
        super().__init__(parent)
        self._cbz_sessions = {}  # {sid: {"zf": ZipFile, "entries": [...], "path": str, "opened_at": int, "last_used": int}}
        self._cbz_seq = 1
        self._cbr_sessions = {}  # {sid: {"rf": RarFile, "entries": [...], "path": str, "opened_at": int}}
        self._cbr_seq = 1

    def _cbz_evict(self):
        while len(self._cbz_sessions) > self._CBZ_MAX:
            # Evict least recently used
            oldest_sid = min(self._cbz_sessions, key=lambda s: self._cbz_sessions[s].get("last_used", 0))
            try:
                self._cbz_sessions[oldest_sid]["zf"].close()
            except Exception:
                pass
            del self._cbz_sessions[oldest_sid]

    def _cbr_evict(self):
        while len(self._cbr_sessions) > self._CBR_MAX:
            oldest_sid = min(self._cbr_sessions, key=lambda s: self._cbr_sessions[s].get("opened_at", 0))
            try:
                self._cbr_sessions[oldest_sid]["rf"].close()
            except Exception:
                pass
            del self._cbr_sessions[oldest_sid]

    @Slot(str, result=str)
    def cbzOpen(self, file_path):
        import zipfile, time
        fp = str(file_path or "").strip()
        if not fp:
            return json.dumps(_err("Missing CBZ path"))
        try:
            zf = zipfile.ZipFile(fp, "r")
            entries = []
            for info in zf.infolist():
                if not info.is_dir():
                    entries.append({"name": info.filename, "uSize": info.file_size, "cSize": info.compress_size})
            sid = str(self._cbz_seq)
            self._cbz_seq += 1
            now = int(time.time() * 1000)
            self._cbz_sessions[sid] = {"zf": zf, "entries": entries, "path": fp, "opened_at": now, "last_used": now}
            self._cbz_evict()
            return json.dumps(_ok({"sessionId": sid, "entries": entries}))
        except Exception as e:
            return json.dumps(_err(str(e)))

    @Slot(str, str, result=str)
    def cbzReadEntry(self, session_id, entry_index):
        import base64, time
        sid = str(session_id or "")
        s = self._cbz_sessions.get(sid)
        if not s:
            return json.dumps(_err("CBZ session not found"))
        s["last_used"] = int(time.time() * 1000)
        idx = int(entry_index)
        if idx < 0 or idx >= len(s["entries"]):
            return json.dumps(_err("Invalid entry index"))
        try:
            entry_name = s["entries"][idx]["name"]
            data = s["zf"].read(entry_name)
            return json.dumps({"ok": True, "data": base64.b64encode(data).decode("ascii")})
        except Exception as e:
            return json.dumps(_err(str(e)))

    @Slot(str, result=str)
    def cbzClose(self, session_id):
        sid = str(session_id or "")
        s = self._cbz_sessions.pop(sid, None)
        if s:
            try:
                s["zf"].close()
            except Exception:
                pass
        return json.dumps(_ok())

    @Slot(str, result=str)
    def cbrOpen(self, file_path):
        import time
        fp = str(file_path or "").strip()
        if not fp:
            return json.dumps(_err("Missing CBR path"))
        try:
            import rarfile
            rf = rarfile.RarFile(fp)
            entries = []
            for info in rf.infolist():
                if not info.is_dir():
                    entries.append({"name": info.filename})
            sid = str(self._cbr_seq)
            self._cbr_seq += 1
            now = int(time.time() * 1000)
            self._cbr_sessions[sid] = {"rf": rf, "entries": entries, "path": fp, "opened_at": now}
            self._cbr_evict()
            return json.dumps(_ok({"sessionId": sid, "entries": entries}))
        except ImportError:
            return json.dumps(_err("rarfile package not installed"))
        except Exception as e:
            return json.dumps(_err(str(e)))

    @Slot(str, str, result=str)
    def cbrReadEntry(self, session_id, entry_index):
        import base64
        sid = str(session_id or "")
        s = self._cbr_sessions.get(sid)
        if not s:
            return json.dumps(_err("CBR session not found"))
        idx = int(entry_index)
        if idx < 0 or idx >= len(s["entries"]):
            return json.dumps(_err("Invalid entry index"))
        try:
            entry_name = s["entries"][idx]["name"]
            data = s["rf"].read(entry_name)
            return json.dumps({"ok": True, "data": base64.b64encode(data).decode("ascii")})
        except Exception as e:
            return json.dumps(_err(str(e)))

    @Slot(str, result=str)
    def cbrClose(self, session_id):
        sid = str(session_id or "")
        s = self._cbr_sessions.pop(sid, None)
        if s:
            try:
                s["rf"].close()
            except Exception:
                pass
        return json.dumps(_ok())


class ExportBridge(StubNamespace):
    """Stub: save/copy comic page."""

    @Slot(str, result=str)
    def saveEntry(self, payload):
        return json.dumps(_stub())

    @Slot(str, result=str)
    def copyEntry(self, payload):
        return json.dumps(_stub())


class FilesBridge(QObject):
    """Raw file read + video folder listing."""

    _VIDEO_EXTS = {
        '.mp4', '.mkv', '.avi', '.mov', '.webm', '.m4v', '.ts', '.m2ts',
        '.flv', '.wmv', '.mpg', '.mpeg', '.ogv', '.3gp',
    }

    def __init__(self, parent=None):
        super().__init__(parent)

    @Slot(str, result=str)
    def read(self, file_path):
        import base64
        fp = str(file_path or "").strip()
        if not fp:
            return json.dumps(_err("Missing path"))
        try:
            data = open(fp, "rb").read()
            return json.dumps({"ok": True, "data": base64.b64encode(data).decode("ascii")})
        except Exception as e:
            return json.dumps(_err(str(e)))

    @Slot(str, result=str)
    def listFolderVideos(self, folder_path):
        fp = str(folder_path or "").strip()
        if not fp:
            return json.dumps([])
        try:
            results = []
            for entry in os.scandir(fp):
                if entry.is_file():
                    ext = os.path.splitext(entry.name)[1].lower()
                    if ext in self._VIDEO_EXTS:
                        results.append(os.path.join(fp, entry.name))
            return json.dumps(results)
        except Exception:
            return json.dumps([])


class PlayerBridge(StubNamespace):
    """Stub: player controls. Will be replaced by internal mpv widget."""
    playerExited = Signal(str)  # BUILD14_PLAYER_EXITED

    @Slot(str, str, result=str)
    def start(self, media_ref, opts):
        return json.dumps(_stub())

    @Slot(result=str)
    def play(self):
        return json.dumps(_stub())

    @Slot(result=str)
    def pause(self):
        return json.dumps(_stub())

    @Slot(str, result=str)
    def seek(self, seconds):
        return json.dumps(_stub())

    @Slot(str, result=str)
    def stop(self, reason):
        return json.dumps(_stub())

    @Slot(str, result=str)
    def launchQt(self, args_json):
        return json.dumps(_stub())

    @Slot(result=str)
    def getState(self):
        return json.dumps(_stub())


class Build14Bridge(QObject):
    """Return state save/restore for player window transitions — single JSON blob."""

    _STATE_FILE = "build14_return_state.json"

    def __init__(self, parent=None):
        super().__init__(parent)

    @Slot(str, result=str)
    def saveReturnState(self, state_json):
        data = json.loads(state_json) if state_json else None
        storage.write_json_sync(storage.data_path(self._STATE_FILE), data)
        return json.dumps(_ok())

    @Slot(result=str)
    def getReturnState(self):
        data = storage.read_json(storage.data_path(self._STATE_FILE), None)
        return json.dumps(_ok({"state": data}))

    @Slot(result=str)
    def clearReturnState(self):
        storage.write_json_sync(storage.data_path(self._STATE_FILE), None)
        return json.dumps(_ok())


class MpvBridge(StubNamespace):
    """Stub: embedded mpv (Holy Grail). Not needed in Butterfly — mpv is native."""

    @Slot(str, result=str)
    def isAvailable(self, opts=""):
        # Return false — there's no embedded mpv path in Butterfly,
        # the player IS the native mpv widget.
        return json.dumps({"ok": True, "available": False})

    @Slot(result=str)
    def probe(self):
        return json.dumps({"ok": True, "available": False})


class HolyGrailBridge(StubNamespace):
    """Stub: Holy Grail experiment. Permanently returns unavailable."""

    @Slot(result=str)
    def probe(self):
        return json.dumps({"ok": False, "error": "holy_grail_not_available_in_butterfly"})


class AudiobooksBridge(QObject):
    """Audiobooks: scanner stubs + working progress/pairing CRUD."""
    audiobookUpdated = Signal(str)
    scanStatus = Signal(str)

    _PROGRESS_FILE = "audiobook_progress.json"
    _PAIRINGS_FILE = "audiobook_pairings.json"

    def __init__(self, parent=None):
        super().__init__(parent)
        self._progress_cache = None
        self._pairings_cache = None

    def _ensure_progress(self):
        if self._progress_cache is not None:
            return self._progress_cache
        self._progress_cache = storage.read_json(storage.data_path(self._PROGRESS_FILE), {})
        return self._progress_cache

    def _ensure_pairings(self):
        if self._pairings_cache is not None:
            return self._pairings_cache
        self._pairings_cache = storage.read_json(storage.data_path(self._PAIRINGS_FILE), {})
        return self._pairings_cache

    # --- Scanner stubs (need worker) ---

    @Slot(result=str)
    def getState(self):
        return json.dumps(_stub())

    @Slot(result=str)
    def scan(self):
        return json.dumps(_stub())

    @Slot(str, result=str)
    def addRootFolder(self, p):
        return json.dumps(_stub())

    @Slot(result=str)
    def addFolder(self):
        return json.dumps(_stub())

    @Slot(str, result=str)
    def removeRootFolder(self, p):
        return json.dumps(_stub())

    # --- Progress CRUD (working) ---

    @Slot(result=str)
    def getProgressAll(self):
        return json.dumps(_ok(self._ensure_progress()))

    @Slot(str, result=str)
    def getProgress(self, ab_id):
        aid = str(ab_id or "").strip()
        if not aid:
            return json.dumps(None)
        all_p = self._ensure_progress()
        return json.dumps(all_p.get(aid))

    @Slot(str, str, result=str)
    def saveProgress(self, ab_id, progress_json):
        aid = str(ab_id or "").strip()
        if not aid:
            return json.dumps(_err("invalid_id"))
        progress = json.loads(progress_json) if progress_json else {}
        all_p = self._ensure_progress()
        prev = all_p.get(aid) if isinstance(all_p.get(aid), dict) else {}
        next_val = progress if isinstance(progress, dict) else {}
        import time
        all_p[aid] = {**prev, **next_val, "updatedAt": int(time.time() * 1000)}
        storage.write_json_debounced(storage.data_path(self._PROGRESS_FILE), all_p)
        return json.dumps(_ok())

    @Slot(str, result=str)
    def clearProgress(self, ab_id):
        aid = str(ab_id or "").strip()
        if not aid:
            return json.dumps(_err("invalid_id"))
        all_p = self._ensure_progress()
        all_p.pop(aid, None)
        storage.write_json_debounced(storage.data_path(self._PROGRESS_FILE), all_p)
        return json.dumps(_ok())

    # --- Pairing CRUD (working) ---

    @Slot(str, result=str)
    def getPairing(self, book_id):
        bid = str(book_id or "").strip()
        if not bid:
            return json.dumps(None)
        all_p = self._ensure_pairings()
        return json.dumps(all_p.get(bid))

    @Slot(str, str, result=str)
    def savePairing(self, book_id, pairing_json):
        bid = str(book_id or "").strip()
        if not bid:
            return json.dumps(_err("invalid_book_id"))
        pairing = json.loads(pairing_json) if pairing_json else {}
        all_p = self._ensure_pairings()
        data = pairing if isinstance(pairing, dict) else {}
        import time
        all_p[bid] = {**data, "updatedAt": int(time.time() * 1000)}
        storage.write_json_debounced(storage.data_path(self._PAIRINGS_FILE), all_p)
        return json.dumps(_ok())

    @Slot(str, result=str)
    def deletePairing(self, book_id):
        bid = str(book_id or "").strip()
        if not bid:
            return json.dumps(_err("invalid_book_id"))
        all_p = self._ensure_pairings()
        all_p.pop(bid, None)
        storage.write_json_debounced(storage.data_path(self._PAIRINGS_FILE), all_p)
        return json.dumps(_ok())

    @Slot(result=str)
    def getPairingAll(self):
        return json.dumps(_ok(self._ensure_pairings()))


# ---------------------------------------------------------------------------
# Web/Browser stubs (large surface — Phase 3)
# ---------------------------------------------------------------------------

class WebSourcesBridge(StubNamespace):
    sourcesUpdated = Signal(str)
    downloadStarted = Signal(str)
    downloadProgress = Signal(str)
    downloadCompleted = Signal(str)
    downloadsUpdated = Signal(str)
    popupOpen = Signal(str)
    destinationPickerRequest = Signal(str)

    @Slot(result=str)
    def get(self): return json.dumps(_stub())
    @Slot(str, result=str)
    def add(self, p): return json.dumps(_stub())
    @Slot(str, result=str)
    def remove(self, p): return json.dumps(_stub())
    @Slot(str, result=str)
    def update(self, p): return json.dumps(_stub())
    @Slot(str, result=str)
    def routeDownload(self, p): return json.dumps(_stub())
    @Slot(result=str)
    def getDestinations(self): return json.dumps(_stub())
    @Slot(str, result=str)
    def downloadFromUrl(self, p): return json.dumps(_stub())
    @Slot(result=str)
    def getDownloadHistory(self): return json.dumps(_err("not_implemented"))
    @Slot(result=str)
    def clearDownloadHistory(self): return json.dumps(_stub())
    @Slot(str, result=str)
    def removeDownloadHistory(self, p): return json.dumps(_stub())
    @Slot(str, result=str)
    def pauseDownload(self, p): return json.dumps(_stub())
    @Slot(str, result=str)
    def resumeDownload(self, p): return json.dumps(_stub())
    @Slot(str, result=str)
    def cancelDownload(self, p): return json.dumps(_stub())
    @Slot(str, result=str)
    def pickDestinationFolder(self, p): return json.dumps(_stub())
    @Slot(str, result=str)
    def listDestinationFolders(self, p): return json.dumps(_stub())
    @Slot(str, result=str)
    def resolveDestinationPicker(self, p): return json.dumps(_stub())
    @Slot(str, result=str)
    def pickSaveFolder(self, p): return json.dumps(_stub())


class WebBrowserSettingsBridge(QObject, JsonCrudMixin):
    _crud_file = "web_browser_settings.json"
    _crud_debounce = False

    @Slot(result=str)
    def get(self):
        data = self._crud_read()
        return json.dumps(_ok({"settings": data}))

    @Slot(str, result=str)
    def save(self, payload_json):
        payload = json.loads(payload_json)
        storage.write_json_sync(self._crud_path(), payload)
        return json.dumps(_ok())


class WebHistoryBridge(QObject):
    """Web browsing history — array store with upsert, scoped filtering, pagination."""
    historyUpdated = Signal(str)

    _HISTORY_FILE = "web_browsing_history.json"
    _MAX = 10000
    _SCOPE_SOURCES = "sources_browser"
    _SCOPE_LEGACY = "legacy_browser"
    _MIGRATION_KEY = "sourcesHistoryScopedV1"

    def __init__(self, parent=None):
        super().__init__(parent)
        self._cache = None

    @staticmethod
    def _normalize_scope(raw):
        s = str(raw or "").strip()
        if s in ("sources_browser", "legacy_browser"):
            return s
        return ""

    def _ensure_cache(self):
        if self._cache is not None:
            return self._cache
        p = storage.data_path(self._HISTORY_FILE)
        raw = storage.read_json(p, None)
        if raw and isinstance(raw.get("entries"), list):
            self._cache = {
                "entries": raw["entries"],
                "updatedAt": raw.get("updatedAt", 0) or 0,
                "migrations": raw.get("migrations") if isinstance(raw.get("migrations"), dict) else {},
            }
        else:
            self._cache = {"entries": [], "updatedAt": 0, "migrations": {}}
        # Run migration: filter to sources_browser scope only
        if not self._cache["migrations"].get(self._MIGRATION_KEY):
            self._cache["entries"] = [e for e in self._cache["entries"] if e and e.get("scope") == self._SCOPE_SOURCES]
            import time
            self._cache["updatedAt"] = int(time.time() * 1000)
            self._cache["migrations"][self._MIGRATION_KEY] = True
            storage.write_json_debounced(p, self._cache, 60)
        return self._cache

    def _write(self):
        c = self._ensure_cache()
        if len(c["entries"]) > self._MAX:
            c["entries"] = c["entries"][:self._MAX]
        storage.write_json_debounced(storage.data_path(self._HISTORY_FILE), c, 120)

    def _emit_updated(self):
        c = self._ensure_cache()
        self.historyUpdated.emit(json.dumps({"total": len(c["entries"]), "updatedAt": c["updatedAt"]}))

    @staticmethod
    def _normalize_entry(payload):
        src = payload if isinstance(payload, dict) else {}
        url = str(src.get("url", "") or "").strip()
        if not url:
            return None
        import time, random, string
        now = int(time.time() * 1000)
        rand = "".join(random.choices(string.ascii_lowercase + string.digits, k=6))
        return {
            "id": f"wh_{now}_{rand}",
            "url": url,
            "title": str(src.get("title", "") or "").strip(),
            "favicon": str(src.get("favicon", "") or "").strip(),
            "visitedAt": int(src.get("visitedAt") or src.get("timestamp") or now),
            "sourceTabId": str(src.get("sourceTabId", "") or ""),
            "scope": WebHistoryBridge._normalize_scope(src.get("scope")),
        }

    def _apply_filters(self, entries, opts):
        query = str(opts.get("query", "") or "").strip().lower()
        from_ts = int(opts.get("from", 0) or 0)
        to_ts = int(opts.get("to", 0) or 0)
        scope = self._normalize_scope(opts.get("scope"))
        out = []
        for e in entries:
            if not e:
                continue
            if scope and self._normalize_scope(e.get("scope")) != scope:
                continue
            at = int(e.get("visitedAt", 0) or 0)
            if from_ts and at < from_ts:
                continue
            if to_ts and at > to_ts:
                continue
            if query:
                in_title = query in str(e.get("title", "") or "").lower()
                in_url = query in str(e.get("url", "") or "").lower()
                if not in_title and not in_url:
                    continue
            out.append(e)
        return out

    @Slot(str, result=str)
    def list(self, payload_json):
        payload = json.loads(payload_json) if payload_json else {}
        c = self._ensure_cache()
        filtered = self._apply_filters(c.get("entries", []), payload)
        limit = int(payload.get("limit", 200) or 200)
        offset = int(payload.get("offset", 0) or 0)
        if limit <= 0:
            limit = 200
        if limit > 1000:
            limit = 1000
        if offset < 0:
            offset = 0
        sl = filtered[offset:offset + limit]
        return json.dumps(_ok({"entries": sl, "total": len(filtered)}))

    @Slot(str, result=str)
    def add(self, payload_json):
        payload = json.loads(payload_json) if payload_json else {}
        entry = self._normalize_entry(payload)
        if not entry:
            return json.dumps(_err("Missing URL"))
        c = self._ensure_cache()
        c["entries"].insert(0, entry)
        if len(c["entries"]) > self._MAX:
            c["entries"] = c["entries"][:self._MAX]
        import time
        c["updatedAt"] = int(time.time() * 1000)
        self._write()
        self._emit_updated()
        return json.dumps(_ok({"entry": entry}))

    @Slot(str, result=str)
    def upsert(self, payload_json):
        payload = json.loads(payload_json) if payload_json else {}
        url = str(payload.get("url", "") or "").strip()
        if not url:
            return json.dumps(_err("Missing URL"))
        scope = self._normalize_scope(payload.get("scope"))
        title = str(payload.get("title", "") or "").strip()
        favicon = str(payload.get("favicon", "") or "").strip()
        import time
        now = int(time.time() * 1000)
        visited_at = int(payload.get("visitedAt") or payload.get("timestamp") or now)
        if visited_at <= 0:
            visited_at = now
        dedupe_ms = int(payload.get("dedupeWindowMs", 3000) or 3000)
        if dedupe_ms < 0:
            dedupe_ms = 3000
        if dedupe_ms > 600000:
            dedupe_ms = 600000
        c = self._ensure_cache()
        idx = -1
        for i, e in enumerate(c["entries"]):
            if not e:
                continue
            if str(e.get("url", "")) != url:
                continue
            if scope and self._normalize_scope(e.get("scope")) != scope:
                continue
            if dedupe_ms > 0:
                at = int(e.get("visitedAt", 0) or 0)
                if abs(visited_at - at) > dedupe_ms:
                    continue
            idx = i
            break
        if idx != -1:
            entry = c["entries"][idx]
            if scope:
                entry["scope"] = scope
            if title:
                entry["title"] = title
            if favicon:
                entry["favicon"] = favicon
            entry["url"] = url
            entry["visitedAt"] = visited_at
            c["entries"].pop(idx)
            c["entries"].insert(0, entry)
            c["updatedAt"] = now
            self._write()
            self._emit_updated()
            return json.dumps(_ok({"entry": entry, "mode": "updated"}))
        inserted = self._normalize_entry({
            "url": url, "title": title or url, "favicon": favicon,
            "visitedAt": visited_at, "scope": scope,
            "sourceTabId": payload.get("sourceTabId"),
        })
        if not inserted:
            return json.dumps(_err("Missing URL"))
        c["entries"].insert(0, inserted)
        if len(c["entries"]) > self._MAX:
            c["entries"] = c["entries"][:self._MAX]
        c["updatedAt"] = now
        self._write()
        self._emit_updated()
        return json.dumps(_ok({"entry": inserted, "mode": "inserted"}))

    @Slot(str, result=str)
    def clear(self, payload_json):
        payload = json.loads(payload_json) if payload_json else {}
        c = self._ensure_cache()
        from_ts = int(payload.get("from", 0) or 0)
        to_ts = int(payload.get("to", 0) or 0)
        scope = self._normalize_scope(payload.get("scope"))
        if not from_ts and not to_ts and not scope:
            c["entries"] = []
        else:
            def keep(e):
                if not e:
                    return False
                e_scope = self._normalize_scope(e.get("scope"))
                if scope and e_scope != scope:
                    return True
                at = int(e.get("visitedAt", 0) or 0)
                if from_ts and at < from_ts:
                    return True
                if to_ts and at > to_ts:
                    return True
                return False
            c["entries"] = [e for e in c["entries"] if keep(e)]
        import time
        c["updatedAt"] = int(time.time() * 1000)
        self._write()
        self._emit_updated()
        return json.dumps(_ok())

    @Slot(str, result=str)
    def remove(self, payload_json):
        payload = json.loads(payload_json) if payload_json else {}
        eid = str(payload.get("id", "") or "").strip()
        if not eid:
            return json.dumps(_err("Missing id"))
        c = self._ensure_cache()
        before = len(c["entries"])
        c["entries"] = [e for e in c["entries"] if not (e and str(e.get("id", "")) == eid)]
        if len(c["entries"]) == before:
            return json.dumps(_err("Not found"))
        import time
        c["updatedAt"] = int(time.time() * 1000)
        self._write()
        self._emit_updated()
        return json.dumps(_ok())


class WebSessionBridge(QObject, JsonCrudMixin):
    _crud_file = "web_session_state.json"
    sessionUpdated = Signal(str)

    @Slot(result=str)
    def get(self):
        data = self._crud_read()
        return json.dumps(_ok({"state": data}))

    @Slot(str, result=str)
    def save(self, payload_json):
        storage.write_json_debounced(self._crud_path(), json.loads(payload_json))
        return json.dumps(_ok())

    @Slot(result=str)
    def clear(self):
        return json.dumps(self.crud_clear_all())


class WebBookmarksBridge(QObject):
    """Web bookmarks — array store with dedup by URL, toggle, max 5000."""
    bookmarksUpdated = Signal(str)

    _BOOKMARKS_FILE = "web_bookmarks.json"
    _MAX = 5000

    def __init__(self, parent=None):
        super().__init__(parent)
        self._cache = None

    def _ensure_cache(self):
        if self._cache is not None:
            return self._cache
        p = storage.data_path(self._BOOKMARKS_FILE)
        raw = storage.read_json(p, None)
        if raw and isinstance(raw.get("bookmarks"), list):
            self._cache = {"bookmarks": raw["bookmarks"], "updatedAt": raw.get("updatedAt", 0) or 0}
        else:
            self._cache = {"bookmarks": [], "updatedAt": 0}
        return self._cache

    def _write(self):
        c = self._ensure_cache()
        bm = c.get("bookmarks", [])
        if len(bm) > self._MAX:
            c["bookmarks"] = bm[:self._MAX]
        storage.write_json_debounced(storage.data_path(self._BOOKMARKS_FILE), c)

    def _emit_updated(self):
        c = self._ensure_cache()
        self.bookmarksUpdated.emit(json.dumps({"bookmarks": c["bookmarks"], "updatedAt": c["updatedAt"]}))

    @staticmethod
    def _sanitize(src):
        if not isinstance(src, dict):
            return None
        url = str(src.get("url", "") or "").strip()
        if not url:
            return None
        import time, random, string
        now = int(time.time() * 1000)
        rand = "".join(random.choices(string.ascii_lowercase + string.digits, k=6))
        return {
            "id": str(src.get("id", "") or "") or f"wbm_{now}_{rand}",
            "url": url,
            "title": str(src.get("title", "") or "").strip(),
            "favicon": str(src.get("favicon", "") or "").strip(),
            "folder": str(src.get("folder", "") or "").strip(),
            "createdAt": int(src.get("createdAt", 0) or 0) or now,
            "updatedAt": int(src.get("updatedAt", 0) or 0) or now,
        }

    def _find_by_url(self, url):
        target = str(url or "").strip()
        if not target:
            return None
        for b in self._ensure_cache()["bookmarks"]:
            if b and str(b.get("url", "") or "").strip() == target:
                return b
        return None

    @Slot(result=str)
    def list(self):
        c = self._ensure_cache()
        return json.dumps(_ok({"bookmarks": c["bookmarks"]}))

    @Slot(str, result=str)
    def add(self, payload_json):
        payload = json.loads(payload_json) if payload_json else {}
        b = self._sanitize(payload)
        if not b:
            return json.dumps(_err("Missing URL"))
        existing = self._find_by_url(b["url"])
        if existing:
            return json.dumps(_ok({"bookmark": existing, "existed": True}))
        c = self._ensure_cache()
        c["bookmarks"].insert(0, b)
        if len(c["bookmarks"]) > self._MAX:
            c["bookmarks"] = c["bookmarks"][:self._MAX]
        import time
        c["updatedAt"] = int(time.time() * 1000)
        self._write()
        self._emit_updated()
        return json.dumps(_ok({"bookmark": b, "existed": False}))

    @Slot(str, result=str)
    def update(self, payload_json):
        payload = json.loads(payload_json) if payload_json else {}
        bid = str(payload.get("id", "") or "").strip()
        if not bid:
            return json.dumps(_err("Missing id"))
        c = self._ensure_cache()
        target = None
        for b in c["bookmarks"]:
            if b and str(b.get("id", "")) == bid:
                target = b
                break
        if not target:
            return json.dumps(_err("Not found"))
        next_url = str(payload["url"]).strip() if payload.get("url") is not None else target["url"]
        if not next_url:
            return json.dumps(_err("Missing URL"))
        target["url"] = next_url
        if payload.get("title") is not None:
            target["title"] = str(payload["title"] or "").strip()
        if payload.get("folder") is not None:
            target["folder"] = str(payload["folder"] or "").strip()
        import time
        target["updatedAt"] = int(time.time() * 1000)
        c["updatedAt"] = target["updatedAt"]
        self._write()
        self._emit_updated()
        return json.dumps(_ok({"bookmark": target}))

    @Slot(str, result=str)
    def remove(self, payload_json):
        payload = json.loads(payload_json) if payload_json else {}
        bid = str(payload.get("id", "") or "").strip()
        if not bid:
            return json.dumps(_err("Missing id"))
        c = self._ensure_cache()
        before = len(c["bookmarks"])
        c["bookmarks"] = [b for b in c["bookmarks"] if not (b and str(b.get("id", "")) == bid)]
        if len(c["bookmarks"]) == before:
            return json.dumps(_err("Not found"))
        import time
        c["updatedAt"] = int(time.time() * 1000)
        self._write()
        self._emit_updated()
        return json.dumps(_ok())

    @Slot(str, result=str)
    def toggle(self, payload_json):
        payload = json.loads(payload_json) if payload_json else {}
        url = str(payload.get("url", "") or "").strip()
        if not url:
            return json.dumps(_err("Missing URL"))
        c = self._ensure_cache()
        existing = self._find_by_url(url)
        import time
        if existing:
            c["bookmarks"] = [b for b in c["bookmarks"] if not (b and str(b.get("id", "")) == str(existing.get("id", "")))]
            c["updatedAt"] = int(time.time() * 1000)
            self._write()
            self._emit_updated()
            return json.dumps(_ok({"added": False, "bookmark": existing}))
        created = self._sanitize({
            "url": url,
            "title": payload.get("title", ""),
            "favicon": payload.get("favicon", ""),
            "folder": payload.get("folder", ""),
        })
        if not created:
            return json.dumps(_err("Missing URL"))
        c["bookmarks"].insert(0, created)
        c["updatedAt"] = int(time.time() * 1000)
        self._write()
        self._emit_updated()
        return json.dumps(_ok({"added": True, "bookmark": created}))


class WebDataBridge(StubNamespace):
    @Slot(str, result=str)
    def clear(self, p): return json.dumps(_stub())
    @Slot(result=str)
    def usage(self): return json.dumps(_stub())


class WebPermissionsBridge(QObject):
    """Per-origin web permission overrides — rules array with origin normalization."""
    permissionsUpdated = Signal(str)
    permissionPrompt = Signal(str)

    _PERMISSIONS_FILE = "web_permissions.json"
    _VALID_DECISIONS = {"allow", "deny", "ask"}

    def __init__(self, parent=None):
        super().__init__(parent)
        self._cache = None

    @staticmethod
    def _normalize_origin(value):
        raw = str(value or "").strip()
        if not raw:
            return ""
        try:
            from urllib.parse import urlparse
            u = urlparse(raw)
            if u.scheme not in ("http", "https"):
                return ""
            origin = f"{u.scheme}://{u.netloc}".lower() if u.netloc else ""
            return origin
        except Exception:
            return ""

    @classmethod
    def _decision_from_value(cls, value):
        d = str(value or "").strip().lower()
        return d if d in cls._VALID_DECISIONS else "ask"

    def _ensure_cache(self):
        if self._cache is not None:
            return self._cache
        p = storage.data_path(self._PERMISSIONS_FILE)
        raw = storage.read_json(p, None)
        if raw and isinstance(raw.get("rules"), list):
            self._cache = {"rules": raw["rules"], "updatedAt": raw.get("updatedAt", 0) or 0}
        else:
            self._cache = {"rules": [], "updatedAt": 0}
        return self._cache

    def _write(self):
        storage.write_json_sync(storage.data_path(self._PERMISSIONS_FILE), self._ensure_cache())

    def _emit_updated(self):
        c = self._ensure_cache()
        self.permissionsUpdated.emit(json.dumps({"rules": c["rules"], "updatedAt": c["updatedAt"]}))

    def _find_rule(self, origin, permission):
        o = self._normalize_origin(origin)
        p = str(permission or "").strip()
        if not o or not p:
            return None
        for r in self._ensure_cache()["rules"]:
            if not r:
                continue
            if str(r.get("origin", "")) == o and str(r.get("permission", "")) == p:
                return r
        return None

    @Slot(result=str)
    def list(self):
        c = self._ensure_cache()
        return json.dumps(_ok({"rules": c["rules"], "updatedAt": c["updatedAt"]}))

    @Slot(str, result=str)
    def set(self, payload_json):
        payload = json.loads(payload_json) if payload_json else {}
        origin = self._normalize_origin(payload.get("origin"))
        permission = str(payload.get("permission", "") or "").strip()
        decision = self._decision_from_value(payload.get("decision"))
        if not origin:
            return json.dumps(_err("Invalid origin"))
        if not permission:
            return json.dumps(_err("Missing permission"))
        c = self._ensure_cache()
        found = self._find_rule(origin, permission)
        import time
        now = int(time.time() * 1000)
        if not found:
            found = {"origin": origin, "permission": permission, "decision": decision, "updatedAt": now}
            c["rules"].append(found)
        else:
            found["decision"] = decision
            found["updatedAt"] = now
        c["updatedAt"] = now
        self._write()
        self._emit_updated()
        return json.dumps(_ok({"rule": found}))

    @Slot(str, result=str)
    def reset(self, payload_json):
        payload = json.loads(payload_json) if payload_json else {}
        origin = self._normalize_origin(payload.get("origin"))
        permission = str(payload.get("permission", "") or "").strip()
        c = self._ensure_cache()
        if not origin and not permission:
            c["rules"] = []
        else:
            def keep(r):
                if not r:
                    return False
                if origin and str(r.get("origin", "")) != origin:
                    return True
                if permission and str(r.get("permission", "")) != permission:
                    return True
                return False
            c["rules"] = [r for r in c["rules"] if keep(r)]
        import time
        c["updatedAt"] = int(time.time() * 1000)
        self._write()
        self._emit_updated()
        return json.dumps(_ok())

    @Slot(str, result=str)
    def resolvePrompt(self, payload_json):
        # Needs QWebEngineView session API — stays stub for now
        return json.dumps(_stub())


class WebUserscriptsBridge(StubNamespace):
    userscriptsUpdated = Signal(str)
    @Slot(result=str)
    def get(self): return json.dumps(_stub())
    @Slot(str, result=str)
    def setEnabled(self, p): return json.dumps(_stub())
    @Slot(str, result=str)
    def upsert(self, p): return json.dumps(_stub())
    @Slot(str, result=str)
    def remove(self, p): return json.dumps(_stub())
    @Slot(str, result=str)
    def setRuleEnabled(self, p): return json.dumps(_stub())


class WebAdblockBridge(QObject):
    """Network-level ad blocker — domain blocklist from EasyList, config CRUD."""
    adblockUpdated = Signal(str)

    _CFG_FILE = "web_adblock.json"
    _LISTS_FILE = "web_adblock_lists.json"
    _DEFAULT_LIST_URLS = [
        "https://easylist.to/easylist/easylist.txt",
        "https://easylist.to/easylist/easyprivacy.txt",
    ]
    _FALLBACK_DOMAINS = [
        "doubleclick.net", "googlesyndication.com", "adservice.google.com",
        "ads.yahoo.com", "taboola.com", "outbrain.com",
    ]

    def __init__(self, parent=None):
        super().__init__(parent)
        self._cfg = None
        self._lists = None
        self._domain_set = None

    def _ensure_cfg(self):
        if self._cfg is not None:
            return self._cfg
        raw = storage.read_json(storage.data_path(self._CFG_FILE), None)
        if isinstance(raw, dict):
            import time
            now = int(time.time() * 1000)
            self._cfg = {
                "enabled": raw.get("enabled", True) is not False,
                "siteAllowlist": raw["siteAllowlist"] if isinstance(raw.get("siteAllowlist"), list) else [],
                "updatedAt": int(raw.get("updatedAt", now) or now),
                "blockedCount": int(raw.get("blockedCount", 0) or 0),
                "lastListUpdateAt": int(raw.get("lastListUpdateAt", 0) or 0),
                "listUrls": raw["listUrls"] if isinstance(raw.get("listUrls"), list) and raw["listUrls"] else list(self._DEFAULT_LIST_URLS),
            }
        else:
            import time
            self._cfg = {
                "enabled": True, "siteAllowlist": [], "updatedAt": int(time.time() * 1000),
                "blockedCount": 0, "lastListUpdateAt": 0, "listUrls": list(self._DEFAULT_LIST_URLS),
            }
        return self._cfg

    def _ensure_lists(self):
        if self._lists is not None:
            return self._lists
        raw = storage.read_json(storage.data_path(self._LISTS_FILE), None)
        if isinstance(raw, dict) and isinstance(raw.get("domains"), list):
            self._lists = {
                "domains": raw["domains"],
                "updatedAt": int(raw.get("updatedAt", 0) or 0),
                "sourceCount": int(raw.get("sourceCount", 0) or 0),
            }
        else:
            self._lists = {"domains": [], "updatedAt": 0, "sourceCount": 0}
        self._domain_set = set(self._lists["domains"])
        return self._lists

    def _write_cfg(self):
        storage.write_json_sync(storage.data_path(self._CFG_FILE), self._ensure_cfg())

    def _write_lists(self):
        storage.write_json_sync(storage.data_path(self._LISTS_FILE), self._ensure_lists())
        self._domain_set = set(self._ensure_lists()["domains"])

    def _emit_updated(self):
        cfg = self._ensure_cfg()
        lists = self._ensure_lists()
        self.adblockUpdated.emit(json.dumps({
            "enabled": cfg["enabled"], "blockedCount": cfg["blockedCount"],
            "siteAllowlist": cfg["siteAllowlist"],
            "listUpdatedAt": lists["updatedAt"],
            "domainCount": len(lists["domains"]),
        }))

    @staticmethod
    def _normalize_host(raw):
        import re
        host = str(raw or "").strip().lower().strip(".")
        if not host or not re.match(r'^[a-z0-9.-]+$', host):
            return ""
        return host

    @staticmethod
    def _parse_domains_from_list_text(text):
        domains = set()
        for line in str(text or "").splitlines():
            line = line.strip()
            if not line or line[0] in ("!", "["):
                continue
            if "##" in line or "#@#" in line:
                continue
            if not line.startswith("||"):
                continue
            rule = line[2:]
            import re
            m = re.search(r'[\^/$*]', rule)
            if m:
                rule = rule[:m.start()]
            if not rule:
                continue
            host = WebAdblockBridge._normalize_host(rule)
            if host:
                domains.add(host)
        return domains

    def ensure_initial_lists(self):
        """Ensure fallback domains exist if no lists loaded yet."""
        lists = self._ensure_lists()
        if lists["domains"]:
            return
        import time
        lists["domains"] = list(self._FALLBACK_DOMAINS)
        lists["updatedAt"] = int(time.time() * 1000)
        lists["sourceCount"] = 0
        self._domain_set = set(lists["domains"])
        self._write_lists()

    def host_matches_blocked(self, hostname):
        """Check if hostname is in blocklist (hierarchical matching)."""
        host = self._normalize_host(hostname)
        if not host:
            return False
        self._ensure_lists()
        if not self._domain_set:
            return False
        probe = host
        while probe:
            if probe in self._domain_set:
                return True
            dot = probe.find(".")
            if dot < 0:
                break
            probe = probe[dot + 1:]
        return False

    def should_block_request(self, url, first_party_url=""):
        """Internal: check if a request URL should be blocked."""
        cfg = self._ensure_cfg()
        if not cfg["enabled"]:
            return False
        # Check site allowlist
        try:
            from urllib.parse import urlparse
            top = self._normalize_host(urlparse(str(first_party_url or "")).hostname or "")
            if top:
                for a in cfg["siteAllowlist"]:
                    ah = self._normalize_host(a)
                    if ah and (top == ah or top.endswith("." + ah)):
                        return False
        except Exception:
            pass
        try:
            from urllib.parse import urlparse
            u = urlparse(str(url or ""))
            if u.scheme not in ("http", "https"):
                return False
            if not self.host_matches_blocked(u.hostname or ""):
                return False
            import time
            cfg["blockedCount"] = cfg["blockedCount"] + 1
            cfg["updatedAt"] = int(time.time() * 1000)
            if cfg["blockedCount"] % 25 == 0:
                self._write_cfg()
            return True
        except Exception:
            return False

    @Slot(result=str)
    def get(self):
        cfg = self._ensure_cfg()
        lists = self._ensure_lists()
        return json.dumps(_ok({
            "enabled": cfg["enabled"], "siteAllowlist": cfg["siteAllowlist"],
            "blockedCount": cfg["blockedCount"],
            "listUpdatedAt": lists["updatedAt"],
            "domainCount": len(lists["domains"]),
        }))

    @Slot(str, result=str)
    def setEnabled(self, payload_json):
        payload = json.loads(payload_json) if payload_json else {}
        cfg = self._ensure_cfg()
        cfg["enabled"] = bool(payload.get("enabled", False))
        import time
        cfg["updatedAt"] = int(time.time() * 1000)
        self._write_cfg()
        self._emit_updated()
        return json.dumps(_ok({"enabled": cfg["enabled"]}))

    @Slot(result=str)
    def updateLists(self):
        cfg = self._ensure_cfg()
        urls = cfg["listUrls"] if cfg["listUrls"] else list(self._DEFAULT_LIST_URLS)
        combined = set()
        source_count = 0
        import urllib.request
        for target in urls:
            target = str(target or "").strip()
            if not target.startswith(("http://", "https://")):
                continue
            try:
                req = urllib.request.Request(target, headers={"User-Agent": "Tankoban-Max/Adblock"})
                with urllib.request.urlopen(req, timeout=30) as resp:
                    txt = resp.read().decode("utf-8", errors="replace")
                parsed = self._parse_domains_from_list_text(txt)
                combined.update(parsed)
                source_count += 1
            except Exception:
                pass
        if combined:
            lists = self._ensure_lists()
            import time
            lists["domains"] = list(combined)
            lists["updatedAt"] = int(time.time() * 1000)
            lists["sourceCount"] = source_count
            self._domain_set = set(lists["domains"])
            self._write_lists()
            cfg["lastListUpdateAt"] = lists["updatedAt"]
            cfg["updatedAt"] = int(time.time() * 1000)
            self._write_cfg()
            self._emit_updated()
            return json.dumps(_ok({
                "updatedAt": lists["updatedAt"], "domains": len(lists["domains"]), "sources": source_count,
            }))
        return json.dumps(_err("No lists loaded"))

    @Slot(result=str)
    def stats(self):
        cfg = self._ensure_cfg()
        lists = self._ensure_lists()
        return json.dumps(_ok({"stats": {
            "enabled": cfg["enabled"], "blockedCount": cfg["blockedCount"],
            "domainCount": len(lists["domains"]), "listUpdatedAt": lists["updatedAt"],
            "sourceCount": lists["sourceCount"],
            "siteAllowlistCount": len(cfg["siteAllowlist"]),
        }}))


class WebFindBridge(StubNamespace):
    findResult = Signal(str)
    @Slot(str, result=str)
    def inPage(self, p): return json.dumps(_stub())


class WebTorrentBridge(StubNamespace):
    torrentStarted = Signal(str)
    torrentProgress = Signal(str)
    torrentCompleted = Signal(str)
    torrentsUpdated = Signal(str)
    torrentMetadata = Signal(str)
    torrentStreamReady = Signal(str)
    magnetDetected = Signal(str)
    torrentFileDetected = Signal(str)

    @Slot(str, result=str)
    def startMagnet(self, p): return json.dumps(_stub())
    @Slot(str, result=str)
    def startTorrentUrl(self, p): return json.dumps(_stub())
    @Slot(str, result=str)
    def pause(self, p): return json.dumps(_stub())
    @Slot(str, result=str)
    def resume(self, p): return json.dumps(_stub())
    @Slot(str, result=str)
    def cancel(self, p): return json.dumps(_stub())
    @Slot(result=str)
    def getActive(self): return json.dumps(_stub())
    @Slot(result=str)
    def getHistory(self): return json.dumps(_stub())
    @Slot(result=str)
    def clearHistory(self): return json.dumps(_stub())
    @Slot(str, result=str)
    def removeHistory(self, p): return json.dumps(_stub())
    @Slot(str, result=str)
    def selectFiles(self, p): return json.dumps(_stub())
    @Slot(str, result=str)
    def setDestination(self, p): return json.dumps(_stub())
    @Slot(str, result=str)
    def streamFile(self, p): return json.dumps(_stub())
    @Slot(str, result=str)
    def addToVideoLibrary(self, p): return json.dumps(_stub())
    @Slot(str, result=str)
    def remove(self, p): return json.dumps(_stub())
    @Slot(result=str)
    def pauseAll(self): return json.dumps(_stub())
    @Slot(result=str)
    def resumeAll(self): return json.dumps(_stub())
    @Slot(str, result=str)
    def getPeers(self, p): return json.dumps(_stub())
    @Slot(result=str)
    def getDhtNodes(self): return json.dumps(_stub())
    @Slot(result=str)
    def selectSaveFolder(self): return json.dumps(_stub())
    @Slot(str, result=str)
    def resolveMetadata(self, p): return json.dumps(_stub())
    @Slot(str, result=str)
    def startConfigured(self, p): return json.dumps(_stub())
    @Slot(str, result=str)
    def cancelResolve(self, p): return json.dumps(_stub())
    @Slot(str, result=str)
    def openFolder(self, p): return json.dumps(_stub())


class TorrentSearchBridge(StubNamespace):
    statusChanged = Signal(str)
    @Slot(str, result=str)
    def query(self, p): return json.dumps(_stub())
    @Slot(result=str)
    def health(self): return json.dumps(_stub())
    @Slot(result=str)
    def indexers(self): return json.dumps(_stub())


class TorProxyBridge(StubNamespace):
    statusChanged = Signal(str)
    @Slot(result=str)
    def start(self): return json.dumps(_stub())
    @Slot(result=str)
    def stop(self): return json.dumps(_stub())
    @Slot(result=str)
    def getStatus(self): return json.dumps(_stub())


class WebSearchBridge(QObject):
    """Web search history — omnibox suggestions from search history + bookmarks + browsing history."""

    _SEARCH_FILE = "web_search_history.json"
    _MAX_ENTRIES = 1000
    _MAX_SUGGESTIONS = 8

    def __init__(self, parent=None):
        super().__init__(parent)
        self._cache = None

    def _ensure_cache(self):
        if self._cache is not None:
            return self._cache
        p = storage.data_path(self._SEARCH_FILE)
        raw = storage.read_json(p, None)
        if raw and isinstance(raw.get("queries"), list):
            self._cache = {"queries": raw["queries"], "updatedAt": raw.get("updatedAt", 0) or 0}
        else:
            self._cache = {"queries": [], "updatedAt": 0}
        return self._cache

    def _write(self):
        c = self._ensure_cache()
        if len(c["queries"]) > self._MAX_ENTRIES:
            c["queries"] = c["queries"][:self._MAX_ENTRIES]
        storage.write_json_debounced(storage.data_path(self._SEARCH_FILE), c, 120)

    @Slot(str, result=str)
    def suggest(self, input_text):
        q = str(input_text or "").lower().strip()
        if not q:
            return json.dumps([])
        seen = set()
        results = []
        c = self._ensure_cache()
        # 1. Search history
        for s in c["queries"]:
            if len(results) >= self._MAX_SUGGESTIONS:
                break
            if s and s.get("query") and q in str(s["query"]).lower():
                key = "search:" + s["query"]
                if key not in seen:
                    seen.add(key)
                    results.append({"type": "search", "text": s["query"], "timestamp": s.get("timestamp", 0)})
        # 2. Bookmarks
        bm_raw = storage.read_json(storage.data_path("web_bookmarks.json"), None)
        bookmarks = bm_raw.get("bookmarks", []) if isinstance(bm_raw, dict) else []
        for b in bookmarks:
            if len(results) >= self._MAX_SUGGESTIONS:
                break
            if not b:
                continue
            title = str(b.get("title", "") or "").lower()
            url = str(b.get("url", "") or "").lower()
            if q in title or q in url:
                key = "url:" + str(b.get("url", ""))
                if key not in seen:
                    seen.add(key)
                    results.append({"type": "bookmark", "text": b.get("title") or b.get("url", ""), "url": b.get("url", ""), "favicon": b.get("favicon", "")})
        # 3. Browsing history
        hist_raw = storage.read_json(storage.data_path("web_browsing_history.json"), None)
        history = hist_raw.get("entries", []) if isinstance(hist_raw, dict) else []
        for h in history:
            if len(results) >= self._MAX_SUGGESTIONS:
                break
            if not h:
                continue
            title = str(h.get("title", "") or "").lower()
            url = str(h.get("url", "") or "").lower()
            if q in title or q in url:
                key = "url:" + str(h.get("url", ""))
                if key not in seen:
                    seen.add(key)
                    results.append({"type": "history", "text": h.get("title") or h.get("url", ""), "url": h.get("url", ""), "favicon": h.get("favicon", "")})
        return json.dumps(results)

    @Slot(str, result=str)
    def add(self, query):
        q = str(query or "").strip()
        if not q:
            return json.dumps(None)
        c = self._ensure_cache()
        c["queries"] = [s for s in c["queries"] if not (s and s.get("query") == q)]
        import time
        c["queries"].insert(0, {"query": q, "timestamp": int(time.time() * 1000)})
        if len(c["queries"]) > self._MAX_ENTRIES:
            c["queries"] = c["queries"][:self._MAX_ENTRIES]
        c["updatedAt"] = int(time.time() * 1000)
        self._write()
        return json.dumps(None)


class WebBrowserActionsBridge(StubNamespace):
    contextMenu = Signal(str)
    createTab = Signal(str)
    @Slot(str, result=str)
    def ctxAction(self, p): return json.dumps(_stub())
    @Slot(str, result=str)
    def printPdf(self, p): return json.dumps(_stub())
    @Slot(str, result=str)
    def capturePage(self, p): return json.dumps(_stub())
    @Slot(str, result=str)
    def downloadOpenFile(self, p): return json.dumps(_stub())
    @Slot(str, result=str)
    def downloadShowInFolder(self, p): return json.dumps(_stub())


# ═══════════════════════════════════════════════════════════════════════════
# BRIDGE ROOT — composes all namespaces
# ═══════════════════════════════════════════════════════════════════════════

class BridgeRoot(QObject):
    """
    Master bridge object registered on QWebChannel.
    JS accesses it as channel.objects.bridge.{namespace}.{method}().
    """

    def __init__(self, parent=None):
        super().__init__(parent)

        # Implemented (working right now)
        self.window = WindowBridge(self)
        self.shell = ShellBridge(self)
        self.clipboard = ClipboardBridge(self)
        self.progress = ProgressBridge(self)
        self.seriesSettings = SeriesSettingsBridge(self)
        self.booksProgress = BooksProgressBridge(self)
        self.booksTtsProgress = BooksTtsProgressBridge(self)
        self.booksBookmarks = BooksBookmarksBridge(self)
        self.booksAnnotations = BooksAnnotationsBridge(self)
        self.booksDisplayNames = BooksDisplayNamesBridge(self)
        self.booksSettings = BooksSettingsBridge(self)
        self.booksUi = BooksUiBridge(self)
        self.videoProgress = VideoProgressBridge(self)
        self.videoSettings = VideoSettingsBridge(self)
        self.videoDisplayNames = VideoDisplayNamesBridge(self)
        self.videoUi = VideoUiBridge(self)
        self.webBrowserSettings = WebBrowserSettingsBridge(self)
        self.webSession = WebSessionBridge(self)
        self.webHistory = WebHistoryBridge(self)
        self.webBookmarks = WebBookmarksBridge(self)
        self.webPermissions = WebPermissionsBridge(self)
        self.webSearch = WebSearchBridge(self)
        self.build14 = Build14Bridge(self)
        self.files = FilesBridge(self)
        self.thumbs = ThumbsBridge(self)
        self.videoPoster = VideoPosterBridge(self)
        self.booksOpds = BooksOpdsBridge(self)
        self.webAdblock = WebAdblockBridge(self)
        self.archives = ArchivesBridge(self)

        # Partially implemented (scanner stubs, CRUD working)
        self.audiobooks = AudiobooksBridge(self)

        # Stubs (Phase 3 — domain logic not yet ported)
        self.library = LibraryBridge(self)
        self.books = BooksBridge(self)
        self.booksTtsEdge = BooksTtsEdgeBridge(self)
        self.video = VideoBridge(self)
        self.export = ExportBridge(self)
        self.player = PlayerBridge(self)
        self.mpv = MpvBridge(self)
        self.holyGrail = HolyGrailBridge(self)
        self.webSources = WebSourcesBridge(self)
        self.webData = WebDataBridge(self)
        self.webUserscripts = WebUserscriptsBridge(self)
        self.webFind = WebFindBridge(self)
        self.webTorrent = WebTorrentBridge(self)
        self.torrentSearch = TorrentSearchBridge(self)
        self.torProxy = TorProxyBridge(self)
        self.webBrowserActions = WebBrowserActionsBridge(self)

    # Health check
    @Slot(result=str)
    def ping(self):
        import time
        return json.dumps({"ok": True, "timestamp": int(time.time() * 1000)})


# ═══════════════════════════════════════════════════════════════════════════
# JS SHIM — injected into QWebEngineView before page load
#
# Creates window.electronAPI from the QWebChannel bridge so that
# src/services/api_gateway.js works WITHOUT ANY CHANGES.
# ═══════════════════════════════════════════════════════════════════════════

BRIDGE_SHIM_JS = r"""
(function() {
  // QWebChannel is loaded via qrc, bridge object is registered as 'bridge'
  new QWebChannel(qt.webChannelTransport, function(channel) {
    var b = channel.objects.bridge;

    // Helper: wrap a @Slot that returns JSON string into a Promise-returning function
    function wrap(fn, ctx) {
      return function() {
        var args = Array.prototype.slice.call(arguments);
        // QWebChannel @Slot args must be strings — serialize objects
        var sArgs = args.map(function(a) {
          return (a === undefined || a === null) ? '' :
                 (typeof a === 'object' ? JSON.stringify(a) : String(a));
        });
        return new Promise(function(resolve, reject) {
          try {
            var result = fn.apply(ctx, sArgs);
            // QWebChannel may return the value synchronously or via callback
            if (result && typeof result.then === 'function') {
              result.then(function(r) { resolve(JSON.parse(r)); },
                          function(e) { reject(e); });
            } else if (typeof result === 'string') {
              resolve(JSON.parse(result));
            } else {
              resolve(result);
            }
          } catch(e) {
            reject(e);
          }
        });
      };
    }

    // Helper: wrap binary-returning @Slot — decodes base64 .data field to ArrayBuffer
    function wrapBinary(fn, ctx) {
      return function() {
        var args = Array.prototype.slice.call(arguments);
        var sArgs = args.map(function(a) {
          return (a === undefined || a === null) ? '' :
                 (typeof a === 'object' ? JSON.stringify(a) : String(a));
        });
        return new Promise(function(resolve, reject) {
          try {
            var result = fn.apply(ctx, sArgs);
            function decode(r) {
              var parsed = (typeof r === 'string') ? JSON.parse(r) : r;
              if (parsed && parsed.data && typeof parsed.data === 'string') {
                var binary = atob(parsed.data);
                var bytes = new Uint8Array(binary.length);
                for (var i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
                return bytes.buffer;
              }
              return parsed;
            }
            if (result && typeof result.then === 'function') {
              result.then(function(r) { resolve(decode(r)); },
                          function(e) { reject(e); });
            } else {
              resolve(decode(result));
            }
          } catch(e) { reject(e); }
        });
      };
    }

    // Helper: wire a Python Signal to an ipcRenderer.on-style callback registration
    function onEvent(signal) {
      return function(cb) {
        if (typeof cb !== 'function') return function(){};
        signal.connect(function(jsonStr) {
          try { cb(JSON.parse(jsonStr)); } catch(e) {}
        });
        // Return unsubscribe function (QWebChannel signals don't support disconnect easily,
        // but in practice Tankoban never unsubscribes from push events)
        return function() {};
      };
    }

    // Build window.electronAPI matching the preload namespace shape
    window.electronAPI = {
      // window
      window: {
        isFullscreen:     wrap(b.window.isFullscreen, b.window),
        isMaximized:      wrap(b.window.isMaximized, b.window),
        toggleFullscreen:  wrap(b.window.toggleFullscreen, b.window),
        setFullscreen:     wrap(b.window.setFullscreen, b.window),
        toggleMaximize:    wrap(b.window.toggleMaximize, b.window),
        isAlwaysOnTop:     wrap(b.window.isAlwaysOnTop, b.window),
        toggleAlwaysOnTop: wrap(b.window.toggleAlwaysOnTop, b.window),
        takeScreenshot:    wrap(b.window.takeScreenshot, b.window),
        openSubtitleDialog: wrap(b.window.openSubtitleDialog, b.window),
        minimize:          wrap(b.window.minimize, b.window),
        close:             wrap(b.window.close, b.window),
        hide:              wrap(b.window.hide, b.window),
        show:              wrap(b.window.show, b.window),
        openBookInNewWindow: wrap(b.window.openBookInNewWindow, b.window),
        openVideoShell:    wrap(b.window.openVideoShell, b.window),
      },

      // shell
      shell: {
        revealPath: wrap(b.shell.revealPath, b.shell),
        openPath:   wrap(b.shell.openPath, b.shell),
      },

      // clipboard
      clipboard: {
        copyText: wrap(b.clipboard.copyText, b.clipboard),
      },

      // library
      library: {
        getState:          wrap(b.library.getState, b.library),
        scan:              wrap(b.library.scan, b.library),
        cancelScan:        wrap(b.library.cancelScan, b.library),
        setScanIgnore:     wrap(b.library.setScanIgnore, b.library),
        addRootFolder:     wrap(b.library.addRootFolder, b.library),
        addSeriesFolder:   wrap(b.library.addSeriesFolder, b.library),
        removeSeriesFolder: wrap(b.library.removeSeriesFolder, b.library),
        removeRootFolder:  wrap(b.library.removeRootFolder, b.library),
        unignoreSeries:    wrap(b.library.unignoreSeries, b.library),
        clearIgnoredSeries: wrap(b.library.clearIgnoredSeries, b.library),
        openComicFileDialog: wrap(b.library.openComicFileDialog, b.library),
        bookFromPath:      wrap(b.library.bookFromPath, b.library),
        onUpdated:         onEvent(b.library.libraryUpdated),
        onScanStatus:      onEvent(b.library.scanStatus),
        onAppOpenFiles:    function(cb) { return function(){}; }, // TODO
      },

      // books
      books: {
        getState:       wrap(b.books.getState, b.books),
        scan:           wrap(b.books.scan, b.books),
        cancelScan:     wrap(b.books.cancelScan, b.books),
        setScanIgnore:  wrap(b.books.setScanIgnore, b.books),
        addRootFolder:  wrap(b.books.addRootFolder, b.books),
        removeRootFolder: wrap(b.books.removeRootFolder, b.books),
        addSeriesFolder: wrap(b.books.addSeriesFolder, b.books),
        removeSeriesFolder: wrap(b.books.removeSeriesFolder, b.books),
        addFiles:       wrap(b.books.addFiles, b.books),
        removeFile:     wrap(b.books.removeFile, b.books),
        openFileDialog: wrap(b.books.openFileDialog, b.books),
        bookFromPath:   wrap(b.books.bookFromPath, b.books),
        onUpdated:      onEvent(b.books.booksUpdated),
        onScanStatus:   onEvent(b.books.scanStatus),
      },

      // booksTtsEdge
      booksTtsEdge: {
        probe:         wrap(b.booksTtsEdge.probe, b.booksTtsEdge),
        getVoices:     wrap(b.booksTtsEdge.getVoices, b.booksTtsEdge),
        synth:         wrap(b.booksTtsEdge.synth, b.booksTtsEdge),
        warmup:        wrap(b.booksTtsEdge.warmup, b.booksTtsEdge),
        resetInstance: wrap(b.booksTtsEdge.resetInstance, b.booksTtsEdge),
        cacheClear:    wrap(b.booksTtsEdge.cacheClear, b.booksTtsEdge),
        cacheInfo:     wrap(b.booksTtsEdge.cacheInfo, b.booksTtsEdge),
      },

      // booksOpds
      booksOpds: {
        getFeeds:     wrap(b.booksOpds.getFeeds, b.booksOpds),
        addFeed:      wrap(b.booksOpds.addFeed, b.booksOpds),
        updateFeed:   wrap(b.booksOpds.updateFeed, b.booksOpds),
        removeFeed:   wrap(b.booksOpds.removeFeed, b.booksOpds),
        fetchCatalog: wrap(b.booksOpds.fetchCatalog, b.booksOpds),
        onFeedsUpdated: onEvent(b.booksOpds.feedsUpdated),
      },

      // booksProgress
      booksProgress: {
        getAll:  wrap(b.booksProgress.getAll, b.booksProgress),
        get:     wrap(b.booksProgress.get, b.booksProgress),
        save:    wrap(b.booksProgress.save, b.booksProgress),
        clear:   wrap(b.booksProgress.clear, b.booksProgress),
        clearAll: wrap(b.booksProgress.clearAll, b.booksProgress),
      },

      // booksTtsProgress
      booksTtsProgress: {
        getAll: wrap(b.booksTtsProgress.getAll, b.booksTtsProgress),
        get:    wrap(b.booksTtsProgress.get, b.booksTtsProgress),
        save:   wrap(b.booksTtsProgress.save, b.booksTtsProgress),
        clear:  wrap(b.booksTtsProgress.clear, b.booksTtsProgress),
      },

      // booksBookmarks
      booksBookmarks: {
        get:    wrap(b.booksBookmarks.get, b.booksBookmarks),
        save:   wrap(b.booksBookmarks.save, b.booksBookmarks),
        delete: wrap(b.booksBookmarks.delete, b.booksBookmarks),
        clear:  wrap(b.booksBookmarks.clear, b.booksBookmarks),
      },

      // booksAnnotations
      booksAnnotations: {
        get:    wrap(b.booksAnnotations.get, b.booksAnnotations),
        save:   wrap(b.booksAnnotations.save, b.booksAnnotations),
        delete: wrap(b.booksAnnotations.delete, b.booksAnnotations),
        clear:  wrap(b.booksAnnotations.clear, b.booksAnnotations),
      },

      // booksDisplayNames
      booksDisplayNames: {
        getAll: wrap(b.booksDisplayNames.getAll, b.booksDisplayNames),
        save:   wrap(b.booksDisplayNames.save, b.booksDisplayNames),
        clear:  wrap(b.booksDisplayNames.clear, b.booksDisplayNames),
      },

      // booksSettings
      booksSettings: {
        get:   wrap(b.booksSettings.get, b.booksSettings),
        save:  wrap(b.booksSettings.save, b.booksSettings),
        clear: wrap(b.booksSettings.clear, b.booksSettings),
      },

      // booksUi
      booksUi: {
        get:   wrap(b.booksUi.get, b.booksUi),
        save:  wrap(b.booksUi.save, b.booksUi),
        clear: wrap(b.booksUi.clear, b.booksUi),
      },

      // video
      video: {
        getState:              wrap(b.video.getState, b.video),
        scan:                  wrap(b.video.scan, b.video),
        scanShow:              wrap(b.video.scanShow, b.video),
        generateShowThumbnail: wrap(b.video.generateShowThumbnail, b.video),
        cancelScan:            wrap(b.video.cancelScan, b.video),
        addFolder:             wrap(b.video.addFolder, b.video),
        addShowFolder:         wrap(b.video.addShowFolder, b.video),
        addShowFolderPath:     wrap(b.video.addShowFolderPath, b.video),
        removeFolder:          wrap(b.video.removeFolder, b.video),
        removeStreamableFolder: wrap(b.video.removeStreamableFolder, b.video),
        hideShow:              wrap(b.video.hideShow, b.video),
        openFileDialog:        wrap(b.video.openFileDialog, b.video),
        openSubtitleFileDialog: wrap(b.video.openSubtitleFileDialog, b.video),
        addFiles:              wrap(b.video.addFiles, b.video),
        removeFile:            wrap(b.video.removeFile, b.video),
        restoreAllHiddenShows: wrap(b.video.restoreAllHiddenShows, b.video),
        restoreHiddenShowsForRoot: wrap(b.video.restoreHiddenShowsForRoot, b.video),
        getEpisodesForShow:    wrap(b.video.getEpisodesForShow, b.video),
        getEpisodesForRoot:    wrap(b.video.getEpisodesForRoot, b.video),
        getEpisodesByIds:      wrap(b.video.getEpisodesByIds, b.video),
        onUpdated:             onEvent(b.video.videoUpdated),
        onShellPlay:           onEvent(b.video.shellPlay),
        onScanStatus:          onEvent(b.video.scanStatus),
      },

      // videoProgress
      videoProgress: {
        getAll:   wrap(b.videoProgress.getAll, b.videoProgress),
        get:      wrap(b.videoProgress.get, b.videoProgress),
        save:     wrap(b.videoProgress.save, b.videoProgress),
        clear:    wrap(b.videoProgress.clear, b.videoProgress),
        clearAll: wrap(b.videoProgress.clearAll, b.videoProgress),
        onUpdated: onEvent(b.videoProgress.progressUpdated),
      },

      // videoSettings
      videoSettings: {
        get:   wrap(b.videoSettings.get, b.videoSettings),
        save:  wrap(b.videoSettings.save, b.videoSettings),
        clear: wrap(b.videoSettings.clear, b.videoSettings),
      },

      // videoDisplayNames
      videoDisplayNames: {
        getAll: wrap(b.videoDisplayNames.getAll, b.videoDisplayNames),
        save:   wrap(b.videoDisplayNames.save, b.videoDisplayNames),
        clear:  wrap(b.videoDisplayNames.clear, b.videoDisplayNames),
      },

      // videoUi
      videoUi: {
        getState:   wrap(b.videoUi.getState, b.videoUi),
        saveState:  wrap(b.videoUi.saveState, b.videoUi),
        clearState: wrap(b.videoUi.clearState, b.videoUi),
      },

      // videoPoster
      videoPoster: {
        get:    wrap(b.videoPoster.get, b.videoPoster),
        has:    wrap(b.videoPoster.has, b.videoPoster),
        save:   wrap(b.videoPoster.save, b.videoPoster),
        delete: wrap(b.videoPoster.delete, b.videoPoster),
        paste:  wrap(b.videoPoster.paste, b.videoPoster),
      },

      // thumbs
      thumbs: {
        has:      wrap(b.thumbs.has, b.thumbs),
        get:      wrap(b.thumbs.get, b.thumbs),
        save:     wrap(b.thumbs.save, b.thumbs),
        delete:   wrap(b.thumbs.delete, b.thumbs),
        hasPage:  wrap(b.thumbs.hasPage, b.thumbs),
        getPage:  wrap(b.thumbs.getPage, b.thumbs),
        savePage: wrap(b.thumbs.savePage, b.thumbs),
      },

      // archives
      archives: {
        cbzOpen:      wrap(b.archives.cbzOpen, b.archives),
        cbzReadEntry: wrapBinary(b.archives.cbzReadEntry, b.archives),
        cbzClose:     wrap(b.archives.cbzClose, b.archives),
        cbrOpen:      wrap(b.archives.cbrOpen, b.archives),
        cbrReadEntry: wrapBinary(b.archives.cbrReadEntry, b.archives),
        cbrClose:     wrap(b.archives.cbrClose, b.archives),
      },

      // export
      export: {
        saveEntry: wrap(b.export.saveEntry, b.export),
        copyEntry: wrap(b.export.copyEntry, b.export),
      },

      // files
      files: {
        read:             wrapBinary(b.files.read, b.files),
        listFolderVideos: wrap(b.files.listFolderVideos, b.files),
      },

      // progress (comics)
      progress: {
        getAll:   wrap(b.progress.getAll, b.progress),
        get:      wrap(b.progress.get, b.progress),
        save:     wrap(b.progress.save, b.progress),
        clear:    wrap(b.progress.clear, b.progress),
        clearAll: wrap(b.progress.clearAll, b.progress),
      },

      // seriesSettings
      seriesSettings: {
        get:   wrap(b.seriesSettings.get, b.seriesSettings),
        save:  wrap(b.seriesSettings.save, b.seriesSettings),
        clear: wrap(b.seriesSettings.clear, b.seriesSettings),
      },

      // player
      player: {
        start:    wrap(b.player.start, b.player),
        play:     wrap(b.player.play, b.player),
        pause:    wrap(b.player.pause, b.player),
        seek:     wrap(b.player.seek, b.player),
        stop:     wrap(b.player.stop, b.player),
        launchQt: wrap(b.player.launchQt, b.player),
        getState: wrap(b.player.getState, b.player),
      },

      // build14
      build14: {
        saveReturnState:  wrap(b.build14.saveReturnState, b.build14),
        getReturnState:   wrap(b.build14.getReturnState, b.build14),
        clearReturnState: wrap(b.build14.clearReturnState, b.build14),
      },

      // mpv
      mpv: {
        isAvailable: wrap(b.mpv.isAvailable, b.mpv),
        probe:       wrap(b.mpv.probe, b.mpv),
        // Other mpv methods not needed — Butterfly uses native widget
      },

      // holyGrail
      holyGrail: {
        probe: wrap(b.holyGrail.probe, b.holyGrail),
      },

      // audiobooks
      audiobooks: {
        getState:       wrap(b.audiobooks.getState, b.audiobooks),
        scan:           wrap(b.audiobooks.scan, b.audiobooks),
        addRootFolder:  wrap(b.audiobooks.addRootFolder, b.audiobooks),
        addFolder:      wrap(b.audiobooks.addFolder, b.audiobooks),
        removeRootFolder: wrap(b.audiobooks.removeRootFolder, b.audiobooks),
        getProgressAll: wrap(b.audiobooks.getProgressAll, b.audiobooks),
        getProgress:    wrap(b.audiobooks.getProgress, b.audiobooks),
        saveProgress:   wrap(b.audiobooks.saveProgress, b.audiobooks),
        clearProgress:  wrap(b.audiobooks.clearProgress, b.audiobooks),
        getPairing:     wrap(b.audiobooks.getPairing, b.audiobooks),
        savePairing:    wrap(b.audiobooks.savePairing, b.audiobooks),
        deletePairing:  wrap(b.audiobooks.deletePairing, b.audiobooks),
        getPairingAll:  wrap(b.audiobooks.getPairingAll, b.audiobooks),
        onUpdated:      onEvent(b.audiobooks.audiobookUpdated),
        onScanStatus:   onEvent(b.audiobooks.scanStatus),
      },

      // webSources
      webSources: {
        get:                    wrap(b.webSources.get, b.webSources),
        add:                    wrap(b.webSources.add, b.webSources),
        remove:                 wrap(b.webSources.remove, b.webSources),
        update:                 wrap(b.webSources.update, b.webSources),
        routeDownload:          wrap(b.webSources.routeDownload, b.webSources),
        getDestinations:        wrap(b.webSources.getDestinations, b.webSources),
        downloadFromUrl:        wrap(b.webSources.downloadFromUrl, b.webSources),
        getDownloadHistory:     wrap(b.webSources.getDownloadHistory, b.webSources),
        clearDownloadHistory:   wrap(b.webSources.clearDownloadHistory, b.webSources),
        removeDownloadHistory:  wrap(b.webSources.removeDownloadHistory, b.webSources),
        pauseDownload:          wrap(b.webSources.pauseDownload, b.webSources),
        resumeDownload:         wrap(b.webSources.resumeDownload, b.webSources),
        cancelDownload:         wrap(b.webSources.cancelDownload, b.webSources),
        pickDestinationFolder:  wrap(b.webSources.pickDestinationFolder, b.webSources),
        listDestinationFolders: wrap(b.webSources.listDestinationFolders, b.webSources),
        resolveDestinationPicker: wrap(b.webSources.resolveDestinationPicker, b.webSources),
        pickSaveFolder:         wrap(b.webSources.pickSaveFolder, b.webSources),
        onUpdated:              onEvent(b.webSources.sourcesUpdated),
        onDownloadStarted:      onEvent(b.webSources.downloadStarted),
        onDownloadProgress:     onEvent(b.webSources.downloadProgress),
        onDownloadCompleted:    onEvent(b.webSources.downloadCompleted),
        onDownloadsUpdated:     onEvent(b.webSources.downloadsUpdated),
        onPopupOpen:            onEvent(b.webSources.popupOpen),
        onDestinationPickerRequest: onEvent(b.webSources.destinationPickerRequest),
      },

      // webBrowserSettings
      webBrowserSettings: {
        get:  wrap(b.webBrowserSettings.get, b.webBrowserSettings),
        save: wrap(b.webBrowserSettings.save, b.webBrowserSettings),
      },

      // webHistory
      webHistory: {
        list:      wrap(b.webHistory.list, b.webHistory),
        add:       wrap(b.webHistory.add, b.webHistory),
        upsert:    wrap(b.webHistory.upsert, b.webHistory),
        clear:     wrap(b.webHistory.clear, b.webHistory),
        remove:    wrap(b.webHistory.remove, b.webHistory),
        onUpdated: onEvent(b.webHistory.historyUpdated),
      },

      // webSession
      webSession: {
        get:       wrap(b.webSession.get, b.webSession),
        save:      wrap(b.webSession.save, b.webSession),
        clear:     wrap(b.webSession.clear, b.webSession),
        onUpdated: onEvent(b.webSession.sessionUpdated),
      },

      // webBookmarks
      webBookmarks: {
        list:      wrap(b.webBookmarks.list, b.webBookmarks),
        add:       wrap(b.webBookmarks.add, b.webBookmarks),
        update:    wrap(b.webBookmarks.update, b.webBookmarks),
        remove:    wrap(b.webBookmarks.remove, b.webBookmarks),
        toggle:    wrap(b.webBookmarks.toggle, b.webBookmarks),
        onUpdated: onEvent(b.webBookmarks.bookmarksUpdated),
      },

      // webData
      webData: {
        clear: wrap(b.webData.clear, b.webData),
        usage: wrap(b.webData.usage, b.webData),
      },

      // webPermissions
      webPermissions: {
        list:          wrap(b.webPermissions.list, b.webPermissions),
        set:           wrap(b.webPermissions.set, b.webPermissions),
        reset:         wrap(b.webPermissions.reset, b.webPermissions),
        resolvePrompt: wrap(b.webPermissions.resolvePrompt, b.webPermissions),
        onUpdated:     onEvent(b.webPermissions.permissionsUpdated),
        onPrompt:      onEvent(b.webPermissions.permissionPrompt),
      },

      // webUserscripts
      webUserscripts: {
        get:            wrap(b.webUserscripts.get, b.webUserscripts),
        setEnabled:     wrap(b.webUserscripts.setEnabled, b.webUserscripts),
        upsert:         wrap(b.webUserscripts.upsert, b.webUserscripts),
        remove:         wrap(b.webUserscripts.remove, b.webUserscripts),
        setRuleEnabled: wrap(b.webUserscripts.setRuleEnabled, b.webUserscripts),
        onUpdated:      onEvent(b.webUserscripts.userscriptsUpdated),
      },

      // webAdblock
      webAdblock: {
        get:         wrap(b.webAdblock.get, b.webAdblock),
        setEnabled:  wrap(b.webAdblock.setEnabled, b.webAdblock),
        updateLists: wrap(b.webAdblock.updateLists, b.webAdblock),
        stats:       wrap(b.webAdblock.stats, b.webAdblock),
        onUpdated:   onEvent(b.webAdblock.adblockUpdated),
      },

      // webFind
      webFind: {
        inPage:   wrap(b.webFind.inPage, b.webFind),
        onResult: onEvent(b.webFind.findResult),
      },

      // webTorrent
      webTorrent: {
        startMagnet:     wrap(b.webTorrent.startMagnet, b.webTorrent),
        startTorrentUrl: wrap(b.webTorrent.startTorrentUrl, b.webTorrent),
        pause:           wrap(b.webTorrent.pause, b.webTorrent),
        resume:          wrap(b.webTorrent.resume, b.webTorrent),
        cancel:          wrap(b.webTorrent.cancel, b.webTorrent),
        getActive:       wrap(b.webTorrent.getActive, b.webTorrent),
        getHistory:      wrap(b.webTorrent.getHistory, b.webTorrent),
        clearHistory:    wrap(b.webTorrent.clearHistory, b.webTorrent),
        removeHistory:   wrap(b.webTorrent.removeHistory, b.webTorrent),
        selectFiles:     wrap(b.webTorrent.selectFiles, b.webTorrent),
        setDestination:  wrap(b.webTorrent.setDestination, b.webTorrent),
        streamFile:      wrap(b.webTorrent.streamFile, b.webTorrent),
        addToVideoLibrary: wrap(b.webTorrent.addToVideoLibrary, b.webTorrent),
        remove:          wrap(b.webTorrent.remove, b.webTorrent),
        pauseAll:        wrap(b.webTorrent.pauseAll, b.webTorrent),
        resumeAll:       wrap(b.webTorrent.resumeAll, b.webTorrent),
        getPeers:        wrap(b.webTorrent.getPeers, b.webTorrent),
        getDhtNodes:     wrap(b.webTorrent.getDhtNodes, b.webTorrent),
        selectSaveFolder: wrap(b.webTorrent.selectSaveFolder, b.webTorrent),
        resolveMetadata: wrap(b.webTorrent.resolveMetadata, b.webTorrent),
        startConfigured: wrap(b.webTorrent.startConfigured, b.webTorrent),
        cancelResolve:   wrap(b.webTorrent.cancelResolve, b.webTorrent),
        openFolder:      wrap(b.webTorrent.openFolder, b.webTorrent),
        onStarted:       onEvent(b.webTorrent.torrentStarted),
        onProgress:      onEvent(b.webTorrent.torrentProgress),
        onCompleted:     onEvent(b.webTorrent.torrentCompleted),
        onUpdated:       onEvent(b.webTorrent.torrentsUpdated),
        onMetadata:      onEvent(b.webTorrent.torrentMetadata),
        onStreamReady:   onEvent(b.webTorrent.torrentStreamReady),
        onMagnetDetected: onEvent(b.webTorrent.magnetDetected),
        onTorrentFileDetected: onEvent(b.webTorrent.torrentFileDetected),
      },

      // torrentSearch
      torrentSearch: {
        query:           wrap(b.torrentSearch.query, b.torrentSearch),
        health:          wrap(b.torrentSearch.health, b.torrentSearch),
        indexers:        wrap(b.torrentSearch.indexers, b.torrentSearch),
        onStatusChanged: onEvent(b.torrentSearch.statusChanged),
      },

      // torProxy
      torProxy: {
        start:           wrap(b.torProxy.start, b.torProxy),
        stop:            wrap(b.torProxy.stop, b.torProxy),
        getStatus:       wrap(b.torProxy.getStatus, b.torProxy),
        onStatusChanged: onEvent(b.torProxy.statusChanged),
      },

      // webSearch
      webSearch: {
        suggest: wrap(b.webSearch.suggest, b.webSearch),
        add:     wrap(b.webSearch.add, b.webSearch),
      },

      // webBrowserActions
      webBrowserActions: {
        ctxAction:           wrap(b.webBrowserActions.ctxAction, b.webBrowserActions),
        printPdf:            wrap(b.webBrowserActions.printPdf, b.webBrowserActions),
        capturePage:         wrap(b.webBrowserActions.capturePage, b.webBrowserActions),
        downloadOpenFile:    wrap(b.webBrowserActions.downloadOpenFile, b.webBrowserActions),
        downloadShowInFolder: wrap(b.webBrowserActions.downloadShowInFolder, b.webBrowserActions),
        onContextMenu:       onEvent(b.webBrowserActions.contextMenu),
        onCreateTab:         onEvent(b.webBrowserActions.createTab),
      },

      // ping (health check)
      ping: wrap(b.ping, b),

      // BUILD14 event forwarding stubs (api_gateway.js checks for these)
      _setupBuild14EventForwarding: function() {},
      _registerBuild14Callback: function(cb) {
        b.player.playerExited.connect(function(jsonStr) {
          try { cb(JSON.parse(jsonStr)); } catch(e) {}
        });
      },

      // features facade (empty — api_gateway.js handles this)
      features: {},
    };

    console.log('[butterfly] QWebChannel bridge ready — window.electronAPI populated');
  });
})();
"""


# ═══════════════════════════════════════════════════════════════════════════
# SETUP — called from app.py
# ═══════════════════════════════════════════════════════════════════════════

def setup_bridge(web_view: QWebEngineView, win) -> BridgeRoot:
    """
    Wire up QWebChannel on the given QWebEngineView.
    Returns the BridgeRoot so app.py can hold a reference.

    Call this AFTER creating the QWebEngineView but BEFORE loading the page.
    """
    bridge = BridgeRoot()
    bridge.window.set_window(win)

    channel = QWebChannel()
    channel.registerObject("bridge", bridge)
    web_view.page().setWebChannel(channel)

    # Inject the shim JS that creates window.electronAPI from the channel.
    # QWebEngineScript runs before page scripts, so api_gateway.js finds
    # window.electronAPI already populated.
    from PySide6.QtWebEngineCore import QWebEngineScript
    script = QWebEngineScript()
    script.setName("butterfly_bridge_shim")
    script.setSourceCode(
        'var s=document.createElement("script");'
        's.src="qrc:///qtwebchannel/qwebchannel.js";'
        's.onload=function(){' + BRIDGE_SHIM_JS.replace('\n', ' ') + '};'
        'document.head.appendChild(s);'
    )
    script.setInjectionPoint(QWebEngineScript.InjectionPoint.DocumentCreation)
    script.setWorldId(QWebEngineScript.ScriptWorldId.MainWorld)
    script.setRunsOnSubFrames(False)
    web_view.page().scripts().insert(script)

    return bridge
