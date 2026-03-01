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

import base64
import hashlib
import json
import os
import subprocess
import sys
import threading
import time
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


def _p(s):
    """Parse a JSON string to a dict. Returns {} on failure."""
    if not s:
        return {}
    if isinstance(s, dict):
        return s
    try:
        result = json.loads(s)
        return result if isinstance(result, dict) else {}
    except Exception:
        return {}


def _stub():
    """Placeholder for unimplemented domain methods."""
    return _err("not_implemented")


# ---------------------------------------------------------------------------
# Shared scanner helpers
# ---------------------------------------------------------------------------

DEFAULT_SCAN_IGNORE_DIRNAMES = frozenset({
    "__macosx", "node_modules", ".git", ".svn", ".hg",
    "@eadir", "$recycle.bin", "system volume information",
})

COMIC_EXTENSIONS = frozenset({".cbz", ".cbr", ".pdf", ".zip", ".rar", ".cb7", ".7z"})
BOOK_EXTENSIONS = frozenset({".epub", ".pdf", ".txt", ".mobi", ".fb2"})
VIDEO_EXTENSIONS = frozenset({".mp4", ".mkv", ".avi", ".mov", ".webm", ".m4v", ".mpg", ".mpeg", ".ts"})
AUDIO_EXTENSIONS = frozenset({".mp3", ".m4a", ".m4b", ".ogg", ".opus", ".flac", ".wav", ".aac", ".wma"})
SUBTITLE_EXTENSIONS = frozenset({".srt", ".ass", ".ssa", ".vtt", ".sub"})

_LIBRARY_CONFIG_FILE = "library_state.json"
_LIBRARY_INDEX_FILE = "library_index.json"
_VIDEO_INDEX_FILE = "video_index.json"
_ADDED_FILES_ROOT_ID = "__added_files__"
_ADDED_FILES_SHOW_ID = "__added_files_show__"
_ADDED_SHOW_FOLDERS_ROOT_ID = "__added_show_folders__"
_ADDED_SHOW_FOLDERS_ROOT_NAME = "Folders"
_STREAMABLE_MANIFEST_FILE = ".tanko_torrent_stream.json"


def _path_key(p):
    """Normalize path for case-insensitive comparison."""
    return os.path.normpath(os.path.abspath(str(p or ""))).lower()


def _uniq_paths(paths):
    """Deduplicate paths case-insensitively."""
    seen = set()
    out = []
    for p in paths:
        if not p:
            continue
        k = _path_key(p)
        if k in seen:
            continue
        seen.add(k)
        out.append(str(p).strip())
    return out


def _sanitize_ignore(patterns, max_count=200):
    """Sanitize scan ignore patterns: dedup, lowercase, cap count."""
    if not isinstance(patterns, list):
        return []
    seen = set()
    out = []
    for p in patterns:
        s = str(p or "").strip().lower()
        if not s or s in seen:
            continue
        seen.add(s)
        out.append(s)
        if len(out) >= max_count:
            break
    return out


def _b64url(data_bytes):
    """Base64url encode without padding (matches JS Buffer.toString('base64url'))."""
    return base64.urlsafe_b64encode(data_bytes).decode("ascii").rstrip("=")


def _series_id_for_folder(folder_path):
    """Base64url of folder path string (matches JS seriesIdForFolder)."""
    return _b64url(str(folder_path or "").encode("utf-8"))


def _book_id_for_path(file_path, size, mtime_ms):
    """Book/comic ID = base64url('path::size::mtimeMs') — matches JS bookIdForPath."""
    return _b64url("{}::{}::{}".format(
        str(file_path or ""), int(size or 0), int(mtime_ms or 0)
    ).encode("utf-8"))


def _safe_b64_decode(s):
    """Decode base64url string, return empty string on failure."""
    try:
        padded = s + "=" * (4 - len(s) % 4) if len(s) % 4 else s
        return base64.urlsafe_b64decode(padded).decode("utf-8", errors="replace")
    except Exception:
        return ""


def _sha1_b64url(raw_str):
    """SHA1 hash of string → base64url (matches JS crypto.createHash('sha1')...base64url)."""
    h = hashlib.sha1(raw_str.encode("utf-8")).digest()
    return _b64url(h)


def _video_root_id(path):
    """Root/show ID = base64url of path."""
    return _b64url(str(path or "").encode("utf-8"))


def _js_num_str(val):
    """Format a float the way JavaScript's Number.toString() does:
    integer-valued floats drop the decimal (1234.0 -> '1234'),
    others keep it (1234.5 -> '1234.5')."""
    if val == int(val):
        return str(int(val))
    return repr(val)


def _video_episode_id(file_path, size, mtime_ms):
    """Episode ID = SHA1('path::size::mtimeMs') in base64url.
    IMPORTANT: mtime_ms must be passed as a float (st.st_mtime * 1000)
    and formatted like JavaScript's Number.toString() to match Electron IDs."""
    return _sha1_b64url("{}::{}::{}".format(
        str(file_path or ""), int(size or 0), _js_num_str(float(mtime_ms or 0))))


def _video_folder_key(show_id, folder_rel_path):
    """Folder key = SHA1('showId::folderRelPath') in base64url."""
    return _sha1_b64url("{}::{}".format(str(show_id or ""), str(folder_rel_path or "")))


def _loose_show_id(root_path):
    """SHA1('rootPath::LOOSE_FILES') in base64url."""
    return _sha1_b64url("{}::LOOSE_FILES".format(str(root_path or "")))


def _audiobook_id(folder_path, total_size, latest_mtime):
    """Audiobook ID = SHA1('path::totalSize::latestMtime') in base64url."""
    return _sha1_b64url("{}::{}::{}".format(str(folder_path or ""), int(total_size), int(latest_mtime)))


def _list_immediate_subdirs(root_folder):
    """List immediate child directories (skip dot-prefixed)."""
    try:
        entries = os.listdir(root_folder)
    except OSError:
        return []
    out = []
    for e in sorted(entries):
        if e.startswith("."):
            continue
        fp = os.path.join(root_folder, e)
        try:
            if os.path.isdir(fp):
                out.append(fp)
        except OSError:
            continue
    return out


def _should_ignore_dir(dirname, ignore_dirnames, ignore_substrings):
    """Check if a directory name should be skipped during scan."""
    lower = dirname.lower()
    if lower in ignore_dirnames:
        return True
    for sub in ignore_substrings:
        if sub in lower:
            return True
    return False


def _is_path_within(parent, target):
    """Check if target path is within parent directory."""
    try:
        p = os.path.normpath(os.path.abspath(str(parent or ""))).lower()
        t = os.path.normpath(os.path.abspath(str(target or ""))).lower()
        return t.startswith(p + os.sep) or t == p
    except Exception:
        return False


def _read_library_config():
    """Read shared library_state.json (used by both library and video domains)."""
    raw = storage.read_json(storage.data_path(_LIBRARY_CONFIG_FILE), {})
    return {
        "seriesFolders": raw.get("seriesFolders", []),
        "rootFolders": raw.get("rootFolders", []),
        "ignoredSeries": raw.get("ignoredSeries", []),
        "scanIgnore": raw.get("scanIgnore", []),
        "videoFolders": raw.get("videoFolders", []),
        "videoShowFolders": raw.get("videoShowFolders", []),
        "videoHiddenShowIds": raw.get("videoHiddenShowIds", []),
        "videoFiles": raw.get("videoFiles", []),
    }


def _write_library_config(cfg):
    """Write shared library_state.json (preserves all fields)."""
    storage.write_json_sync(storage.data_path(_LIBRARY_CONFIG_FILE), cfg)


# ---------------------------------------------------------------------------
# Generic JSON CRUD mixin
#
# Most domains (progress, booksProgress, videoSettings, etc.) are identical:
# a JSON file keyed by some ID with getAll/get/save/clear/clearAll.
# This mixin generates the @Slot implementations from a filename.
# ---------------------------------------------------------------------------

def _backfill_updated_at(data, write_fn):
    """Backfill missing updatedAt on progress entries (one-time migration).
    Electron's save handlers always add updatedAt; Butterfly didn't until this fix."""
    if not data or not isinstance(data, dict):
        return data
    dirty = False
    now = int(time.time() * 1000)
    for k, v in data.items():
        if isinstance(v, dict) and "updatedAt" not in v:
            v["updatedAt"] = now
            dirty = True
    if dirty:
        try:
            write_fn(data)
        except Exception:
            pass
    return data


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
        return self._crud_read()

    def crud_get(self, key: str):
        data = self._crud_read()
        return data.get(key)

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
        return json.dumps(_backfill_updated_at(self._crud_read(), self._crud_write))

    @Slot(str, result=str)
    def get(self, book_id):
        return json.dumps(self.crud_get(book_id))

    @Slot(str, str, result=str)
    def save(self, book_id, progress_json):
        data = self._crud_read()
        prev = data.get(book_id, {}) if isinstance(data.get(book_id), dict) else {}
        nxt = json.loads(progress_json)
        data[book_id] = {**prev, **nxt, "updatedAt": int(time.time() * 1000)}
        self._crud_write(data)
        return json.dumps(_ok())

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
        return json.dumps(_backfill_updated_at(self._crud_read(), self._crud_write))

    @Slot(str, result=str)
    def get(self, book_id):
        return json.dumps(self.crud_get(book_id))

    @Slot(str, str, result=str)
    def save(self, book_id, progress_json):
        data = self._crud_read()
        prev = data.get(book_id, {}) if isinstance(data.get(book_id), dict) else {}
        nxt = json.loads(progress_json)
        data[book_id] = {**prev, **nxt, "updatedAt": int(time.time() * 1000)}
        self._crud_write(data)
        return json.dumps(_ok())

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

    def __init__(self, parent=None):
        super().__init__(parent)
        self._cache = None  # in-memory cache like Electron's videoProgressMem

    def _ensure_cache(self):
        if self._cache is None:
            self._cache = _backfill_updated_at(self._crud_read(), self._crud_write)
        return self._cache

    @Slot(result=str)
    def getAll(self):
        # Electron returns raw dict { videoId: progressObj, ... }
        return json.dumps(self._ensure_cache())

    @Slot(str, result=str)
    def get(self, video_id):
        # Electron returns raw progress object or null
        data = self._ensure_cache()
        return json.dumps(data.get(video_id))

    @Slot(str, str, result=str)
    def save(self, video_id, progress_json):
        nxt = json.loads(progress_json)
        # Merge like Electron: { ...prev, ...next, updatedAt: Date.now() }
        data = self._ensure_cache()
        prev = data.get(video_id, {}) if isinstance(data.get(video_id), dict) else {}
        merged = {**prev, **nxt, "updatedAt": int(time.time() * 1000)}
        data[video_id] = merged
        self._crud_write(data)
        # Emit with progress included — JS handler uses payload.progress to update state
        self.progressUpdated.emit(json.dumps({"videoId": video_id, "progress": merged}))
        return json.dumps({"ok": True, "value": merged})

    @Slot(str, result=str)
    def clear(self, video_id):
        data = self._ensure_cache()
        data.pop(video_id, None)
        self._crud_write(data)
        # Match Electron: { videoId, progress: null }
        self.progressUpdated.emit(json.dumps({"videoId": video_id, "progress": None}))
        return json.dumps({"ok": True})

    @Slot(result=str)
    def clearAll(self):
        data = self._ensure_cache()
        data.clear()
        self._crud_write(data)
        # JS checks payload.allCleared (not clearedAll)
        self.progressUpdated.emit(json.dumps({"allCleared": True}))
        return json.dumps({"ok": True})


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

    def __init__(self, parent=None):
        super().__init__(parent)
        self._cache = None

    def _ensure_cache(self):
        if self._cache is None:
            raw = self._crud_read()
            # Normalize: Electron stores { ui: {...}, updatedAt } on disk
            if raw and isinstance(raw, dict) and "ui" in raw:
                self._cache = raw
            elif raw and isinstance(raw, dict):
                self._cache = {"ui": {**raw}, "updatedAt": 0}
            else:
                self._cache = {"ui": {}, "updatedAt": 0}
        return self._cache

    @Slot(result=str)
    def getState(self):
        # Match Electron: returns { ui: {...}, updatedAt }
        v = self._ensure_cache()
        return json.dumps({"ui": {**(v.get("ui") or {})}, "updatedAt": v.get("updatedAt", 0)})

    @Slot(str, result=str)
    def saveState(self, ui_json):
        incoming = json.loads(ui_json)
        # Merge like Electron: v.ui = { ...v.ui, ...next }
        v = self._ensure_cache()
        ui = v.get("ui") or {}
        if incoming and isinstance(incoming, dict):
            ui.update(incoming)
        v["ui"] = ui
        v["updatedAt"] = int(time.time() * 1000)
        storage.write_json_debounced(self._crud_path(), v)
        return json.dumps({"ok": True})

    @Slot(result=str)
    def clearState(self):
        self._cache = {"ui": {}, "updatedAt": int(time.time() * 1000)}
        storage.write_json_debounced(self._crud_path(), self._cache)
        return json.dumps({"ok": True})


# ---------------------------------------------------------------------------
# Stub namespaces — complex domains not yet ported
# These return _stub() for every method so the renderer doesn't crash.
# They'll be replaced by real implementations as domains are ported.
# ---------------------------------------------------------------------------

class StubNamespace(QObject):
    """Base for namespaces that aren't implemented yet. All @Slot methods
    are defined on the JS shim side to return { ok: false, error: 'not_implemented' }."""
    pass


class LibraryBridge(QObject):
    """Comics library: folder management, scanning, series discovery."""
    libraryUpdated = Signal(str)
    scanStatus = Signal(str)

    def __init__(self, parent=None):
        super().__init__(parent)
        self._idx = {"series": [], "books": []}
        self._scanning = False
        self._scan_thread = None
        self._cancel_event = threading.Event()
        self._last_scan_at = 0
        self._last_scan_key = ""
        self._error = None
        self._idx_loaded = False
        self._scan_id = 0

    # --- internals ---

    def _ensure_index(self):
        if self._idx_loaded:
            return
        self._idx_loaded = True
        raw = storage.read_json(storage.data_path(_LIBRARY_INDEX_FILE), {})
        self._idx = {"series": raw.get("series", []), "books": raw.get("books", [])}
        # Invalidate old-format cache (IDs without ::size::mtime) and force rescan
        needs_rescan = False
        for b in self._idx["books"][:5]:
            bid = b.get("id", "") if isinstance(b, dict) else ""
            if bid and "::" not in _safe_b64_decode(bid):
                needs_rescan = True
                break
        if needs_rescan:
            print("[comics] Old-format IDs detected in cache — clearing and forcing rescan")
            self._idx = {"series": [], "books": []}
            self._last_scan_at = 0
            self._start_scan(force=True)
        elif self._idx["series"] and self._last_scan_at == 0:
            self._last_scan_at = 1

    def _compute_auto_series(self, cfg):
        ignored_set = set(_path_key(p) for p in cfg.get("ignoredSeries", []) if p)
        scan_ignore = [s.lower() for s in cfg.get("scanIgnore", []) if s]
        auto = []
        for root in cfg.get("rootFolders", []):
            for sub in _list_immediate_subdirs(root):
                k = _path_key(sub)
                if k in ignored_set:
                    continue
                bn = os.path.basename(sub).lower()
                if bn in DEFAULT_SCAN_IGNORE_DIRNAMES:
                    continue
                if any(pat in bn for pat in scan_ignore):
                    continue
                auto.append(sub)
        return auto

    def _effective_series(self, cfg):
        return _uniq_paths(cfg.get("seriesFolders", []) + self._compute_auto_series(cfg))

    def _make_snapshot(self, cfg):
        self._ensure_index()
        auto = self._compute_auto_series(cfg)
        effective = _uniq_paths(cfg.get("seriesFolders", []) + auto)
        return {
            "seriesFolders": cfg.get("seriesFolders", []),
            "rootFolders": cfg.get("rootFolders", []),
            "ignoredSeries": cfg.get("ignoredSeries", []),
            "scanIgnore": cfg.get("scanIgnore", []),
            "autoSeriesFolders": auto,
            "effectiveSeriesFolders": effective,
            "series": self._idx.get("series", []),
            "books": self._idx.get("books", []),
            "scanning": self._scanning,
            "lastScanAt": self._last_scan_at,
            "error": self._error,
        }

    def _emit_updated(self):
        try:
            cfg = _read_library_config()
            self.libraryUpdated.emit(json.dumps(self._make_snapshot(cfg)))
        except Exception:
            pass

    def _emit_scan_status(self, scanning, progress=None, canceled=False):
        payload = {"scanning": scanning, "progress": progress}
        if canceled:
            payload["canceled"] = True
        try:
            self.scanStatus.emit(json.dumps(payload))
        except Exception:
            pass

    def _do_scan(self, series_folders, ignore_subs, scan_id):
        """Background thread: walk series folders, discover comic files."""
        series = []
        books = []
        total = len(series_folders)
        for i, folder in enumerate(series_folders):
            if self._cancel_event.is_set() or scan_id != self._scan_id:
                return
            folder_name = os.path.basename(folder)
            self._emit_scan_status(True, {"seriesDone": i, "seriesTotal": total, "currentSeries": folder_name})
            sid = _series_id_for_folder(folder)
            series_books = []
            for root, dirs, files in os.walk(folder):
                if self._cancel_event.is_set():
                    return
                dirs[:] = [d for d in dirs if not _should_ignore_dir(d, DEFAULT_SCAN_IGNORE_DIRNAMES, ignore_subs)]
                dirs.sort()
                for f in sorted(files):
                    ext = os.path.splitext(f)[1].lower()
                    if ext not in COMIC_EXTENSIONS:
                        continue
                    fp = os.path.join(root, f)
                    try:
                        st = os.stat(fp)
                    except OSError:
                        continue
                    book = {
                        "id": _book_id_for_path(fp, st.st_size, int(st.st_mtime * 1000)),
                        "seriesId": sid,
                        "title": os.path.splitext(f)[0],
                        "path": fp,
                        "size": st.st_size,
                        "mtimeMs": int(st.st_mtime * 1000),
                        "ext": ext.lstrip(".").upper(),
                    }
                    series_books.append(book)
                    books.append(book)
            newest = max((b["mtimeMs"] for b in series_books), default=0)
            series.append({
                "id": sid, "name": folder_name, "path": folder,
                "count": len(series_books), "newestMtimeMs": newest,
            })
        if scan_id != self._scan_id:
            return
        # Safety: don't overwrite good disk cache with empty scan results
        if not series and self._idx.get("series"):
            print("[scan] Comics scan found 0 series but disk cache has data — skipping overwrite")
            self._scanning = False
            self._scan_thread = None
            self._emit_scan_status(False)
            return
        self._idx = {"series": series, "books": books}
        storage.write_json_sync(storage.data_path(_LIBRARY_INDEX_FILE), self._idx)
        self._last_scan_at = int(time.time() * 1000)
        self._scanning = False
        self._scan_thread = None
        self._error = None
        self._emit_scan_status(False)
        self._emit_updated()
        # Prune orphaned progress
        try:
            live_ids = set(b["id"] for b in books)
            root = self.parent()
            if root:
                prog = getattr(root, "progress", None)
                if prog:
                    all_p = prog._ensure()
                    removed = [k for k in list(all_p.keys()) if k not in live_ids]
                    if removed:
                        for k in removed:
                            all_p.pop(k, None)
                        storage.write_json_sync(storage.data_path(prog._FILE), all_p)
        except Exception:
            pass

    def _start_scan(self, force=False):
        cfg = _read_library_config()
        effective = self._effective_series(cfg)
        key = json.dumps(sorted(effective), sort_keys=True)
        if not force and self._last_scan_at > 0 and self._last_scan_key == key:
            return
        if self._scanning:
            return
        self._last_scan_key = key
        self._scanning = True
        self._error = None
        self._cancel_event.clear()
        self._scan_id += 1
        ignore_subs = [s.lower() for s in cfg.get("scanIgnore", []) if s]
        self._emit_scan_status(True, {"seriesDone": 0, "seriesTotal": len(effective), "currentSeries": ""})
        t = threading.Thread(target=self._do_scan, args=(effective, ignore_subs, self._scan_id), daemon=True)
        self._scan_thread = t
        t.start()

    # --- @Slot methods ---

    @Slot(result=str)
    def getState(self):
        self._ensure_index()
        cfg = _read_library_config()
        snap = self._make_snapshot(cfg)
        if not self._scanning and self._last_scan_at == 0:
            self._start_scan()
        return json.dumps(snap)

    @Slot(result=str)
    @Slot(str, result=str)
    def scan(self, opts=""):
        self._ensure_index()
        self._start_scan(force=True)
        return json.dumps(_ok())

    @Slot(result=str)
    def cancelScan(self):
        if self._scanning:
            self._cancel_event.set()
            self._scanning = False
            self._scan_thread = None
            self._emit_scan_status(False, canceled=True)
            self._emit_updated()
        return json.dumps(_ok())

    @Slot(str, result=str)
    def setScanIgnore(self, patterns_json):
        try:
            patterns = json.loads(patterns_json) if patterns_json else []
        except Exception:
            patterns = []
        cfg = _read_library_config()
        cfg["scanIgnore"] = _sanitize_ignore(patterns)
        _write_library_config(cfg)
        self._start_scan(force=True)
        return json.dumps(_ok(self._make_snapshot(cfg)))

    @Slot(result=str)
    def addRootFolder(self):
        from PySide6.QtWidgets import QFileDialog
        folder = QFileDialog.getExistingDirectory(None, "Add root folder")
        if not folder:
            return json.dumps({"ok": False})
        cfg = _read_library_config()
        roots = cfg.get("rootFolders", [])
        if _path_key(folder) not in set(_path_key(r) for r in roots):
            roots.insert(0, folder)
            cfg["rootFolders"] = roots
            _write_library_config(cfg)
        self._start_scan(force=True)
        return json.dumps({**_ok(self._make_snapshot(cfg)), "folder": folder})

    @Slot(result=str)
    def addSeriesFolder(self):
        from PySide6.QtWidgets import QFileDialog
        folder = QFileDialog.getExistingDirectory(None, "Add series folder")
        if not folder:
            return json.dumps({"ok": False})
        cfg = _read_library_config()
        series = cfg.get("seriesFolders", [])
        if _path_key(folder) not in set(_path_key(s) for s in series):
            series.insert(0, folder)
            cfg["seriesFolders"] = series
            _write_library_config(cfg)
        self._start_scan(force=True)
        return json.dumps({**_ok(self._make_snapshot(cfg)), "folder": folder})

    @Slot(str, result=str)
    def removeSeriesFolder(self, folder):
        folder = str(folder or "").strip()
        if not folder:
            return json.dumps(_err("Missing folder"))
        cfg = _read_library_config()
        fk = _path_key(folder)
        manual = cfg.get("seriesFolders", [])
        manual_keys = set(_path_key(s) for s in manual)
        if fk in manual_keys:
            cfg["seriesFolders"] = [s for s in manual if _path_key(s) != fk]
        else:
            ignored = cfg.get("ignoredSeries", [])
            if fk not in set(_path_key(x) for x in ignored):
                ignored.append(folder)
                cfg["ignoredSeries"] = ignored
        _write_library_config(cfg)
        self._start_scan(force=True)
        return json.dumps(_ok(self._make_snapshot(cfg)))

    @Slot(str, result=str)
    def removeRootFolder(self, root_path):
        root_path = str(root_path or "").strip()
        if not root_path:
            return json.dumps(_err("Missing root_path"))
        cfg = _read_library_config()
        rk = _path_key(root_path)
        cfg["rootFolders"] = [r for r in cfg.get("rootFolders", []) if _path_key(r) != rk]
        _write_library_config(cfg)
        self._start_scan(force=True)
        return json.dumps(_ok(self._make_snapshot(cfg)))

    @Slot(str, result=str)
    def unignoreSeries(self, folder):
        folder = str(folder or "").strip()
        if not folder:
            return json.dumps(_err("Missing folder"))
        cfg = _read_library_config()
        fk = _path_key(folder)
        cfg["ignoredSeries"] = [x for x in cfg.get("ignoredSeries", []) if _path_key(x) != fk]
        _write_library_config(cfg)
        self._start_scan(force=True)
        return json.dumps(_ok(self._make_snapshot(cfg)))

    @Slot(result=str)
    def clearIgnoredSeries(self):
        cfg = _read_library_config()
        cfg["ignoredSeries"] = []
        _write_library_config(cfg)
        self._start_scan(force=True)
        return json.dumps(_ok(self._make_snapshot(cfg)))

    @Slot(result=str)
    def openComicFileDialog(self):
        from PySide6.QtWidgets import QFileDialog
        exts = " ".join("*" + e for e in sorted(COMIC_EXTENSIONS))
        path, _ = QFileDialog.getOpenFileName(
            None, "Open comic file", "",
            "Comic files ({});;All Files (*)".format(exts),
        )
        if not path:
            return json.dumps({"ok": False})
        return json.dumps({"ok": True, "path": path})

    @Slot(str, result=str)
    def bookFromPath(self, file_path):
        fp = str(file_path or "").strip()
        if not fp:
            return json.dumps(_err("Missing path"))
        ext = os.path.splitext(fp)[1].lower()
        if ext not in COMIC_EXTENSIONS:
            return json.dumps({"ok": False, "error": "unsupported_format"})
        try:
            st = os.stat(fp)
        except OSError:
            return json.dumps({"ok": False, "error": "file_not_found"})
        bid = _book_id_for_path(fp, st.st_size, int(st.st_mtime * 1000))
        parent_dir = os.path.dirname(fp)
        sid = _series_id_for_folder(parent_dir)
        book = {
            "id": bid, "seriesId": sid,
            "seriesName": os.path.basename(parent_dir),
            "title": os.path.splitext(os.path.basename(fp))[0],
            "path": fp, "size": st.st_size,
            "mtimeMs": int(st.st_mtime * 1000),
            "ext": ext.lstrip(".").upper(),
        }
        return json.dumps({"ok": True, "book": book})


