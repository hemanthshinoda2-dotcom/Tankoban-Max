"""Background scan worker for discovering media files on disk."""

from __future__ import annotations

import os
import threading

from PySide6.QtCore import QObject, QThread, Signal

from constants import MediaKind

# Import common helpers from QTRoute
import sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from QTRoute.src.common import (
    COMIC_EXTENSIONS, BOOK_EXTENSIONS, VIDEO_EXTENSIONS,
    DEFAULT_SCAN_IGNORE_DIRNAMES,
    series_id_for_folder, book_id_for_path, video_episode_id,
    should_ignore_dir, list_immediate_subdirs,
)


def _extensions_for(kind: MediaKind):
    if kind == "comics":
        return COMIC_EXTENSIONS
    if kind == "books":
        return BOOK_EXTENSIONS
    return VIDEO_EXTENSIONS


class ScanWorker(QObject):
    """Walks configured folders and discovers media files.

    Signals:
        progress(done, total, current_name) — emitted per-folder
        finished(index_dict) — emitted when scan is complete
        error(message) — emitted on failure
    """

    progress = Signal(int, int, str)  # done, total, current folder name
    finished = Signal(dict)           # {"series": [...], "books/episodes": [...]}
    error = Signal(str)

    def __init__(self, kind: MediaKind, folders: list[str],
                 ignore_subs: list[str] | None = None):
        super().__init__()
        self._kind = kind
        self._folders = folders
        self._ignore_subs = ignore_subs or []
        self._cancel = threading.Event()
        self._extensions = _extensions_for(kind)

    def cancel(self):
        self._cancel.set()

    def run(self):
        try:
            if self._kind == "comics":
                result = self._scan_comics()
            elif self._kind == "books":
                result = self._scan_books()
            else:
                result = self._scan_video()

            if not self._cancel.is_set():
                self.finished.emit(result)
        except Exception as exc:
            if not self._cancel.is_set():
                self.error.emit(str(exc))

    # ── Comics scan ──────────────────────────────────────────────────

    def _scan_comics(self) -> dict:
        series_list = []
        books_list = []
        total = len(self._folders)

        for i, folder in enumerate(self._folders):
            if self._cancel.is_set():
                return {"series": series_list, "books": books_list}

            folder_name = os.path.basename(folder)
            self.progress.emit(i, total, folder_name)

            sid = series_id_for_folder(folder)
            folder_books = []

            for root, dirs, files in os.walk(folder):
                if self._cancel.is_set():
                    return {"series": series_list, "books": books_list}

                dirs[:] = sorted(
                    d for d in dirs
                    if not should_ignore_dir(d, DEFAULT_SCAN_IGNORE_DIRNAMES, self._ignore_subs)
                )

                for f in sorted(files):
                    ext = os.path.splitext(f)[1].lower()
                    if ext not in self._extensions:
                        continue
                    fp = os.path.join(root, f)
                    try:
                        st = os.stat(fp)
                    except OSError:
                        continue

                    book = {
                        "id": book_id_for_path(fp, st.st_size, int(st.st_mtime * 1000)),
                        "seriesId": sid,
                        "title": os.path.splitext(f)[0],
                        "path": fp,
                        "size": st.st_size,
                        "mtimeMs": int(st.st_mtime * 1000),
                        "ext": ext.lstrip(".").upper(),
                    }
                    folder_books.append(book)
                    books_list.append(book)

            newest = max((b["mtimeMs"] for b in folder_books), default=0)
            series_list.append({
                "id": sid,
                "name": folder_name,
                "path": folder,
                "count": len(folder_books),
                "newestMtimeMs": newest,
            })

        self.progress.emit(total, total, "")
        return {"series": series_list, "books": books_list}

    # ── Books scan ───────────────────────────────────────────────────

    def _scan_books(self) -> dict:
        series_list = []
        books_list = []
        total = len(self._folders)

        for i, folder in enumerate(self._folders):
            if self._cancel.is_set():
                return {"series": series_list, "books": books_list}

            folder_name = os.path.basename(folder)
            self.progress.emit(i, total, folder_name)

            sid = series_id_for_folder(folder)
            folder_books = []

            for root, dirs, files in os.walk(folder):
                if self._cancel.is_set():
                    return {"series": series_list, "books": books_list}

                dirs[:] = sorted(
                    d for d in dirs
                    if not should_ignore_dir(d, DEFAULT_SCAN_IGNORE_DIRNAMES, self._ignore_subs)
                )

                for f in sorted(files):
                    ext = os.path.splitext(f)[1].lower()
                    if ext not in self._extensions:
                        continue
                    fp = os.path.join(root, f)
                    try:
                        st = os.stat(fp)
                    except OSError:
                        continue

                    book = {
                        "id": book_id_for_path(fp, st.st_size, int(st.st_mtime * 1000)),
                        "seriesId": sid,
                        "title": os.path.splitext(f)[0],
                        "path": fp,
                        "size": st.st_size,
                        "mtimeMs": int(st.st_mtime * 1000),
                        "format": ext.lstrip(".").upper(),
                    }
                    folder_books.append(book)
                    books_list.append(book)

            newest = max((b["mtimeMs"] for b in folder_books), default=0)
            series_list.append({
                "id": sid,
                "name": folder_name,
                "path": folder,
                "count": len(folder_books),
                "newestMtimeMs": newest,
            })

        self.progress.emit(total, total, "")
        return {"series": series_list, "books": books_list}

    # ── Video scan ───────────────────────────────────────────────────

    def _scan_video(self) -> dict:
        shows_list = []
        episodes_list = []
        total = len(self._folders)

        for i, folder in enumerate(self._folders):
            if self._cancel.is_set():
                return {"shows": shows_list, "episodes": episodes_list}

            folder_name = os.path.basename(folder)
            self.progress.emit(i, total, folder_name)

            # Each subfolder of the root is a show
            show_dirs = list_immediate_subdirs(folder)
            for show_dir in show_dirs:
                if self._cancel.is_set():
                    return {"shows": shows_list, "episodes": episodes_list}

                show_name = os.path.basename(show_dir)
                show_id = series_id_for_folder(show_dir)
                show_eps = []

                for root, dirs, files in os.walk(show_dir):
                    if self._cancel.is_set():
                        return {"shows": shows_list, "episodes": episodes_list}

                    dirs[:] = sorted(
                        d for d in dirs
                        if not should_ignore_dir(d, DEFAULT_SCAN_IGNORE_DIRNAMES, self._ignore_subs)
                    )

                    for f in sorted(files):
                        ext = os.path.splitext(f)[1].lower()
                        if ext not in self._extensions:
                            continue
                        fp = os.path.join(root, f)
                        try:
                            st = os.stat(fp)
                        except OSError:
                            continue

                        ep = {
                            "id": video_episode_id(fp, st.st_size, st.st_mtime * 1000),
                            "showId": show_id,
                            "title": os.path.splitext(f)[0],
                            "path": fp,
                            "size": st.st_size,
                            "mtimeMs": int(st.st_mtime * 1000),
                            "ext": ext.lstrip(".").upper(),
                        }
                        show_eps.append(ep)
                        episodes_list.append(ep)

                shows_list.append({
                    "id": show_id,
                    "name": show_name,
                    "path": show_dir,
                    "episodeCount": len(show_eps),
                    "thumbPath": None,
                })

            # Also check for loose files directly in the root folder
            loose_eps = []
            try:
                for f in sorted(os.listdir(folder)):
                    fp = os.path.join(folder, f)
                    if not os.path.isfile(fp):
                        continue
                    ext = os.path.splitext(f)[1].lower()
                    if ext not in self._extensions:
                        continue
                    try:
                        st = os.stat(fp)
                    except OSError:
                        continue
                    ep = {
                        "id": video_episode_id(fp, st.st_size, st.st_mtime * 1000),
                        "showId": series_id_for_folder(folder),
                        "title": os.path.splitext(f)[0],
                        "path": fp,
                        "size": st.st_size,
                        "mtimeMs": int(st.st_mtime * 1000),
                        "ext": ext.lstrip(".").upper(),
                    }
                    loose_eps.append(ep)
                    episodes_list.append(ep)
            except OSError:
                pass

            if loose_eps:
                shows_list.append({
                    "id": series_id_for_folder(folder),
                    "name": folder_name,
                    "path": folder,
                    "episodeCount": len(loose_eps),
                    "thumbPath": None,
                    "isLoose": True,
                })

        self.progress.emit(total, total, "")
        return {"shows": shows_list, "episodes": episodes_list}
