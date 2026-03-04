"""
Bitmap cache — threaded QImage decode with LRU eviction and prefetch.

Decode happens on QThreadPool workers. Signals fire on the main thread
when a page is ready or failed. The cache enforces a byte budget with
LRU eviction (non-keep entries evicted first).
"""

import time
from typing import Optional

from PySide6.QtCore import QObject, QRunnable, QThreadPool, Signal, Slot
from PySide6.QtGui import QImage, QPixmap

from archive_handler import ArchiveSession
from state import ReaderState, WIDE_RATIO_PRIMARY

# Max simultaneous decode tasks
MAX_DECODE_CONCURRENCY = 2

# Keep-set cap — always keep at least this many entries regardless of LRU
KEEP_CAP = 12

# Prefetch radius (pages ahead and behind current)
PREFETCH_RADIUS = 2


class CacheEntry:
    __slots__ = ("pixmap", "width", "height", "spread", "bytes_estimate", "last_used")

    def __init__(self, pixmap: QPixmap, width: int, height: int, spread: bool):
        self.pixmap = pixmap
        self.width = width
        self.height = height
        self.spread = spread
        self.bytes_estimate = width * height * 4  # RGBA
        self.last_used = time.monotonic()

    def touch(self):
        self.last_used = time.monotonic()


class DecodeTask(QRunnable):
    """Runs on QThreadPool — reads archive bytes and decodes to QImage."""

    def __init__(self, emitter, archive: ArchiveSession,
                 page_index: int, volume_token: int, open_token: int):
        super().__init__()
        self.emitter = emitter
        self.archive = archive
        self.page_index = page_index
        self.volume_token = volume_token
        self.open_token = open_token
        self.setAutoDelete(True)

    def run(self):
        try:
            raw = self.archive.read_page(self.page_index)
            img = QImage()
            if not img.loadFromData(raw):
                self.emitter.decode_failed.emit(
                    self.page_index, "QImage.loadFromData failed",
                    self.volume_token, self.open_token
                )
                return
            pixmap = QPixmap.fromImage(img)
            self.emitter.decode_ready.emit(
                self.page_index, pixmap, img.width(), img.height(),
                self.volume_token, self.open_token
            )
        except Exception as e:
            self.emitter.decode_failed.emit(
                self.page_index, str(e),
                self.volume_token, self.open_token
            )


class _DecodeEmitter(QObject):
    """Signal bridge — DecodeTask emits these from the thread pool,
    BitmapCache receives them on the main thread via queued connections."""
    decode_ready = Signal(int, QPixmap, int, int, int, int)   # page, pixmap, w, h, vol_tok, open_tok
    decode_failed = Signal(int, str, int, int)                # page, error, vol_tok, open_tok


class BitmapCache(QObject):
    """Main-thread cache manager. Decodes on background threads,
    stores QPixmaps, evicts by LRU when over budget."""

    page_ready = Signal(int)       # page_index — ready to paint
    page_failed = Signal(int, str) # page_index, error message

    def __init__(self, state: ReaderState, parent=None):
        super().__init__(parent)
        self.state = state
        self._cache: dict[int, CacheEntry] = {}
        self._pending: set[int] = set()    # page indices currently decoding
        self._archive: Optional[ArchiveSession] = None

        self._pool = QThreadPool.globalInstance()
        self._pool.setMaxThreadCount(MAX_DECODE_CONCURRENCY)

        self._emitter = _DecodeEmitter()
        self._emitter.decode_ready.connect(self._on_decode_ready)
        self._emitter.decode_failed.connect(self._on_decode_failed)

    def set_archive(self, archive: ArchiveSession):
        """Bind to a new archive. Clears all cached data."""
        self._archive = archive
        self.clear()

    def clear(self):
        """Drop all cached pixmaps and cancel pending decodes."""
        self._cache.clear()
        self._pending.clear()

    def get(self, page_index: int) -> Optional[CacheEntry]:
        """Return cached entry if available, or None. Touches LRU timestamp."""
        entry = self._cache.get(page_index)
        if entry is not None:
            entry.touch()
        return entry

    def request(self, page_index: int):
        """Request a page decode. No-op if already cached or pending."""
        if self._archive is None:
            return
        if page_index < 0 or page_index >= self._archive.page_count:
            return
        if page_index in self._cache or page_index in self._pending:
            return

        self._pending.add(page_index)
        task = DecodeTask(
            self._emitter, self._archive, page_index,
            self.state.volume_token, self.state.open_token
        )
        self._pool.start(task)

    def prefetch(self, center: int):
        """Request decode for pages around center within PREFETCH_RADIUS."""
        if self._archive is None:
            return
        for offset in range(PREFETCH_RADIUS + 1):
            for idx in (center + offset, center - offset):
                if 0 <= idx < self._archive.page_count:
                    self.request(idx)

    def total_bytes(self) -> int:
        return sum(e.bytes_estimate for e in self._cache.values())

    def _evict_if_needed(self):
        """Evict LRU entries until under budget. Keep at most KEEP_CAP entries."""
        budget = self.state.memory_budget_bytes()
        while self.total_bytes() > budget and len(self._cache) > KEEP_CAP:
            # Find the least-recently-used entry
            oldest_key = None
            oldest_time = float("inf")
            for key, entry in self._cache.items():
                if entry.last_used < oldest_time:
                    oldest_time = entry.last_used
                    oldest_key = key
            if oldest_key is not None:
                del self._cache[oldest_key]
            else:
                break

    @Slot(int, QPixmap, int, int, int, int)
    def _on_decode_ready(self, page_index, pixmap, w, h, vol_tok, open_tok):
        self._pending.discard(page_index)

        # Stale check
        if vol_tok != self.state.volume_token or open_tok != self.state.open_token:
            return

        # Detect spread
        spread = (w / h >= WIDE_RATIO_PRIMARY) if h > 0 else False
        if spread:
            self.state.known_spread_indices.add(page_index)

        entry = CacheEntry(pixmap, w, h, spread)
        self._cache[page_index] = entry
        self._evict_if_needed()

        self.page_ready.emit(page_index)

    @Slot(int, str, int, int)
    def _on_decode_failed(self, page_index, error, vol_tok, open_tok):
        self._pending.discard(page_index)

        if vol_tok != self.state.volume_token or open_tok != self.state.open_token:
            return

        self.page_failed.emit(page_index, error)