class BooksBridge(QObject):
    """Books library: folder/file management, scanning, series discovery."""
    booksUpdated = Signal(str)
    scanStatus = Signal(str)

    _CONFIG_FILE = "books_library_state.json"
    _INDEX_FILE = "books_library_index.json"

    def __init__(self, parent=None):
        super().__init__(parent)
        self._idx = {"series": [], "books": [], "folders": []}
        self._scanning = False
        self._scan_thread = None
        self._cancel_event = threading.Event()
        self._last_scan_at = 0
        self._last_scan_key = ""
        self._error = None
        self._idx_loaded = False
        self._scan_id = 0

    # --- internals ---

    def _read_config(self):
        raw = storage.read_json(storage.data_path(self._CONFIG_FILE), {})
        return {
            "bookRootFolders": raw.get("bookRootFolders", []),
            "bookSeriesFolders": raw.get("bookSeriesFolders", []),
            "bookSingleFiles": raw.get("bookSingleFiles", []),
            "scanIgnore": raw.get("scanIgnore", []),
        }

    def _write_config(self, cfg):
        storage.write_json_sync(storage.data_path(self._CONFIG_FILE), cfg)

    def _ensure_index(self):
        if self._idx_loaded:
            return
        self._idx_loaded = True
        raw = storage.read_json(storage.data_path(self._INDEX_FILE), {})
        self._idx = {
            "series": raw.get("series", []),
            "books": raw.get("books", []),
            "folders": raw.get("folders", []),
        }
        # Invalidate old-format cache (IDs without ::size::mtime) and force rescan
        needs_rescan = False
        for b in self._idx["books"][:5]:
            bid = b.get("id", "") if isinstance(b, dict) else ""
            if bid and "::" not in _safe_b64_decode(bid):
                needs_rescan = True
                break
        if needs_rescan:
            print("[books] Old-format IDs detected in cache — clearing and forcing rescan")
            self._idx = {"series": [], "books": [], "folders": []}
            self._last_scan_at = 0
            self._start_scan(force=True)
        elif self._idx["series"] and self._last_scan_at == 0:
            self._last_scan_at = 1

    def _compute_auto_series(self, cfg):
        scan_ignore = [s.lower() for s in cfg.get("scanIgnore", []) if s]
        auto = []
        for root in cfg.get("bookRootFolders", []):
            for sub in _list_immediate_subdirs(root):
                bn = os.path.basename(sub).lower()
                if bn in DEFAULT_SCAN_IGNORE_DIRNAMES:
                    continue
                if any(pat in bn for pat in scan_ignore):
                    continue
                auto.append(sub)
        return auto

    def _effective_series(self, cfg):
        return _uniq_paths(cfg.get("bookSeriesFolders", []) + self._compute_auto_series(cfg))

    def _make_snapshot(self, cfg):
        self._ensure_index()
        return {
            "bookRootFolders": cfg.get("bookRootFolders", []),
            "bookSeriesFolders": cfg.get("bookSeriesFolders", []),
            "bookSingleFiles": cfg.get("bookSingleFiles", []),
            "scanIgnore": cfg.get("scanIgnore", []),
            "series": self._idx.get("series", []),
            "books": self._idx.get("books", []),
            "folders": self._idx.get("folders", []),
            "scanning": self._scanning,
            "lastScanAt": self._last_scan_at,
            "error": self._error,
        }

    def _emit_updated(self):
        try:
            cfg = self._read_config()
            self.booksUpdated.emit(json.dumps(self._make_snapshot(cfg)))
        except Exception:
            pass

    def _emit_scan_status(self, scanning, progress=None, canceled=False):
        payload = {"scanning": scanning, "progress": progress}
        if canceled:
            payload["canceled"] = True
        try:
            self.scanStatus.emit(json.dumps(payload))
        except Exception:
            pass

    def _classify_book(self, cfg, fp):
        """Determine source kind and series for a file path."""
        for sf in cfg.get("bookSeriesFolders", []):
            if _is_path_within(sf, fp):
                return {"sourceKind": "seriesFolder", "seriesPath": sf,
                        "seriesId": _series_id_for_folder(sf), "seriesName": os.path.basename(sf)}
        for root in cfg.get("bookRootFolders", []):
            if _is_path_within(root, fp):
                rel = os.path.relpath(fp, root)
                parts = rel.split(os.sep)
                if len(parts) > 1:
                    sp = os.path.join(root, parts[0])
                    return {"sourceKind": "rootFolder", "seriesPath": sp,
                            "seriesId": _series_id_for_folder(sp), "seriesName": parts[0]}
                return {"sourceKind": "rootLoose", "seriesPath": root,
                        "seriesId": _series_id_for_folder(root), "seriesName": os.path.basename(root)}
        fk = _path_key(fp)
        for sf_path in cfg.get("bookSingleFiles", []):
            if _path_key(sf_path) == fk:
                return {"sourceKind": "singleFile", "seriesPath": None,
                        "seriesId": "__singles__", "seriesName": "Individual Books"}
        return {"sourceKind": "unknown", "seriesPath": None,
                "seriesId": "__unknown__", "seriesName": "Unknown"}

    def _do_scan(self, cfg, scan_id):
        """Background thread: walk series folders + single files, discover books."""
        series_map = {}
        books = []
        folders_list = []
        effective = self._effective_series(cfg)
        single_files = cfg.get("bookSingleFiles", [])
        total = len(effective) + (1 if single_files else 0)
        ignore_subs = [s.lower() for s in cfg.get("scanIgnore", []) if s]

        # Build a mapping from folder → (rootId, rootPath) for hierarchy fields
        root_folders = cfg.get("bookRootFolders", [])
        explicit_series = cfg.get("bookSeriesFolders", [])

        def _classify_folder(folder):
            """Return (rootId, rootPath, folderRelPath) for a series folder."""
            for rf in root_folders:
                if _is_path_within(rf, folder):
                    rid = "root:" + _series_id_for_folder(rf)
                    rel = os.path.relpath(folder, rf).replace("\\", "/")
                    if rel == ".":
                        rel = ""
                    return rid, rf, rel
            # Explicit series folder (not under any root)
            rid = "series:" + _series_id_for_folder(folder)
            return rid, folder, ""

        def _folder_key(root_id, rel_path):
            return root_id + ":" + (rel_path or ".")

        for i, folder in enumerate(effective):
            if self._cancel_event.is_set() or scan_id != self._scan_id:
                return
            folder_name = os.path.basename(folder)
            self._emit_scan_status(True, {"foldersDone": i, "foldersTotal": total, "currentFolder": folder_name})
            sid = _series_id_for_folder(folder)
            root_id, root_path, folder_rel = _classify_folder(folder)
            fk = _folder_key(root_id, folder_rel)
            series_books = []
            for root, dirs, files in os.walk(folder):
                if self._cancel_event.is_set():
                    return
                dirs[:] = [d for d in dirs if not _should_ignore_dir(d, DEFAULT_SCAN_IGNORE_DIRNAMES, ignore_subs)]
                dirs.sort()
                rel_path = os.path.relpath(root, folder).replace("\\", "/")
                if rel_path == ".":
                    rel_path = ""
                book_rel = (folder_rel + "/" + rel_path).strip("/") if rel_path else folder_rel
                book_fk = _folder_key(root_id, book_rel)
                for f in sorted(files):
                    ext = os.path.splitext(f)[1].lower()
                    if ext not in BOOK_EXTENSIONS:
                        continue
                    fp = os.path.join(root, f)
                    try:
                        st = os.stat(fp)
                    except OSError:
                        continue
                    book = {
                        "id": _book_id_for_path(fp, st.st_size, int(st.st_mtime * 1000)),
                        "seriesId": sid,
                        "title": os.path.splitext(f)[0], "path": fp,
                        "size": st.st_size, "mtimeMs": int(st.st_mtime * 1000),
                        "format": ext.lstrip(".").lower(),
                        "rootId": root_id, "rootPath": root_path,
                        "folderRelPath": book_rel, "folderKey": book_fk,
                    }
                    series_books.append(book)
                    books.append(book)
            newest = max((b["mtimeMs"] for b in series_books), default=0)
            if sid not in series_map:
                series_map[sid] = {
                    "id": sid, "name": folder_name, "path": folder,
                    "mediaType": "bookSeries",
                    "rootPath": root_path, "rootId": root_id,
                    "folderRelPath": folder_rel, "folderKey": fk,
                    "count": len(series_books), "newestMtimeMs": newest,
                }
            else:
                s = series_map[sid]
                s["count"] = s.get("count", 0) + len(series_books)
                s["newestMtimeMs"] = max(s.get("newestMtimeMs", 0), newest)
            # Add folder entry for hierarchy
            folders_list.append({
                "rootId": root_id, "rootPath": root_path,
                "relPath": folder_rel,
                "parentRelPath": os.path.dirname(folder_rel).replace("\\", "/") if folder_rel else None,
                "name": folder_name,
                "folderKey": fk,
                "seriesCount": 1,
            })

        # Single files
        if single_files and not self._cancel_event.is_set():
            self._emit_scan_status(True, {"foldersDone": len(effective), "foldersTotal": total, "currentFolder": "Individual files"})
            singles_sid = "__singles__"
            singles_root_id = "singles:__singles__"
            singles_books = []
            for fp in single_files:
                if self._cancel_event.is_set():
                    return
                ext = os.path.splitext(fp)[1].lower()
                if ext not in BOOK_EXTENSIONS:
                    continue
                try:
                    st = os.stat(fp)
                except OSError:
                    continue
                book = {
                    "id": _book_id_for_path(fp, st.st_size, int(st.st_mtime * 1000)),
                    "seriesId": singles_sid,
                    "title": os.path.splitext(os.path.basename(fp))[0], "path": fp,
                    "size": st.st_size, "mtimeMs": int(st.st_mtime * 1000),
                    "format": ext.lstrip(".").lower(),
                    "rootId": singles_root_id, "rootPath": None,
                    "folderRelPath": "", "folderKey": singles_root_id + ":.",
                }
                singles_books.append(book)
                books.append(book)
            if singles_books:
                newest = max((b["mtimeMs"] for b in singles_books), default=0)
                series_map[singles_sid] = {
                    "id": singles_sid, "name": "Individual Books", "path": None,
                    "mediaType": "bookSeries",
                    "rootPath": None, "rootId": singles_root_id,
                    "folderRelPath": "", "folderKey": singles_root_id + ":.",
                    "count": len(singles_books), "newestMtimeMs": newest,
                }

        if scan_id != self._scan_id:
            return
        # Safety: don't overwrite good disk cache with empty scan results
        if not series_map and self._idx.get("series"):
            print("[scan] Books scan found 0 series but disk cache has data — skipping overwrite")
            self._scanning = False
            self._scan_thread = None
            self._emit_scan_status(False)
            return
        self._idx = {"series": list(series_map.values()), "books": books, "folders": folders_list}
        storage.write_json_sync(storage.data_path(self._INDEX_FILE), self._idx)
        self._last_scan_at = int(time.time() * 1000)
        self._scanning = False
        self._scan_thread = None
        self._error = None
        self._emit_scan_status(False)
        self._emit_updated()
        # Prune orphaned progress across books-related bridges
        try:
            live_ids = set(b["id"] for b in books)
            root = self.parent()
            if root:
                for attr in ("booksProgress", "booksBookmarks", "booksAnnotations",
                             "booksDisplayNames", "booksTtsProgress"):
                    bridge = getattr(root, attr, None)
                    if not bridge:
                        continue
                    cache = bridge._ensure()
                    removed = [k for k in list(cache.keys()) if k not in live_ids]
                    if removed:
                        for k in removed:
                            cache.pop(k, None)
                        storage.write_json_sync(storage.data_path(bridge._FILE), cache)
        except Exception:
            pass

    def _start_scan(self, force=False):
        cfg = self._read_config()
        effective = self._effective_series(cfg)
        singles = cfg.get("bookSingleFiles", [])
        key = json.dumps({"e": sorted(effective), "s": sorted(singles)}, sort_keys=True)
        if not force and self._last_scan_at > 0 and self._last_scan_key == key:
            return
        if self._scanning:
            return
        self._last_scan_key = key
        self._scanning = True
        self._error = None
        self._cancel_event.clear()
        self._scan_id += 1
        self._emit_scan_status(True, {"foldersDone": 0, "foldersTotal": len(effective), "currentFolder": ""})
        t = threading.Thread(target=self._do_scan, args=(cfg, self._scan_id), daemon=True)
        self._scan_thread = t
        t.start()

    # --- @Slot methods ---

    @Slot(result=str)
    def getState(self):
        self._ensure_index()
        cfg = self._read_config()
        snap = self._make_snapshot(cfg)
        if not self._scanning and self._last_scan_at == 0:
            self._start_scan()
        return json.dumps(snap)

    @Slot(result=str)
    @Slot(str, result=str)
    def scan(self, opts=""):
        self._ensure_index()
        self._start_scan(force=True)
        return json.dumps(_ok())

    @Slot(result=str)
    def cancelScan(self):
        if self._scanning:
            self._cancel_event.set()
            self._scanning = False
            self._scan_thread = None
            self._emit_scan_status(False, canceled=True)
            self._emit_updated()
        return json.dumps(_ok())

    @Slot(str, result=str)
    def setScanIgnore(self, p):
        try:
            patterns = json.loads(p) if p else []
        except Exception:
            patterns = []
        cfg = self._read_config()
        cfg["scanIgnore"] = _sanitize_ignore(patterns)
        self._write_config(cfg)
        self._start_scan(force=True)
        return json.dumps(_ok(self._make_snapshot(cfg)))

    @Slot(result=str)
    def addRootFolder(self):
        from PySide6.QtWidgets import QFileDialog
        folder = QFileDialog.getExistingDirectory(None, "Add books root folder")
        if not folder:
            return json.dumps({"ok": False})
        cfg = self._read_config()
        roots = cfg.get("bookRootFolders", [])
        if _path_key(folder) not in set(_path_key(r) for r in roots):
            roots.insert(0, folder)
            cfg["bookRootFolders"] = roots
            self._write_config(cfg)
        self._start_scan(force=True)
        return json.dumps({**_ok(self._make_snapshot(cfg)), "folder": folder})

    @Slot(str, result=str)
    def removeRootFolder(self, p):
        p = str(p or "").strip()
        if not p:
            return json.dumps(_err("Missing path"))
        cfg = self._read_config()
        pk = _path_key(p)
        cfg["bookRootFolders"] = [r for r in cfg.get("bookRootFolders", []) if _path_key(r) != pk]
        self._write_config(cfg)
        self._start_scan(force=True)
        return json.dumps(_ok(self._make_snapshot(cfg)))

    @Slot(result=str)
    def addSeriesFolder(self):
        from PySide6.QtWidgets import QFileDialog
        folder = QFileDialog.getExistingDirectory(None, "Add books series folder")
        if not folder:
            return json.dumps({"ok": False})
        cfg = self._read_config()
        series = cfg.get("bookSeriesFolders", [])
        if _path_key(folder) not in set(_path_key(s) for s in series):
            series.insert(0, folder)
            cfg["bookSeriesFolders"] = series
            self._write_config(cfg)
        self._start_scan(force=True)
        return json.dumps({**_ok(self._make_snapshot(cfg)), "folder": folder})

    @Slot(str, result=str)
    def removeSeriesFolder(self, p):
        p = str(p or "").strip()
        if not p:
            return json.dumps(_err("Missing path"))
        cfg = self._read_config()
        pk = _path_key(p)
        manual = cfg.get("bookSeriesFolders", [])
        if pk in set(_path_key(s) for s in manual):
            cfg["bookSeriesFolders"] = [s for s in manual if _path_key(s) != pk]
            self._write_config(cfg)
            self._start_scan(force=True)
        else:
            sid = _series_id_for_folder(p)
            self._idx["books"] = [b for b in self._idx.get("books", []) if b.get("seriesId") != sid]
            self._idx["series"] = [s for s in self._idx.get("series", []) if s.get("id") != sid]
            storage.write_json_sync(storage.data_path(self._INDEX_FILE), self._idx)
            self._emit_updated()
        return json.dumps(_ok(self._make_snapshot(cfg)))

    @Slot(result=str)
    def addFiles(self):
        from PySide6.QtWidgets import QFileDialog
        exts = " ".join("*" + e for e in sorted(BOOK_EXTENSIONS))
        paths, _ = QFileDialog.getOpenFileNames(
            None, "Add book files", "",
            "Book files ({});;All Files (*)".format(exts),
        )
        if not paths:
            return json.dumps({"ok": False})
        cfg = self._read_config()
        singles = cfg.get("bookSingleFiles", [])
        existing = set(_path_key(s) for s in singles)
        for fp in paths:
            pk = _path_key(fp)
            if pk not in existing:
                singles.append(fp)
                existing.add(pk)
        cfg["bookSingleFiles"] = singles
        self._write_config(cfg)
        self._start_scan(force=True)
        return json.dumps(_ok(self._make_snapshot(cfg)))

    @Slot(str, result=str)
    def removeFile(self, p):
        p = str(p or "").strip()
        if not p:
            return json.dumps(_err("Missing path"))
        cfg = self._read_config()
        pk = _path_key(p)
        cfg["bookSingleFiles"] = [s for s in cfg.get("bookSingleFiles", []) if _path_key(s) != pk]
        self._write_config(cfg)
        self._start_scan(force=True)
        return json.dumps(_ok(self._make_snapshot(cfg)))

    @Slot(result=str)
    def openFileDialog(self):
        from PySide6.QtWidgets import QFileDialog
        exts = " ".join("*" + e for e in sorted(BOOK_EXTENSIONS))
        path, _ = QFileDialog.getOpenFileName(
            None, "Open book file", "",
            "Book files ({});;All Files (*)".format(exts),
        )
        if not path:
            return json.dumps({"ok": False})
        return self.bookFromPath(path)

    @Slot(str, result=str)
    def bookFromPath(self, p):
        fp = str(p or "").strip()
        if not fp:
            return json.dumps(_err("Missing path"))
        ext = os.path.splitext(fp)[1].lower()
        if ext not in BOOK_EXTENSIONS:
            return json.dumps({"ok": False, "error": "unsupported_format"})
        try:
            st = os.stat(fp)
        except OSError:
            return json.dumps({"ok": False, "error": "file_not_found"})
        cfg = self._read_config()
        cls = self._classify_book(cfg, fp)
        book = {
            "id": _book_id_for_path(fp, st.st_size, int(st.st_mtime * 1000)),
            "seriesId": cls["seriesId"], "seriesName": cls.get("seriesName", ""),
            "title": os.path.splitext(os.path.basename(fp))[0],
            "path": fp, "size": st.st_size,
            "mtimeMs": int(st.st_mtime * 1000),
            "format": ext.lstrip(".").lower(),
            "sourceKind": cls["sourceKind"],
        }
        return json.dumps({"ok": True, "book": book})


class BooksTtsEdgeBridge(QObject):
    """
    Edge TTS (Text-to-Speech) via the ``edge-tts`` pip package.

    Provides voice listing, text→audio synthesis with SHA-256-keyed disk
    cache (``tts_audio_cache/``), cache eviction at 500 MB, and a probe
    method that tests both voice availability and synthesis readiness.

    Synthesis runs on a background thread to avoid blocking the Qt event loop.
    Audio is returned as base64 or as a ``file://`` URL pointing to the
    cached MP3.
    """

    _CACHE_SUBDIR = "tts_audio_cache"
    _EVICT_MAX_BYTES = 500 * 1024 * 1024   # 500 MB
    _EVICT_WRITE_THRESHOLD = 50
    _SYNTH_TIMEOUT_S = 20

    def __init__(self, parent=None):
        super().__init__(parent)
        self._voices_cache = []     # list of voice dicts
        self._voices_at = 0         # timestamp of last fetch
        self._evict_count = 0
        self._edge_tts = None       # lazy-loaded module reference

    # ── helpers ──────────────────────────────────────────────────────────

    def _try_import(self):
        if self._edge_tts is not None:
            return self._edge_tts
        try:
            import edge_tts as _et
            self._edge_tts = _et
        except ImportError:
            self._edge_tts = False      # sentinel: tried and failed
        return self._edge_tts

    def _cache_dir(self):
        return storage.data_path(self._CACHE_SUBDIR)

    @staticmethod
    def _cache_key(text, voice, rate, pitch):
        raw = text + "|" + voice + "|" + str(rate) + "|" + str(pitch)
        return hashlib.sha256(raw.encode("utf-8")).hexdigest()[:40]

    def _cache_get(self, key, return_base64=True):
        d = self._cache_dir()
        mp3 = os.path.join(d, key + ".mp3")
        meta_path = os.path.join(d, key + ".meta.json")
        try:
            meta = json.loads(open(meta_path, "r", encoding="utf-8").read())
            out = {
                "audioPath": mp3,
                "audioUrl": "file:///" + mp3.replace("\\", "/"),
                "boundaries": meta.get("boundaries", []),
                "mime": meta.get("mime", "audio/mpeg"),
            }
            if return_base64:
                out["audioBase64"] = base64.b64encode(
                    open(mp3, "rb").read()).decode("ascii")
            return out
        except Exception:
            return None

    def _cache_set(self, key, audio_bytes, boundaries, mime="audio/mpeg"):
        d = self._cache_dir()
        os.makedirs(d, exist_ok=True)
        mp3 = os.path.join(d, key + ".mp3")
        meta_path = os.path.join(d, key + ".meta.json")
        try:
            with open(mp3, "wb") as f:
                f.write(audio_bytes)
            with open(meta_path, "w", encoding="utf-8") as f:
                json.dump({"boundaries": boundaries or [], "mime": mime}, f)
        except Exception:
            pass

    def _evict_if_needed(self):
        d = self._cache_dir()
        if not os.path.isdir(d):
            return
        try:
            entries = []
            total = 0
            for name in os.listdir(d):
                if not name.endswith(".mp3"):
                    continue
                mp3 = os.path.join(d, name)
                meta = os.path.join(d, name.replace(".mp3", ".meta.json"))
                try:
                    sz = os.path.getsize(mp3)
                    msz = 0
                    try:
                        msz = os.path.getsize(meta)
                    except Exception:
                        pass
                    total += sz + msz
                    entries.append({"mp3": mp3, "meta": meta,
                                    "size": sz + msz,
                                    "mtime": os.path.getmtime(mp3)})
                except Exception:
                    pass
            if total <= self._EVICT_MAX_BYTES:
                return
            entries.sort(key=lambda e: e["mtime"])
            idx = 0
            while total > self._EVICT_MAX_BYTES and idx < len(entries):
                try:
                    os.unlink(entries[idx]["mp3"])
                except Exception:
                    pass
                try:
                    os.unlink(entries[idx]["meta"])
                except Exception:
                    pass
                total -= entries[idx]["size"]
                idx += 1
        except Exception:
            pass

    @staticmethod
    def _rate_str(rate):
        pct = round((max(0.5, min(2.0, float(rate or 1.0))) - 1) * 100)
        return ("+" if pct >= 0 else "") + str(pct) + "%"

    @staticmethod
    def _pitch_str(pitch):
        hz = round((max(0.5, min(2.0, float(pitch or 1.0))) - 1) * 50)
        return ("+" if hz >= 0 else "") + str(hz) + "Hz"

    # ── async runner (edge_tts is asyncio-based) ────────────────────────

    def _run_async(self, coro):
        """Run an asyncio coroutine from a sync context (Qt slot).
        Uses processEvents() polling to keep UI responsive while waiting."""
        import asyncio
        import concurrent.futures
        from PySide6.QtWidgets import QApplication
        try:
            with concurrent.futures.ThreadPoolExecutor(max_workers=1) as pool:
                future = pool.submit(asyncio.run, coro)
                deadline = time.monotonic() + self._SYNTH_TIMEOUT_S + 5
                while not future.done():
                    remaining = deadline - time.monotonic()
                    if remaining <= 0:
                        future.cancel()
                        raise TimeoutError("TTS synthesis timed out")
                    app = QApplication.instance()
                    if app:
                        app.processEvents()
                    time.sleep(0.02)  # 20ms poll interval
                return future.result(timeout=0)
        except (TimeoutError, concurrent.futures.TimeoutError) as e:
            raise e
        except Exception:
            return asyncio.run(coro)

    # ── voice listing ───────────────────────────────────────────────────

    async def _fetch_voices(self):
        et = self._try_import()
        if not et or et is False:
            return {"ok": False, "voices": [], "reason": "edge_tts_module_missing"}
        try:
            raw = await et.list_voices()
            voices = []
            for v in (raw or []):
                short = v.get("ShortName") or v.get("Name") or ""
                if not short:
                    continue
                voices.append({
                    "name": short,
                    "voiceURI": short,
                    "lang": v.get("Locale", ""),
                    "gender": v.get("Gender", ""),
                    "localService": False,
                    "default": short == "en-US-AriaNeural",
                    "engine": "edge",
                })
            if not voices:
                return {"ok": False, "voices": [], "reason": "voices_empty"}
            self._voices_cache = voices
            self._voices_at = int(time.time() * 1000)
            return {"ok": True, "voices": voices}
        except Exception as e:
            return {"ok": False, "voices": [], "reason": str(e)}

    @Slot(str, result=str)
    def getVoices(self, p):
        payload = _p(p)
        max_age = max(0, int(payload.get("maxAgeMs", 600000) or 600000))
        now = int(time.time() * 1000)
        if self._voices_cache and (now - self._voices_at) <= max_age:
            return json.dumps({"ok": True, "voices": self._voices_cache, "cached": True})
        try:
            result = self._run_async(self._fetch_voices())
            return json.dumps(result)
        except Exception as e:
            return json.dumps({"ok": False, "voices": [], "reason": str(e)})

    # ── synthesis ───────────────────────────────────────────────────────

    async def _synth_edge(self, text, voice, rate_str, pitch_str):
        et = self._try_import()
        if not et or et is False:
            return {"ok": False, "errorCode": "edge_module_missing",
                    "reason": "edge-tts not available",
                    "boundaries": [], "audioBase64": ""}
        try:
            comm = et.Communicate(text, voice, rate=rate_str, pitch=pitch_str,
                                  boundary="WordBoundary")
            audio_chunks = []
            boundaries = []
            async for chunk in comm.stream():
                if chunk["type"] == "audio":
                    audio_chunks.append(chunk["data"])
                elif chunk["type"] == "WordBoundary":
                    boundaries.append({
                        "offsetMs": int(chunk.get("offset", 0)) // 10000,
                        "durationMs": int(chunk.get("duration", 0)) // 10000,
                        "text": chunk.get("text", ""),
                    })
            if not audio_chunks:
                return {"ok": False, "errorCode": "edge_audio_chunk_recv_none",
                        "reason": "No audio data received",
                        "boundaries": boundaries, "audioBase64": ""}
            audio_bytes = b"".join(audio_chunks)
            return {
                "ok": True,
                "boundaries": boundaries,
                "audioBytes": audio_bytes,
                "audioBase64": base64.b64encode(audio_bytes).decode("ascii"),
                "encoding": "base64",
                "mime": "audio/mpeg",
            }
        except Exception as e:
            return {"ok": False, "errorCode": "edge_synth_error",
                    "reason": str(e),
                    "boundaries": [], "audioBase64": ""}

    @Slot(str, result=str)
    def synth(self, p):
        payload = _p(p)
        text = str(payload.get("text", "")).strip()
        if not text:
            return json.dumps({"ok": False, "errorCode": "edge_empty_text",
                               "reason": "Text is empty",
                               "boundaries": [], "audioBase64": ""})
        voice = str(payload.get("voice", "en-US-AriaNeural"))
        rate_num = float(payload.get("rate", 1.0) or 1.0)
        pitch_num = float(payload.get("pitch", 1.0) or 1.0)
        rate_str = self._rate_str(rate_num)
        pitch_str = self._pitch_str(pitch_num)
        return_base64 = payload.get("returnBase64", True) is not False

        # Check disk cache first
        key = self._cache_key(text, voice, rate_num, pitch_num)
        cached = self._cache_get(key, return_base64)
        if cached:
            return json.dumps({
                "ok": True, "elapsedMs": 0,
                "boundaries": cached.get("boundaries", []),
                "audioBase64": cached.get("audioBase64", ""),
                "audioPath": cached.get("audioPath", ""),
                "audioUrl": cached.get("audioUrl", ""),
                "encoding": "base64" if return_base64 else "url",
                "mime": cached.get("mime", "audio/mpeg"),
                "fromCache": True,
            })

        # Synthesize
        started = int(time.time() * 1000)
        try:
            result = self._run_async(self._synth_edge(text, voice, rate_str, pitch_str))
        except Exception as e:
            return json.dumps({"ok": False, "errorCode": "edge_synth_internal_error",
                               "reason": str(e),
                               "boundaries": [], "audioBase64": ""})

        if not result.get("ok"):
            return json.dumps(result)

        elapsed = int(time.time() * 1000) - started
        audio_bytes = result.pop("audioBytes", None)

        # Write to disk cache
        if audio_bytes:
            self._cache_set(key, audio_bytes, result.get("boundaries", []),
                            result.get("mime", "audio/mpeg"))
            self._evict_count += 1
            if self._evict_count >= self._EVICT_WRITE_THRESHOLD:
                self._evict_count = 0
                self._evict_if_needed()

        # If caller wants file URL, read back from cache
        if not return_base64 and audio_bytes:
            cached2 = self._cache_get(key, False)
            if cached2:
                return json.dumps({
                    "ok": True, "elapsedMs": elapsed,
                    "boundaries": result.get("boundaries", []),
                    "audioPath": cached2["audioPath"],
                    "audioUrl": cached2["audioUrl"],
                    "audioBase64": "",
                    "encoding": "url",
                    "mime": cached2.get("mime", "audio/mpeg"),
                    "fromCache": False,
                })

        result["elapsedMs"] = elapsed
        return json.dumps(result)

    # ── probe ───────────────────────────────────────────────────────────

    @Slot(str, result=str)
    def probe(self, p):
        payload = _p(p)
        require_synth = payload.get("requireSynthesis", True) is not False
        allow_voices_only = bool(payload.get("allowVoicesOnly", False))

        out = {
            "ok": True, "available": False, "reason": "",
            "details": {"voices": None, "synth": None},
        }

        # Test voices
        v_raw = self.getVoices(json.dumps({"maxAgeMs": 0}))
        v = json.loads(v_raw)
        voices_ok = bool(v.get("ok") and v.get("voices"))
        out["details"]["voices"] = {
            "ok": voices_ok,
            "count": len(v.get("voices", [])),
            "reason": v.get("reason", ""),
        }

        if voices_ok and not require_synth:
            out["available"] = True
            out["reason"] = "voices_ok"
            return json.dumps(out)

        # Test synthesis
        s_raw = self.synth(json.dumps({
            "text": str(payload.get("text", "Edge probe")),
            "voice": str(payload.get("voice", "en-US-AriaNeural")),
            "rate": 1.0, "pitch": 1.0,
        }))
        s = json.loads(s_raw)
        out["details"]["synth"] = {
            "ok": bool(s.get("ok")),
            "errorCode": s.get("errorCode", ""),
            "reason": s.get("reason", ""),
        }

        if s.get("ok") and s.get("audioBase64"):
            out["available"] = True
            out["reason"] = "synth_ok"
            return json.dumps(out)

        if voices_ok and allow_voices_only:
            out["available"] = True
            out["reason"] = "voices_only_mode"
            return json.dumps(out)

        out["available"] = False
        out["reason"] = s.get("errorCode") or s.get("reason") or "probe_failed"
        return json.dumps(out)

    # ── warmup / reset / cache management ───────────────────────────────

    @Slot(str, result=str)
    def warmup(self, p):
        """Pre-warm by fetching voice list (edge-tts has no persistent connection)."""
        et = self._try_import()
        if not et or et is False:
            return json.dumps({"ok": False, "reason": "edge_tts_module_missing"})
        try:
            self._run_async(self._fetch_voices())
            return json.dumps({"ok": True})
        except Exception as e:
            return json.dumps({"ok": False, "reason": str(e)})

    @Slot(result=str)
    def resetInstance(self):
        """Reset cached state — forces fresh voice fetch on next call."""
        self._voices_cache = []
        self._voices_at = 0
        return json.dumps({"ok": True})

    @Slot(result=str)
    def cacheClear(self):
        d = self._cache_dir()
        if not os.path.isdir(d):
            return json.dumps({"ok": True, "deletedCount": 0})
        deleted = 0
        try:
            for name in os.listdir(d):
                try:
                    os.unlink(os.path.join(d, name))
                    deleted += 1
                except Exception:
                    pass
        except Exception as e:
            return json.dumps({"ok": False, "reason": str(e)})
        return json.dumps({"ok": True, "deletedCount": deleted})

    @Slot(result=str)
    def cacheInfo(self):
        d = self._cache_dir()
        if not os.path.isdir(d):
            return json.dumps({"ok": True, "count": 0, "sizeBytes": 0})
        try:
            mp3_count = 0
            total = 0
            for name in os.listdir(d):
                fp = os.path.join(d, name)
                try:
                    total += os.path.getsize(fp)
                except Exception:
                    pass
                if name.endswith(".mp3"):
                    mp3_count += 1
            return json.dumps({"ok": True, "count": mp3_count, "sizeBytes": total})
        except Exception as e:
            return json.dumps({"ok": False, "reason": str(e),
                               "count": 0, "sizeBytes": 0})


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


