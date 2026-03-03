"""Async thumbnail loading via QThreadPool."""

from __future__ import annotations

import os

from PySide6.QtCore import QObject, QRunnable, QThreadPool, Signal, Slot, QByteArray
from PySide6.QtGui import QImage, QPixmap

import storage
from thumb_extractor import extract_comic_cover, extract_book_cover


class _ThumbSignals(QObject):
    """Signals for QRunnable (QRunnable can't emit directly)."""
    thumb_ready = Signal(str, QPixmap)  # (series_id, pixmap)


class _ThumbTask(QRunnable):
    """Background task: load or generate a thumbnail for one series."""

    def __init__(self, series_id: str, first_item_path: str, first_item_id: str,
                 thumb_path: str | None = None):
        super().__init__()
        self.setAutoDelete(True)
        self.signals = _ThumbSignals()
        self._series_id = series_id
        self._item_path = first_item_path
        self._item_id = first_item_id
        self._thumb_path = thumb_path

    def run(self):
        px = self._try_load()
        if px and not px.isNull():
            self.signals.thumb_ready.emit(self._series_id, px)

    def _try_load(self) -> QPixmap | None:
        # 0. If a pre-existing thumb path is provided (video shows), try it first
        if self._thumb_path and os.path.isfile(self._thumb_path):
            px = QPixmap(self._thumb_path)
            if not px.isNull():
                return px

        # 1. Check if cached thumb exists for the first item
        cache_dir = storage.data_path("thumbs")
        cache_path = os.path.join(cache_dir, f"{self._item_id}.jpg")

        if os.path.isfile(cache_path):
            px = QPixmap(cache_path)
            if not px.isNull():
                return px

        # 2. Extract cover from archive or book
        ext = os.path.splitext(self._item_path)[1].lower()
        if ext in (".epub",):
            data = extract_book_cover(self._item_path)
        elif ext in (".cbz", ".zip", ".cbr", ".rar", ".cb7", ".7z"):
            data = extract_comic_cover(self._item_path)
        else:
            # Video files, PDFs, etc. — no extraction
            return None

        if not data:
            return None

        img = QImage()
        if not img.loadFromData(QByteArray(data)):
            return None

        px = QPixmap.fromImage(img)
        if px.isNull():
            return None

        # 3. Cache to disk for next time
        try:
            os.makedirs(cache_dir, exist_ok=True)
            scaled = px.scaled(360, 520, aspectMode=1, mode=1)
            scaled.save(cache_path, "JPEG", 85)
        except Exception:
            pass

        return px


class ThumbProvider(QObject):
    """Manages async thumbnail loading for series cards."""

    thumb_ready = Signal(str, QPixmap)  # (series_id, pixmap)

    def __init__(self, parent=None, max_threads: int = 4):
        super().__init__(parent)
        self._pool = QThreadPool()
        self._pool.setMaxThreadCount(max_threads)
        self._pending: set[str] = set()
        self._cache: dict[str, QPixmap] = {}

    def request_thumb(self, series_id: str, first_item_path: str, first_item_id: str,
                      thumb_path: str | None = None):
        """Queue a thumbnail load for a series. Deduplicates by series_id."""
        if series_id in self._pending or series_id in self._cache:
            if series_id in self._cache:
                self.thumb_ready.emit(series_id, self._cache[series_id])
            return

        self._pending.add(series_id)
        task = _ThumbTask(series_id, first_item_path, first_item_id, thumb_path)
        task.signals.thumb_ready.connect(self._on_thumb_done)
        self._pool.start(task)

    @Slot(str, QPixmap)
    def _on_thumb_done(self, series_id: str, px: QPixmap):
        self._pending.discard(series_id)
        # LRU cap
        if len(self._cache) > 300:
            oldest_key = next(iter(self._cache))
            del self._cache[oldest_key]
        self._cache[series_id] = px
        self.thumb_ready.emit(series_id, px)

    def clear(self):
        self._cache.clear()
        self._pending.clear()