class VideoBridge(QObject):
    """Video library: folder management, scanning, show grouping, episodes."""
    videoUpdated = Signal(str)
    scanStatus = Signal(str)
    shellPlay = Signal(str)
    folderThumbnailUpdated = Signal(str)

    def __init__(self, parent=None):
        super().__init__(parent)
        self._idx = {"roots": [], "shows": [], "episodes": []}
        self._scanning = False
        self._scan_thread = None
        self._cancel_event = threading.Event()
        self._last_scan_at = 0
        self._last_scan_key = ""
        self._error = None
        self._idx_loaded = False
        self._scan_id = 0

    # --- internals ---

    def _ensure_index(self):
        if self._idx_loaded:
            return
        self._idx_loaded = True
        raw = storage.read_json(storage.data_path(_VIDEO_INDEX_FILE), {})
        self._idx = {
            "roots": raw.get("roots", []),
            "shows": raw.get("shows", []),
            "episodes": raw.get("episodes", []),
        }
        # Dedup shows in memory (cached index may contain duplicates from
        # Electron scanner when root folders and show folders overlap).
        # Important: do NOT clear + rescan — that destroys Electron-generated
        # properties (torrentStreamable, sourceKind, episodeCount, etc.)
        # that butterfly's scanner doesn't produce.
        if self._idx["shows"]:
            seen_paths = set()
            deduped = []
            removed_ids = set()
            for s in self._idx["shows"]:
                sp = os.path.normcase(os.path.normpath(s.get("path", "") or ""))
                if sp and sp in seen_paths:
                    removed_ids.add(s.get("id"))
                    continue
                if sp:
                    seen_paths.add(sp)
                deduped.append(s)
            if removed_ids:
                print(f"[video] Deduped {len(removed_ids)} duplicate show(s) in memory")
                self._idx["shows"] = deduped
                self._idx["episodes"] = [
                    e for e in self._idx["episodes"]
                    if e.get("showId") not in removed_ids
                ]
        # Detect stale episode IDs from old butterfly scanner (used int mtimeMs
        # instead of float, producing IDs that don't match Electron's progress keys).
        # Sample a few accessible episodes and check if their IDs match what
        # the current _video_episode_id() would produce. If not, force rescan.
        if self._idx["episodes"]:
            needs_id_fix = False
            checked = 0
            for ep in self._idx["episodes"][:20]:
                fp = ep.get("path", "")
                if not fp:
                    continue
                try:
                    st = os.stat(fp)
                except OSError:
                    continue
                checked += 1
                expected = _video_episode_id(fp, st.st_size, st.st_mtime * 1000)
                if expected != ep.get("id"):
                    needs_id_fix = True
                    break
                if checked >= 5:
                    break
            if needs_id_fix:
                print("[video] Stale episode IDs detected (int mtimeMs) — forcing rescan")
                self._last_scan_at = 0
                self._start_scan(force=True)
                return
        if self._idx["shows"] and self._last_scan_at == 0:
            self._last_scan_at = 1

    def _filter_hidden(self, idx, hidden_ids):
        if not hidden_ids:
            return idx
        shows = [s for s in idx.get("shows", []) if s.get("id") not in hidden_ids]
        show_ids = set(s["id"] for s in shows)
        episodes = [e for e in idx.get("episodes", []) if e.get("showId") in show_ids]
        return {"roots": idx.get("roots", []), "shows": shows, "episodes": episodes}

    def _make_snapshot(self, cfg, opts=None):
        self._ensure_index()
        hidden_ids = set(cfg.get("videoHiddenShowIds", []))
        idx = self._filter_hidden(self._idx, hidden_ids)
        lite = opts and isinstance(opts, dict) and opts.get("lite")
        snap = {
            "videoFolders": cfg.get("videoFolders", []),
            "videoShowFolders": cfg.get("videoShowFolders", []),
            "videoHiddenShowIds": cfg.get("videoHiddenShowIds", []),
            "videoFiles": cfg.get("videoFiles", []),
            "roots": idx.get("roots", []),
            "shows": idx.get("shows", []),
            "scanning": self._scanning,
            "lastScanAt": self._last_scan_at,
            "error": self._error,
        }
        if not lite:
            snap["episodes"] = idx.get("episodes", [])
        return snap

    def _emit_updated(self, opts=None):
        try:
            cfg = _read_library_config()
            self.videoUpdated.emit(json.dumps(self._make_snapshot(cfg, opts)))
        except Exception:
            pass

    def _emit_scan_status(self, scanning, progress=None, canceled=False, phase="scan"):
        payload = {"scanning": scanning, "phase": phase, "progress": progress}
        if canceled:
            payload["canceled"] = True
        try:
            self.scanStatus.emit(json.dumps(payload))
        except Exception:
            pass

    def _build_added_files(self, cfg, hidden_set):
        """Build pseudo-root/show/episodes for individually added video files."""
        video_files = cfg.get("videoFiles", [])
        if not video_files:
            return [], [], []
        roots = [{"id": _ADDED_FILES_ROOT_ID, "name": "Added Files",
                  "path": None, "displayPath": "Added Files"}]
        shows = []
        episodes = []
        if _ADDED_FILES_SHOW_ID not in hidden_set:
            shows.append({
                "id": _ADDED_FILES_SHOW_ID, "rootId": _ADDED_FILES_ROOT_ID,
                "name": "Added Files", "path": None, "displayPath": "Added Files",
                "isLoose": True, "thumbPath": None, "folders": [],
            })
            for fp in video_files:
                ext = os.path.splitext(fp)[1].lower()
                if ext not in VIDEO_EXTENSIONS:
                    continue
                try:
                    st = os.stat(fp)
                except OSError:
                    continue
                eid = _video_episode_id(fp, st.st_size, st.st_mtime * 1000)
                episodes.append({
                    "id": eid, "title": os.path.splitext(os.path.basename(fp))[0],
                    "rootId": _ADDED_FILES_ROOT_ID, "rootName": "Added Files",
                    "showId": _ADDED_FILES_SHOW_ID, "showName": "Added Files",
                    "showRootPath": None, "folderRelPath": "",
                    "folderKey": _video_folder_key(_ADDED_FILES_SHOW_ID, ""),
                    "folderId": None, "folderName": None,
                    "path": fp, "size": st.st_size,
                    "mtimeMs": st.st_mtime * 1000,
                    "ext": ext.lstrip(".").upper(), "aliasIds": [],
                })
        return roots, shows, episodes

    def _scan_show_folder(self, folder, show_id, root_id, show_name, ignore_subs):
        """Walk a show folder and return list of episode entries."""
        episodes = []
        for root, dirs, files in os.walk(folder):
            if self._cancel_event.is_set():
                return episodes
            dirs[:] = [d for d in dirs if not _should_ignore_dir(d, DEFAULT_SCAN_IGNORE_DIRNAMES, ignore_subs)]
            dirs.sort()
            rel_path = os.path.relpath(root, folder)
            if rel_path == ".":
                rel_path = ""
            for f in sorted(files):
                ext = os.path.splitext(f)[1].lower()
                if ext not in VIDEO_EXTENSIONS:
                    continue
                fp = os.path.join(root, f)
                try:
                    st = os.stat(fp)
                except OSError:
                    continue
                eid = _video_episode_id(fp, st.st_size, st.st_mtime * 1000)
                fk = _video_folder_key(show_id, rel_path)
                episodes.append({
                    "id": eid, "title": os.path.splitext(f)[0],
                    "rootId": root_id, "rootName": "",
                    "showId": show_id, "showName": show_name,
                    "showRootPath": folder, "folderRelPath": rel_path,
                    "folderKey": fk,
                    "folderId": fk if rel_path else None,
                    "folderName": os.path.basename(root) if rel_path else None,
                    "path": fp, "size": st.st_size,
                    "mtimeMs": st.st_mtime * 1000,
                    "ext": ext.lstrip(".").upper(), "aliasIds": [],
                })
        return episodes

    def _find_folder_poster(self, folder, show_id):
        """Look for an existing poster in user data or the folder itself."""
        safe_id = show_id.replace("/", "_").replace("\\", "_")
        for ext in (".jpg", ".png"):
            user_poster = os.path.join(storage.data_path("video_posters"), safe_id + ext)
            if os.path.isfile(user_poster):
                return user_poster
        for name in ("poster.jpg", "poster.png", "folder.jpg", "folder.png",
                     "cover.jpg", "cover.png"):
            fp = os.path.join(folder, name)
            if os.path.isfile(fp):
                return fp
        return None

    def _has_stream_manifest(self, folder, max_depth=5):
        """Check if folder contains a .tanko_torrent_stream.json marker."""
        stack = [(folder, 0)]
        while stack:
            current, depth = stack.pop()
            if depth > max_depth:
                continue
            if os.path.isfile(os.path.join(current, _STREAMABLE_MANIFEST_FILE)):
                return True
            try:
                for entry in os.scandir(current):
                    if entry.is_dir() and not entry.name.startswith("."):
                        stack.append((entry.path, depth + 1))
            except OSError:
                continue
        return False

    def _resolve_mpv(self):
        """Find bundled or system mpv executable."""
        app_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        candidate = os.path.join(app_root, "resources", "mpv", "windows", "mpv.exe")
        if os.path.isfile(candidate):
            return candidate
        import shutil as _shutil
        return _shutil.which("mpv")

    def _mpv_grab_frame(self, episode_path, show_id):
        """Spawn mpv to grab a single frame as a poster image."""
        mpv_exe = self._resolve_mpv()
        if not mpv_exe:
            return _err("mpv not found")
        safe_id = show_id.replace("/", "_").replace("\\", "_")
        posters_dir = storage.data_path("video_posters")
        os.makedirs(posters_dir, exist_ok=True)
        out_dir = os.path.join(storage.data_path("video_posters"), "_tmp_grab")
        os.makedirs(out_dir, exist_ok=True)
        args = [
            mpv_exe, "--no-config", "--no-terminal", "--msg-level=all=no",
            "--ao=null", "--vo=image", "--frames=1", "--start=7",
            "--vo-image-format=jpg", "--vo-image-outdir=" + out_dir,
            episode_path,
        ]
        try:
            subprocess.run(args, capture_output=True, timeout=30,
                           creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
        except Exception:
            return _err("mpv spawn failed")
        produced = None
        try:
            for f in os.listdir(out_dir):
                if f.lower().endswith(".jpg"):
                    produced = os.path.join(out_dir, f)
                    break
        except OSError:
            pass
        if not produced or not os.path.isfile(produced):
            return _err("No frame produced")
        dest = os.path.join(posters_dir, safe_id + ".jpg")
        try:
            import shutil as _shutil
            _shutil.move(produced, dest)
        except Exception:
            return _err("Failed to move poster")
        try:
            import shutil as _shutil
            _shutil.rmtree(out_dir, ignore_errors=True)
        except Exception:
            pass
        return {"ok": True, "producedPath": dest}

    def _do_scan(self, video_folders, show_folders, cfg, scan_id):
        """Background thread: walk video folders, discover shows and episodes."""
        roots = []
        shows = []
        episodes = []
        ignore_subs = [s.lower() for s in cfg.get("scanIgnore", []) if s]
        hidden_set = set(cfg.get("videoHiddenShowIds", []))

        # Build lookup of previous show properties so we can carry forward
        # Electron-generated metadata (torrentStreamable, sourceKind, etc.)
        _prev_shows_by_path = {}
        _prev_episodes_by_id = {}
        _CARRY_FORWARD_KEYS = (
            "torrentStreamable", "sourceKind", "torrentId",
            "torrentInfoHash", "torrentMagnetUri", "torrentFileIndex",
        )
        for ps in self._idx.get("shows", []):
            pp = os.path.normcase(os.path.normpath(ps.get("path", "") or ""))
            if pp:
                _prev_shows_by_path[pp] = ps
        for pe in self._idx.get("episodes", []):
            pid = pe.get("id")
            if pid:
                _prev_episodes_by_id[pid] = pe

        all_tasks = []
        for vf in video_folders:
            root_id = _video_root_id(vf)
            roots.append({"id": root_id, "name": os.path.basename(vf),
                         "path": vf, "displayPath": vf})
            all_tasks.append(("root", vf, root_id))
        if show_folders:
            sf_root_id = _ADDED_SHOW_FOLDERS_ROOT_ID
            roots.append({"id": sf_root_id, "name": _ADDED_SHOW_FOLDERS_ROOT_NAME,
                         "path": None, "displayPath": "Folders"})
            for sf in show_folders:
                all_tasks.append(("show_folder", sf, sf_root_id))

        seen_show_paths = set()   # dedup: prevent show_folder duplicating a root subdir

        total = len(all_tasks)
        for ti, (kind, folder, root_id) in enumerate(all_tasks):
            if self._cancel_event.is_set() or scan_id != self._scan_id:
                return
            self._emit_scan_status(True, {"foldersDone": ti, "foldersTotal": total,
                                          "currentFolder": os.path.basename(folder)})

            if kind == "root":
                subdirs = _list_immediate_subdirs(folder)
                loose_episodes = []
                for sub in subdirs:
                    if self._cancel_event.is_set():
                        return
                    sub_name = os.path.basename(sub)
                    if _should_ignore_dir(sub_name, DEFAULT_SCAN_IGNORE_DIRNAMES, ignore_subs):
                        continue
                    show_id = _video_root_id(sub)
                    seen_show_paths.add(os.path.normcase(os.path.normpath(sub)))
                    show_eps = self._scan_show_folder(sub, show_id, root_id, sub_name, ignore_subs)
                    if show_eps:
                        thumb = self._find_folder_poster(sub, show_id)
                        is_streamable = self._has_stream_manifest(sub)
                        show_obj = {
                            "id": show_id, "rootId": root_id, "name": sub_name,
                            "path": sub, "displayPath": sub, "isLoose": False,
                            "thumbPath": thumb, "folders": [],
                            "episodeCount": len(show_eps),
                            "torrentStreamable": is_streamable,
                            "sourceKind": "torrent_stream" if is_streamable else "local",
                        }
                        # Carry forward additional Electron-generated metadata
                        prev = _prev_shows_by_path.get(os.path.normcase(os.path.normpath(sub)))
                        if prev:
                            for k in _CARRY_FORWARD_KEYS:
                                if k in prev and k not in show_obj:
                                    show_obj[k] = prev[k]
                        shows.append(show_obj)
                        episodes.extend(show_eps)
                # Loose files at root level
                try:
                    for entry in os.scandir(folder):
                        if entry.is_file():
                            ext = os.path.splitext(entry.name)[1].lower()
                            if ext in VIDEO_EXTENSIONS:
                                st = entry.stat()
                                eid = _video_episode_id(entry.path, st.st_size, st.st_mtime * 1000)
                                loose_episodes.append({
                                    "id": eid, "title": os.path.splitext(entry.name)[0],
                                    "rootId": root_id, "rootName": os.path.basename(folder),
                                    "showId": None, "showName": os.path.basename(folder),
                                    "showRootPath": folder, "folderRelPath": "",
                                    "folderKey": "", "folderId": None, "folderName": None,
                                    "path": entry.path, "size": st.st_size,
                                    "mtimeMs": st.st_mtime * 1000,
                                    "ext": ext.lstrip(".").upper(), "aliasIds": [],
                                })
                except OSError:
                    pass
                if loose_episodes:
                    loose_id = _loose_show_id(folder)
                    shows.append({
                        "id": loose_id, "rootId": root_id, "name": os.path.basename(folder),
                        "path": folder, "displayPath": folder, "isLoose": True,
                        "thumbPath": None, "folders": [],
                    })
                    for ep in loose_episodes:
                        ep["showId"] = loose_id
                    episodes.extend(loose_episodes)

            elif kind == "show_folder":
                norm_sf = os.path.normcase(os.path.normpath(folder))
                if norm_sf in seen_show_paths:
                    continue   # already found as subdir of a root folder
                # Also skip if this is a nested subfolder of an already-scanned show
                is_nested = any(norm_sf.startswith(other + os.sep) for other in seen_show_paths)
                if is_nested:
                    continue
                seen_show_paths.add(norm_sf)
                show_id = _video_root_id(folder)
                show_eps = self._scan_show_folder(folder, show_id, root_id,
                                                   os.path.basename(folder), ignore_subs)
                if show_eps:
                    thumb = self._find_folder_poster(folder, show_id)
                    is_streamable = self._has_stream_manifest(folder)
                    show_obj = {
                        "id": show_id, "rootId": root_id,
                        "name": os.path.basename(folder),
                        "path": folder, "displayPath": folder, "isLoose": False,
                        "thumbPath": thumb, "folders": [],
                        "episodeCount": len(show_eps),
                        "torrentStreamable": is_streamable,
                        "sourceKind": "torrent_stream" if is_streamable else "local",
                    }
                    prev = _prev_shows_by_path.get(os.path.normcase(os.path.normpath(folder)))
                    if prev:
                        for k in _CARRY_FORWARD_KEYS:
                            if k in prev and k not in show_obj:
                                show_obj[k] = prev[k]
                    shows.append(show_obj)
                    episodes.extend(show_eps)

        # Pseudo entries for added files
        af_roots, af_shows, af_eps = self._build_added_files(cfg, hidden_set)
        roots.extend(af_roots)
        shows.extend(af_shows)
        episodes.extend(af_eps)

        if scan_id != self._scan_id:
            return
        # Safety: don't overwrite good disk cache with empty scan results
        if not shows and self._idx.get("shows"):
            print("[scan] Video scan found 0 shows but disk cache has data — skipping overwrite")
            self._scanning = False
            self._scan_thread = None
            self._emit_scan_status(False)
            return

        # Carry forward Electron-generated episode metadata (torrent info)
        if _prev_episodes_by_id:
            for ep in episodes:
                prev_ep = _prev_episodes_by_id.get(ep.get("id"))
                if prev_ep:
                    for k in _CARRY_FORWARD_KEYS:
                        if k in prev_ep and k not in ep:
                            ep[k] = prev_ep[k]

        self._idx = {"roots": roots, "shows": shows, "episodes": episodes}
        storage.write_json_sync(storage.data_path(_VIDEO_INDEX_FILE), self._idx)
        self._last_scan_at = int(time.time() * 1000)
        self._scanning = False
        self._scan_thread = None
        self._error = None
        self._emit_scan_status(False)
        self._emit_updated()

    def _start_scan(self, force=False):
        cfg = _read_library_config()
        folders = cfg.get("videoFolders", [])
        show_folders = cfg.get("videoShowFolders", [])
        key = json.dumps({"f": sorted(folders), "sf": sorted(show_folders)}, sort_keys=True)
        if not force and self._last_scan_at > 0 and self._last_scan_key == key:
            return
        if self._scanning:
            return
        self._last_scan_key = key
        self._scanning = True
        self._error = None
        self._cancel_event.clear()
        self._scan_id += 1
        self._emit_scan_status(True, {"foldersDone": 0,
                                       "foldersTotal": len(folders) + len(show_folders),
                                       "currentFolder": ""})
        t = threading.Thread(target=self._do_scan,
                             args=(folders, show_folders, cfg, self._scan_id), daemon=True)
        self._scan_thread = t
        t.start()

    def _add_show_folder_path(self, folder):
        cfg = _read_library_config()
        sf = cfg.get("videoShowFolders", [])
        fk = _path_key(folder)
        for existing in sf:
            if _is_path_within(existing, folder) and _path_key(existing) != fk:
                return {"ok": True, "folder": folder, "skipped": True}
        sf = [f for f in sf if not (_is_path_within(folder, f) and _path_key(f) != fk)]
        if fk not in set(_path_key(f) for f in sf):
            sf.insert(0, folder)
        cfg["videoShowFolders"] = sf
        _write_library_config(cfg)
        self._start_scan(force=True)
        return {"ok": True, "state": self._make_snapshot(cfg), "folder": folder}

    # --- @Slot methods ---

    @Slot(result=str)
    @Slot(str, result=str)
    def getState(self, opts=""):
        self._ensure_index()
        try:
            o = json.loads(opts) if opts else {}
        except Exception:
            o = {}
        cfg = _read_library_config()
        snap = self._make_snapshot(cfg, o)
        if not self._scanning and self._last_scan_at == 0:
            self._start_scan()
        return json.dumps(snap)

    @Slot(result=str)
    @Slot(str, result=str)
    def scan(self, opts=""):
        self._ensure_index()
        self._start_scan(force=True)
        return json.dumps(_ok())

    @Slot(str, result=str)
    def scanShow(self, p):
        self._ensure_index()
        self._start_scan(force=True)
        return json.dumps(_ok())

    @Slot(str, str, result=str)
    def generateShowThumbnail(self, show_id, opts=""):
        sid = str(show_id or "").strip()
        if not sid:
            return json.dumps(_err("Missing showId"))
        self._ensure_index()
        show = None
        for s in self._idx.get("shows", []):
            if s.get("id") == sid:
                show = s
                break
        if not show:
            return json.dumps(_err("Show not found"))
        first_ep = None
        for ep in self._idx.get("episodes", []):
            if ep.get("showId") == sid:
                first_ep = ep
                break
        if not first_ep or not first_ep.get("path"):
            return json.dumps(_err("No episodes found"))
        result = self._mpv_grab_frame(first_ep["path"], sid)
        if result and result.get("ok"):
            show["thumbPath"] = result.get("producedPath")
            storage.write_json_sync(storage.data_path(_VIDEO_INDEX_FILE), self._idx)
            self._emit_updated()
        return json.dumps(result or _err("Frame grab failed"))

    @Slot(result=str)
    def cancelScan(self):
        if self._scanning:
            self._cancel_event.set()
            self._scanning = False
            self._scan_thread = None
            self._emit_scan_status(False, canceled=True)
            self._emit_updated()
        return json.dumps(_ok())

    @Slot(result=str)
    def addFolder(self):
        from PySide6.QtWidgets import QFileDialog
        folder = QFileDialog.getExistingDirectory(None, "Add video folder")
        if not folder:
            return json.dumps({"ok": False})
        cfg = _read_library_config()
        vf = cfg.get("videoFolders", [])
        if _path_key(folder) not in set(_path_key(f) for f in vf):
            vf.insert(0, folder)
            cfg["videoFolders"] = vf
            _write_library_config(cfg)
        self._start_scan(force=True)
        return json.dumps({"ok": True, "state": self._make_snapshot(cfg), "folder": folder})

    @Slot(result=str)
    def addShowFolder(self):
        from PySide6.QtWidgets import QFileDialog
        folder = QFileDialog.getExistingDirectory(None, "Add show folder")
        if not folder:
            return json.dumps({"ok": False})
        return json.dumps(self._add_show_folder_path(folder))

    @Slot(str, result=str)
    def addShowFolderPath(self, p):
        fp = str(p or "").strip()
        if not fp:
            return json.dumps(_err("Missing path"))
        return json.dumps(self._add_show_folder_path(fp))

    @Slot(str, result=str)
    def removeFolder(self, p):
        fp = str(p or "").strip()
        if not fp:
            return json.dumps(_err("Missing path"))
        cfg = _read_library_config()
        pk = _path_key(fp)
        cfg["videoFolders"] = [f for f in cfg.get("videoFolders", []) if _path_key(f) != pk]
        cfg["videoShowFolders"] = [f for f in cfg.get("videoShowFolders", []) if _path_key(f) != pk]
        _write_library_config(cfg)
        self._start_scan(force=True)
        return json.dumps({"ok": True, "state": self._make_snapshot(cfg)})

    @Slot(str, result=str)
    def removeStreamableFolder(self, p):
        try:
            payload = json.loads(p) if isinstance(p, str) else {}
        except Exception:
            return json.dumps(_err("Invalid payload"))
        show_path = str(payload.get("showPath", "")).strip()
        folder_rel = str(payload.get("folderRelPath", "")).strip()
        delete_files = payload.get("deleteFiles", True)
        if not show_path:
            return json.dumps(_err("Missing showPath"))
        target = os.path.normpath(os.path.join(show_path, folder_rel) if folder_rel else show_path)
        if not _is_path_within(show_path, target):
            return json.dumps(_err("Target not within show path"))
        if not self._has_stream_manifest(target):
            return json.dumps(_err("Not a streamable folder"))
        deleted = False
        if delete_files is not False:
            try:
                import shutil as _shutil
                _shutil.rmtree(target, ignore_errors=True)
                deleted = True
            except Exception:
                pass
        cfg = _read_library_config()
        cfg["videoShowFolders"] = [f for f in cfg.get("videoShowFolders", [])
                                   if not _is_path_within(target, f)]
        _write_library_config(cfg)
        self._start_scan(force=True)
        return json.dumps({"ok": True, "showPath": show_path,
                          "targetFolder": target, "deleted": deleted})

    @Slot(str, result=str)
    def hideShow(self, show_id):
        sid = str(show_id or "").strip()
        if not sid:
            return json.dumps(_err("Missing showId"))
        cfg = _read_library_config()
        hidden = cfg.get("videoHiddenShowIds", [])
        if sid not in hidden:
            hidden.append(sid)
            cfg["videoHiddenShowIds"] = hidden
            _write_library_config(cfg)
        self._emit_updated()
        return json.dumps({"ok": True, "state": self._make_snapshot(cfg)})

    @Slot(result=str)
    def openFileDialog(self):
        from PySide6.QtWidgets import QFileDialog
        exts = " ".join("*" + e for e in sorted(VIDEO_EXTENSIONS))
        path, _ = QFileDialog.getOpenFileName(
            None, "Open video file", "",
            "Video files ({});;All Files (*)".format(exts),
        )
        if not path:
            return json.dumps({"ok": False})
        return json.dumps({"ok": True, "path": path})

    @Slot(result=str)
    def openSubtitleFileDialog(self):
        from PySide6.QtWidgets import QFileDialog
        exts = " ".join("*" + e for e in sorted(SUBTITLE_EXTENSIONS))
        path, _ = QFileDialog.getOpenFileName(
            None, "Load subtitle file", "",
            "Subtitle files ({});;All Files (*)".format(exts),
        )
        if not path:
            return json.dumps({"ok": False})
        return json.dumps({"ok": True, "path": path})

    @Slot(result=str)
    def addFiles(self):
        from PySide6.QtWidgets import QFileDialog
        exts = " ".join("*" + e for e in sorted(VIDEO_EXTENSIONS))
        paths, _ = QFileDialog.getOpenFileNames(
            None, "Add video files", "",
            "Video files ({});;All Files (*)".format(exts),
        )
        if not paths:
            return json.dumps({"ok": False})
        cfg = _read_library_config()
        vfiles = cfg.get("videoFiles", [])
        existing = set(_path_key(f) for f in vfiles)
        for fp in paths:
            pk = _path_key(fp)
            if pk not in existing:
                vfiles.append(fp)
                existing.add(pk)
        cfg["videoFiles"] = vfiles
        _write_library_config(cfg)
        self._start_scan(force=True)
        return json.dumps({"ok": True, "state": self._make_snapshot(cfg)})

    @Slot(str, result=str)
    def removeFile(self, p):
        fp = str(p or "").strip()
        if not fp:
            return json.dumps(_err("Missing path"))
        cfg = _read_library_config()
        pk = _path_key(fp)
        cfg["videoFiles"] = [f for f in cfg.get("videoFiles", []) if _path_key(f) != pk]
        _write_library_config(cfg)
        self._start_scan(force=True)
        return json.dumps({"ok": True, "state": self._make_snapshot(cfg)})

    @Slot(result=str)
    def restoreAllHiddenShows(self):
        cfg = _read_library_config()
        cfg["videoHiddenShowIds"] = []
        _write_library_config(cfg)
        self._emit_updated()
        return json.dumps({"ok": True, "state": self._make_snapshot(cfg)})

    @Slot(str, result=str)
    def restoreHiddenShowsForRoot(self, root_id):
        rid = str(root_id or "").strip()
        if not rid:
            return json.dumps(_err("Missing rootId"))
        cfg = _read_library_config()
        hidden = cfg.get("videoHiddenShowIds", [])
        self._ensure_index()
        root_show_ids = set(s.get("id") for s in self._idx.get("shows", []) if s.get("rootId") == rid)
        cfg["videoHiddenShowIds"] = [h for h in hidden if h not in root_show_ids]
        _write_library_config(cfg)
        self._emit_updated()
        return json.dumps({"ok": True, "state": self._make_snapshot(cfg)})

    @Slot(str, result=str)
    def getEpisodesForShow(self, show_id):
        sid = str(show_id or "").strip()
        if not sid:
            return json.dumps(_err("Missing showId"))
        self._ensure_index()
        eps = [e for e in self._idx.get("episodes", []) if e.get("showId") == sid]
        return json.dumps({"ok": True, "episodes": eps})

    @Slot(str, result=str)
    def getEpisodesForRoot(self, root_id):
        rid = str(root_id or "").strip()
        if not rid:
            return json.dumps(_err("Missing rootId"))
        self._ensure_index()
        eps = [e for e in self._idx.get("episodes", []) if e.get("rootId") == rid]
        return json.dumps({"ok": True, "episodes": eps})

    @Slot(str, result=str)
    def getEpisodesByIds(self, ids_json):
        try:
            ids = json.loads(ids_json) if ids_json else []
        except Exception:
            ids = []
        if not isinstance(ids, list):
            return json.dumps(_err("Invalid ids"))
        self._ensure_index()
        id_set = set(str(i) for i in ids)
        eps = []
        for e in self._idx.get("episodes", []):
            if e.get("id") in id_set:
                eps.append(e)
            elif any(a in id_set for a in e.get("aliasIds", [])):
                eps.append(e)
        return json.dumps({"ok": True, "episodes": eps})


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


class ExportBridge(QObject):
    """Export comic pages: save to disk via QFileDialog, copy to clipboard."""

    def __init__(self, parent=None):
        super().__init__(parent)

    def _read_entry_bytes(self, kind, session_id, entry_index):
        """Read raw bytes from an open CBZ/CBR session via ArchivesBridge internals."""
        root = self.parent()
        if not root:
            return None
        archives = getattr(root, "archives", None)
        if not archives:
            return None
        kind = str(kind or "cbz").lower()
        sid = str(session_id or "")
        idx = int(entry_index)
        if kind == "cbr":
            s = archives._cbr_sessions.get(sid)
            if not s:
                return None
            entries = s.get("entries", [])
            if idx < 0 or idx >= len(entries):
                return None
            entry_name = entries[idx]["name"]
            return s["rf"].read(entry_name)
        else:
            s = archives._cbz_sessions.get(sid)
            if not s:
                return None
            entries = s.get("entries", [])
            if idx < 0 or idx >= len(entries):
                return None
            entry_name = entries[idx]["name"]
            return s["zf"].read(entry_name)

    @Slot(str, result=str)
    def saveEntry(self, payload):
        try:
            p = json.loads(payload) if isinstance(payload, str) else {}
            kind = str(p.get("kind", "cbz"))
            session_id = str(p.get("sessionId", ""))
            entry_index = int(p.get("entryIndex", -1))
            suggested_name = str(p.get("suggestedName", "page.png"))

            if not session_id or entry_index < 0:
                return json.dumps(_err("Missing sessionId or entryIndex"))

            data = self._read_entry_bytes(kind, session_id, entry_index)
            if data is None:
                return json.dumps(_err("Failed to read entry"))

            import os
            ext = os.path.splitext(suggested_name)[1].lstrip(".").lower() or "png"
            from PySide6.QtWidgets import QFileDialog
            file_path, _ = QFileDialog.getSaveFileName(
                None,
                "Save current page",
                suggested_name,
                "Image (*.{ext});;All Files (*)".format(ext=ext),
            )
            if not file_path:
                return json.dumps({"ok": False})

            with open(file_path, "wb") as f:
                f.write(data)
            return json.dumps({"ok": True, "filePath": file_path})
        except Exception as e:
            return json.dumps(_err(str(e)))

    @Slot(str, result=str)
    def copyEntry(self, payload):
        try:
            p = json.loads(payload) if isinstance(payload, str) else {}
            kind = str(p.get("kind", "cbz"))
            session_id = str(p.get("sessionId", ""))
            entry_index = int(p.get("entryIndex", -1))

            if not session_id or entry_index < 0:
                return json.dumps(_err("Missing sessionId or entryIndex"))

            data = self._read_entry_bytes(kind, session_id, entry_index)
            if data is None:
                return json.dumps(_err("Failed to read entry"))

            from PySide6.QtGui import QImage
            from PySide6.QtWidgets import QApplication
            img = QImage()
            if not img.loadFromData(data):
                return json.dumps({"ok": False})
            QApplication.clipboard().setImage(img)
            return json.dumps({"ok": True})
        except Exception:
            return json.dumps({"ok": False})


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


_VIDEO_EXTS = frozenset({
    "mp4", "mkv", "avi", "mov", "m4v", "webm", "ts", "m2ts",
    "wmv", "flv", "mpeg", "mpg", "3gp",
})


def _is_video_file(path):
    ext = os.path.splitext(path)[1].lower().lstrip(".")
    return ext in _VIDEO_EXTS


def _finished(pos, dur, max_pos, watched, ended):
    """5-point heuristic matching run_player.py."""
    if ended:
        return True
    try:
        if not dur or dur <= 0:
            return False
        p = pos if (pos is not None and pos >= 0) else 0.0
        mp = max_pos if (max_pos is not None and max_pos >= 0) else 0.0
        near_end = (p / dur) >= 0.98 or (mp / dur) >= 0.98
        watched_ok = (watched / dur) >= 0.80 if watched >= 0 else False
        return bool(near_end and watched_ok)
    except Exception:
        return False


def _natural_sort_key(filename):
    import re
    parts = re.split(r'(\d+)', str(filename))
    result = []
    for p in parts:
        try:
            result.append(int(p))
        except ValueError:
            result.append(p.lower())
    return result


class PlayerBridge(QObject):
    """Video player powered by python-mpv, rendered in a native QWidget.

    In Butterfly the player is *internal* — mpv renders directly into
    app.py's QStackedWidget.  No subprocess, no file-based progress sync.
    The renderer calls these Slots just like it called the Electron IPC
    ``player:*`` channels.

    app.py calls ``setMpvWidget(widget)`` once the stacked widget is ready
    so that PlayerBridge can control mpv from here.

    Full feature set ported from player_qt/run_player.py:
    - Playlist management (prev/next, auto-advance on EOF)
    - Watched time tracking (delta-based, speed-aware, seek-ignoring)
    - Finished detection (5-point heuristic)
    - Initial seek retry (up to 4 attempts)
    - Track preference persistence (aid, sid, subVisibility)
    - Speed control with presets
    - mpv property observers (replaces polling for core state)
    - Extended progress format (maxPosition, watchedTime, phase, tracks)
    """

    # Signals the renderer listens to
    playerStateChanged = Signal(str)   # periodic state snapshot
    playerExited       = Signal(str)   # BUILD14_PLAYER_EXITED
    playerEnded        = Signal(str)   # natural end-of-file

    # ── constants ────────────────────────────────────────────────────────
    _POLL_MS = 200            # UI update interval (faster than old 500ms)
    _PROGRESS_WRITE_MS = 5000 # periodic progress persistence interval
    _SPEED_PRESETS = [0.25, 0.5, 0.75, 1.0, 1.25, 1.5, 1.75, 2.0, 2.5, 3.0, 4.0]

    def __init__(self, parent=None):
        super().__init__(parent)
        self._mpv = None
        self._mpv_widget = None
        self._show_player = None
        self._show_web     = None
        self._media_ref = {}
        self._is_playing = False
        self._position_sec = 0.0
        self._duration_sec = 0.0
        self._ended = False
        self._eof_signaled = False
        self._stopped = True
        self._poll_timer = None
        self._progress_timer = None
        self._progress_domain = None

        # Playlist state
        self._playlist = []
        self._playlist_ids = []
        self._playlist_index = -1
        self._auto_advance = True

        # Watched time tracking (delta-based, speed-aware)
        self._max_position = 0.0
        self._watched_time = 0.0
        self._watch_last_pos = None
        self._watch_last_wall = None

        # Speed
        self._speed = 1.0

        # Volume (persisted in player_settings.json)
        self._volume = 100
        self._muted = False

        # Track preferences (persisted per show in progress data)
        self._last_aid = None
        self._last_sid = None
        self._last_sub_visibility = None
        self._cached_paused = False

        # Initial seek retry
        self._pending_initial_seek = None
        self._initial_seek_attempts = 0

        # Chapter list
        self._chapter_list = []

        # Session
        self._session_id = ""

        # Player overlay reference (set by app.py)
        self._overlay = None

        # Player settings persistence path
        self._settings_path = os.path.join(
            os.path.dirname(os.path.abspath(__file__)), "data", "player_settings.json"
        )
        self._load_player_settings()

    # ── app.py wiring ───────────────────────────────────────────────────

    def setMpvWidget(self, widget, show_player_fn, show_web_fn):
        """Called by app.py after QStackedWidget is built."""
        self._mpv_widget = widget
        self._show_player = show_player_fn
        self._show_web    = show_web_fn

    def setOverlay(self, overlay):
        """Called by MpvContainer to connect itself for state updates."""
        self._overlay = overlay

    def setProgressDomain(self, bridge):
        """Give PlayerBridge a ref to VideoProgressBridge for progress persistence."""
        self._progress_domain = bridge

    # ── player settings persistence ─────────────────────────────────────

    def _load_player_settings(self):
        try:
            if os.path.isfile(self._settings_path):
                with open(self._settings_path, "r", encoding="utf-8") as f:
                    s = json.load(f)
                self._volume = int(s.get("volume", 100))
                self._muted = bool(s.get("muted", False))
                self._auto_advance = bool(s.get("autoAdvance", True))
        except Exception:
            pass

    def _save_player_settings(self):
        try:
            d = os.path.dirname(self._settings_path)
            if d and not os.path.isdir(d):
                os.makedirs(d, exist_ok=True)
            with open(self._settings_path, "w", encoding="utf-8") as f:
                json.dump({
                    "volume": self._volume,
                    "muted": self._muted,
                    "autoAdvance": self._auto_advance,
                }, f)
        except Exception:
            pass

    # ── mpv lifecycle ───────────────────────────────────────────────────

    def _ensure_mpv(self):
        """Create the mpv.MPV instance on first use (lazy).
        Uses Build 13 quality settings from run_player.py."""
        if self._mpv is not None:
            return True

        # Search for libmpv DLL in multiple candidate directories.
        # resources/mpv/windows/ is gitignored, so it may not exist in the
        # butterfly working tree but does exist in the master repo or a
        # sibling checkout.
        project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        candidates = [
            os.path.join(project_root, "resources", "mpv", "windows"),
        ]
        # Also check sibling repos (e.g. Tankoban-Max-master alongside Tankoban-Max-butterfly)
        parent_of_root = os.path.dirname(project_root)
        for sibling in ("Tankoban-Max-master", "Tankoban-Max", "Tankoban Max"):
            candidates.append(os.path.join(parent_of_root, sibling, "resources", "mpv", "windows"))
        # Also check player_qt directory (run_player.py ships alongside mpv)
        candidates.append(os.path.join(project_root, "player_qt"))

        mpv_dir = None
        for d in candidates:
            if os.path.isdir(d):
                # Check if the directory actually contains a libmpv DLL
                has_dll = any(
                    f.startswith(("libmpv", "mpv-")) and f.endswith(".dll")
                    for f in os.listdir(d)
                )
                if has_dll:
                    mpv_dir = d
                    break

        if mpv_dir:
            print(f"[player] Found libmpv in: {mpv_dir}")
            if mpv_dir not in os.environ.get("PATH", ""):
                os.environ["PATH"] = mpv_dir + os.pathsep + os.environ.get("PATH", "")
        else:
            print(f"[player] libmpv DLL not found in candidates: {candidates}")

        try:
            import mpv as _mpv_mod
        except (ImportError, OSError) as e:
            print(f"[player] python-mpv not available: {e}")
            print("[player] Install with: pip install python-mpv")
            print(f"[player] Ensure libmpv-2.dll is in resources/mpv/windows/ or on PATH")
            return False
        if self._mpv_widget is None:
            print("[player] mpv widget not set — call setMpvWidget() first")
            return False
        wid = str(int(self._mpv_widget.winId()))
        try:
            self._mpv = _mpv_mod.MPV(
                wid=wid,
                input_default_bindings=False,
                input_vo_keyboard=False,
                osc=False,
                keep_open="yes",
                idle="yes",
                # Build 13 quality
                vo="gpu-next",
                hwdec="auto",
                gpu_api="vulkan",
                # Volume
                volume=self._volume,
                # OSD
                osd_level=1,
                osd_duration=2000,
            )
        except Exception:
            # Fallback without gpu-next/vulkan if not supported
            try:
                self._mpv = _mpv_mod.MPV(
                    wid=wid,
                    input_default_bindings=False,
                    input_vo_keyboard=False,
                    osc=False,
                    keep_open="yes",
                    idle="yes",
                    hwdec="auto",
                    volume=self._volume,
                    osd_level=1,
                    osd_duration=2000,
                )
            except Exception as e2:
                print(f"[player] mpv init failed: {e2}")
                return False

        # Apply mute state
        try:
            self._mpv.mute = self._muted
        except Exception:
            pass

        # Property observers (replace polling for core state)
        self._mpv.observe_property('time-pos', self._on_time_pos)
        self._mpv.observe_property('duration', self._on_duration)
        self._mpv.observe_property('pause', self._on_pause_change)
        self._mpv.observe_property('eof-reached', self._on_eof)
        try:
            self._mpv.observe_property('chapter-list', self._on_chapter_list)
        except Exception:
            pass
        try:
            self._mpv.observe_property('aid', self._on_aid_change)
            self._mpv.observe_property('sid', self._on_sid_change)
            self._mpv.observe_property('sub-visibility', self._on_sub_visibility_change)
        except Exception:
            pass

        # Subtitle style defaults (respect embedded ASS/SSA)
        try:
            self._mpv.sub_ass_override = 'no'
        except Exception:
            try:
                self._mpv.command('set', 'sub-ass-override', 'no')
            except Exception:
                pass
        try:
            self._mpv.sub_ass_force_margins = 'yes'
        except Exception:
            try:
                self._mpv.command('set', 'sub-ass-force-margins', 'yes')
            except Exception:
                pass
        try:
            self._mpv.sub_use_margins = 'yes'
        except Exception:
            try:
                self._mpv.command('set', 'sub-use-margins', 'yes')
            except Exception:
                pass

        # End-of-file event callback for auto-advance
        @self._mpv.event_callback("end-file")
        def _on_end(evt):
            reason = getattr(evt, "reason", None)
            if str(reason) == "eof":
                self._eof_signaled = True
                self._ended = True
                self._is_playing = False
                self._persist_progress("eof")
                try:
                    self.playerEnded.emit(json.dumps(self._state_snapshot()))
                except RuntimeError:
                    pass
                # Auto-advance to next episode
                if self._auto_advance:
                    try:
                        from PySide6.QtCore import QTimer
                        QTimer.singleShot(300, self._auto_advance_next)
                    except Exception:
                        pass

        return True

    # ── mpv property observers ──────────────────────────────────────────

    def _on_time_pos(self, _name, value):
        try:
            if value is not None:
                v = float(value)
                self._position_sec = v
                self._max_position = max(self._max_position, v)

                # Initial seek retry (up to 4 attempts)
                if self._pending_initial_seek is not None and self._initial_seek_attempts < 4:
                    target = float(self._pending_initial_seek)
                    if v >= (target - 0.5):
                        self._pending_initial_seek = None
                    else:
                        if v <= 1.0 or v < (target - 1.0):
                            try:
                                self._mpv.command('seek', str(target), 'absolute')
                            except Exception:
                                pass
                        self._initial_seek_attempts += 1
        except Exception:
            pass

    def _on_duration(self, _name, value):
        try:
            if value is not None:
                self._duration_sec = float(value)
        except Exception:
            pass

    def _on_pause_change(self, _name, value):
        try:
            if value is not None:
                self._cached_paused = bool(value)
                self._is_playing = not bool(value)
        except Exception:
            pass

    def _on_eof(self, _name, value):
        try:
            if value is True:
                self._eof_signaled = True
        except Exception:
            pass

    def _on_chapter_list(self, _name, value):
        try:
            self._chapter_list = list(value) if value else []
        except Exception:
            self._chapter_list = []

    def _on_aid_change(self, _name, value):
        try:
            self._last_aid = value
        except Exception:
            pass

    def _on_sid_change(self, _name, value):
        try:
            self._last_sid = value
        except Exception:
            pass

    def _on_sub_visibility_change(self, _name, value):
        try:
            self._last_sub_visibility = value
        except Exception:
            pass

    # ── timers ──────────────────────────────────────────────────────────

    def _start_poll(self):
        if self._poll_timer is not None:
            return
        from PySide6.QtCore import QTimer
        self._poll_timer = QTimer(self)
        self._poll_timer.setInterval(self._POLL_MS)
        self._poll_timer.timeout.connect(self._poll_tick)
        self._poll_timer.start()
        # Progress persistence timer
        if self._progress_timer is None:
            self._progress_timer = QTimer(self)
            self._progress_timer.setInterval(self._PROGRESS_WRITE_MS)
            self._progress_timer.timeout.connect(lambda: self._persist_progress("periodic"))
            self._progress_timer.start()

    def _stop_poll(self):
        if self._poll_timer is not None:
            self._poll_timer.stop()
            self._poll_timer.deleteLater()
            self._poll_timer = None
        if self._progress_timer is not None:
            self._progress_timer.stop()
            self._progress_timer.deleteLater()
            self._progress_timer = None

    def _poll_tick(self):
        """UI update tick — uses observer-cached values (never polls mpv)."""
        if self._mpv is None:
            return

        # Watched time tracking (delta-based, speed-aware)
        try:
            pos = self._position_sec
            now_m = time.monotonic()
            last_wall = self._watch_last_wall
            last_pos = self._watch_last_pos

            if pos is not None and now_m is not None:
                pos_f = float(pos)
                if not self._cached_paused and last_pos is not None and last_wall is not None:
                    dt = now_m - last_wall
                    dpos = pos_f - last_pos
                    if dt > 0 and dpos > 0:
                        sp = self._speed if self._speed > 0 else 1.0
                        max_count = max(3.0, (dt * sp * 1.75) + 1.0)
                        if dpos <= max_count:
                            self._watched_time += dpos
                self._watch_last_wall = now_m
                self._watch_last_pos = pos_f
        except Exception:
            pass

        # Emit state to renderer and overlay
        try:
            snapshot = self._state_snapshot()
            self.playerStateChanged.emit(json.dumps(snapshot))
            if self._overlay:
                self._overlay.update_state(snapshot)
        except RuntimeError:
            pass

    def _state_snapshot(self):
        return {
            "backend": "mpv",
            "mediaRef": self._media_ref,
            "isPlaying": self._is_playing,
            "positionSec": self._position_sec,
            "durationSec": self._duration_sec,
            "ended": self._ended,
            "stopped": self._stopped,
            "speed": self._speed,
            "volume": self._volume,
            "muted": self._muted,
            "maxPosition": self._max_position,
            "watchedTime": self._watched_time,
            "playlistIndex": self._playlist_index,
            "playlistLength": len(self._playlist),
            "autoAdvance": self._auto_advance,
            "chapters": self._chapter_list,
        }

    # ── progress persistence ────────────────────────────────────────────

    def _persist_progress(self, phase="pause"):
        """Write progress into VideoProgressBridge, matching run_player.py format."""
        if self._progress_domain is None:
            return
        vid = self._media_ref.get("videoId", "")
        if not vid:
            return
        now = int(time.time() * 1000)
        pos = self._position_sec
        dur = self._duration_sec
        # For eof/close, prefer last observed position if mpv reports 0
        if phase in ("close", "eof") and pos <= 0.1 and self._max_position > 0.1:
            pos = self._max_position

        finished = _finished(pos, dur, self._max_position, self._watched_time, self._eof_signaled)
        prog = {
            "positionSec": pos,
            "durationSec": dur,
            "maxPositionSec": self._max_position,
            "watchedSecApprox": self._watched_time,
            "finished": finished,
            "lastWatchedAtMs": now,
            "completedAtMs": now if finished else None,
            "phase": phase,
        }
        # Persist track preferences
        if self._last_aid is not None:
            prog["aid"] = self._last_aid
        if self._last_sid is not None:
            prog["sid"] = self._last_sid
        if self._last_sub_visibility is not None:
            prog["subVisibility"] = bool(self._last_sub_visibility)

        try:
            self._progress_domain.save(vid, json.dumps(prog))
        except Exception:
            pass

    # ── playlist management ─────────────────────────────────────────────

    def _setup_playlist(self, args):
        """Initialize playlist from launchQt args or build from folder."""
        paths = args.get("playlistPaths")
        ids = args.get("playlistIds")
        index = args.get("playlistIndex", -1)

        if isinstance(paths, list) and paths:
            self._playlist = [str(p) for p in paths]
            self._playlist_ids = [str(i) for i in ids] if isinstance(ids, list) else []
            if isinstance(index, int) and 0 <= index < len(self._playlist):
                self._playlist_index = index
            else:
                file_path = args.get("filePath", "")
                self._playlist_index = self._find_in_playlist(file_path)
        else:
            self._build_folder_playlist(args.get("filePath", ""))

    def _build_folder_playlist(self, file_path):
        """Build playlist from video files in the same folder."""
        try:
            folder = os.path.dirname(file_path)
            if not folder or not os.path.isdir(folder):
                self._playlist = [file_path] if file_path else []
                self._playlist_index = 0
                return
            files = sorted(
                [os.path.join(folder, f) for f in os.listdir(folder)
                 if os.path.isfile(os.path.join(folder, f)) and _is_video_file(f)],
                key=lambda x: _natural_sort_key(os.path.basename(x))
            )
            self._playlist = files if files else [file_path]
            self._playlist_ids = []
            self._playlist_index = self._find_in_playlist(file_path)
        except Exception:
            self._playlist = [file_path] if file_path else []
            self._playlist_index = 0

    def _find_in_playlist(self, file_path):
        """Find index of file_path in playlist (case-insensitive on Windows)."""
        if not file_path:
            return 0
        norm = os.path.normcase(os.path.normpath(file_path))
        for i, p in enumerate(self._playlist):
            if os.path.normcase(os.path.normpath(p)) == norm:
                return i
        return 0

    def _navigate_playlist(self, direction):
        """Navigate playlist by direction (+1 for next, -1 for prev).
        Returns True if navigation happened."""
        new_idx = self._playlist_index + direction
        if new_idx < 0 or new_idx >= len(self._playlist):
            return False
        return self._jump_to_playlist_index(new_idx)

    def _jump_to_playlist_index(self, index):
        """Jump to a specific playlist index. Returns True if successful."""
        if index < 0 or index >= len(self._playlist):
            return False
        self._playlist_index = index
        new_path = self._playlist[index]
        # Update video ID if aligned IDs exist
        new_vid = ""
        if self._playlist_ids and index < len(self._playlist_ids):
            new_vid = self._playlist_ids[index]
        # Persist progress for current video before switching
        self._persist_progress("navigate")
        # Reset tracking state for new episode
        self._position_sec = 0.0
        self._duration_sec = 0.0
        self._max_position = 0.0
        self._watched_time = 0.0
        self._watch_last_pos = None
        self._watch_last_wall = time.monotonic()
        self._ended = False
        self._eof_signaled = False
        self._pending_initial_seek = None
        self._initial_seek_attempts = 0
        # Update media ref
        self._media_ref["path"] = new_path
        if new_vid:
            self._media_ref["videoId"] = new_vid
        # Look up saved progress for the new episode to resume
        start_sec = 0.0
        if new_vid and self._progress_domain:
            try:
                saved = json.loads(self._progress_domain.get(new_vid))
                if isinstance(saved, dict) and not saved.get("finished", False):
                    start_sec = float(saved.get("position", 0) or 0)
            except Exception:
                pass
        # Load file
        try:
            self._mpv.play(new_path)
            if start_sec > 2:
                self._pending_initial_seek = start_sec
                self._initial_seek_attempts = 0
                try:
                    self._mpv.command('seek', str(start_sec), 'absolute')
                except Exception:
                    pass
            self._is_playing = True
            self._stopped = False
            # Restore track preferences
            self._restore_track_prefs()
        except Exception:
            return False
        return True

    def _auto_advance_next(self):
        """Called from end-file callback to advance to next episode."""
        if not self._auto_advance:
            return
        if self._playlist_index + 1 < len(self._playlist):
            self._navigate_playlist(1)
        else:
            # End of playlist — return to library
            self.stop("playlist_ended")

    def _restore_track_prefs(self):
        """Restore saved track preferences for current video (best-effort)."""
        vid = self._media_ref.get("videoId", "")
        if not vid or not self._progress_domain:
            return
        try:
            saved = json.loads(self._progress_domain.get(vid))
            if not isinstance(saved, dict):
                return
            aid = saved.get("aid")
            sid = saved.get("sid")
            sub_vis = saved.get("subVisibility")
            if aid is not None:
                try:
                    self._mpv.aid = aid
                except Exception:
                    pass
            if sid is not None:
                try:
                    self._mpv.sid = sid
                except Exception:
                    pass
            if sub_vis is not None:
                try:
                    self._mpv.sub_visibility = bool(sub_vis)
                except Exception:
                    pass
        except Exception:
            pass

    # ── speed control ───────────────────────────────────────────────────

    def set_speed(self, speed):
        """Set playback speed."""
        try:
            self._speed = float(speed)
            self._mpv.speed = self._speed
        except Exception:
            pass

    def cycle_speed(self, direction=1):
        """Cycle speed preset by direction (+1 next, -1 prev)."""
        try:
            presets = self._SPEED_PRESETS
            idx = presets.index(self._speed) if self._speed in presets else 3
            new_idx = max(0, min(len(presets) - 1, idx + direction))
            self.set_speed(presets[new_idx])
        except Exception:
            pass

    def reset_speed(self):
        """Reset speed to 1.0x."""
        self.set_speed(1.0)

    # ── volume control ──────────────────────────────────────────────────

    def set_volume(self, vol):
        """Set volume (0-100)."""
        try:
            self._volume = max(0, min(100, int(vol)))
            if self._mpv:
                self._mpv.volume = self._volume
            self._save_player_settings()
        except Exception:
            pass

    def adjust_volume(self, delta):
        """Adjust volume by delta (e.g. +5 or -5)."""
        self.set_volume(self._volume + delta)

    def toggle_mute(self):
        """Toggle mute state."""
        self._muted = not self._muted
        try:
            if self._mpv:
                self._mpv.mute = self._muted
            self._save_player_settings()
        except Exception:
            pass

    # ── track control ───────────────────────────────────────────────────

    def cycle_audio_track(self):
        try:
            if self._mpv:
                self._mpv.command('cycle', 'aid')
        except Exception:
            pass

    def cycle_subtitle_track(self):
        try:
            if self._mpv:
                self._mpv.command('cycle', 'sid')
        except Exception:
            pass

    def toggle_subtitle_visibility(self):
        try:
            if self._mpv:
                cur = self._mpv.sub_visibility
                self._mpv.sub_visibility = not cur
        except Exception:
            pass

    def set_audio_delay(self, delay_sec):
        try:
            if self._mpv:
                self._mpv.audio_delay = float(delay_sec)
        except Exception:
            pass

    def set_subtitle_delay(self, delay_sec):
        try:
            if self._mpv:
                self._mpv.sub_delay = float(delay_sec)
        except Exception:
            pass

    def get_track_list(self):
        """Return list of audio/subtitle tracks."""
        try:
            if self._mpv:
                tl = self._mpv.track_list
                return tl if tl else []
        except Exception:
            pass
        return []

    # ── chapter control ─────────────────────────────────────────────────

    def next_chapter(self):
        try:
            if self._mpv:
                self._mpv.command('add', 'chapter', '1')
        except Exception:
            pass

    def prev_chapter(self):
        try:
            if self._mpv:
                self._mpv.command('add', 'chapter', '-1')
        except Exception:
            pass

    # ── aspect ratio ────────────────────────────────────────────────────

    def set_aspect_ratio(self, ratio):
        """Set video aspect ratio. Pass '' or 'default' for auto."""
        try:
            if self._mpv:
                if not ratio or ratio == 'default':
                    self._mpv.video_aspect_override = '-1'
                else:
                    self._mpv.video_aspect_override = str(ratio)
        except Exception:
            pass

    # ── subtitle margin ─────────────────────────────────────────────────

    def set_subtitle_margin(self, px):
        """Push subtitles up by px pixels from bottom."""
        try:
            if self._mpv:
                self._mpv.sub_margin_y = int(px)
        except Exception:
            try:
                if self._mpv:
                    self._mpv.command('set', 'sub-margin-y', str(int(px)))
            except Exception:
                pass

    # ── Slots (called from JS) ──────────────────────────────────────────

    @Slot(str, str, result=str)
    def start(self, media_ref_json, opts_json=""):
        """Begin playback of a media item."""
        if not self._ensure_mpv():
            return json.dumps(_err("mpv_not_available"))
        p = _p(media_ref_json)
        opts = _p(opts_json) if opts_json else {}
        if not isinstance(p, dict):
            return json.dumps(_err("invalid_media_ref"))
        self._media_ref = p
        self._ended = False
        self._eof_signaled = False
        self._stopped = False
        self._position_sec = 0.0
        self._duration_sec = 0.0
        self._max_position = 0.0
        self._watched_time = 0.0
        self._watch_last_pos = None
        self._watch_last_wall = time.monotonic()
        self._pending_initial_seek = None
        self._initial_seek_attempts = 0
        self._session_id = str(int(time.time() * 1000))

        file_path = p.get("path", "")
        if not file_path:
            return json.dumps(_err("no_path"))

        try:
            self._mpv.play(file_path)
            start_sec = float(opts.get("startSeconds", 0) or 0)
            if start_sec > 2:
                self._pending_initial_seek = start_sec
                self._initial_seek_attempts = 0
                try:
                    self._mpv.command('seek', str(start_sec), 'absolute')
                except Exception:
                    pass
                self._position_sec = start_sec
            elif start_sec > 0:
                self._mpv.seek(start_sec, "absolute")
                self._position_sec = start_sec
            self._is_playing = True
        except Exception as exc:
            return json.dumps(_err(str(exc)))

        # Restore track preferences
        self._restore_track_prefs()

        if self._show_player:
            self._show_player()
        self._start_poll()
        return json.dumps(_ok({"state": self._state_snapshot()}))

    @Slot(result=str)
    def play(self):
        if self._mpv is None:
            return json.dumps(_err("mpv_not_available"))
        try:
            self._mpv.pause = False
            self._is_playing = True
            self._stopped = False
        except Exception as exc:
            return json.dumps(_err(str(exc)))
        return json.dumps(_ok({"state": self._state_snapshot()}))

    @Slot(result=str)
    def pause(self):
        if self._mpv is None:
            return json.dumps(_err("mpv_not_available"))
        try:
            self._mpv.pause = True
            self._is_playing = False
            self._persist_progress("pause")
        except Exception as exc:
            return json.dumps(_err(str(exc)))
        return json.dumps(_ok({"state": self._state_snapshot()}))

    @Slot(result=str)
    def togglePlayPause(self):
        if self._mpv is None:
            return json.dumps(_err("mpv_not_available"))
        if self._is_playing:
            return self.pause()
        else:
            return self.play()

    @Slot(str, result=str)
    def seek(self, seconds_json):
        if self._mpv is None:
            return json.dumps(_err("mpv_not_available"))
        try:
            sec = float(seconds_json)
        except (ValueError, TypeError):
            return json.dumps(_err("invalid_seconds"))
        if sec > 10000:
            sec = sec / 1000.0
        try:
            self._mpv.seek(sec, "absolute")
            self._position_sec = sec
        except Exception as exc:
            return json.dumps(_err(str(exc)))
        return json.dumps(_ok({"state": self._state_snapshot()}))

    @Slot(str, result=str)
    def seekRelative(self, delta_json):
        """Seek by a relative number of seconds (+/-)."""
        if self._mpv is None:
            return json.dumps(_err("mpv_not_available"))
        try:
            delta = float(delta_json)
        except (ValueError, TypeError):
            return json.dumps(_err("invalid_delta"))
        try:
            self._mpv.seek(delta, "relative")
        except Exception as exc:
            return json.dumps(_err(str(exc)))
        return json.dumps(_ok())

    @Slot(str, result=str)
    def stop(self, reason=""):
        if self._mpv is None:
            return json.dumps(_err("mpv_not_available"))
        self._persist_progress("close")
        try:
            self._mpv.stop()
        except Exception:
            pass
        self._is_playing = False
        self._stopped = True
        self._stop_poll()
        if self._show_web:
            self._show_web()
        # Build synced progress for JS build14:playerExited handler
        vid = self._media_ref.get("videoId", "") if self._media_ref else ""
        synced = None
        if vid and self._progress_domain:
            try:
                cached = self._progress_domain._ensure_cache()
                synced = {"videoId": vid, "progress": cached.get(vid)}
            except Exception:
                pass
        try:
            self.playerExited.emit(json.dumps({
                "reason": reason or "user_stopped",
                "returnState": None,
                "synced": synced,
            }))
        except RuntimeError:
            pass
        # Also emit progressUpdated so Continue Watching refreshes immediately
        if vid and synced and synced.get("progress"):
            try:
                self._progress_domain.progressUpdated.emit(
                    json.dumps({"videoId": vid, "progress": synced["progress"]}))
            except Exception:
                pass
        return json.dumps(_ok({"state": self._state_snapshot()}))

    @Slot(result=str)
    def nextEpisode(self):
        if self._navigate_playlist(1):
            return json.dumps(_ok({"navigated": True, "index": self._playlist_index}))
        return json.dumps(_ok({"navigated": False}))

    @Slot(result=str)
    def prevEpisode(self):
        if self._navigate_playlist(-1):
            return json.dumps(_ok({"navigated": True, "index": self._playlist_index}))
        return json.dumps(_ok({"navigated": False}))

    @Slot(int, result=str)
    def jumpToEpisode(self, index):
        if self._jump_to_playlist_index(index):
            return json.dumps(_ok({"navigated": True, "index": self._playlist_index}))
        return json.dumps(_ok({"navigated": False}))

    @Slot(result=str)
    def getPlaylist(self):
        """Return playlist with paths, ids, current index, and names."""
        items = []
        for i, p in enumerate(self._playlist):
            items.append({
                "path": p,
                "id": self._playlist_ids[i] if i < len(self._playlist_ids) else "",
                "name": os.path.splitext(os.path.basename(p))[0],
                "current": i == self._playlist_index,
            })
        return json.dumps({"items": items, "index": self._playlist_index, "autoAdvance": self._auto_advance})

    @Slot(bool, result=str)
    def setAutoAdvance(self, enabled):
        self._auto_advance = bool(enabled)
        self._save_player_settings()
        return json.dumps(_ok())

    @Slot(str, result=str)
    def launchQt(self, args_json):
        """In Butterfly there is no external Qt player — playback is inline.
        We translate launchQt into an internal start() call so existing
        renderer code (video.js ``openVideoQtFallback``) keeps working."""
        p = _p(args_json)
        if not isinstance(p, dict):
            return json.dumps(_err("invalid_args"))
        file_path = p.get("filePath", "")
        if not file_path:
            return json.dumps(_err("no_filePath"))

        # Setup playlist from args
        self._setup_playlist(p)

        media_ref = {
            "path": file_path,
            "videoId": p.get("videoId", ""),
            "showId": p.get("showId", ""),
        }
        opts = {"startSeconds": p.get("startSeconds", 0)}
        result = json.loads(self.start(json.dumps(media_ref), json.dumps(opts)))
        result["keepLibraryVisible"] = True
        return json.dumps(result)

    @Slot(result=str)
    def getState(self):
        return json.dumps(_ok({"state": self._state_snapshot()}))

    # ── cleanup ─────────────────────────────────────────────────────────

    def shutdown(self):
        """Called by app.py on quit."""
        self._stop_poll()
        self._persist_progress("close")
        self._save_player_settings()
        if self._mpv is not None:
            try:
                self._mpv.terminate()
            except Exception:
                pass
            self._mpv = None


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


class MpvBridge(QObject):
    """mpv availability check.  In Butterfly the player is native python-mpv,
    so probe() / isAvailable() report whether the ``mpv`` module can be
    imported (i.e. libmpv is installed on the system)."""

    _cached = None  # bool | None

    def __init__(self, parent=None):
        super().__init__(parent)

    def _check(self):
        if MpvBridge._cached is not None:
            return MpvBridge._cached
        # Ensure libmpv DLL is findable
        mpv_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                               "resources", "mpv", "windows")
        if os.path.isdir(mpv_dir) and mpv_dir not in os.environ.get("PATH", ""):
            os.environ["PATH"] = mpv_dir + os.pathsep + os.environ.get("PATH", "")
        try:
            import mpv as _m  # noqa: F401
            MpvBridge._cached = True
        except (ImportError, OSError):
            MpvBridge._cached = False
        return MpvBridge._cached

    @Slot(result=str)
    @Slot(str, result=str)
    def isAvailable(self, opts=""):
        return json.dumps({"ok": True, "available": self._check()})

    @Slot(result=str)
    def probe(self):
        avail = self._check()
        out = {"ok": True, "available": avail}
        if avail:
            try:
                import mpv as _m
                out["version"] = getattr(_m, "MPV_VERSION", "unknown")
            except Exception:
                pass
        return json.dumps(out)


class HolyGrailBridge(StubNamespace):
    """Stub: Holy Grail experiment. Permanently returns unavailable."""

    @Slot(result=str)
    def probe(self):
        return json.dumps({"ok": False, "error": "holy_grail_not_available_in_butterfly"})


class AudiobooksBridge(QObject):
    """Audiobooks: folder scanner + progress/pairing CRUD."""
    audiobookUpdated = Signal(str)
    scanStatus = Signal(str)

    _PROGRESS_FILE = "audiobook_progress.json"
    _PAIRINGS_FILE = "audiobook_pairings.json"
    _CONFIG_FILE = "audiobook_config.json"
    _INDEX_FILE = "audiobook_index.json"

    _COVER_NAMES = ("cover.jpg", "cover.png", "folder.jpg", "front.jpg")

    def __init__(self, parent=None):
        super().__init__(parent)
        self._progress_cache = None
        self._pairings_cache = None
        self._idx = {"audiobooks": []}
        self._scanning = False
        self._scan_thread = None
        self._cancel_event = threading.Event()
        self._last_scan_at = 0
        self._last_scan_key = ""
        self._error = None
        self._idx_loaded = False
        self._scan_id = 0

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

    # --- Scanner internals ---

    def _read_config(self):
        raw = storage.read_json(storage.data_path(self._CONFIG_FILE), {})
        return {"audiobookRootFolders": raw.get("audiobookRootFolders", [])}

    def _write_config(self, cfg):
        storage.write_json_sync(storage.data_path(self._CONFIG_FILE), cfg)

    def _ensure_index(self):
        if self._idx_loaded:
            return
        self._idx_loaded = True
        raw = storage.read_json(storage.data_path(self._INDEX_FILE), {})
        self._idx = {"audiobooks": raw.get("audiobooks", [])}
        # Suppress auto-scan if disk cache has data
        if self._idx["audiobooks"] and self._last_scan_at == 0:
            self._last_scan_at = 1

    def _collect_all_roots(self, cfg):
        """Merge audiobook roots + books roots for shared discovery."""
        roots = list(cfg.get("audiobookRootFolders", []))
        try:
            books_cfg = storage.read_json(storage.data_path("books_library_state.json"), {})
            for r in books_cfg.get("bookRootFolders", []):
                if _path_key(r) not in set(_path_key(x) for x in roots):
                    roots.append(r)
        except Exception:
            pass
        return roots

    def _make_snapshot(self, cfg):
        self._ensure_index()
        return {
            "audiobookRootFolders": cfg.get("audiobookRootFolders", []),
            "audiobooks": self._idx.get("audiobooks", []),
            "scanning": self._scanning,
            "lastScanAt": self._last_scan_at,
            "error": self._error,
        }

    def _emit_updated(self):
        try:
            cfg = self._read_config()
            self.audiobookUpdated.emit(json.dumps(self._make_snapshot(cfg)))
        except Exception:
            pass

    def _emit_scan_status(self, scanning, progress=None, canceled=False):
        payload = {"scanning": scanning, "progress": progress}
        if canceled:
            payload["canceled"] = True
        try:
            self.scanStatus.emit(json.dumps(payload))
        except Exception:
            pass

    def _find_cover(self, folder_path, entries):
        """Find cover image in a folder."""
        entries_lower = {e.lower(): e for e in entries}
        for name in self._COVER_NAMES:
            if name in entries_lower:
                return os.path.join(folder_path, entries_lower[name])
        for e in sorted(entries):
            if e.lower().endswith((".jpg", ".jpeg", ".png")):
                return os.path.join(folder_path, e)
        return None

    def _scan_folder(self, folder_path):
        """Scan a single folder for audio files and cover."""
        try:
            entries = os.listdir(folder_path)
        except OSError:
            return None
        audio_files = []
        for e in entries:
            ext = os.path.splitext(e)[1].lower()
            if ext not in AUDIO_EXTENSIONS:
                continue
            fp = os.path.join(folder_path, e)
            try:
                st = os.stat(fp)
                if not st.st_size:
                    continue
                audio_files.append({
                    "file": e,
                    "title": os.path.splitext(e)[0],
                    "path": fp,
                    "size": st.st_size,
                    "mtimeMs": int(st.st_mtime * 1000),
                    "duration": 0,
                })
            except OSError:
                continue
        if not audio_files:
            return None
        audio_files.sort(key=lambda x: x["file"].lower())
        cover = self._find_cover(folder_path, entries)
        return {"audioFiles": audio_files, "coverPath": cover}

    def _walk_for_audiobooks(self, root_path, root_id, ignore_subs):
        """BFS walk finding all directories containing audio files."""
        candidates = []
        stack = [root_path]
        while stack:
            current = stack.pop(0)
            if self._cancel_event.is_set():
                return candidates
            try:
                entries = os.listdir(current)
            except OSError:
                continue
            has_audio = False
            for e in entries:
                ext = os.path.splitext(e)[1].lower()
                if ext in AUDIO_EXTENSIONS:
                    has_audio = True
                    break
            if has_audio:
                candidates.append({"folderPath": current, "rootPath": root_path, "rootId": root_id})
            for e in sorted(entries):
                if e.startswith("."):
                    continue
                sub = os.path.join(current, e)
                try:
                    if not os.path.isdir(sub):
                        continue
                except OSError:
                    continue
                if _should_ignore_dir(e, DEFAULT_SCAN_IGNORE_DIRNAMES, ignore_subs):
                    continue
                stack.append(sub)
        return candidates

    def _do_scan(self, all_roots, cfg, scan_id):
        """Background thread: discover audiobook folders and build index."""
        ignore_subs = [s.lower() for s in cfg.get("scanIgnore", []) if s]
        candidates = []
        for root in all_roots:
            if self._cancel_event.is_set() or scan_id != self._scan_id:
                return
            root_id = "abroot:" + _b64url(str(root).encode("utf-8"))
            found = self._walk_for_audiobooks(root, root_id, ignore_subs)
            candidates.extend(found)

        audiobooks = []
        total = len(candidates)
        for i, cand in enumerate(candidates):
            if self._cancel_event.is_set() or scan_id != self._scan_id:
                return
            folder_path = cand["folderPath"]
            self._emit_scan_status(True, {"foldersDone": i, "foldersTotal": total,
                                          "currentFolder": os.path.basename(folder_path)})
            result = self._scan_folder(folder_path)
            if not result:
                continue
            audio_files = result["audioFiles"]
            total_size = sum(af["size"] for af in audio_files)
            latest_mtime = max(af["mtimeMs"] for af in audio_files)
            total_duration = sum(af.get("duration", 0) for af in audio_files)
            ab_id = _audiobook_id(folder_path, total_size, latest_mtime)
            chapters = []
            for af in audio_files:
                chapters.append({
                    "file": af["file"], "title": af["title"],
                    "path": af["path"], "size": af["size"],
                    "duration": af.get("duration", 0),
                })
            audiobooks.append({
                "id": ab_id,
                "title": os.path.basename(folder_path),
                "path": folder_path,
                "chapters": chapters,
                "totalDuration": total_duration,
                "coverPath": result["coverPath"],
                "rootPath": cand["rootPath"],
                "rootId": cand["rootId"],
            })

        if scan_id != self._scan_id:
            return
        # Safety: don't overwrite good disk cache with empty scan results
        if not audiobooks and self._idx.get("audiobooks"):
            print("[scan] Audiobook scan found 0 items but disk cache has data — skipping overwrite")
            self._scanning = False
            self._scan_thread = None
            self._emit_scan_status(False)
            return
        self._idx = {"audiobooks": audiobooks}
        storage.write_json_sync(storage.data_path(self._INDEX_FILE), self._idx)
        self._last_scan_at = int(time.time() * 1000)
        self._scanning = False
        self._scan_thread = None
        self._error = None
        self._emit_scan_status(False)
        self._emit_updated()

    def _start_scan(self, force=False):
        cfg = self._read_config()
        all_roots = self._collect_all_roots(cfg)
        key = json.dumps(sorted(all_roots), sort_keys=True)
        if not force and self._last_scan_at > 0 and self._last_scan_key == key:
            return
        if self._scanning:
            return
        self._last_scan_key = key
        self._scanning = True
        self._error = None
        self._cancel_event.clear()
        self._scan_id += 1
        self._emit_scan_status(True, {"foldersDone": 0, "foldersTotal": 0, "currentFolder": ""})
        t = threading.Thread(target=self._do_scan, args=(all_roots, cfg, self._scan_id), daemon=True)
        self._scan_thread = t
        t.start()

    # --- Scanner @Slot methods ---

    @Slot(result=str)
    def getState(self):
        self._ensure_index()
        cfg = self._read_config()
        snap = self._make_snapshot(cfg)
        if not self._scanning and self._last_scan_at == 0:
            self._start_scan()
        return json.dumps(snap)

    @Slot(result=str)
    def scan(self):
        self._ensure_index()
        self._start_scan(force=True)
        return json.dumps(_ok())

    @Slot(result=str)
    @Slot(str, result=str)
    def addRootFolder(self, p=""):
        folder = str(p or "").strip()
        if not folder:
            from PySide6.QtWidgets import QFileDialog
            folder = QFileDialog.getExistingDirectory(None, "Add audiobook root folder")
        if not folder:
            return json.dumps({"ok": False})
        cfg = self._read_config()
        roots = cfg.get("audiobookRootFolders", [])
        if _path_key(folder) not in set(_path_key(r) for r in roots):
            roots.insert(0, folder)
            cfg["audiobookRootFolders"] = roots
            self._write_config(cfg)
        self._start_scan(force=True)
        return json.dumps({**_ok(self._make_snapshot(cfg)), "folder": folder})

    @Slot(result=str)
    def addFolder(self):
        from PySide6.QtWidgets import QFileDialog
        folder = QFileDialog.getExistingDirectory(None, "Add audiobook folder")
        if not folder:
            return json.dumps({"ok": False})
        parent = os.path.dirname(folder)
        return self.addRootFolder(parent)

    @Slot(str, result=str)
    def removeRootFolder(self, p):
        p = str(p or "").strip()
        if not p:
            return json.dumps(_err("Missing path"))
        cfg = self._read_config()
        pk = _path_key(p)
        cfg["audiobookRootFolders"] = [r for r in cfg.get("audiobookRootFolders", []) if _path_key(r) != pk]
        self._write_config(cfg)
        self._start_scan(force=True)
        return json.dumps(_ok(self._make_snapshot(cfg)))

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

class WebSourcesBridge(QObject):
    """
    Curated download-source sites and download lifecycle management.

    Data-only methods (sources CRUD, download history, destination management)
    are fully implemented.  ``handleDownloadRequested()`` accepts
    QWebEngineDownloadRequest from QWebEngineProfile.downloadRequested (wired
    by app.py) and manages the full download lifecycle including
    pause/resume/cancel via stored handles.
    """
    sourcesUpdated = Signal(str)
    downloadStarted = Signal(str)
    downloadProgress = Signal(str)
    downloadCompleted = Signal(str)
    downloadsUpdated = Signal(str)
    popupOpen = Signal(str)
    destinationPickerRequest = Signal(str)

    _SOURCES_FILE = "web_sources.json"
    _DOWNLOADS_FILE = "web_download_history.json"
    _MAX_DOWNLOADS = 1000

    _DEFAULT_SOURCES = [
        {"id": "annasarchive", "name": "Anna's Archive", "url": "https://annas-archive.org", "color": "#e74c3c", "builtIn": True},
        {"id": "oceanofpdf", "name": "OceanofPDF", "url": "https://oceanofpdf.com", "color": "#3498db", "builtIn": True},
        {"id": "getcomics", "name": "GetComics", "url": "https://getcomics.org", "color": "#2ecc71", "builtIn": True},
        {"id": "zlibrary", "name": "Z-Library", "url": "https://z-lib.is", "color": "#f39c12", "builtIn": True},
    ]

    _BOOK_EXTS = {".epub", ".txt", ".mobi", ".azw3"}
    _COMIC_EXTS = {".cbz", ".cbr", ".pdf"}
    _VIDEO_EXTS = {".mp4", ".mkv", ".avi", ".mov", ".m4v", ".webm", ".ts",
                   ".m2ts", ".wmv", ".flv", ".mpeg", ".mpg", ".3gp"}

    _TERMINAL_STATES = {"completed", "cancelled", "failed", "interrupted"}

    def __init__(self, parent=None):
        super().__init__(parent)
        self._sources_cache = None
        self._downloads_cache = None
        self._active_downloads = {}      # id -> download handle (set by app.py)
        self._download_stats = {}        # id -> {received, ts}
        self._picker_pending = {}        # requestId -> callback (future use)

    # ── helpers ──────────────────────────────────────────────────────────

    def _ensure_sources(self):
        if self._sources_cache is not None:
            return self._sources_cache
        raw = storage.read_json(storage.data_path(self._SOURCES_FILE), None)
        if raw and isinstance(raw.get("sources"), list):
            self._sources_cache = raw
        else:
            self._sources_cache = {
                "sources": [dict(s) for s in self._DEFAULT_SOURCES],
                "updatedAt": 0,
            }
        return self._sources_cache

    def _write_sources(self):
        storage.write_json_sync(storage.data_path(self._SOURCES_FILE),
                           self._sources_cache)

    def _emit_sources_updated(self):
        c = self._ensure_sources()
        self.sourcesUpdated.emit(json.dumps({"sources": c.get("sources", [])}))

    def _ensure_downloads(self):
        if self._downloads_cache is not None:
            if not isinstance(self._downloads_cache.get("downloads"), list):
                self._downloads_cache["downloads"] = []
            return self._downloads_cache
        raw = storage.read_json(storage.data_path(self._DOWNLOADS_FILE), None)
        if raw and isinstance(raw.get("downloads"), list):
            self._downloads_cache = raw
        else:
            self._downloads_cache = {"downloads": [], "updatedAt": 0}
        return self._downloads_cache

    def _write_downloads(self):
        c = self._ensure_downloads()
        if len(c["downloads"]) > self._MAX_DOWNLOADS:
            c["downloads"] = c["downloads"][:self._MAX_DOWNLOADS]
        storage.write_json_sync(storage.data_path(self._DOWNLOADS_FILE), c)

    def _emit_downloads_updated(self):
        c = self._ensure_downloads()
        rows = []
        for d in c.get("downloads", []):
            if not isinstance(d, dict):
                continue
            rows.append(self._to_renderer_download(d))
        self.downloadsUpdated.emit(json.dumps({
            "downloads": rows,
        }))

    @staticmethod
    def _normalize_download_state(raw_state):
        s = str(raw_state or "").strip().lower()
        if s in ("started", "downloading", "in_progress", "progressing"):
            return "progressing"
        if s in ("cancelled", "canceled"):
            return "cancelled"
        if s in ("queued", "pending"):
            return "queued"
        if not s:
            return "progressing"
        return s

    @classmethod
    def _is_active_download_state(cls, raw_state):
        s = cls._normalize_download_state(raw_state)
        return s in ("queued", "progressing", "paused", "downloading", "started")

    @staticmethod
    def _download_save_path(entry):
        if not isinstance(entry, dict):
            return ""
        explicit = str(entry.get("savePath", "") or "").strip()
        if explicit:
            return explicit
        destination = str(entry.get("destination", "") or "").strip()
        filename = str(entry.get("filename", "") or "").strip()
        if not destination:
            return ""
        if filename and os.path.isdir(destination):
            return os.path.join(destination, filename)
        return destination

    def _to_renderer_download(self, entry, speed_override=None):
        """Return Electron-like download payload with compatibility keys."""
        if not isinstance(entry, dict):
            entry = {}
        received = int(entry.get("receivedBytes", entry.get("received", 0)) or 0)
        total = int(entry.get("totalBytes", 0) or 0)
        speed_val = speed_override
        if speed_val is None:
            speed_val = entry.get("speed", entry.get("bytesPerSec", 0))
        speed = int(speed_val or 0)
        state_raw = str(entry.get("state", "") or "").strip().lower()
        state = self._normalize_download_state(state_raw)
        save_path = self._download_save_path(entry)
        progress = 0.0
        if total > 0:
            try:
                progress = max(0.0, min(1.0, float(received) / float(total)))
            except Exception:
                progress = 0.0
        return {
            "id": str(entry.get("id", "") or ""),
            "filename": str(entry.get("filename", "") or "download"),
            "name": str(entry.get("filename", "") or "download"),
            "destination": str(entry.get("destination", "") or ""),
            "savePath": save_path,
            "path": save_path,
            "library": str(entry.get("library", "") or ""),
            "state": state,
            "rawState": state_raw,
            "progress": progress,
            "startedAt": int(entry.get("startedAt", 0) or 0),
            "finishedAt": int(entry.get("finishedAt", 0) or 0) if entry.get("finishedAt") is not None else None,
            "error": str(entry.get("error", "") or ""),
            "pageUrl": str(entry.get("pageUrl", "") or ""),
            "downloadUrl": str(entry.get("downloadUrl", "") or ""),
            "totalBytes": total,
            "received": received,
            "receivedBytes": received,
            "speed": speed,
            "bytesPerSec": speed,
            "transport": str(entry.get("transport", "") or "browser"),
            "canPause": bool(entry.get("canPause", False)),
            "canResume": bool(entry.get("canResume", False)),
            "canCancel": bool(entry.get("canCancel", False)),
        }

    def _detect_mode_by_ext(self, filename):
        ext = os.path.splitext(str(filename or ""))[1].lower()
        if ext in self._BOOK_EXTS:
            return "books"
        if ext in self._COMIC_EXTS:
            return "comics"
        if ext in self._VIDEO_EXTS:
            return "videos"
        return ""

    def _get_library_roots(self):
        books = []
        comics = []
        videos = []
        try:
            bc = storage.read_json(storage.data_path("books_library_state.json"), {})
            books = [f for f in (bc.get("bookRootFolders") or []) if f]
        except Exception:
            pass
        try:
            lc = storage.read_json(storage.data_path("library_state.json"), {})
            comics = [f for f in (lc.get("rootFolders") or []) if f]
            videos = [f for f in (lc.get("videoFolders") or []) if f]
        except Exception:
            pass
        return {"books": books, "comics": comics, "videos": videos}

    def _roots_for_mode(self, mode):
        roots = self._get_library_roots()
        if mode == "books":
            return roots.get("books", [])
        if mode == "comics":
            return roots.get("comics", [])
        if mode == "videos":
            return roots.get("videos", [])
        return []

    @staticmethod
    def _normalize_mode(mode):
        m = str(mode or "").strip().lower()
        if m in ("books", "comics", "videos"):
            return m
        return ""

    @staticmethod
    def _sanitize_filename(filename):
        import re
        s = str(filename or "").strip()
        s = re.sub(r'[\\/:*?"<>|]+', "_", s)
        s = re.sub(r"\s+", " ", s).strip()
        if not s:
            s = "download"
        if len(s) > 180:
            s = s[:180].strip()
        return s

    # ── Sources CRUD ─────────────────────────────────────────────────────

    @Slot(result=str)
    def get(self):
        c = self._ensure_sources()
        return json.dumps(_ok({"sources": c.get("sources", [])}))

    @Slot(str, result=str)
    def add(self, p):
        payload = _p(p)
        name = str(payload.get("name", "")).strip()
        url = str(payload.get("url", "")).strip()
        color = str(payload.get("color", "#888888")).strip()
        if not name or not url:
            return json.dumps(_err("Name and URL are required"))
        c = self._ensure_sources()
        sid = "src_" + str(int(time.time() * 1000)) + "_" + hashlib.md5(
            os.urandom(8)).hexdigest()[:4]
        source = {"id": sid, "name": name, "url": url, "color": color,
                  "builtIn": False}
        c["sources"].append(source)
        c["updatedAt"] = int(time.time() * 1000)
        self._write_sources()
        self._emit_sources_updated()
        return json.dumps(_ok({"source": source}))

    @Slot(str, result=str)
    def remove(self, p):
        payload = _p(p)
        sid = str(payload.get("id", "") or payload if isinstance(payload, str) else "")
        if isinstance(payload, dict):
            sid = str(payload.get("id", ""))
        c = self._ensure_sources()
        before = len(c["sources"])
        c["sources"] = [s for s in c["sources"] if s.get("id") != sid]
        if len(c["sources"]) == before:
            return json.dumps(_err("Source not found"))
        c["updatedAt"] = int(time.time() * 1000)
        self._write_sources()
        self._emit_sources_updated()
        return json.dumps(_ok())

    @Slot(str, result=str)
    def update(self, p):
        payload = _p(p)
        sid = str(payload.get("id", ""))
        if not sid:
            return json.dumps(_err("Missing id"))
        c = self._ensure_sources()
        found = None
        for s in c["sources"]:
            if s.get("id") == sid:
                found = s
                break
        if not found:
            return json.dumps(_err("Source not found"))
        if payload.get("name") is not None:
            found["name"] = str(payload["name"]).strip()
        if payload.get("url") is not None:
            found["url"] = str(payload["url"]).strip()
        if payload.get("color") is not None:
            found["color"] = str(payload["color"]).strip()
        c["updatedAt"] = int(time.time() * 1000)
        self._write_sources()
        self._emit_sources_updated()
        return json.dumps(_ok())

    # ── Download history ─────────────────────────────────────────────────

    @Slot(result=str)
    def getDownloadHistory(self):
        c = self._ensure_downloads()
        rows = []
        for d in c.get("downloads", []):
            if not isinstance(d, dict):
                continue
            rows.append(self._to_renderer_download(d))
        return json.dumps(_ok({"downloads": rows}))

    @Slot(result=str)
    def clearDownloadHistory(self):
        c = self._ensure_downloads()
        # Keep active downloads
        c["downloads"] = [d for d in c.get("downloads", [])
                          if d and self._is_active_download_state(d.get("state"))]
        c["updatedAt"] = int(time.time() * 1000)
        self._write_downloads()
        self._emit_downloads_updated()
        return json.dumps(_ok())

    @Slot(str, result=str)
    def removeDownloadHistory(self, p):
        payload = _p(p)
        did = str(payload.get("id", ""))
        if not did:
            return json.dumps(_err("Missing id"))
        c = self._ensure_downloads()
        before = len(c.get("downloads", []))
        c["downloads"] = [d for d in c.get("downloads", [])
                          if not d or str(d.get("id", "")) != did
                          or self._is_active_download_state(d.get("state"))]
        if len(c["downloads"]) == before:
            return json.dumps(_err("Not found"))
        c["updatedAt"] = int(time.time() * 1000)
        self._write_downloads()
        self._emit_downloads_updated()
        return json.dumps(_ok())

    # ── Destinations ─────────────────────────────────────────────────────

    @Slot(result=str)
    def getDestinations(self):
        roots = self._get_library_roots()
        def pick_first(arr):
            return str(arr[0]) if arr else None
        return json.dumps(_ok({
            "books": pick_first(roots.get("books", [])),
            "comics": pick_first(roots.get("comics", [])),
            "videos": pick_first(roots.get("videos", [])),
            "allBooks": roots.get("books", []),
            "allComics": roots.get("comics", []),
            "allVideos": roots.get("videos", []),
        }))

    @Slot(str, result=str)
    def listDestinationFolders(self, p):
        payload = _p(p)
        mode = self._normalize_mode(payload.get("mode"))
        if not mode:
            return json.dumps(_err("Invalid mode"))
        roots = [f for f in self._roots_for_mode(mode) if f]
        if not roots:
            return json.dumps(_ok({"mode": mode, "folders": []}))

        raw_path = str(payload.get("path", "")).strip()
        if not raw_path:
            # Return root folders themselves
            rows = []
            for r in roots:
                abs_r = os.path.abspath(str(r))
                rows.append({"name": os.path.basename(abs_r) or abs_r,
                             "path": abs_r})
            return json.dumps(_ok({"mode": mode, "folders": rows}))

        abs_path = os.path.abspath(raw_path)
        # Verify within allowed roots
        allowed = False
        for r in roots:
            if _is_path_within(os.path.abspath(str(r)), abs_path):
                allowed = True
                break
        if not allowed:
            return json.dumps(_err("Path outside allowed roots"))
        if not os.path.isdir(abs_path):
            return json.dumps(_err("Folder not found"))

        folders = []
        try:
            for entry in os.scandir(abs_path):
                if entry.is_dir():
                    folders.append({"name": entry.name, "path": entry.path})
        except Exception:
            pass
        folders.sort(key=lambda x: str(x.get("name", "")).lower())
        return json.dumps(_ok({"mode": mode, "folders": folders}))

    @Slot(str, result=str)
    def pickDestinationFolder(self, p):
        """Open a folder-picker dialog for download destination."""
        from PySide6.QtWidgets import QFileDialog
        folder = QFileDialog.getExistingDirectory(None, "Select Destination Folder")
        if not folder:
            return json.dumps(_ok({"cancelled": True}))
        return json.dumps(_ok({"folderPath": folder, "ok": True}))

    @Slot(str, result=str)
    def pickSaveFolder(self, p):
        """Open a folder-picker for generic save-to location."""
        from PySide6.QtWidgets import QFileDialog
        folder = QFileDialog.getExistingDirectory(None, "Select Save Folder")
        if not folder:
            return json.dumps(_ok({"cancelled": True}))
        return json.dumps(_ok({"folderPath": folder}))

    @Slot(str, result=str)
    def resolveDestinationPicker(self, p):
        """Resolve a pending destination picker request from the renderer."""
        payload = _p(p)
        rid = str(payload.get("requestId", ""))
        if not rid:
            return json.dumps(_err("Missing requestId"))
        cb = self._picker_pending.pop(rid, None)
        if not cb:
            return json.dumps(_err("Unknown requestId"))
        try:
            cb(payload)
        except Exception:
            pass
        return json.dumps(_ok())

    # ── Download routing ─────────────────────────────────────────────────

    @Slot(str, result=str)
    def routeDownload(self, p):
        """Route a download to an appropriate library folder (picker flow)."""
        payload = _p(p)
        filename = self._sanitize_filename(payload.get("suggestedFilename", ""))
        if not filename:
            return json.dumps(_err("No filename"))
        from PySide6.QtWidgets import QFileDialog
        folder = QFileDialog.getExistingDirectory(None, "Save to Folder")
        if not folder:
            return json.dumps(_ok({"ok": False, "cancelled": True}))
        dest = os.path.join(folder, filename)
        mode = self._detect_mode_by_ext(filename)
        return json.dumps(_ok({
            "destination": dest, "destFolder": folder,
            "mode": mode, "library": mode,
        }))

    @Slot(str, result=str)
    def downloadFromUrl(self, p):
        """
        Direct HTTP download from a URL.

        Full implementation requires threading + streaming. For now, queue
        the download and return immediately. The heavy download logic will
        be wired when app.py integrates QWebEngineProfile.
        """
        payload = _p(p)
        url = str(payload.get("url", "")).strip()
        if not url:
            return json.dumps(_err("No URL"))
        did = "wdl_" + str(int(time.time() * 1000)) + "_" + hashlib.md5(
            os.urandom(8)).hexdigest()[:6]

        # Push a placeholder entry into download history
        c = self._ensure_downloads()
        entry = {
            "id": did,
            "filename": self._sanitize_filename(
                payload.get("suggestedFilename", "") or "download"),
            "destination": "",
            "library": "",
            "state": "queued",
            "startedAt": int(time.time() * 1000),
            "finishedAt": None,
            "error": "",
            "pageUrl": str(payload.get("referer", "")),
            "downloadUrl": url,
            "totalBytes": 0,
            "receivedBytes": 0,
            "transport": "direct",
            "canPause": False,
            "canResume": False,
            "canCancel": True,
        }
        c["downloads"].insert(0, entry)
        c["updatedAt"] = int(time.time() * 1000)
        self._write_downloads()
        self._emit_downloads_updated()
        return json.dumps(_ok({"id": did, "queued": True}))

    # ── QWebEngineDownloadRequest handler (wired by app.py) ──

    def handleDownloadRequested(self, download):
        """
        Slot for QWebEngineProfile.downloadRequested signal.

        Accepts a QWebEngineDownloadRequest, creates a download history
        entry, sets the save path, connects progress/completion signals,
        and accepts the download.
        """
        did = "wdl_" + str(int(time.time() * 1000)) + "_" + hashlib.md5(
            os.urandom(8)).hexdigest()[:6]

        # Determine filename and destination
        suggested = ""
        try:
            suggested = download.downloadFileName()
        except Exception:
            pass
        if not suggested:
            try:
                suggested = download.suggestedFileName()
            except Exception:
                pass
        filename = self._sanitize_filename(suggested or "download")

        # Determine save directory
        dest_dir = self._get_default_destination()
        if dest_dir:
            os.makedirs(dest_dir, exist_ok=True)
            try:
                download.setDownloadDirectory(dest_dir)
                download.setDownloadFileName(filename)
            except Exception:
                pass

        # Total bytes (may be 0 if unknown)
        total = 0
        try:
            total = download.totalBytes()
        except Exception:
            pass

        # Create download history entry
        dl_url = ""
        try:
            dl_url = download.url().toString()
        except Exception:
            pass
        page_url = ""
        try:
            page_url = download.page().url().toString() if download.page() else ""
        except Exception:
            pass

        entry = {
            "id": did,
            "filename": filename,
            "destination": dest_dir or "",
            "savePath": os.path.join(dest_dir, filename) if dest_dir else "",
            "library": "",
            "state": "downloading",
            "startedAt": int(time.time() * 1000),
            "finishedAt": None,
            "error": "",
            "pageUrl": page_url,
            "downloadUrl": dl_url,
            "totalBytes": total,
            "receivedBytes": 0,
            "transport": "browser",
            "canPause": True,
            "canResume": True,
            "canCancel": True,
        }

        c = self._ensure_downloads()
        c["downloads"].insert(0, entry)
        c["updatedAt"] = int(time.time() * 1000)
        self._write_downloads()
        self.downloadStarted.emit(json.dumps(self._to_renderer_download(entry)))
        self._emit_downloads_updated()

        # Store handle for pause/resume/cancel
        self._active_downloads[did] = download
        self._download_stats[did] = {
            "received": 0,
            "ts": int(time.time() * 1000),
        }

        # Connect progress signal
        def on_received_bytes_changed():
            try:
                received = download.receivedBytes()
                total_now = download.totalBytes()
            except Exception:
                received, total_now = 0, 0
            entry["receivedBytes"] = received
            if total_now > 0:
                entry["totalBytes"] = total_now
            entry["state"] = "downloading"
            now_ms = int(time.time() * 1000)
            prev = self._download_stats.get(did) or {"received": 0, "ts": now_ms}
            dt = max(1, now_ms - int(prev.get("ts", now_ms)))
            delta = max(0, int(received) - int(prev.get("received", 0)))
            speed = int((delta * 1000) / dt)
            self._download_stats[did] = {"received": int(received), "ts": now_ms}
            self.downloadProgress.emit(json.dumps(self._to_renderer_download(entry, speed_override=speed)))

        def on_finished():
            self._active_downloads.pop(did, None)
            self._download_stats.pop(did, None)
            try:
                is_complete = download.isFinished()
                state_val = download.state()
            except Exception:
                is_complete = True
                state_val = None
            # Map Qt download state to our state string
            final_state = "completed"
            try:
                from PySide6.QtWebEngineCore import QWebEngineDownloadRequest
                if state_val == QWebEngineDownloadRequest.DownloadState.DownloadCancelled:
                    final_state = "cancelled"
                elif state_val == QWebEngineDownloadRequest.DownloadState.DownloadInterrupted:
                    final_state = "interrupted"
            except Exception:
                if not is_complete:
                    final_state = "failed"
            entry["state"] = final_state
            entry["finishedAt"] = int(time.time() * 1000)
            try:
                entry["receivedBytes"] = download.receivedBytes()
            except Exception:
                pass
            try:
                ddir = str(download.downloadDirectory() or "").strip()
                dname = str(download.downloadFileName() or "").strip()
                if ddir and dname:
                    entry["savePath"] = os.path.join(ddir, dname)
                    entry["destination"] = ddir
                    entry["filename"] = dname
            except Exception:
                pass
            c["updatedAt"] = int(time.time() * 1000)
            self._write_downloads()
            self.downloadCompleted.emit(json.dumps(self._to_renderer_download(entry)))
            self._emit_downloads_updated()

        try:
            download.receivedBytesChanged.connect(on_received_bytes_changed)
            download.isFinishedChanged.connect(on_finished)
        except Exception:
            pass

        # Accept the download
        try:
            download.accept()
        except Exception:
            pass

    def _get_default_destination(self):
        """Return the default download directory."""
        c = self._ensure_sources()
        dests = c.get("destinations", [])
        for d in dests:
            if isinstance(d, dict) and d.get("default"):
                p = d.get("path", "")
                if p and os.path.isdir(p):
                    return p
        # Fallback to user Downloads folder
        try:
            from pathlib import Path
            dl = Path.home() / "Downloads"
            if dl.is_dir():
                return str(dl)
        except Exception:
            pass
        return ""

    # ── Live download lifecycle ──

    @Slot(str, result=str)
    def pauseDownload(self, p):
        payload = _p(p)
        did = str(payload.get("id", ""))
        if not did:
            return json.dumps(_err("Missing id"))
        handle = self._active_downloads.get(did)
        if not handle:
            return json.dumps(_err("Download not active"))
        try:
            handle.pause()
        except Exception as e:
            return json.dumps(_err(str(e)))
        return json.dumps(_ok())

    @Slot(str, result=str)
    def resumeDownload(self, p):
        payload = _p(p)
        did = str(payload.get("id", ""))
        if not did:
            return json.dumps(_err("Missing id"))
        handle = self._active_downloads.get(did)
        if not handle:
            return json.dumps(_err("Download not active"))
        try:
            handle.resume()
        except Exception as e:
            return json.dumps(_err(str(e)))
        return json.dumps(_ok())

    @Slot(str, result=str)
    def cancelDownload(self, p):
        payload = _p(p)
        did = str(payload.get("id", ""))
        if not did:
            return json.dumps(_err("Missing id"))
        handle = self._active_downloads.get(did)
        if not handle:
            return json.dumps(_err("Download not active"))
        try:
            handle.cancel()
        except Exception as e:
            return json.dumps(_err(str(e)))
        self._active_downloads.pop(did, None)
        return json.dumps(_ok())


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


class WebDataBridge(QObject):
    """
    Browsing-data management — aggregate usage stats and selective clearing.

    Cross-domain: delegates clearing to WebHistoryBridge, WebSourcesBridge,
    and WebTorrentBridge (when implemented), plus QWebEngineProfile cache.
    """

    _HISTORY_FILE = "web_browsing_history.json"
    _DOWNLOADS_FILE = "web_download_history.json"
    _TORRENT_FILE = "web_torrent_history.json"
    _SESSION_FILE = "web_session_state.json"

    def __init__(self, parent=None):
        super().__init__(parent)
        self._profile = None   # set by app.py: QWebEngineProfile reference

    def setProfile(self, profile):
        self._profile = profile

    def _file_size_safe(self, filename):
        p = storage.data_path(filename)
        try:
            st = os.stat(p)
            if st:
                return st.st_size
        except Exception:
            pass
        return 0

    def _usage_snapshot(self):
        h = self._file_size_safe(self._HISTORY_FILE)
        d = self._file_size_safe(self._DOWNLOADS_FILE)
        t = self._file_size_safe(self._TORRENT_FILE)
        s = self._file_size_safe(self._SESSION_FILE)
        return {
            "historyBytes": h,
            "downloadsBytes": d,
            "torrentsBytes": t,
            "sessionBytes": s,
            "totalBytes": h + d + t + s,
        }

    @Slot(result=str)
    def usage(self):
        return json.dumps(_ok({"usage": self._usage_snapshot()}))

    @Slot(str, result=str)
    def clear(self, p):
        payload = _p(p)
        raw_kinds = payload.get("kinds", [])
        if not isinstance(raw_kinds, list):
            raw_kinds = []
        kinds = set()
        for k in raw_kinds:
            s = str(k or "").strip().lower()
            if s:
                kinds.add(s)
        if not kinds:
            kinds = {"history", "downloads", "torrents", "cookies", "cache", "siteData"}

        cleared = {}

        # Delegate to sibling bridges via parent (BridgeRoot)
        root = self.parent()

        if "history" in kinds:
            try:
                if root and hasattr(root, "webHistory"):
                    root.webHistory.clear(json.dumps({
                        "from": payload.get("from", 0),
                        "to": payload.get("to", 0),
                    }))
                    cleared["history"] = True
                else:
                    cleared["history"] = False
            except Exception:
                cleared["history"] = False

        if "downloads" in kinds:
            try:
                if root and hasattr(root, "webSources"):
                    root.webSources.clearDownloadHistory()
                    cleared["downloads"] = True
                else:
                    cleared["downloads"] = False
            except Exception:
                cleared["downloads"] = False

        if "torrents" in kinds:
            try:
                if root and hasattr(root, "webTorrent") and hasattr(root.webTorrent, "clearHistory"):
                    root.webTorrent.clearHistory("")
                    cleared["torrents"] = True
                else:
                    cleared["torrents"] = False
            except Exception:
                cleared["torrents"] = False

        if "cache" in kinds:
            try:
                if self._profile:
                    self._profile.clearHttpCache()
                    cleared["cache"] = True
                else:
                    cleared["cache"] = False
            except Exception:
                cleared["cache"] = False

        if "cookies" in kinds or "siteData" in kinds:
            try:
                if self._profile:
                    self._profile.clearAllVisitedLinks()
                    cleared["siteData"] = True
                else:
                    cleared["siteData"] = False
            except Exception:
                cleared["siteData"] = False

        return json.dumps(_ok({"cleared": cleared, "usage": self._usage_snapshot()}))


class WebPermissionsBridge(QObject):
    """Per-origin web permission overrides — rules array with origin normalization."""
    permissionsUpdated = Signal(str)
    permissionPrompt = Signal(str)

    _PERMISSIONS_FILE = "web_permissions.json"
    _VALID_DECISIONS = {"allow", "deny", "ask"}

    def __init__(self, parent=None):
        super().__init__(parent)
        self._cache = None
        self._pending_prompts = {}  # promptId → {page, origin, feature}

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
        """Resolve a pending permission prompt (grant or deny)."""
        payload = json.loads(payload_json) if payload_json else {}
        prompt_id = str(payload.get("promptId", "") or "").strip()
        decision = str(payload.get("decision", "") or "").strip().lower()
        remember = payload.get("remember", False)
        if not prompt_id:
            return json.dumps(_err("Missing promptId"))
        pending = self._pending_prompts.pop(prompt_id, None)
        if not pending:
            return json.dumps(_err("Prompt not found or already resolved"))
        page = pending["page"]
        origin = pending["origin"]
        feature = pending["feature"]
        try:
            if decision == "allow":
                page.setFeaturePermission(
                    origin, feature,
                    page.PermissionPolicy.PermissionGrantedByUser,
                )
            else:
                page.setFeaturePermission(
                    origin, feature,
                    page.PermissionPolicy.PermissionDeniedByUser,
                )
        except Exception:
            pass
        # Optionally persist the decision
        if remember:
            origin_str = origin.toString() if hasattr(origin, "toString") else str(origin)
            feature_map_rev = {}
            try:
                from PySide6.QtWebEngineCore import QWebEnginePage
                feature_map_rev = {
                    QWebEnginePage.Feature.Geolocation: "geolocation",
                    QWebEnginePage.Feature.MediaAudioCapture: "media",
                    QWebEnginePage.Feature.MediaVideoCapture: "media",
                    QWebEnginePage.Feature.MediaAudioVideoCapture: "media",
                    QWebEnginePage.Feature.Notifications: "notifications",
                    QWebEnginePage.Feature.ClipboardReadWrite: "clipboard-read",
                    QWebEnginePage.Feature.ClipboardSanitizedWrite: "clipboard-sanitized-write",
                    QWebEnginePage.Feature.DesktopVideoCapture: "display-capture",
                    QWebEnginePage.Feature.DesktopAudioVideoCapture: "display-capture",
                }
            except Exception:
                pass
            perm_name = feature_map_rev.get(feature, "unknown")
            if perm_name != "unknown":
                self.set(json.dumps({
                    "origin": origin_str,
                    "permission": perm_name,
                    "decision": "allow" if decision == "allow" else "deny",
                }))
        return json.dumps(_ok())


class WebUserscriptsBridge(QObject):
    """Per-site userscript manager — stores scripts and matches them to URLs."""
    userscriptsUpdated = Signal(str)

    _CFG_FILE = "web_userscripts.json"

    def __init__(self, parent=None):
        super().__init__(parent)
        self._cache = None

    # --- internals ---

    def _cfg_path(self):
        return _data_path(self._CFG_FILE)

    @staticmethod
    def _make_id():
        import time, random
        return "usr_" + hex(int(time.time()))[2:] + "_" + hex(random.randint(0, 0xFFFFFF))[2:]

    @staticmethod
    def _normalize_run_at(v):
        s = str(v or "").strip().lower()
        return "dom-ready" if s == "dom-ready" else "did-finish-load"

    @staticmethod
    def _normalize_rule(raw):
        if not raw or not isinstance(raw, dict):
            return None
        code = str(raw.get("code", "") or "").strip()
        match = str(raw.get("match", "") or "").strip()
        if not code or not match:
            return None
        if len(code) > 100000:
            code = code[:100000]
        if len(match) > 1000:
            match = match[:1000]
        import time
        now = int(time.time() * 1000)
        return {
            "id": str(raw.get("id", "") or "").strip() or WebUserscriptsBridge._make_id(),
            "title": str(raw.get("title", "") or "").strip() or "Custom script",
            "enabled": raw.get("enabled") is not False,
            "match": match,
            "runAt": WebUserscriptsBridge._normalize_run_at(raw.get("runAt")),
            "code": code,
            "createdAt": int(raw.get("createdAt") or 0) or now,
            "updatedAt": int(raw.get("updatedAt") or 0) or now,
            "lastInjectedAt": int(raw.get("lastInjectedAt") or 0) or 0,
            "injectCount": int(raw.get("injectCount") or 0) or 0,
        }

    def _ensure_cfg(self):
        if self._cache is not None:
            return self._cache
        try:
            with open(self._cfg_path(), "r", encoding="utf-8") as f:
                raw = json.load(f)
        except Exception:
            raw = {}
        import time
        src = raw if isinstance(raw, dict) else {}
        cfg = {
            "enabled": src.get("enabled") is not False,
            "updatedAt": int(src.get("updatedAt") or 0) or int(time.time() * 1000),
            "rules": [],
        }
        for r in (src.get("rules") or []):
            nr = self._normalize_rule(r)
            if nr:
                cfg["rules"].append(nr)
        self._cache = cfg
        return cfg

    def _write_cfg(self):
        try:
            import os
            os.makedirs(os.path.dirname(self._cfg_path()), exist_ok=True)
            with open(self._cfg_path(), "w", encoding="utf-8") as f:
                json.dump(self._ensure_cfg(), f, indent=2)
        except Exception:
            pass

    def _emit_updated(self):
        cfg = self._ensure_cfg()
        self.userscriptsUpdated.emit(json.dumps({
            "enabled": bool(cfg["enabled"]),
            "updatedAt": cfg["updatedAt"],
            "rules": cfg["rules"],
        }))

    @staticmethod
    def _wildcard_match(pattern, value):
        """Match URL against a userscript match pattern (with * wildcards)."""
        p = str(pattern or "").strip()
        v = str(value or "")
        if not p or not v:
            return False
        if p == "*" or p == "<all_urls>":
            return True
        import re
        try:
            regex = "^" + re.escape(p).replace(r"\*", ".*") + "$"
            return bool(re.match(regex, v, re.IGNORECASE))
        except Exception:
            return False

    @staticmethod
    def _rule_matches_url(rule, url):
        if not rule or not rule.get("enabled"):
            return False
        u = str(url or "")
        if not u.lower().startswith(("http://", "https://")):
            return False
        if WebUserscriptsBridge._wildcard_match(rule.get("match"), u):
            return True
        # Bare domain shorthand: if match has no :// or * or /, treat as hostname match
        m = str(rule.get("match", "") or "").strip()
        if m and "://" not in m and "*" not in m and "/" not in m:
            try:
                from urllib.parse import urlparse
                host = urlparse(u).hostname or ""
                host = host.lower()
                want = m.lower()
                return host == want or host.endswith("." + want)
            except Exception:
                pass
        return False

    # --- public methods for future injection use ---

    def get_matching_scripts(self, url, run_at="did-finish-load"):
        """Internal: get scripts matching a URL and runAt phase."""
        cfg = self._ensure_cfg()
        if not cfg["enabled"]:
            return {"ok": True, "enabled": False, "scripts": []}
        ra = self._normalize_run_at(run_at)
        scripts = []
        for r in cfg["rules"]:
            if not r or not r.get("enabled"):
                continue
            if self._normalize_run_at(r.get("runAt")) != ra:
                continue
            if not self._rule_matches_url(r, url):
                continue
            scripts.append({
                "id": r["id"],
                "title": r["title"],
                "match": r["match"],
                "runAt": r["runAt"],
                "code": r["code"],
            })
        return {"ok": True, "enabled": True, "scripts": scripts}

    def touch_injected(self, rule_id):
        """Internal: mark a rule as injected (update stats)."""
        rid = str(rule_id or "").strip()
        if not rid:
            return
        cfg = self._ensure_cfg()
        for r in cfg["rules"]:
            if str(r.get("id", "")) == rid:
                import time
                r["lastInjectedAt"] = int(time.time() * 1000)
                r["injectCount"] = int(r.get("injectCount") or 0) + 1
                cfg["updatedAt"] = int(time.time() * 1000)
                if r["injectCount"] % 5 == 0:
                    self._write_cfg()
                return

    # --- @Slot methods (IPC surface) ---

    @Slot(result=str)
    def get(self):
        cfg = self._ensure_cfg()
        return json.dumps({
            "ok": True,
            "enabled": bool(cfg["enabled"]),
            "updatedAt": cfg["updatedAt"],
            "rules": cfg["rules"],
        })

    @Slot(str, result=str)
    def setEnabled(self, p):
        try:
            payload = json.loads(p) if isinstance(p, str) and p.strip() else {}
        except Exception:
            payload = {}
        import time
        cfg = self._ensure_cfg()
        cfg["enabled"] = bool(payload.get("enabled"))
        cfg["updatedAt"] = int(time.time() * 1000)
        self._write_cfg()
        self._emit_updated()
        return json.dumps({"ok": True, "enabled": cfg["enabled"]})

    @Slot(str, result=str)
    def upsert(self, p):
        try:
            incoming = json.loads(p) if isinstance(p, str) and p.strip() else {}
        except Exception:
            incoming = {}
        import time
        cfg = self._ensure_cfg()
        requested_id = str(incoming.get("id", "") or "").strip()
        draft = self._normalize_rule({
            "id": requested_id or None,
            "title": incoming.get("title"),
            "enabled": incoming.get("enabled"),
            "match": incoming.get("match"),
            "runAt": incoming.get("runAt"),
            "code": incoming.get("code"),
            "createdAt": incoming.get("createdAt"),
            "updatedAt": int(time.time() * 1000),
        })
        if not draft:
            return json.dumps(_err("Invalid rule"))

        idx = -1
        search_id = requested_id or draft["id"]
        for i, r in enumerate(cfg["rules"]):
            if str(r.get("id", "")) == search_id:
                idx = i
                break

        if idx >= 0:
            prev = cfg["rules"][idx]
            draft["id"] = prev["id"]
            draft["createdAt"] = int(prev.get("createdAt") or draft["createdAt"])
            draft["lastInjectedAt"] = int(prev.get("lastInjectedAt") or 0)
            draft["injectCount"] = int(prev.get("injectCount") or 0)
            cfg["rules"][idx] = draft
        else:
            cfg["rules"].append(draft)

        cfg["updatedAt"] = int(time.time() * 1000)
        self._write_cfg()
        self._emit_updated()
        return json.dumps({"ok": True, "rule": draft})

    @Slot(str, result=str)
    def remove(self, p):
        try:
            payload = json.loads(p) if isinstance(p, str) and p.strip() else {}
        except Exception:
            payload = {}
        import time
        rid = str(payload.get("id", "") or "").strip()
        if not rid:
            return json.dumps(_err("Missing id"))
        cfg = self._ensure_cfg()
        before = len(cfg["rules"])
        cfg["rules"] = [r for r in cfg["rules"] if str(r.get("id", "")) != rid]
        removed = len(cfg["rules"]) < before
        cfg["updatedAt"] = int(time.time() * 1000)
        self._write_cfg()
        self._emit_updated()
        return json.dumps({"ok": True, "removed": removed})

    @Slot(str, result=str)
    def setRuleEnabled(self, p):
        try:
            payload = json.loads(p) if isinstance(p, str) and p.strip() else {}
        except Exception:
            payload = {}
        import time
        rid = str(payload.get("id", "") or "").strip()
        if not rid:
            return json.dumps(_err("Missing id"))
        cfg = self._ensure_cfg()
        for r in cfg["rules"]:
            if str(r.get("id", "")) != rid:
                continue
            r["enabled"] = bool(payload.get("enabled"))
            r["updatedAt"] = int(time.time() * 1000)
            cfg["updatedAt"] = int(time.time() * 1000)
            self._write_cfg()
            self._emit_updated()
            return json.dumps({"ok": True, "enabled": r["enabled"]})
        return json.dumps(_err("Rule not found"))


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


class WebFindBridge(QObject):
    """
    In-page find (Ctrl+F) for the browser webview.

    In Electron the main process was a no-op stub — find was managed entirely
    by the renderer calling webContents.findInPage().  In Butterfly we route
    the request to QWebEnginePage.findText() via a stored page reference that
    app.py must set after boot: ``bridge.webFind.setPage(page)``.
    """
    findResult = Signal(str)

    def __init__(self, parent=None):
        super().__init__(parent)
        self._page = None          # type: Optional[QWebEnginePage]

    # --- called by app.py after the QWebEngineView is ready ---
    def setPage(self, page):
        self._page = page

    @Slot(str, result=str)
    def inPage(self, p):
        payload = _p(p)
        text = str(payload.get("text") or payload.get("query") or "").strip()
        action = str(payload.get("action", "find")).lower()

        if action == "clear" or not text:
            if self._page:
                self._page.findText("")            # clears highlight
            self.findResult.emit(json.dumps({"matches": 0, "activeIndex": 0}))
            return json.dumps(_ok({"cleared": True}))

        if not self._page:
            return json.dumps(_err("No page attached"))

        forward = payload.get("forward", True)
        case_sensitive = payload.get("caseSensitive", False)

        from PySide6.QtWebEngineCore import QWebEnginePage
        flags = QWebEnginePage.FindFlags(0)
        if not forward:
            flags |= QWebEnginePage.FindFlag.FindBackward
        if case_sensitive:
            flags |= QWebEnginePage.FindFlag.FindCaseSensitively

        # findText is async — we emit findResult when the callback fires
        def _on_result(result):
            # result is a QWebEngineFindTextResult
            matches = 0
            idx = 0
            try:
                matches = result.numberOfMatches()
                idx = result.activeMatch()
            except Exception:
                pass
            self.findResult.emit(json.dumps({
                "matches": matches, "activeIndex": idx,
            }))

        self._page.findText(text, flags, _on_result)
        return json.dumps(_ok({"searching": True}))


class WebTorrentBridge(QObject):
    """
    Torrent client using ``libtorrent`` (python-bindings for libtorrent-rasterbar).

    Manages torrent lifecycle (add magnet/URL, pause/resume/cancel/remove),
    file selection with priority, sequential streaming, history persistence,
    video-library integration, and metadata resolution.

    A background ``threading.Thread`` polls active torrents every 800 ms and
    emits progress signals.  History is persisted to ``web_torrent_history.json``.
    """
    torrentStarted = Signal(str)
    torrentProgress = Signal(str)
    torrentCompleted = Signal(str)
    torrentsUpdated = Signal(str)
    torrentMetadata = Signal(str)
    torrentStreamReady = Signal(str)
    magnetDetected = Signal(str)
    torrentFileDetected = Signal(str)

    _HISTORY_FILE = "web_torrent_history.json"
    _MAX_HISTORY = 1000
    _ACTIVE_STATES = {"downloading", "paused", "resolving_metadata",
                      "metadata_ready", "completed_pending", "seeding"}

    def __init__(self, parent=None):
        super().__init__(parent)
        self._lt = None               # libtorrent module (lazy)
        self._session = None           # libtorrent.session
        self._active = {}              # id -> { handle, entry, ... }
        self._pending = {}             # resolveId -> { handle, info }
        self._history_cache = None
        self._poll_thread = None
        self._poll_stop = threading.Event()

    # ── libtorrent bootstrap ────────────────────────────────────────────

    def _try_import(self):
        if self._lt is not None:
            return self._lt
        try:
            import libtorrent as lt
            self._lt = lt
        except ImportError:
            self._lt = False
        return self._lt

    def _ensure_session(self):
        if self._session is not None:
            return self._session
        lt = self._try_import()
        if not lt or lt is False:
            return None
        settings = lt.default_settings()
        settings["enable_dht"] = True
        settings["enable_lsd"] = True
        settings["enable_natpmp"] = True
        settings["enable_upnp"] = True
        self._session = lt.session(settings)
        self._session.listen_on(6881, 6891)
        return self._session

    def _start_poll(self):
        if self._poll_thread and self._poll_thread.is_alive():
            return
        self._poll_stop.clear()
        self._poll_thread = threading.Thread(target=self._poll_loop, daemon=True)
        self._poll_thread.start()

    def _poll_loop(self):
        while not self._poll_stop.is_set():
            try:
                self._tick()
            except Exception:
                pass
            self._poll_stop.wait(0.8)

    def _tick(self):
        """Update progress for all active torrents."""
        for tid, rec in list(self._active.items()):
            h = rec.get("handle")
            entry = rec.get("entry")
            if not h or not entry:
                continue
            try:
                s = h.status()
                entry["progress"] = float(s.progress)
                entry["downloadRate"] = int(s.download_rate)
                entry["uploadSpeed"] = int(s.upload_rate)
                entry["uploaded"] = int(s.total_upload)
                entry["downloaded"] = int(s.total_download)
                entry["numPeers"] = int(s.num_peers)
                entry["name"] = str(s.name or entry.get("name", ""))

                # State transitions
                lt = self._lt
                if lt and s.state == lt.torrent_status.seeding:
                    if entry["state"] == "downloading":
                        entry["state"] = "completed"
                        entry["finishedAt"] = int(time.time() * 1000)
                        entry["progress"] = 1.0
                        self._write_history()
                        self.torrentCompleted.emit(json.dumps(entry))
                elif s.is_finished and entry["state"] == "downloading":
                    entry["state"] = "completed"
                    entry["finishedAt"] = int(time.time() * 1000)
                    entry["progress"] = 1.0
                    self._write_history()
                    self.torrentCompleted.emit(json.dumps(entry))

                self.torrentProgress.emit(json.dumps(entry))
            except Exception:
                pass
        self._emit_updated()

    # ── history persistence ─────────────────────────────────────────────

    def _ensure_history(self):
        if self._history_cache is not None:
            if not isinstance(self._history_cache.get("torrents"), list):
                self._history_cache["torrents"] = []
            return self._history_cache
        raw = storage.read_json(storage.data_path(self._HISTORY_FILE), None)
        if raw and isinstance(raw.get("torrents"), list):
            self._history_cache = raw
        else:
            self._history_cache = {"torrents": [], "updatedAt": 0}
        return self._history_cache

    def _write_history(self):
        c = self._ensure_history()
        if len(c["torrents"]) > self._MAX_HISTORY:
            c["torrents"] = c["torrents"][:self._MAX_HISTORY]
        c["updatedAt"] = int(time.time() * 1000)
        storage.write_json_sync(storage.data_path(self._HISTORY_FILE), c)

    def _upsert_history(self, entry):
        c = self._ensure_history()
        tid = str(entry.get("id", ""))
        if not tid:
            return
        found = None
        for t in c["torrents"]:
            if t and str(t.get("id", "")) == tid:
                found = t
                break
        if found is None:
            c["torrents"].insert(0, entry)
        else:
            found.update(entry)
        self._write_history()

    def _emit_updated(self):
        c = self._ensure_history()
        active = [r["entry"] for r in self._active.values() if r.get("entry")]
        active.sort(key=lambda e: int(e.get("startedAt", 0) or 0), reverse=True)
        self.torrentsUpdated.emit(json.dumps({
            "torrents": active,
            "history": c.get("torrents", []),
        }))

    # ── entry factory ───────────────────────────────────────────────────

    @staticmethod
    def _create_entry(partial=None):
        entry = {
            "id": "wtr_" + str(int(time.time() * 1000)) + "_" + hashlib.md5(
                os.urandom(8)).hexdigest()[:6],
            "infoHash": "", "name": "",
            "state": "downloading", "progress": 0,
            "downloadRate": 0, "uploadSpeed": 0,
            "uploaded": 0, "downloaded": 0, "totalSize": 0, "numPeers": 0,
            "startedAt": int(time.time() * 1000), "finishedAt": None,
            "error": "", "magnetUri": "", "sourceUrl": "", "origin": "",
            "destinationRoot": "", "savePath": "",
            "directWrite": False, "sequential": True,
            "filePriorities": {}, "files": None,
            "metadataReady": False,
            "routedFiles": 0, "ignoredFiles": 0, "failedFiles": 0,
        }
        if partial:
            entry.update(partial)
        return entry

    @staticmethod
    def _build_file_list(ti):
        """Build file list from a libtorrent torrent_info."""
        files = []
        if not ti:
            return files
        fs_obj = ti.files()
        for i in range(fs_obj.num_files()):
            files.append({
                "index": i,
                "path": fs_obj.file_path(i),
                "name": os.path.basename(fs_obj.file_path(i)),
                "length": fs_obj.file_size(i),
                "progress": 0,
                "selected": True,
                "priority": "normal",
            })
        return files

    def _extract_id(self, payload):
        if isinstance(payload, dict) and payload.get("id"):
            return str(payload["id"])
        if isinstance(payload, str) and payload:
            return payload
        return ""

    # ── add torrent ─────────────────────────────────────────────────────

    def _add_torrent(self, entry, params):
        """Add a torrent to libtorrent session and bind tracking."""
        ses = self._ensure_session()
        if not ses:
            return {"ok": False, "error": "libtorrent not available"}

        lt = self._lt
        try:
            h = ses.add_torrent(params)
        except Exception as e:
            return {"ok": False, "error": str(e)}

        if entry.get("sequential", True):
            h.set_sequential_download(True)

        rec = {"handle": h, "entry": entry}
        self._active[entry["id"]] = rec

        # If metadata is already available (e.g. .torrent file)
        if h.has_metadata():
            ti = h.get_torrent_info()
            entry["infoHash"] = str(ti.info_hash()) if ti else ""
            entry["name"] = str(ti.name()) if ti else entry.get("name", "")
            entry["totalSize"] = int(ti.total_size()) if ti else 0
            entry["files"] = self._build_file_list(ti)
            entry["metadataReady"] = True
        else:
            entry["state"] = "resolving_metadata"

        self._upsert_history(entry)
        self.torrentStarted.emit(json.dumps(entry))
        self._emit_updated()
        self._start_poll()
        return {"ok": True, "id": entry["id"]}

    # ── public API slots ────────────────────────────────────────────────

    @Slot(str, result=str)
    def startMagnet(self, p):
        payload = _p(p)
        magnet = str(payload.get("magnetUri", "")).strip()
        if not magnet or not magnet.startswith("magnet:"):
            return json.dumps(_err("Invalid magnet URI"))
        lt = self._try_import()
        if not lt or lt is False:
            return json.dumps(_err("libtorrent not available"))

        dest = str(payload.get("destinationRoot", "")).strip()
        save_path = os.path.abspath(dest) if dest else os.path.join(
            storage.data_path("web_torrent_tmp"), "tmp_" + str(int(time.time())))
        os.makedirs(save_path, exist_ok=True)

        entry = self._create_entry({
            "magnetUri": magnet,
            "origin": str(payload.get("origin", "")),
            "sourceUrl": str(payload.get("referer", "")),
            "destinationRoot": dest,
            "savePath": save_path,
            "directWrite": bool(dest),
        })

        params = lt.parse_magnet_uri(magnet)
        params.save_path = save_path
        return json.dumps(self._add_torrent(entry, params))

    @Slot(str, result=str)
    def startTorrentUrl(self, p):
        payload = _p(p)
        url = str(payload.get("url", "")).strip()
        if not url.startswith("http"):
            return json.dumps(_err("Invalid torrent URL"))
        lt = self._try_import()
        if not lt or lt is False:
            return json.dumps(_err("libtorrent not available"))

        # Fetch torrent file
        import urllib.request
        try:
            req = urllib.request.Request(url, headers={
                "User-Agent": "Tankoban-Max/1.0"})
            with urllib.request.urlopen(req, timeout=30) as resp:
                buf = resp.read()
        except Exception as e:
            return json.dumps(_err("Failed to fetch torrent: " + str(e)))

        dest = str(payload.get("destinationRoot", "")).strip()
        save_path = os.path.abspath(dest) if dest else os.path.join(
            storage.data_path("web_torrent_tmp"), "tmp_" + str(int(time.time())))
        os.makedirs(save_path, exist_ok=True)

        entry = self._create_entry({
            "sourceUrl": url,
            "origin": str(payload.get("origin", "")),
            "destinationRoot": dest,
            "savePath": save_path,
            "directWrite": bool(dest),
        })

        ti = lt.torrent_info(lt.bdecode(buf))
        params = {"ti": ti, "save_path": save_path}
        return json.dumps(self._add_torrent(entry, params))

    @Slot(str, result=str)
    def startConfigured(self, p):
        payload = _p(p)
        resolve_id = str(payload.get("resolveId", ""))
        pending = self._pending.get(resolve_id)
        if not pending:
            return json.dumps(_err("No pending resolve with that ID"))
        lt = self._try_import()
        if not lt or lt is False:
            return json.dumps(_err("libtorrent not available"))

        save_path = str(payload.get("savePath", "")).strip()
        if not save_path:
            save_path = os.path.join(
                storage.data_path("web_torrent_tmp"), "tmp_" + str(int(time.time())))
        os.makedirs(save_path, exist_ok=True)

        info = pending.get("info", {})
        entry = self._create_entry({
            "destinationRoot": save_path,
            "savePath": save_path,
            "directWrite": True,
            "origin": str(payload.get("origin", "")),
            "magnetUri": info.get("magnetUri", ""),
            "name": info.get("name", ""),
            "infoHash": info.get("infoHash", ""),
            "totalSize": info.get("totalSize", 0),
        })

        # Re-add the torrent with save path
        h = pending.get("handle")
        if h:
            try:
                ses = self._ensure_session()
                if ses:
                    ses.remove_torrent(h)
            except Exception:
                pass

        magnet = info.get("magnetUri", "")
        if magnet:
            params = lt.parse_magnet_uri(magnet)
            params.save_path = save_path
        else:
            return json.dumps(_err("No source to re-add"))

        self._pending.pop(resolve_id, None)

        # Apply file selection after adding
        result = self._add_torrent(entry, params)
        selected = payload.get("selectedFiles")
        if result.get("ok") and isinstance(selected, list) and selected:
            self.selectFiles(json.dumps({
                "id": entry["id"],
                "selectedIndices": selected,
                "destinationRoot": save_path,
            }))
        return json.dumps(result)

    @Slot(str, result=str)
    def pause(self, p):
        payload = _p(p)
        tid = self._extract_id(payload)
        rec = self._active.get(tid)
        if not rec or not rec.get("handle"):
            return json.dumps(_err("Torrent not active"))
        try:
            rec["handle"].pause()
            rec["entry"]["state"] = "paused"
            self._upsert_history(rec["entry"])
            self._emit_updated()
        except Exception as e:
            return json.dumps(_err(str(e)))
        return json.dumps(_ok())

    @Slot(str, result=str)
    def resume(self, p):
        payload = _p(p)
        tid = self._extract_id(payload)
        rec = self._active.get(tid)
        if not rec or not rec.get("handle"):
            return json.dumps(_err("Torrent not active"))
        try:
            rec["handle"].resume()
            rec["entry"]["state"] = "downloading"
            self._upsert_history(rec["entry"])
            self._emit_updated()
        except Exception as e:
            return json.dumps(_err(str(e)))
        return json.dumps(_ok())

    @Slot(str, result=str)
    def cancel(self, p):
        payload = _p(p)
        tid = self._extract_id(payload)
        rec = self._active.pop(tid, None)
        if not rec:
            return json.dumps(_err("Torrent not active"))
        try:
            ses = self._ensure_session()
            if ses and rec.get("handle"):
                ses.remove_torrent(rec["handle"])
        except Exception:
            pass
        rec["entry"]["state"] = "cancelled"
        rec["entry"]["finishedAt"] = int(time.time() * 1000)
        self._upsert_history(rec["entry"])
        self._emit_updated()
        return json.dumps(_ok())

    @Slot(str, result=str)
    def remove(self, p):
        payload = _p(p)
        tid = self._extract_id(payload)
        if not tid:
            return json.dumps(_err("Missing id"))
        remove_files = bool(payload.get("removeFiles", False))
        rec = self._active.pop(tid, None)
        if rec and rec.get("handle"):
            try:
                ses = self._ensure_session()
                if ses:
                    ses.remove_torrent(rec["handle"],
                                       1 if remove_files else 0)
            except Exception:
                pass
        # Remove from history
        c = self._ensure_history()
        c["torrents"] = [t for t in c["torrents"]
                         if not (t and str(t.get("id", "")) == tid)]
        self._write_history()
        self._emit_updated()
        return json.dumps(_ok())

    @Slot(result=str)
    def getActive(self):
        entries = [r["entry"] for r in self._active.values() if r.get("entry")]
        entries.sort(key=lambda e: int(e.get("startedAt", 0) or 0), reverse=True)
        return json.dumps(_ok({"torrents": entries}))

    @Slot(result=str)
    def getHistory(self):
        c = self._ensure_history()
        return json.dumps(_ok({"torrents": c.get("torrents", [])}))

    @Slot(result=str)
    def clearHistory(self):
        c = self._ensure_history()
        c["torrents"] = [t for t in c.get("torrents", [])
                         if t and t.get("state") in self._ACTIVE_STATES]
        self._write_history()
        self._emit_updated()
        return json.dumps(_ok())

    @Slot(str, result=str)
    def removeHistory(self, p):
        payload = _p(p)
        tid = self._extract_id(payload)
        if not tid:
            return json.dumps(_err("Missing id"))
        if tid in self._active:
            return json.dumps(_err("Torrent active"))
        c = self._ensure_history()
        before = len(c["torrents"])
        c["torrents"] = [t for t in c["torrents"]
                         if not (t and str(t.get("id", "")) == tid)]
        if len(c["torrents"]) == before:
            return json.dumps(_err("Not found"))
        self._write_history()
        self._emit_updated()
        return json.dumps(_ok())

    @Slot(str, result=str)
    def selectFiles(self, p):
        payload = _p(p)
        tid = self._extract_id(payload)
        rec = self._active.get(tid)
        if not rec or not rec.get("handle"):
            return json.dumps(_err("Torrent not active"))
        h = rec["handle"]
        entry = rec["entry"]

        selected_indices = set()
        raw = payload.get("selectedIndices", [])
        if isinstance(raw, list):
            selected_indices = {int(x) for x in raw}

        # Update destination if provided
        dest = str(payload.get("destinationRoot", "")).strip()
        if dest:
            abs_root = os.path.abspath(dest)
            os.makedirs(abs_root, exist_ok=True)
            entry["destinationRoot"] = abs_root
            entry["savePath"] = abs_root
            entry["directWrite"] = True

        if not h.has_metadata():
            self._upsert_history(entry)
            self._emit_updated()
            return json.dumps(_ok({"pending": True}))

        ti = h.get_torrent_info()
        num_files = ti.files().num_files() if ti else 0
        priorities = [0] * num_files
        for i in range(num_files):
            if i in selected_indices:
                priorities[i] = 4   # normal priority
                if entry.get("files") and i < len(entry["files"]):
                    entry["files"][i]["selected"] = True
            else:
                if entry.get("files") and i < len(entry["files"]):
                    entry["files"][i]["selected"] = False

        h.prioritize_files(priorities)

        if entry.get("state") in ("metadata_ready", "completed_pending"):
            if entry.get("destinationRoot") and selected_indices:
                entry["state"] = "downloading"

        self._upsert_history(entry)
        self._emit_updated()
        return json.dumps(_ok())

    @Slot(str, result=str)
    def setDestination(self, p):
        payload = _p(p)
        tid = self._extract_id(payload)
        rec = self._active.get(tid)
        if not rec or not rec.get("entry"):
            return json.dumps(_err("Torrent not active"))
        dest = str(payload.get("destinationRoot", "")).strip()
        if not dest:
            return json.dumps(_err("Destination folder required"))
        abs_root = os.path.abspath(dest)
        os.makedirs(abs_root, exist_ok=True)
        entry = rec["entry"]
        entry["destinationRoot"] = abs_root
        entry["savePath"] = abs_root
        entry["directWrite"] = True
        self._upsert_history(entry)
        self._emit_updated()
        return json.dumps(_ok())

    @Slot(str, result=str)
    def streamFile(self, p):
        """Set sequential download priority for a specific file (for playback)."""
        payload = _p(p)
        tid = self._extract_id(payload)
        rec = self._active.get(tid)
        if not rec or not rec.get("handle"):
            return json.dumps(_err("Torrent not active"))
        h = rec["handle"]
        if not h.has_metadata():
            return json.dumps(_err("Metadata not ready"))

        file_index = int(payload.get("fileIndex", -1))
        ti = h.get_torrent_info()
        num_files = ti.files().num_files() if ti else 0
        if file_index < 0 or file_index >= num_files:
            return json.dumps(_err("Invalid file index"))

        # Prioritize target file, deselect others
        priorities = [0] * num_files
        priorities[file_index] = 7   # highest priority
        h.prioritize_files(priorities)
        h.set_sequential_download(True)

        return json.dumps(_ok({"streaming": True, "fileIndex": file_index}))

    @Slot(str, result=str)
    def addToVideoLibrary(self, p):
        """Route torrent video files to a video library folder."""
        payload = _p(p)
        tid = self._extract_id(payload)
        rec = self._active.get(tid)
        if not rec or not rec.get("entry"):
            return json.dumps(_err("Torrent not active"))
        entry = rec["entry"]
        dest = str(payload.get("destinationRoot", "")).strip()
        if not dest:
            return json.dumps(_err("Destination folder required"))
        abs_root = os.path.abspath(dest)
        os.makedirs(abs_root, exist_ok=True)

        # Find video files
        VIDEO_EXTS = {".mp4", ".mkv", ".avi", ".webm", ".mov", ".wmv",
                      ".flv", ".m4v", ".ts", ".m2ts"}
        video_indices = []
        for f in (entry.get("files") or []):
            ext = os.path.splitext(str(f.get("name", "") or f.get("path", "")))[1].lower()
            if ext in VIDEO_EXTS:
                video_indices.append(f.get("index", 0))

        if not video_indices:
            return json.dumps(_err("No video files found in torrent"))

        entry["videoLibrary"] = True
        entry["destinationRoot"] = abs_root
        entry["savePath"] = abs_root
        entry["directWrite"] = True

        # Select only video files
        self.selectFiles(json.dumps({
            "id": tid,
            "selectedIndices": video_indices,
            "destinationRoot": abs_root,
            "sequential": True,
        }))

        self._upsert_history(entry)
        self._emit_updated()
        return json.dumps(_ok({"showPath": abs_root}))

    @Slot(result=str)
    def pauseAll(self):
        for rec in self._active.values():
            if rec.get("entry", {}).get("state") in ("downloading", "seeding"):
                try:
                    rec["handle"].pause()
                    rec["entry"]["state"] = "paused"
                    self._upsert_history(rec["entry"])
                except Exception:
                    pass
        self._emit_updated()
        return json.dumps(_ok())

    @Slot(result=str)
    def resumeAll(self):
        for rec in self._active.values():
            if rec.get("entry", {}).get("state") == "paused":
                try:
                    rec["handle"].resume()
                    p = rec["entry"].get("progress", 0)
                    rec["entry"]["state"] = "seeding" if p >= 1 else "downloading"
                    self._upsert_history(rec["entry"])
                except Exception:
                    pass
        self._emit_updated()
        return json.dumps(_ok())

    @Slot(str, result=str)
    def getPeers(self, p):
        payload = _p(p)
        tid = self._extract_id(payload)
        rec = self._active.get(tid)
        if not rec or not rec.get("handle"):
            return json.dumps(_ok({"peers": []}))
        peers = []
        try:
            for peer in rec["handle"].get_peer_info():
                peers.append({
                    "ip": str(peer.ip),
                    "client": str(peer.client),
                    "progress": float(peer.progress),
                    "dlSpeed": int(peer.down_speed),
                    "ulSpeed": int(peer.up_speed),
                })
        except Exception:
            pass
        return json.dumps(_ok({"peers": peers}))

    @Slot(result=str)
    def getDhtNodes(self):
        ses = self._session
        if not ses:
            return json.dumps(0)
        try:
            s = ses.status()
            return json.dumps(int(s.dht_nodes))
        except Exception:
            return json.dumps(0)

    @Slot(result=str)
    def selectSaveFolder(self):
        from PySide6.QtWidgets import QFileDialog
        folder = QFileDialog.getExistingDirectory(None, "Select Save Folder")
        if not folder:
            return json.dumps(_ok({"cancelled": True}))
        return json.dumps(_ok({"path": folder}))

    @Slot(str, result=str)
    def resolveMetadata(self, p):
        """Resolve metadata for a magnet/torrent without downloading."""
        payload = _p(p)
        source = str(payload.get("source", "") or "").strip()
        if not source:
            return json.dumps(_err("No source provided"))
        lt = self._try_import()
        if not lt or lt is False:
            return json.dumps(_err("libtorrent not available"))

        ses = self._ensure_session()
        if not ses:
            return json.dumps(_err("Session unavailable"))

        import tempfile
        tmp_dir = os.path.join(tempfile.gettempdir(),
                               "tanko-resolve-" + str(int(time.time())))
        os.makedirs(tmp_dir, exist_ok=True)

        try:
            if source.startswith("magnet:"):
                params = lt.parse_magnet_uri(source)
                params.save_path = tmp_dir
            else:
                buf = open(source, "rb").read()
                ti = lt.torrent_info(lt.bdecode(buf))
                params = {"ti": ti, "save_path": tmp_dir}
            h = ses.add_torrent(params)
        except Exception as e:
            return json.dumps(_err(str(e)))

        # Wait for metadata (up to 180s)
        deadline = time.time() + 180
        while not h.has_metadata() and time.time() < deadline:
            time.sleep(0.5)

        if not h.has_metadata():
            try:
                ses.remove_torrent(h)
            except Exception:
                pass
            return json.dumps(_err("Metadata resolution timed out (180s)"))

        ti = h.get_torrent_info()
        resolve_id = "res_" + str(int(time.time() * 1000)) + "_" + hashlib.md5(
            os.urandom(8)).hexdigest()[:6]

        info = {
            "name": str(ti.name()),
            "infoHash": str(ti.info_hash()),
            "totalSize": int(ti.total_size()),
            "files": self._build_file_list(ti),
            "magnetUri": source if source.startswith("magnet:") else "",
        }

        # Deselect all files to prevent download
        priorities = [0] * ti.files().num_files()
        h.prioritize_files(priorities)

        self._pending[resolve_id] = {"handle": h, "info": info}
        return json.dumps(_ok({
            "resolveId": resolve_id,
            "name": info["name"],
            "infoHash": info["infoHash"],
            "totalSize": info["totalSize"],
            "files": info["files"],
        }))

    @Slot(str, result=str)
    def cancelResolve(self, p):
        payload = _p(p)
        resolve_id = str(payload.get("resolveId", ""))
        pending = self._pending.pop(resolve_id, None)
        if pending and pending.get("handle"):
            try:
                ses = self._ensure_session()
                if ses:
                    ses.remove_torrent(pending["handle"])
            except Exception:
                pass
        return json.dumps(_ok())

    @Slot(str, result=str)
    def openFolder(self, p):
        payload = _p(p)
        save_path = str(payload.get("savePath", "") or "").strip()
        if not save_path:
            return json.dumps(_err("No path"))
        import subprocess, sys
        if sys.platform == "win32":
            subprocess.Popen(["explorer", "/select,", os.path.normpath(save_path)])
        elif sys.platform == "darwin":
            subprocess.Popen(["open", "-R", save_path])
        else:
            from PySide6.QtGui import QDesktopServices
            from PySide6.QtCore import QUrl
            QDesktopServices.openUrl(QUrl.fromLocalFile(os.path.dirname(save_path)))
        return json.dumps(_ok())

    # ── cleanup (called by app.py on quit) ───────────────────────────────

    def shutdown(self):
        self._poll_stop.set()
        if self._session:
            try:
                self._session.pause()
            except Exception:
                pass


class TorrentSearchBridge(QObject):
    """Torrent search via Jackett or Prowlarr torznab APIs."""
    statusChanged = Signal(str)

    _DEFAULT_LIMIT = 40
    _MAX_LIMIT = 100

    _CATEGORY_CODE_TYPE_MAP = {
        7030: ("comics", "Comics"),
        7020: ("comics", "Comics"),
        7000: ("books", "Books"),
        5040: ("movies", "Movies"),
        5030: ("tv", "TV"),
        5070: ("anime", "Anime"),
    }

    def __init__(self, parent=None):
        super().__init__(parent)

    # --- provider config (reads from web_browser_settings.json) ---

    def _read_settings(self):
        try:
            p = _data_path("web_browser_settings.json")
            with open(p, "r", encoding="utf-8") as f:
                raw = json.load(f)
            if isinstance(raw, dict) and isinstance(raw.get("settings"), dict):
                return raw["settings"]
            return raw if isinstance(raw, dict) else {}
        except Exception:
            return {}

    @staticmethod
    def _normalize_provider_config(src):
        s = src if isinstance(src, dict) else {}
        timeout = int(s.get("timeoutMs") or 30000)
        if timeout <= 0:
            timeout = 30000
        idx_map = s.get("indexersByCategory") if isinstance(s.get("indexersByCategory"), dict) else {}
        return {
            "baseUrl": str(s.get("baseUrl") or "").strip().rstrip("/"),
            "apiKey": str(s.get("apiKey") or "").strip(),
            "indexer": str(s.get("indexer") or "all").strip() or "all",
            "timeoutMs": timeout,
            "indexersByCategory": {
                "all": str(idx_map.get("all") or "all").strip() or "all",
                "comics": str(idx_map.get("comics") or idx_map.get("anime") or idx_map.get("manga") or "all").strip() or "all",
                "books": str(idx_map.get("books") or idx_map.get("audiobooks") or "all").strip() or "all",
                "tv": str(idx_map.get("tv") or idx_map.get("movies") or "all").strip() or "all",
            },
        }

    def _get_provider_config(self):
        s = self._read_settings()
        ts = s.get("torrentSearch") if isinstance(s.get("torrentSearch"), dict) else {}
        provider_key = str(ts.get("provider") or s.get("torrentSearchProvider") or "jackett").strip().lower()
        if provider_key != "prowlarr":
            provider_key = "jackett"

        jk_src = s.get("jackett") if isinstance(s.get("jackett"), dict) else {
            "baseUrl": s.get("jackettBaseUrl"), "apiKey": s.get("jackettApiKey"),
            "indexer": s.get("jackettIndexer"), "timeoutMs": s.get("jackettTimeoutMs"),
            "indexersByCategory": s.get("jackettIndexersByCategory"),
        }
        jackett = self._normalize_provider_config(jk_src)

        pw_src = s.get("prowlarr") if isinstance(s.get("prowlarr"), dict) else {
            "baseUrl": s.get("prowlarrBaseUrl"), "apiKey": s.get("prowlarrApiKey"),
            "indexer": s.get("prowlarrIndexer"), "timeoutMs": s.get("prowlarrTimeoutMs"),
            "indexersByCategory": s.get("prowlarrIndexersByCategory"),
        }
        prowlarr = self._normalize_provider_config(pw_src)

        current = prowlarr if provider_key == "prowlarr" else jackett
        return {"provider": provider_key, "current": current, "jackett": jackett, "prowlarr": prowlarr}

    # --- XML parsing helpers ---

    @staticmethod
    def _decode_xml(s):
        return str(s or "").replace("&amp;", "&").replace("&lt;", "<").replace("&gt;", ">").replace("&quot;", '"').replace("&#39;", "'")

    @staticmethod
    def _text_between(xml, tag):
        import re
        m = re.search(r"<" + tag + r"[^>]*>([\s\S]*?)</" + tag + r">", str(xml or ""), re.IGNORECASE)
        return TorrentSearchBridge._decode_xml(m.group(1).strip()) if m else ""

    @staticmethod
    def _attr_from_item(xml, name):
        import re
        m = re.search(r'<torznab:attr[^>]*name="' + name + r'"[^>]*value="([^"]*)"', str(xml or ""), re.IGNORECASE)
        return TorrentSearchBridge._decode_xml(m.group(1).strip()) if m else ""

    @staticmethod
    def _hash_string(value):
        s = str(value or "")
        h = 0
        for c in s:
            h = ((h << 5) - h) + ord(c)
            h &= 0xFFFFFFFF
        return h

    @staticmethod
    def _get_category_cats(category):
        key = str(category or "all").strip().lower()
        if key == "all":
            return "7030,7020,7000,5000,5030,5040"
        if key == "comics":
            return "7030,7020"
        if key == "books":
            return "7000"
        if key == "tv":
            return "5000,5030,5040"
        return ""

    @staticmethod
    def _map_category_to_type(code):
        try:
            n = int(code)
        except (ValueError, TypeError):
            return None
        if n in TorrentSearchBridge._CATEGORY_CODE_TYPE_MAP:
            return TorrentSearchBridge._CATEGORY_CODE_TYPE_MAP[n]
        if 7000 <= n < 8000:
            return ("books", "Books")
        if 5000 <= n < 6000:
            return ("videos", "Videos")
        return None

    @staticmethod
    def _type_from_label(raw):
        import re as _re
        label = str(raw or "").strip()
        if not label or label.isdigit():
            return None
        low = label.lower()
        if "anime" in low:
            return ("anime", "Anime")
        if _re.search(r"tv|series|show|episode", low):
            return ("tv", "TV")
        if _re.search(r"movie|film", low):
            return ("movies", "Movies")
        if _re.search(r"comic|manga|manhwa|graphic", low):
            return ("comics", "Comics")
        if _re.search(r"book|ebook|novel|audiobook|literature", low):
            return ("books", "Books")
        key = _re.sub(r"[^a-z0-9]+", "_", low).strip("_")
        return (key, label) if key else None

    @staticmethod
    def _normalize_source_key(v):
        import re as _re
        return _re.sub(r"[^a-z0-9]+", "_", str(v or "").strip().lower()).strip("_") or "indexer"

    def _parse_items(self, xml, indexer_name, id_prefix):
        import re
        src = str(xml or "")
        out = []
        for m in re.finditer(r"<item\b[\s\S]*?</item>", src, re.IGNORECASE):
            item = m.group(0)
            title = self._text_between(item, "title")
            link = self._text_between(item, "link")
            enc_m = re.search(r'<enclosure[^>]*url="(magnet:[^"]+)"', item, re.IGNORECASE)
            magnet = self._decode_xml(enc_m.group(1)) if enc_m else (link if link.lower().startswith("magnet:") else "")
            if not title or not magnet:
                continue

            size_raw = self._text_between(item, "size") or self._attr_from_item(item, "size")
            size_bytes = int(size_raw) if size_raw and size_raw.isdigit() else 0
            seeders_raw = self._attr_from_item(item, "seeders")
            seeders = int(seeders_raw) if seeders_raw and seeders_raw.isdigit() else 0
            source_name = self._attr_from_item(item, "indexer") or self._attr_from_item(item, "tracker") or str(indexer_name or "Indexer")
            source_key = self._normalize_source_key(source_name)
            source_url = self._text_between(item, "comments") or ""
            published_at = self._text_between(item, "pubDate") or ""

            type_keys, type_labels = [], []
            for cat_m in re.finditer(r'<torznab:attr[^>]*name="category"[^>]*value="([^"]*)"', item, re.IGNORECASE):
                mapped = self._map_category_to_type(cat_m.group(1).strip())
                if mapped and mapped[0] not in type_keys:
                    type_keys.append(mapped[0])
                    type_labels.append(mapped[1])
            for cat_m in re.finditer(r'<category[^>]*value="([^"]+)"', item, re.IGNORECASE):
                parsed = self._type_from_label(self._decode_xml(cat_m.group(1).strip()))
                if parsed and parsed[0] not in type_keys:
                    type_keys.append(parsed[0])
                    type_labels.append(parsed[1])

            stable_id = (id_prefix or "jackett") + "_" + str(self._hash_string("::".join([title, magnet, source_key])))
            out.append({
                "id": stable_id, "title": title,
                "sizeBytes": size_bytes if size_bytes > 0 else None,
                "fileCount": None, "seeders": max(0, seeders), "magnetUri": magnet,
                "sourceName": source_name, "sourceKey": source_key,
                "sourceUrl": source_url or None, "publishedAt": published_at or None,
                "typeKeys": type_keys, "typeLabels": type_labels,
            })
        return out

    # --- HTTP helpers ---

    @staticmethod
    def _fetch_text(url, cfg, extra_headers=None):
        import urllib.request
        timeout = max(4, int(cfg.get("timeoutMs", 30000)) // 1000)
        req = urllib.request.Request(url, headers={"Accept": "application/xml,text/xml,*/*"})
        for k, v in (extra_headers or {}).items():
            req.add_header(k, v)
        try:
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                return {"ok": True, "status": resp.status, "body": resp.read().decode("utf-8", errors="replace")}
        except Exception as e:
            return {"ok": False, "status": 0, "body": "", "error": str(e)}

    @staticmethod
    def _fetch_json_http(url, cfg, extra_headers=None):
        import urllib.request
        timeout = max(4, int(cfg.get("timeoutMs", 30000)) // 1000)
        req = urllib.request.Request(url, headers={"Accept": "application/json,*/*"})
        for k, v in (extra_headers or {}).items():
            req.add_header(k, v)
        try:
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                return {"ok": True, "status": resp.status, "body": json.loads(resp.read().decode("utf-8", errors="replace"))}
        except Exception as e:
            return {"ok": False, "status": 0, "body": None, "error": str(e)}

    # --- URL builders ---

    def _jackett_build_url(self, cfg, payload, indexer_override=None):
        from urllib.parse import urlencode, quote
        q = str(payload.get("query") or "").strip()
        category = str(payload.get("category") or "all").strip().lower()
        no_cat = bool(payload.get("noCategoryFilter"))
        limit = min(self._MAX_LIMIT, max(1, int(payload.get("limit") or self._DEFAULT_LIMIT)))
        page = max(0, int(payload.get("page") or 0))
        indexer = str(indexer_override or cfg.get("indexer") or "all").strip() or "all"
        base = cfg["baseUrl"] + "/api/v2.0/indexers/" + quote(indexer, safe="") + "/results/torznab/api"
        params = {"apikey": cfg["apiKey"], "t": "search"}
        if q:
            params["q"] = q
        if not no_cat:
            cats = self._get_category_cats(category)
            if cats:
                params["cat"] = cats
        params["limit"] = str(limit)
        params["offset"] = str(page * limit)
        return base + "?" + urlencode(params)

    def _prowlarr_headers(self, cfg):
        return {"X-Api-Key": cfg["apiKey"]} if cfg.get("apiKey") else {}

    def _prowlarr_build_json_url(self, cfg, payload, indexer_ids=None):
        from urllib.parse import urlencode
        q = str(payload.get("query") or "").strip()
        limit = min(self._MAX_LIMIT, max(1, int(payload.get("limit") or self._DEFAULT_LIMIT)))
        page = max(0, int(payload.get("page") or 0))
        params = {"query": q, "type": "search", "limit": str(limit), "offset": str(page * limit)}
        ids = [str(i) for i in (indexer_ids or []) if i]
        if ids:
            params["indexerIds"] = ",".join(ids)
        return cfg["baseUrl"] + "/api/v1/search?" + urlencode(params)

    def _prowlarr_build_torznab_url(self, cfg, payload, indexer_id=None):
        from urllib.parse import urlencode, quote
        q = str(payload.get("query") or "").strip()
        category = str(payload.get("category") or "all").strip().lower()
        no_cat = bool(payload.get("noCategoryFilter"))
        limit = min(self._MAX_LIMIT, max(1, int(payload.get("limit") or self._DEFAULT_LIMIT)))
        page = max(0, int(payload.get("page") or 0))
        idx = quote(str(indexer_id or "all"), safe="")
        base = cfg["baseUrl"] + "/api/v1/indexer/" + idx + "/newznab/api"
        params = {"t": "search", "apikey": cfg["apiKey"]}
        if q:
            params["q"] = q
        if not no_cat:
            cats = self._get_category_cats(category)
            if cats:
                params["cat"] = cats
        params["limit"] = str(limit)
        params["offset"] = str(page * limit)
        return base + "?" + urlencode(params)

    def _prowlarr_parse_json_items(self, rows):
        out = []
        seen = set()
        for row in (rows if isinstance(rows, list) else []):
            if not isinstance(row, dict):
                continue
            title = str(row.get("title") or row.get("releaseTitle") or "").strip()
            magnet = str(row.get("magnetUrl") or row.get("downloadUrl") or row.get("magnet") or "").strip()
            if not title or not magnet.lower().startswith("magnet:"):
                continue
            dedup = magnet.lower()
            if dedup in seen:
                continue
            seen.add(dedup)
            source_name = str(row.get("indexer") or row.get("indexerName") or "Indexer").strip()
            source_key = self._normalize_source_key(source_name)
            type_keys, type_labels = [], []
            for c in (row.get("categories") or []):
                if not isinstance(c, dict):
                    continue
                cat_label = str(c.get("name") or c.get("label") or "").strip()
                if cat_label:
                    parsed = self._type_from_label(cat_label)
                    if parsed and parsed[0] not in type_keys:
                        type_keys.append(parsed[0])
                        type_labels.append(parsed[1])
                cat_id = c.get("id")
                if cat_id is not None:
                    mapped = self._map_category_to_type(cat_id)
                    if mapped and mapped[0] not in type_keys:
                        type_keys.append(mapped[0])
                        type_labels.append(mapped[1])
            size = int(row.get("size") or row.get("sizeBytes") or 0)
            seeders = max(0, int(row.get("seeders") or 0))
            stable_id = "prowlarr_" + str(self._hash_string("::".join([title, magnet, source_key])))
            out.append({
                "id": stable_id, "title": title,
                "sizeBytes": size if size > 0 else None, "fileCount": None,
                "seeders": seeders, "magnetUri": magnet,
                "sourceName": source_name, "sourceKey": source_key,
                "sourceUrl": str(row.get("infoUrl") or row.get("guid") or "").strip() or None,
                "publishedAt": str(row.get("publishDate") or row.get("pubDate") or "").strip() or None,
                "typeKeys": type_keys, "typeLabels": type_labels,
            })
        return out

    def _parse_indexer_spec(self, cfg, category):
        key = str(category or "all").strip().lower()
        by_cat = cfg.get("indexersByCategory") or {}
        spec = str(by_cat.get(key) or cfg.get("indexer") or "all").strip()
        if key == "all" and spec.lower() == "all":
            union, seen = [], set()
            for k in ["comics", "books", "tv"]:
                raw = str(by_cat.get(k) or "").strip()
                if not raw or raw.lower() == "all":
                    continue
                for token in raw.split(","):
                    t = token.strip()
                    if t and t.lower() not in seen:
                        seen.add(t.lower())
                        union.append(t)
            if union:
                return union
        if not spec or spec.lower() == "all":
            return ["all"]
        out, seen = [], set()
        for token in spec.split(","):
            t = token.strip()
            if t and t.lower() not in seen:
                seen.add(t.lower())
                out.append(t)
        return out or ["all"]

    # --- @Slot methods ---

    @Slot(result=str)
    def health(self):
        cfg_set = self._get_provider_config()
        provider_key = cfg_set["provider"]
        cfg = cfg_set["current"]

        if not cfg["baseUrl"] or not cfg["apiKey"]:
            msg = "Configure Prowlarr base URL + API key" if provider_key == "prowlarr" else "Configure Jackett base URL + API key"
            out = {"ok": True, "ready": False, "error": msg, "details": {"configured": False, "provider": provider_key}}
            self.statusChanged.emit(json.dumps(out))
            return json.dumps(out)

        try:
            if provider_key == "prowlarr":
                res = self._fetch_json_http(cfg["baseUrl"] + "/api/v1/health", cfg, self._prowlarr_headers(cfg))
                if not res["ok"]:
                    res = self._fetch_json_http(cfg["baseUrl"] + "/api/v1/system/status", cfg, self._prowlarr_headers(cfg))
                ready = res["ok"]
                out = {"ok": True, "ready": ready, "details": {"configured": True, "provider": provider_key}}
                if not ready:
                    out["error"] = "Prowlarr unreachable"
            else:
                from urllib.parse import quote
                url = cfg["baseUrl"] + "/api/v2.0/indexers/all/results/torznab/api?t=caps&apikey=" + quote(cfg["apiKey"], safe="")
                res = self._fetch_text(url, cfg)
                out = {"ok": True, "ready": res["ok"], "details": {"configured": True, "provider": provider_key, "indexer": cfg["indexer"]}}
                if not res["ok"]:
                    out["error"] = "Jackett unreachable (HTTP " + str(res.get("status", 0)) + ")"
        except Exception as e:
            out = {"ok": True, "ready": False, "error": str(e), "details": {"configured": True, "provider": provider_key}}

        self.statusChanged.emit(json.dumps(out))
        return json.dumps(out)

    @Slot(str, result=str)
    def query(self, p):
        try:
            payload = json.loads(p) if isinstance(p, str) and p.strip() else {}
        except Exception:
            payload = {}

        cfg_set = self._get_provider_config()
        provider_key = cfg_set["provider"]
        cfg = cfg_set["current"]
        limit = min(self._MAX_LIMIT, max(1, int(payload.get("limit") or self._DEFAULT_LIMIT)))
        page = max(0, int(payload.get("page") or 0))
        envelope = {"page": page, "limit": limit}

        if not cfg["baseUrl"] or not cfg["apiKey"]:
            return json.dumps({"ok": False, "items": [], "error": "Not configured", "provider": provider_key, **envelope, "returned": 0})

        query_text = str(payload.get("query") or "").strip()
        if not query_text:
            return json.dumps({"ok": True, "items": [], "provider": provider_key, **envelope, "returned": 0})

        category = str(payload.get("category") or "all").strip().lower()
        source_filter = str(payload.get("source") or payload.get("indexer") or "").strip()
        force_single = bool(source_filter and source_filter.lower() != "all")
        indexers = [source_filter] if force_single else self._parse_indexer_spec(cfg, category)

        all_items = []
        any_ok = False
        last_error = ""
        for idx_name in indexers:
            try:
                if provider_key == "prowlarr":
                    ids = [idx_name] if idx_name and idx_name.lower() != "all" else []
                    url = self._prowlarr_build_json_url(cfg, payload, ids)
                    res = self._fetch_json_http(url, cfg, self._prowlarr_headers(cfg))
                    if res["ok"]:
                        all_items.extend(self._prowlarr_parse_json_items(res["body"] if isinstance(res["body"], list) else []))
                        any_ok = True
                        continue
                    url = self._prowlarr_build_torznab_url(cfg, payload, idx_name or "all")
                    res = self._fetch_text(url, cfg, self._prowlarr_headers(cfg))
                    if res["ok"]:
                        all_items.extend(self._parse_items(res["body"], idx_name, "prowlarr"))
                        any_ok = True
                    else:
                        last_error = res.get("error", "Search failed")
                else:
                    url = self._jackett_build_url(cfg, payload, idx_name)
                    res = self._fetch_text(url, cfg)
                    if res["ok"]:
                        all_items.extend(self._parse_items(res["body"], idx_name, "jackett"))
                        any_ok = True
                    else:
                        last_error = res.get("error", "Search failed")
            except Exception as e:
                last_error = str(e)

        # Dedup
        seen = set()
        deduped = []
        for it in all_items:
            key = (it.get("magnetUri") or it.get("id") or it.get("title", "")).lower()
            if key and key not in seen:
                seen.add(key)
                deduped.append(it)

        if any_ok:
            return json.dumps({"ok": True, "items": deduped, "provider": provider_key, **envelope, "returned": len(deduped)})

        # Fallback: 'all' indexer
        if not force_single and len(indexers) > 1:
            try:
                if provider_key == "prowlarr":
                    url = self._prowlarr_build_json_url(cfg, payload, [])
                    res = self._fetch_json_http(url, cfg, self._prowlarr_headers(cfg))
                    if res["ok"]:
                        items = self._prowlarr_parse_json_items(res["body"] if isinstance(res["body"], list) else [])
                        return json.dumps({"ok": True, "items": items, "provider": provider_key, **envelope, "returned": len(items)})
                else:
                    url = self._jackett_build_url(cfg, payload, "all")
                    res = self._fetch_text(url, cfg)
                    if res["ok"]:
                        items = self._parse_items(res["body"], "all", "jackett")
                        return json.dumps({"ok": True, "items": items, "provider": provider_key, **envelope, "returned": len(items)})
            except Exception:
                pass

        return json.dumps({"ok": False, "items": [], "error": last_error or "Search failed", "provider": provider_key, **envelope, "returned": 0})

    @Slot(result=str)
    def indexers(self):
        cfg_set = self._get_provider_config()
        provider_key = cfg_set["provider"]
        cfg = cfg_set["current"]

        # Try live API
        if cfg["baseUrl"] and cfg["apiKey"]:
            try:
                if provider_key == "prowlarr":
                    res = self._fetch_json_http(cfg["baseUrl"] + "/api/v1/indexer", cfg, self._prowlarr_headers(cfg))
                    if res["ok"] and isinstance(res["body"], list):
                        out, seen = [], set()
                        for row in res["body"]:
                            if not isinstance(row, dict):
                                continue
                            if row.get("enable") is False or row.get("enabled") is False:
                                continue
                            proto = str(row.get("protocol") or "").lower()
                            if proto and proto != "torrent":
                                continue
                            rid = str(row.get("id") or row.get("indexerId") or "").strip()
                            if not rid or rid.lower() in seen:
                                continue
                            seen.add(rid.lower())
                            name = str(row.get("name") or row.get("title") or "").strip() or rid
                            out.append({"id": rid, "name": name})
                        return json.dumps({"ok": True, "indexers": out, "source": provider_key, "provider": provider_key})
                else:
                    from urllib.parse import quote
                    url = cfg["baseUrl"] + "/api/v2.0/indexers?apikey=" + quote(cfg["apiKey"], safe="") + "&configured=true"
                    res = self._fetch_json_http(url, cfg)
                    if res["ok"]:
                        body = res["body"]
                        rows = body if isinstance(body, list) else (body.get("indexers") or body.get("Indexers") or []) if isinstance(body, dict) else []
                        out, seen = [], set()
                        for row in rows:
                            if not isinstance(row, dict):
                                continue
                            rid = str(row.get("id") or row.get("ID") or row.get("identifier") or row.get("name") or "").strip()
                            if not rid or rid.lower() in seen:
                                continue
                            seen.add(rid.lower())
                            name = str(row.get("title") or row.get("name") or row.get("displayName") or "").strip() or rid
                            out.append({"id": rid, "name": name})
                        return json.dumps({"ok": True, "indexers": out, "source": provider_key, "provider": provider_key})
            except Exception:
                pass

        # Fallback: derive from settings
        out, seen = [], set()
        for val in [cfg.get("indexer", "")] + list((cfg.get("indexersByCategory") or {}).values()):
            for token in str(val or "").split(","):
                t = token.strip()
                if t and t.lower() != "all" and t.lower() not in seen:
                    seen.add(t.lower())
                    out.append({"id": t, "name": t})
        return json.dumps({"ok": True, "indexers": out, "source": "settings", "provider": provider_key})


class TorProxyBridge(QObject):
    """
    Tor SOCKS5 proxy — spawns a Tor child process and applies a SOCKS5
    proxy to ``QNetworkProxy.setApplicationProxy()`` so that all
    QWebEngine traffic is routed through Tor.

    Tor binary is resolved from ``resources/tor/windows/tor.exe`` (packaged)
    or system PATH (dev).  Bootstrap progress is parsed from Tor's stdout
    and emitted via ``statusChanged``.
    """
    statusChanged = Signal(str)

    _PORT_START = 9150
    _PORT_END = 9159
    _BOOTSTRAP_TIMEOUT_S = 45

    def __init__(self, parent=None):
        super().__init__(parent)
        self._process = None          # subprocess.Popen
        self._active = False
        self._bootstrap = 0
        self._port = 0
        self._data_dir = ""
        self._monitor_thread = None

    # ── helpers ──────────────────────────────────────────────────────────

    @staticmethod
    def _locate_tor():
        """Find tor.exe in resources or PATH."""
        import shutil
        # Packaged: resources/tor/windows/tor.exe relative to project
        candidates = []
        project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        candidates.append(os.path.join(project_root, "resources", "tor", "windows", "tor.exe"))
        candidates.append(os.path.join(os.getcwd(), "resources", "tor", "windows", "tor.exe"))
        # Sibling repos (resources/tor/ is gitignored)
        parent_of_root = os.path.dirname(project_root)
        for sibling in ("Tankoban-Max-master", "Tankoban-Max", "Tankoban Max"):
            candidates.append(os.path.join(parent_of_root, sibling, "resources", "tor", "windows", "tor.exe"))
        for c in candidates:
            if os.path.isfile(c):
                return c
        # Fallback: system PATH
        found = shutil.which("tor")
        if found:
            return found
        return None

    def _make_temp_dir(self):
        import tempfile
        d = os.path.join(tempfile.gettempdir(),
                         "tankoban_tor_" + str(os.getpid()) + "_" + str(int(time.time())))
        os.makedirs(d, exist_ok=True)
        return d

    def _clean_temp_dir(self):
        if not self._data_dir:
            return
        import shutil
        try:
            shutil.rmtree(self._data_dir, ignore_errors=True)
        except Exception:
            pass
        self._data_dir = ""

    def _set_proxy(self, port):
        """Apply SOCKS5 proxy to the Qt application."""
        from PySide6.QtNetwork import QNetworkProxy
        if port:
            proxy = QNetworkProxy(QNetworkProxy.ProxyType.Socks5Proxy,
                                  "127.0.0.1", port)
            QNetworkProxy.setApplicationProxy(proxy)
        else:
            QNetworkProxy.setApplicationProxy(
                QNetworkProxy(QNetworkProxy.ProxyType.NoProxy))

    def _emit_status(self, **extra):
        payload = {
            "active": self._active,
            "connecting": not self._active and self._bootstrap > 0,
            "bootstrapProgress": self._bootstrap,
        }
        payload.update(extra)
        self.statusChanged.emit(json.dumps(payload))

    # ── start ────────────────────────────────────────────────────────────

    @Slot(result=str)
    def start(self):
        if self._active and self._process:
            return json.dumps(_ok())

        tor_exe = self._locate_tor()
        if not tor_exe:
            return json.dumps(_err("Tor binary not found. Place tor.exe in resources/tor/windows/"))

        # Kill stale process
        if self._process:
            try:
                self._process.kill()
            except Exception:
                pass
            self._process = None

        self._data_dir = self._make_temp_dir()
        self._bootstrap = 0

        # Try ports in range
        import subprocess, re
        last_error = ""
        for port in range(self._PORT_START, self._PORT_END + 1):
            args = [tor_exe, "--SocksPort", str(port),
                    "--DataDirectory", self._data_dir,
                    "--Log", "notice stdout"]
            # Add geoip files if present
            tor_dir = os.path.dirname(tor_exe)
            geoip = os.path.join(tor_dir, "geoip")
            geoip6 = os.path.join(tor_dir, "geoip6")
            if os.path.isfile(geoip):
                args += ["--GeoIPFile", geoip]
            if os.path.isfile(geoip6):
                args += ["--GeoIPv6File", geoip6]

            try:
                proc = subprocess.Popen(
                    args, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                    stdin=subprocess.DEVNULL,
                    creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
            except Exception as e:
                last_error = str(e)
                continue

            # Wait for bootstrap by reading stdout
            import select
            deadline = time.time() + self._BOOTSTRAP_TIMEOUT_S
            bootstrapped = False
            buf = ""

            while time.time() < deadline:
                try:
                    line = proc.stdout.readline()
                    if not line:
                        # Process exited
                        break
                    text = line.decode("utf-8", errors="replace")
                    buf += text
                    m = re.search(r"Bootstrapped\s+(\d+)%", text)
                    if m:
                        self._bootstrap = int(m.group(1))
                        self._emit_status()
                        if self._bootstrap >= 100:
                            bootstrapped = True
                            break
                except Exception:
                    break

            if not bootstrapped:
                try:
                    proc.kill()
                except Exception:
                    pass
                # Check for port in use
                if "Address already in use" in buf or "Could not bind" in buf:
                    last_error = "Port " + str(port) + " in use"
                    continue
                rc = proc.poll()
                last_error = "Tor exited (code " + str(rc) + ") on port " + str(port)
                continue

            # Success
            self._process = proc
            self._port = port
            self._active = True
            self._set_proxy(port)
            self._emit_status()

            # Start background thread to monitor for unexpected exit
            self._monitor_thread = threading.Thread(
                target=self._watch_process, daemon=True)
            self._monitor_thread.start()

            return json.dumps(_ok())

        # All ports failed
        self._cleanup()
        return json.dumps(_err("Failed to start Tor: " + last_error))

    def _watch_process(self):
        """Background thread: wait for Tor to exit, then clean up."""
        proc = self._process
        if not proc:
            return
        proc.wait()
        if not self._active:
            return
        self._active = False
        self._process = None
        self._bootstrap = 0
        try:
            self._set_proxy(0)
        except Exception:
            pass
        self._emit_status(crashed=True)

    # ── stop ─────────────────────────────────────────────────────────────

    @Slot(result=str)
    def stop(self):
        if not self._active and not self._process:
            return json.dumps(_ok())

        # Clear proxy first
        try:
            self._set_proxy(0)
        except Exception:
            pass

        # Kill process
        if self._process:
            try:
                self._process.kill()
            except Exception:
                pass
            self._process = None

        self._active = False
        self._bootstrap = 0
        self._port = 0
        self._clean_temp_dir()
        self._emit_status()
        return json.dumps(_ok())

    # ── status ───────────────────────────────────────────────────────────

    @Slot(result=str)
    def getStatus(self):
        return json.dumps(_ok({
            "active": self._active,
            "bootstrapProgress": self._bootstrap,
            "port": self._port,
        }))

    # ── cleanup (called by app.py on quit) ───────────────────────────────

    def forceKill(self):
        if self._process:
            try:
                self._process.kill()
            except Exception:
                pass
            self._process = None
        self._active = False
        self._bootstrap = 0
        self._clean_temp_dir()

    def _cleanup(self):
        if self._process:
            try:
                self._process.kill()
            except Exception:
                pass
            self._process = None
        self._active = False
        self._bootstrap = 0
        self._port = 0
        self._clean_temp_dir()


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


# ---------------------------------------------------------------------------
# BrowserTabPage — custom QWebEnginePage for each browser tab
# ---------------------------------------------------------------------------

class BrowserTabPage:
    """
    Thin wrapper created lazily per browser tab.

    Cannot subclass QWebEnginePage at import time because
    PySide6.QtWebEngineCore may not be available.  Instead,
    WebTabManagerBridge calls ``create_browser_tab_page()`` which imports
    QWebEnginePage locally and builds a real subclass instance.
    """
    pass  # placeholder — see create_browser_tab_page() below


def create_browser_tab_page(profile, tab_manager, tab_id):
    """
    Create a QWebEnginePage subclass instance for a browser tab.

    Overrides:
      - createWindow() → asks tab manager to open a new tab for popups
      - acceptNavigationRequest() → intercepts magnet: links
    """
    from PySide6.QtWebEngineCore import QWebEnginePage
    from PySide6.QtCore import QUrl

    class _BrowserTabPage(QWebEnginePage):
        def __init__(self, prof, parent=None):
            super().__init__(prof, parent)
            self._tab_manager = tab_manager
            self._tab_id = tab_id

        def createWindow(self, window_type):
            """Handle window.open / target=_blank — create a new tab."""
            new_id = self._tab_manager._create_tab_internal("", home=False)
            if new_id and new_id in self._tab_manager._tabs:
                try:
                    # Host-initiated tab creation path (popup/new-window).
                    self._tab_manager._emit_tab_created(new_id, source="popup")
                except Exception:
                    pass
                return self._tab_manager._tabs[new_id]["page"]
            return None

        def acceptNavigationRequest(self, url, nav_type, is_main_frame):
            """Intercept magnet: links before they hit the engine."""
            url_str = url.toString()
            if url_str.startswith("magnet:"):
                self._tab_manager.magnetRequested.emit(
                    json.dumps({"url": url_str, "tabId": self._tab_id})
                )
                return False
            return super().acceptNavigationRequest(url, nav_type, is_main_frame)

    return _BrowserTabPage(profile)


# ---------------------------------------------------------------------------
# WebTabManagerBridge — manages browser tab QWebEngineViews
# ---------------------------------------------------------------------------

class WebTabManagerBridge(QObject):
    """
    Manages browser tabs via BrowserWidget (native Qt chrome).

    The QWebEngineView instances are owned by BrowserWidget and live in
    its QStackedWidget — no overlays, no HWND z-ordering tricks needed.

    Lifecycle:
      1. app.py calls ``setup(browser_widget)``
      2. JS calls ``createTab({url, home})``   → Python creates page+view, BrowserWidget registers it
      3. JS calls ``switchTab({tabId})``        → BrowserWidget switches QStackedWidget
      4. JS calls ``closeTab({tabId})``         → BrowserWidget removes view
      5. User interacts with BrowserWidget toolbar → signals → bridge slots → JS events
    """

    # Signals pushed to JS renderer
    tabCreated      = Signal(str)   # {tabId, url, title, home, source}
    tabClosed       = Signal(str)   # {tabId}
    tabUpdated      = Signal(str)   # {tabId, url?, title?, icon?, loading?, canGoBack?, canGoForward?}
    magnetRequested = Signal(str)   # {url, tabId}

    def __init__(self, parent=None):
        super().__init__(parent)
        self._tabs = {}           # tabId → {"view", "page", "home", "url", "title", ...}
        self._tab_order = []      # ordered tabId list
        self._active_tab_id = ""
        self._tab_seq = 0
        self._profile = None      # QWebEngineProfile — from BrowserWidget
        self._bw = None           # BrowserWidget reference — set by setup()
        # Legacy fields kept to avoid AttributeError in any code that still reads them
        self._container = None
        self._main_view = None
        self._viewport_rect = (0, 0, 0, 0)

    # ── Setup (called by app.py after bridge construction) ───────────────────

    def setup(self, browser_widget):
        """Wire BrowserWidget and connect its user-action signals back to bridge slots."""
        self._bw = browser_widget
        self._profile = browser_widget.profile

        bw = browser_widget

        # User navigates in address bar → tell the page to load
        bw.userNavigated.connect(
            lambda tid, url: self.navigateTo(json.dumps({"tabId": tid, "url": url}))
        )
        # User clicks + or Ctrl+T → create a new non-home tab
        bw.userOpenNewTab.connect(
            lambda: self.createTab(json.dumps({"home": False}))
        )
        # User clicks × on a tab
        bw.userCloseTab.connect(
            lambda tid: self.closeTab(json.dumps({"tabId": tid}))
        )
        # User clicks a different tab pill
        bw.userSwitchTab.connect(
            lambda tid: self.switchTab(json.dumps({"tabId": tid}))
        )
        # Nav buttons
        bw.userGoBack.connect(
            lambda tid: self.goBack(json.dumps({"tabId": tid}))
        )
        bw.userGoForward.connect(
            lambda tid: self.goForward(json.dumps({"tabId": tid}))
        )
        bw.userReload.connect(
            lambda tid: self.reload(json.dumps({"tabId": tid}))
        )

    # -- Internal helpers --

    def _next_tab_id(self):
        self._tab_seq += 1
        return "bt_" + str(self._tab_seq)

    def _connect_page_signals(self, tab_id, page):
        """Connect QWebEnginePage signals to emit tabUpdated."""
        from PySide6.QtCore import QUrl

        def on_url_changed(url):
            if tab_id not in self._tabs:
                return
            u = url.toString() if hasattr(url, "toString") else str(url)
            self._tabs[tab_id]["url"] = u
            # If this was a home tab that has now navigated to an external URL,
            # transition it to a URL tab (clear home flag, show the view's content).
            if self._tabs[tab_id].get("home") and u and not u.startswith("file://") and u not in ("about:blank", ""):
                self._tabs[tab_id]["home"] = False
                if self._bw:
                    try:
                        self._bw.navigate_tab(tab_id, u)
                    except Exception:
                        pass
            self._emit_tab_update(tab_id, url=u)

        def on_title_changed(title):
            if tab_id not in self._tabs:
                return
            self._tabs[tab_id]["title"] = title
            self._emit_tab_update(tab_id, title=title)

        def on_icon_changed(icon):
            if tab_id not in self._tabs:
                return
            url = page.iconUrl()
            icon_url = url.toString() if hasattr(url, "toString") else ""
            self._tabs[tab_id]["icon"] = icon_url
            self._emit_tab_update(tab_id, icon=icon_url)

        def on_load_started():
            if tab_id not in self._tabs:
                return
            self._tabs[tab_id]["loading"] = True
            self._emit_tab_update(tab_id, loading=True)

        def on_load_finished(ok):
            if tab_id not in self._tabs:
                return
            self._tabs[tab_id]["loading"] = False
            can_back = page.history().canGoBack() if page.history() else False
            can_fwd = page.history().canGoForward() if page.history() else False
            self._emit_tab_update(
                tab_id, loading=False,
                canGoBack=can_back, canGoForward=can_fwd,
            )
            # Userscript injection
            if ok:
                self._inject_userscripts(tab_id, page, "did-finish-load")

        page.urlChanged.connect(on_url_changed)
        page.titleChanged.connect(on_title_changed)
        page.iconChanged.connect(on_icon_changed)
        page.loadStarted.connect(on_load_started)
        page.loadFinished.connect(on_load_finished)

        # Permission requests (geolocation, camera, microphone, etc.)
        def on_permission_requested(origin, feature):
            if tab_id not in self._tabs:
                return
            root = self.parent()
            if not root or not hasattr(root, "webPermissions"):
                return
            perm_bridge = root.webPermissions
            origin_str = origin.toString() if hasattr(origin, "toString") else str(origin)
            # Map Qt feature enum to string
            feature_map = {}
            try:
                from PySide6.QtWebEngineCore import QWebEnginePage
                feature_map = {
                    QWebEnginePage.Feature.Geolocation: "geolocation",
                    QWebEnginePage.Feature.MediaAudioCapture: "media",
                    QWebEnginePage.Feature.MediaVideoCapture: "media",
                    QWebEnginePage.Feature.MediaAudioVideoCapture: "media",
                    QWebEnginePage.Feature.Notifications: "notifications",
                    QWebEnginePage.Feature.ClipboardReadWrite: "clipboard-read",
                    QWebEnginePage.Feature.ClipboardSanitizedWrite: "clipboard-sanitized-write",
                    QWebEnginePage.Feature.DesktopVideoCapture: "display-capture",
                    QWebEnginePage.Feature.DesktopAudioVideoCapture: "display-capture",
                }
            except Exception:
                pass
            perm_name = feature_map.get(feature, "unknown")
            # Check stored rules first
            rule = perm_bridge._find_rule(origin_str, perm_name)
            if rule and rule.get("decision") == "allow":
                page.setFeaturePermission(
                    origin, feature,
                    page.PermissionPolicy.PermissionGrantedByUser,
                )
                return
            if rule and rule.get("decision") == "deny":
                page.setFeaturePermission(
                    origin, feature,
                    page.PermissionPolicy.PermissionDeniedByUser,
                )
                return
            # No stored rule — emit prompt to JS
            prompt_id = f"perm_{tab_id}_{perm_name}_{int(time.time() * 1000)}"
            perm_bridge._pending_prompts[prompt_id] = {
                "page": page, "origin": origin, "feature": feature,
            }
            perm_bridge.permissionPrompt.emit(json.dumps({
                "promptId": prompt_id,
                "tabId": tab_id,
                "origin": origin_str,
                "permission": perm_name,
            }))

        try:
            page.featurePermissionRequested.connect(on_permission_requested)
        except Exception:
            pass

    def _emit_tab_update(self, tab_id, **fields):
        """Emit tabUpdated to JS and sync BrowserWidget UI."""
        payload = {"tabId": tab_id}
        payload.update(fields)
        self.tabUpdated.emit(json.dumps(payload))
        # Sync native browser chrome
        if self._bw:
            try:
                self._bw.update_tab(tab_id, **fields)
            except Exception:
                pass

    def _emit_tab_created(self, tab_id, source="host"):
        """Emit tabCreated with canonical metadata for host-initiated tabs."""
        tab = self._tabs.get(tab_id)
        if not tab:
            return
        payload = {
            "tabId": tab_id,
            "url": str(tab.get("url", "") or ""),
            "title": str(tab.get("title", "") or ""),
            "home": bool(tab.get("home", False)),
            "source": str(source or "host"),
        }
        self.tabCreated.emit(json.dumps(payload))

    def _apply_viewport_bounds(self):
        """No-op: BrowserWidget QStackedWidget manages geometry."""
        pass

    def _hide_all_views(self):
        """No-op: BrowserWidget manages visibility."""
        pass

    def _create_tab_internal(self, url, home=False):
        """
        Internal: creates QWebEnginePage + QWebEngineView, registers with BrowserWidget.
        Returns the tabId or "" on failure.
        """
        if not self._profile or not self._bw:
            return ""
        if len(self._tabs) >= 20:
            return ""

        tab_id = self._next_tab_id()
        page   = create_browser_tab_page(self._profile, self, tab_id)
        self._connect_page_signals(tab_id, page)

        view = QWebEngineView()
        view.setPage(page)
        view.setStyleSheet("background-color: #0d1117;")

        # Suppress Qt native context menu; route through BrowserWidget.show_context_menu()
        try:
            from PySide6.QtCore import Qt
            view.setContextMenuPolicy(Qt.ContextMenuPolicy.CustomContextMenu)
            view.customContextMenuRequested.connect(
                lambda pos, tid=tab_id: self._on_context_menu(tid, pos)
            )
        except Exception:
            pass

        title = "Home" if home else "New Tab"
        self._tabs[tab_id] = {
            "view":    view,
            "page":    page,
            "home":    home,
            "url":     url or "",
            "title":   title,
            "icon":    "",
            "loading": False,
        }
        self._tab_order.append(tab_id)

        # Register with BrowserWidget (adds to QTabBar + QStackedWidget)
        self._bw.add_tab_view(tab_id, view, title=title, home=home)

        # For home tabs: attach the shared QWebChannel so home.html can call bridge APIs
        if home:
            root = self.parent()
            if root and getattr(root, "_channel", None) and getattr(root, "_bridge_shim_combined", None):
                page.setWebChannel(root._channel)
                from PySide6.QtWebEngineCore import QWebEngineScript as _QWS
                # Inject tab ID first so home.js knows which tab it is
                id_scr = _QWS()
                id_scr.setName(f"tanko_home_tab_id_{tab_id}")
                id_scr.setSourceCode(f"window.__tankoHomeTabId = '{tab_id}';")
                id_scr.setInjectionPoint(_QWS.InjectionPoint.DocumentCreation)
                id_scr.setWorldId(_QWS.ScriptWorldId.MainWorld)
                page.scripts().insert(id_scr)
                # Inject qwebchannel.js + bridge shim (gives window.electronAPI + all APIs)
                shim_scr = _QWS()
                shim_scr.setName(f"tanko_home_bridge_shim_{tab_id}")
                shim_scr.setSourceCode(root._bridge_shim_combined)
                shim_scr.setInjectionPoint(_QWS.InjectionPoint.DocumentCreation)
                shim_scr.setWorldId(_QWS.ScriptWorldId.MainWorld)
                page.scripts().insert(shim_scr)

        # Load URL or home page
        from PySide6.QtCore import QUrl
        import os as _os
        if home:
            home_path = _os.path.join(_os.path.dirname(__file__), "data", "home.html")
            page.load(QUrl.fromLocalFile(home_path))
        elif url:
            page.load(QUrl(url))

        return tab_id

    def _inject_userscripts(self, tab_id, page, run_at):
        """Inject matching userscripts into a browser tab page."""
        try:
            root = self.parent()
            if not root or not hasattr(root, "webUserscripts"):
                return
            url = page.url().toString() if page.url() else ""
            if not url or url == "about:blank":
                return
            result = root.webUserscripts.get_matching_scripts(url, run_at)
            if not result or not result.get("ok") or not result.get("scripts"):
                return
            for script in result["scripts"]:
                code = script.get("code", "")
                if not code:
                    continue
                try:
                    page.runJavaScript(code)
                except Exception:
                    pass
                # Update injection stats
                try:
                    root.webUserscripts.touch_injected(script.get("id", ""))
                except Exception:
                    pass
        except Exception:
            pass

    def _on_context_menu(self, tab_id, pos):
        """Show a native Qt context menu via BrowserWidget (Qt 6 API)."""
        tab = self._tabs.get(tab_id)
        if not tab or not self._bw:
            return
        view = tab.get("view")

        # Get Qt 6 context menu request object
        req = None
        try:
            if view and hasattr(view, "lastContextMenuRequest"):
                req = view.lastContextMenuRequest()
                if req:
                    req.setAccepted(True)  # suppress Chromium's native menu
        except Exception:
            pass

        # Convert to screen coordinates for QMenu.exec()
        screen_pos = None
        try:
            from PySide6.QtCore import QPoint
            if view and hasattr(view, "mapToGlobal"):
                screen_pos = view.mapToGlobal(pos)
        except Exception:
            pass
        if screen_pos is None:
            from PySide6.QtGui import QCursor
            screen_pos = QCursor.pos()

        try:
            self._bw.show_context_menu(tab_id, req, screen_pos)
        except Exception:
            pass

    # -- Slot methods (called from JS via QWebChannel) --

    @Slot(str, result=str)
    def createTab(self, p="{}"):
        """Create a new browser tab. Returns {ok, tabId}."""
        try:
            opts = json.loads(p) if p else {}
        except Exception:
            opts = {}
        url  = str(opts.get("url",  "") or "").strip()
        home = bool(opts.get("home", False))

        tab_id = self._create_tab_internal(url, home=home)
        if not tab_id:
            return json.dumps({"ok": False, "error": "tab_create_failed"})

        result = {
            "ok":     True,
            "tabId":  tab_id,
            "url":    url,
            "title":  self._tabs[tab_id]["title"],
            "home":   home,
            "source": "renderer",
        }
        return json.dumps(result)

    @Slot(str, result=str)
    def closeTab(self, p="{}"):
        """Close a browser tab and remove its view from BrowserWidget."""
        try:
            opts = json.loads(p) if p else {}
        except Exception:
            opts = {}
        tab_id = str(opts.get("tabId", ""))
        tab = self._tabs.get(tab_id)
        if not tab:
            return json.dumps({"ok": False, "error": "tab_not_found"})

        # Remove from BrowserWidget UI (handles view.deleteLater() internally)
        if self._bw:
            try:
                self._bw.remove_tab_view(tab_id)
            except Exception:
                pass

        del self._tabs[tab_id]
        if tab_id in self._tab_order:
            self._tab_order.remove(tab_id)

        # If the closed tab was active, reset to main page for find/actions
        if self._active_tab_id == tab_id:
            self._active_tab_id = ""
            root = self.parent()
            if root:
                main_page = None
                try:
                    mw = root._web_view
                    main_page = mw.page() if mw else None
                except Exception:
                    pass
                if main_page:
                    if hasattr(root, "webFind"):
                        try: root.webFind.setPage(main_page)
                        except Exception: pass
                    if hasattr(root, "webBrowserActions"):
                        try: root.webBrowserActions.setPage(main_page)
                        except Exception: pass

        self.tabClosed.emit(json.dumps({"tabId": tab_id}))
        return json.dumps({"ok": True})

    @Slot(str, result=str)
    def switchTab(self, p="{}"):
        """Activate a browser tab — switches BrowserWidget content stack."""
        try:
            opts = json.loads(p) if p else {}
        except Exception:
            opts = {}
        tab_id = str(opts.get("tabId", ""))
        tab = self._tabs.get(tab_id)
        if not tab:
            return json.dumps({"ok": False, "error": "tab_not_found"})

        self._active_tab_id = tab_id

        # Tell BrowserWidget to switch the QStackedWidget and QTabBar
        if self._bw:
            try:
                self._bw.set_active_tab_id(tab_id)
            except Exception:
                pass

        # Update webFind and webBrowserActions to use this tab's page
        root = self.parent()
        if root and tab.get("page"):
            if hasattr(root, "webFind"):
                try: root.webFind.setPage(tab["page"])
                except Exception: pass
            if hasattr(root, "webBrowserActions"):
                try: root.webBrowserActions.setPage(tab["page"])
                except Exception: pass

        return json.dumps({"ok": True})

    @Slot(str, result=str)
    def navigateTo(self, p="{}"):
        """Navigate a tab to a URL."""
        try:
            opts = json.loads(p) if p else {}
        except Exception:
            opts = {}
        tab_id = str(opts.get("tabId", ""))
        url    = str(opts.get("url",   "")).strip()
        tab    = self._tabs.get(tab_id)
        if not tab or not tab.get("page"):
            return json.dumps({"ok": False, "error": "tab_not_found"})
        if not url:
            return json.dumps({"ok": False, "error": "no_url"})

        was_home = tab.get("home", False)
        tab["home"] = False
        tab["url"]  = url

        from PySide6.QtCore import QUrl
        tab["page"].load(QUrl(url))

        # If this was a home tab, tell BrowserWidget to switch its content view
        if was_home and self._bw:
            try:
                self._bw.navigate_tab(tab_id, url)
            except Exception:
                pass

        return json.dumps({"ok": True})

    @Slot(str, result=str)
    def goBack(self, p="{}"):
        """Navigate back in tab history."""
        try:
            opts = json.loads(p) if p else {}
        except Exception:
            opts = {}
        tab_id = str(opts.get("tabId", ""))
        tab = self._tabs.get(tab_id)
        if not tab or not tab.get("page"):
            return json.dumps({"ok": False})
        from PySide6.QtWebEngineCore import QWebEnginePage
        tab["page"].triggerAction(QWebEnginePage.WebAction.Back)
        return json.dumps({"ok": True})

    @Slot(str, result=str)
    def goForward(self, p="{}"):
        """Navigate forward in tab history."""
        try:
            opts = json.loads(p) if p else {}
        except Exception:
            opts = {}
        tab_id = str(opts.get("tabId", ""))
        tab = self._tabs.get(tab_id)
        if not tab or not tab.get("page"):
            return json.dumps({"ok": False})
        from PySide6.QtWebEngineCore import QWebEnginePage
        tab["page"].triggerAction(QWebEnginePage.WebAction.Forward)
        return json.dumps({"ok": True})

    @Slot(str, result=str)
    def reload(self, p="{}"):
        """Reload the tab."""
        try:
            opts = json.loads(p) if p else {}
        except Exception:
            opts = {}
        tab_id = str(opts.get("tabId", ""))
        tab = self._tabs.get(tab_id)
        if not tab or not tab.get("page"):
            return json.dumps({"ok": False})
        from PySide6.QtWebEngineCore import QWebEnginePage
        tab["page"].triggerAction(QWebEnginePage.WebAction.Reload)
        return json.dumps({"ok": True})

    @Slot(str, result=str)
    def stop(self, p="{}"):
        """Stop loading the tab."""
        try:
            opts = json.loads(p) if p else {}
        except Exception:
            opts = {}
        tab_id = str(opts.get("tabId", ""))
        tab = self._tabs.get(tab_id)
        if not tab or not tab.get("page"):
            return json.dumps({"ok": False})
        from PySide6.QtWebEngineCore import QWebEnginePage
        tab["page"].triggerAction(QWebEnginePage.WebAction.Stop)
        return json.dumps({"ok": True})

    @Slot(str, result=str)
    def getNavState(self, p="{}"):
        """Return navigation state for a tab."""
        try:
            opts = json.loads(p) if p else {}
        except Exception:
            opts = {}
        tab_id = str(opts.get("tabId", ""))
        tab = self._tabs.get(tab_id)
        if not tab or not tab.get("page"):
            return json.dumps({"ok": False, "error": "tab_not_found"})
        page = tab["page"]
        hist = page.history()
        return json.dumps({
            "ok": True,
            "canGoBack": hist.canGoBack() if hist else False,
            "canGoForward": hist.canGoForward() if hist else False,
            "url": tab.get("url", ""),
            "title": tab.get("title", ""),
            "loading": tab.get("loading", False),
        })

    @Slot(str, result=str)
    def setViewportBounds(self, p="{}"):
        """No-op: BrowserWidget QStackedWidget handles its own geometry."""
        return json.dumps({"ok": True})

    @Slot(result=str)
    def openBrowser(self):
        """Switch the app stack to the native BrowserWidget. Called from JS openSources()."""
        try:
            bridge_root = self.parent()
            win = getattr(getattr(bridge_root, "window", None), "_win", None)
            if win and hasattr(win, "show_browser"):
                from PySide6.QtCore import QTimer
                QTimer.singleShot(0, win.show_browser)
            # Auto-create a home tab if the browser has no tabs yet
            if not self._tabs:
                self._create_tab_internal("", home=True)
        except Exception:
            pass
        return json.dumps({"ok": True})

    @Slot(result=str)
    def closeBrowser(self):
        """Switch the app stack back to the renderer (index 0). Called when leaving sources mode."""
        try:
            bridge_root = self.parent()
            win = getattr(getattr(bridge_root, "window", None), "_win", None)
            if win and hasattr(win, "show_web_view"):
                from PySide6.QtCore import QTimer
                QTimer.singleShot(0, win.show_web_view)
        except Exception:
            pass
        return json.dumps({"ok": True})

    @Slot(str, result=str)
    def setTabHome(self, p="{}"):
        """Toggle a tab's home mode — hides/shows its overlay."""
        try:
            opts = json.loads(p) if p else {}
        except Exception:
            opts = {}
        tab_id = str(opts.get("tabId", ""))
        home = bool(opts.get("home", False))
        tab = self._tabs.get(tab_id)
        if not tab:
            return json.dumps({"ok": False, "error": "tab_not_found"})
        tab["home"] = home
        if tab_id == self._active_tab_id:
            self._apply_viewport_bounds()
        return json.dumps({"ok": True})

    @Slot(str, result=str)
    def getZoomFactor(self, p="{}"):
        """Get the zoom factor for a tab."""
        try:
            opts = json.loads(p) if p else {}
        except Exception:
            opts = {}
        tab_id = str(opts.get("tabId", ""))
        tab = self._tabs.get(tab_id)
        if not tab or not tab.get("view"):
            return json.dumps({"ok": False})
        return json.dumps({"ok": True, "factor": tab["view"].zoomFactor()})

    @Slot(str, result=str)
    def setZoomFactor(self, p="{}"):
        """Set the zoom factor for a tab."""
        try:
            opts = json.loads(p) if p else {}
        except Exception:
            opts = {}
        tab_id = str(opts.get("tabId", ""))
        factor = float(opts.get("factor", 1.0))
        tab = self._tabs.get(tab_id)
        if not tab or not tab.get("view"):
            return json.dumps({"ok": False})
        tab["view"].setZoomFactor(max(0.25, min(5.0, factor)))
        return json.dumps({"ok": True})

    @Slot(str, result=str)
    def getTabs(self, p="{}"):
        """Return all open tabs and their state."""
        tabs = []
        for tid in self._tab_order:
            t = self._tabs.get(tid)
            if not t:
                continue
            tabs.append({
                "tabId": tid,
                "url": t.get("url", ""),
                "title": t.get("title", ""),
                "home": t.get("home", False),
                "loading": t.get("loading", False),
            })
        return json.dumps({
            "ok": True,
            "tabs": tabs,
            "activeTabId": self._active_tab_id,
        })

    def shutdown(self):
        """Clean up all tab state on app quit (views are owned by BrowserWidget)."""
        self._tabs.clear()
        self._tab_order.clear()
        self._active_tab_id = ""


class WebBrowserActionsBridge(QObject):
    """
    Browser utility actions: context-menu dispatch, print-to-PDF,
    page screenshot, and OS shell open/reveal for downloaded files.

    ctxAction requires a live QWebEnginePage — set via ``setPage(page)``.
    printPdf / capturePage also need the page for content access.
    downloadOpenFile / downloadShowInFolder are pure OS shell operations.
    """
    contextMenu = Signal(str)
    createTab = Signal(str)

    def __init__(self, parent=None):
        super().__init__(parent)
        self._page = None    # set by app.py

    def setPage(self, page):
        self._page = page

    @staticmethod
    def _coerce_url(value):
        """Accept string or object payloads and extract a target URL."""
        if isinstance(value, dict):
            for key in ("url", "href", "srcURL", "linkURL", "targetURL"):
                s = str(value.get(key, "") or "").strip()
                if s:
                    return s
            return ""
        return str(value or "").strip()

    @staticmethod
    def _extract_local_path(raw_payload):
        """
        Accept payload forms:
        - {"path": "..."}
        - {"savePath": "..."}
        - {"destination": "..."}
        - "C:\\path\\file.ext"
        """
        payload = _p(raw_payload)
        if isinstance(payload, dict):
            for key in ("path", "savePath", "destination", "filePath"):
                s = str(payload.get(key, "") or "").strip()
                if s:
                    return s
        raw = str(raw_payload or "").strip()
        if not raw or raw == "{}":
            return ""
        try:
            parsed = json.loads(raw)
            if isinstance(parsed, str):
                return str(parsed or "").strip()
            if isinstance(parsed, dict):
                for key in ("path", "savePath", "destination", "filePath"):
                    s = str(parsed.get(key, "") or "").strip()
                    if s:
                        return s
        except Exception:
            # Plain string payload path.
            return raw
        return ""

    @Slot(str, result=str)
    def ctxAction(self, p):
        """Dispatch a context-menu action on the current page."""
        payload = _p(p)
        action = str(payload.get("action", "")).strip()
        data = payload.get("payload")
        if not action:
            return json.dumps(_err("No action"))

        page = self._page
        if not page:
            # Actions that don't need a page
            if action == "copyLink" and data:
                target = self._coerce_url(data)
                if not target:
                    return json.dumps(_err("No URL"))
                from PySide6.QtWidgets import QApplication
                cb = QApplication.clipboard()
                if cb:
                    cb.setText(target)
                return json.dumps(_ok())
            if action == "openLinkExternal" and data:
                target = self._coerce_url(data)
                if not target:
                    return json.dumps(_err("No URL"))
                from PySide6.QtGui import QDesktopServices
                from PySide6.QtCore import QUrl
                QDesktopServices.openUrl(QUrl(target))
                return json.dumps(_ok())
            return json.dumps(_err("No page attached"))

        # Navigation
        if action == "back":
            page.triggerAction(page.WebAction.Back)
        elif action == "forward":
            page.triggerAction(page.WebAction.Forward)
        elif action == "reload":
            page.triggerAction(page.WebAction.Reload)
        # Clipboard
        elif action == "copy":
            page.triggerAction(page.WebAction.Copy)
        elif action == "cut":
            page.triggerAction(page.WebAction.Cut)
        elif action == "paste":
            page.triggerAction(page.WebAction.Paste)
        elif action == "pasteAndMatchStyle":
            page.triggerAction(page.WebAction.PasteAndMatchStyle)
        elif action == "undo":
            page.triggerAction(page.WebAction.Undo)
        elif action == "redo":
            page.triggerAction(page.WebAction.Redo)
        elif action == "selectAll":
            page.triggerAction(page.WebAction.SelectAll)
        # Save / copy media
        elif action == "saveImage" and data:
            from PySide6.QtCore import QUrl
            target = self._coerce_url(data)
            if not target:
                return json.dumps(_err("No image URL"))
            page.download(QUrl(target))
        elif action == "saveLinkAs" and data:
            from PySide6.QtCore import QUrl
            target = self._coerce_url(data)
            if not target:
                return json.dumps(_err("No link URL"))
            page.download(QUrl(target))
        elif action == "copyImage":
            try:
                from PySide6.QtWebEngineCore import QWebEnginePage
                copy_image_action = getattr(QWebEnginePage.WebAction, "CopyImageToClipboard", None)
                if copy_image_action is not None:
                    page.triggerAction(copy_image_action)
                else:
                    page.triggerAction(page.WebAction.Copy)
            except Exception:
                page.triggerAction(page.WebAction.Copy)
        elif action == "copyLink" and data:
            target = self._coerce_url(data)
            if not target:
                return json.dumps(_err("No URL"))
            from PySide6.QtWidgets import QApplication
            cb = QApplication.clipboard()
            if cb:
                cb.setText(target)
        elif action == "openLinkExternal" and data:
            target = self._coerce_url(data)
            if not target:
                return json.dumps(_err("No URL"))
            from PySide6.QtGui import QDesktopServices
            from PySide6.QtCore import QUrl
            QDesktopServices.openUrl(QUrl(target))
        # DevTools
        elif action == "inspect" or action == "devtools":
            # Qt uses the page's current context for element inspection.
            page.triggerAction(page.WebAction.InspectElement)
        else:
            return json.dumps(_err("Unknown action: " + action))

        return json.dumps(_ok())

    @Slot(str, result=str)
    def printPdf(self, p):
        """Print current page to PDF (opens a save dialog)."""
        if not self._page:
            return json.dumps(_err("No page attached"))
        from PySide6.QtWidgets import QFileDialog
        path, _ = QFileDialog.getSaveFileName(
            None, "Save PDF", "page.pdf", "PDF Files (*.pdf)")
        if not path:
            return json.dumps(_ok({"cancelled": True}))
        self._page.printToPdf(path)
        return json.dumps(_ok({"path": path}))

    @Slot(str, result=str)
    def capturePage(self, p):
        """Screenshot the current page (opens a save dialog)."""
        if not self._page:
            return json.dumps(_err("No page attached"))
        from PySide6.QtWidgets import QFileDialog
        path, _ = QFileDialog.getSaveFileName(
            None, "Save Screenshot", "screenshot.png", "PNG Images (*.png)")
        if not path:
            return json.dumps(_ok({"cancelled": True}))
        # Grab is on the view, not the page — defer to app.py wiring
        # For now, use page.toHtml fallback or return stub
        return json.dumps(_ok({"path": path, "deferred": True}))

    @Slot(str, result=str)
    def downloadOpenFile(self, p):
        """Open a downloaded file with the OS default app."""
        save_path = self._extract_local_path(p)
        if not save_path:
            return json.dumps(_err("No path"))
        from PySide6.QtGui import QDesktopServices
        from PySide6.QtCore import QUrl
        QDesktopServices.openUrl(QUrl.fromLocalFile(save_path))
        return json.dumps(_ok())

    @Slot(str, result=str)
    def downloadShowInFolder(self, p):
        """Reveal a downloaded file in the OS file manager."""
        save_path = self._extract_local_path(p)
        if not save_path:
            return json.dumps(_err("No path"))
        import subprocess, sys
        if sys.platform == "win32":
            subprocess.Popen(["explorer", "/select,", os.path.normpath(save_path)])
        elif sys.platform == "darwin":
            subprocess.Popen(["open", "-R", save_path])
        else:
            # Linux — open parent folder
            parent = os.path.dirname(save_path)
            from PySide6.QtGui import QDesktopServices
            from PySide6.QtCore import QUrl
            QDesktopServices.openUrl(QUrl.fromLocalFile(parent))
        return json.dumps(_ok())


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
        self.export = ExportBridge(self)
        self.webUserscripts = WebUserscriptsBridge(self)
        self.torrentSearch = TorrentSearchBridge(self)
        self.library = LibraryBridge(self)
        self.books = BooksBridge(self)
        self.video = VideoBridge(self)
        self.audiobooks = AudiobooksBridge(self)
        self.webSources = WebSourcesBridge(self)
        self.webData = WebDataBridge(self)
        self.webFind = WebFindBridge(self)
        self.webTabManager = WebTabManagerBridge(self)
        self.webBrowserActions = WebBrowserActionsBridge(self)
        self.booksTtsEdge = BooksTtsEdgeBridge(self)
        self.torProxy = TorProxyBridge(self)
        self.webTorrent = WebTorrentBridge(self)
        self.player = PlayerBridge(self)
        self.mpv = MpvBridge(self)

        # Wire player → videoProgress for automatic persistence
        self.player.setProgressDomain(self.videoProgress)

        # Permanent stub
        self.holyGrail = HolyGrailBridge(self)

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

    // QWebChannel doesn't auto-expose child QObjects as nested properties
    // in PySide6.  Each child bridge is registered individually on the
    // channel, so we attach them onto b for shim compatibility.
    var _ns = [
      'window','shell','clipboard','progress','seriesSettings',
      'booksProgress','booksTtsProgress','booksBookmarks','booksAnnotations',
      'booksDisplayNames','booksSettings','booksUi','videoProgress',
      'videoSettings','videoDisplayNames','videoUi','webBrowserSettings',
      'webSession','webHistory','webBookmarks','webPermissions','webSearch',
      'build14','files','thumbs','videoPoster','booksOpds','webAdblock',
      'archives','export','webUserscripts','torrentSearch','library','books',
      'video','audiobooks','webSources','webData','webFind','webTabManager',
      'webBrowserActions','booksTtsEdge','torProxy','webTorrent','player',
      'mpv','holyGrail'
    ];
    for (var _i = 0; _i < _ns.length; _i++) {
      if (channel.objects[_ns[_i]]) b[_ns[_i]] = channel.objects[_ns[_i]];
    }
    console.log('[butterfly] bridge children attached:', _ns.filter(function(n){return !!b[n];}).length + '/' + _ns.length);

    // Helper: wrap a @Slot that returns JSON string into a Promise-returning function.
    // QWebChannel delivers return values via a callback (last argument), not
    // as a synchronous return.
    function wrap(fn, ctx, _debugName) {
      return function() {
        var args = Array.prototype.slice.call(arguments);
        // QWebChannel @Slot args must be strings — serialize objects
        var sArgs = args.map(function(a) {
          return (a === undefined || a === null) ? '' :
                 (typeof a === 'object' ? JSON.stringify(a) : String(a));
        });
        return new Promise(function(resolve, reject) {
          try {
            // Append callback — QWebChannel delivers return values this way
            sArgs.push(function(result) {
              try {
                if (typeof result === 'string' && result) {
                  resolve(JSON.parse(result));
                } else {
                  resolve(result);
                }
              } catch(e) {
                console.error('[butterfly-wrap] parse error in ' + (_debugName||'?') + ':', e.message, typeof result, String(result).substring(0, 200));
                reject(e);
              }
            });
            fn.apply(ctx, sArgs);
          } catch(e) {
            console.error('[butterfly-wrap] call error in ' + (_debugName||'?') + ':', e.message);
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
          try {
            sArgs.push(function(result) {
              try { resolve(decode(result)); } catch(e) { reject(e); }
            });
            fn.apply(ctx, sArgs);
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

    // Butterfly environment flag (lets renderer code detect Qt mode)
    window.__tankoButterfly = true;

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
        getState:       wrap(b.books.getState, b.books, 'books.getState'),
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
        getAll:  wrap(b.booksProgress.getAll, b.booksProgress, 'booksProgress.getAll'),
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
        getState:              wrap(b.video.getState, b.video, 'video.getState'),
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
        getAll:   wrap(b.videoProgress.getAll, b.videoProgress, 'videoProgress.getAll'),
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
        onStateChanged: onEvent(b.player.playerStateChanged),
        onEnded:        onEvent(b.player.playerEnded),
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

      // webTabManager (browser tab lifecycle)
      webTabManager: {
        createTab:        wrap(b.webTabManager.createTab, b.webTabManager),
        closeTab:         wrap(b.webTabManager.closeTab, b.webTabManager),
        switchTab:        wrap(b.webTabManager.switchTab, b.webTabManager),
        navigateTo:       wrap(b.webTabManager.navigateTo, b.webTabManager),
        goBack:           wrap(b.webTabManager.goBack, b.webTabManager),
        goForward:        wrap(b.webTabManager.goForward, b.webTabManager),
        reload:           wrap(b.webTabManager.reload, b.webTabManager),
        stop:             wrap(b.webTabManager.stop, b.webTabManager),
        getNavState:      wrap(b.webTabManager.getNavState, b.webTabManager),
        setViewportBounds: wrap(b.webTabManager.setViewportBounds, b.webTabManager),
        setTabHome:       wrap(b.webTabManager.setTabHome, b.webTabManager),
        getZoomFactor:    wrap(b.webTabManager.getZoomFactor, b.webTabManager),
        setZoomFactor:    wrap(b.webTabManager.setZoomFactor, b.webTabManager),
        getTabs:          wrap(b.webTabManager.getTabs, b.webTabManager),
        openBrowser:      wrap(b.webTabManager.openBrowser, b.webTabManager),
        closeBrowser:     wrap(b.webTabManager.closeBrowser, b.webTabManager),
        onTabCreated:     onEvent(b.webTabManager.tabCreated),
        onTabClosed:      onEvent(b.webTabManager.tabClosed),
        onTabUpdated:     onEvent(b.webTabManager.tabUpdated),
        onMagnetRequested: onEvent(b.webTabManager.magnetRequested),
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

    // Signal index.html's deferred loader that the bridge is ready.
    try { document.dispatchEvent(new Event('electronAPI:ready')); } catch(e) {}
  });
})();
"""


# ═══════════════════════════════════════════════════════════════════════════
# SETUP — called from app.py
# ═══════════════════════════════════════════════════════════════════════════

def _read_qrc_text(path: str) -> str:
    """Read a Qt resource file (qrc://) as UTF-8 text."""
    from PySide6.QtCore import QFile, QIODevice
    f = QFile(path)
    if f.open(QIODevice.OpenModeFlag.ReadOnly):
        data = bytes(f.readAll()).decode("utf-8", errors="replace")
        f.close()
        return data
    return ""


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

    # Register every child bridge individually.  QWebChannel in PySide6 does
    # NOT auto-expose child QObjects as nested JS properties — each must be
    # registered explicitly so the shim can access them via channel.objects.
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
        obj = getattr(bridge, name, None)
        if obj is not None:
            channel.registerObject(name, obj)

    web_view.page().setWebChannel(channel)
    # Keep a Python reference so GC doesn't destroy the channel
    bridge._channel = channel
    # Store combined shim so home-tab pages can get their own bridge injection
    bridge._bridge_shim_combined = combined

    # Read qwebchannel.js from Qt's built-in resources and inline it together
    # with the bridge shim into a single QWebEngineScript.  This avoids the
    # extra async <script> load and ensures the QWebChannel constructor is
    # available as soon as the injected script runs.
    qwc_js = _read_qrc_text(":/qtwebchannel/qwebchannel.js")
    if not qwc_js:
        # Fallback: try the qrc:/// prefix
        qwc_js = _read_qrc_text("qrc:///qtwebchannel/qwebchannel.js")

    # Keep newlines — flattening breaks // comments (they eat rest of line)
    combined = qwc_js + "\n" + BRIDGE_SHIM_JS if qwc_js else BRIDGE_SHIM_JS

    from PySide6.QtWebEngineCore import QWebEngineScript
    script = QWebEngineScript()
    script.setName("butterfly_bridge_shim")
    script.setSourceCode(combined)
    script.setInjectionPoint(QWebEngineScript.InjectionPoint.DocumentCreation)
    script.setWorldId(QWebEngineScript.ScriptWorldId.MainWorld)
    script.setRunsOnSubFrames(False)
    web_view.page().scripts().insert(script)

    return bridge
