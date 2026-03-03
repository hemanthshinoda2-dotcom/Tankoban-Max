import struct
import time
from dataclasses import dataclass

from PySide6.QtCore import QObject, QRunnable, QThreadPool, Signal
from PySide6.QtGui import QImage, QPixmap


def _u16_be(data: bytes, offset: int) -> int:
    return struct.unpack_from(">H", data, offset)[0]


def _u32_be(data: bytes, offset: int) -> int:
    return struct.unpack_from(">I", data, offset)[0]


def _u16_le(data: bytes, offset: int) -> int:
    return struct.unpack_from("<H", data, offset)[0]


def parse_image_dimensions_fast(data: bytes):
    try:
        if len(data) >= 24 and data[0:8] == b"\x89PNG\r\n\x1a\n":
            return _u32_be(data, 16), _u32_be(data, 20)

        if len(data) >= 10 and data[0:6] in (b"GIF87a", b"GIF89a"):
            return _u16_be(data, 6), _u16_be(data, 8)

        if len(data) >= 30 and data[0:4] == b"RIFF" and data[8:12] == b"WEBP":
            chunk = data[12:16]
            if chunk == b"VP8X" and len(data) >= 30:
                w = 1 + data[24] + (data[25] << 8) + (data[26] << 16)
                h = 1 + data[27] + (data[28] << 8) + (data[29] << 16)
                return w, h
            if chunk == b"VP8 " and len(data) >= 30:
                w = _u16_le(data, 26) & 0x3FFF
                h = _u16_le(data, 28) & 0x3FFF
                return w, h
            if chunk == b"VP8L" and len(data) >= 25:
                b0, b1, b2, b3 = data[21], data[22], data[23], data[24]
                w = 1 + (((b1 & 0x3F) << 8) | b0)
                h = 1 + (((b3 & 0x0F) << 10) | (b2 << 2) | ((b1 & 0xC0) >> 6))
                return w, h

        if len(data) >= 4 and data[0:2] == b"\xff\xd8":
            offset = 2
            length = len(data)
            while offset + 4 <= length:
                if data[offset] != 0xFF:
                    offset += 1
                    continue
                marker = data[offset + 1]
                offset += 2
                if marker in (0xD8, 0xD9):
                    continue
                if offset + 2 > length:
                    break
                size = _u16_be(data, offset)
                if size < 2 or offset + size > length:
                    break
                if marker in (
                    0xC0, 0xC1, 0xC2, 0xC3,
                    0xC5, 0xC6, 0xC7,
                    0xC9, 0xCA, 0xCB,
                    0xCD, 0xCE, 0xCF,
                ):
                    if offset + 7 <= length:
                        h = _u16_be(data, offset + 3)
                        w = _u16_be(data, offset + 5)
                        return w, h
                    break
                offset += size
    except Exception:
        return None, None
    return None, None


@dataclass
class CacheEntry:
    pixmap: QPixmap
    spread: bool
    width: int
    height: int
    bytes_estimate: int
    last_used: float


class _DecodeSignals(QObject):
    finished = Signal(object)


class _DecodeTask(QRunnable):
    def __init__(self, session, index: int, volume_token: int):
        super().__init__()
        self.signals = _DecodeSignals()
        self.session = session
        self.index = index
        self.volume_token = int(volume_token)

    def run(self):
        try:
            data = self.session.get_page_bytes(self.index)
            w, h = parse_image_dimensions_fast(data)
            image = QImage()
            if not image.loadFromData(data):
                raise RuntimeError("Decode failed")
            if not w or not h:
                w = image.width()
                h = image.height()
            self.signals.finished.emit({
                "ok": True,
                "index": self.index,
                "volume_token": self.volume_token,
                "image": image,
                "width": int(w),
                "height": int(h),
            })
        except Exception as exc:
            self.signals.finished.emit({
                "ok": False,
                "index": self.index,
                "volume_token": self.volume_token,
                "error": str(exc),
            })


class BitmapCache(QObject):
    page_ready = Signal(int)
    page_failed = Signal(int, str)

    def __init__(self, parent=None, memory_saver: bool = False, spread_threshold: float = 1.35):
        super().__init__(parent)
        self.memory_budget_bytes = (256 if memory_saver else 512) * 1024 * 1024
        self.keep_set_cap = 12
        self.spread_threshold = float(spread_threshold)

        self._thread_pool = QThreadPool.globalInstance()
        self._thread_pool.setMaxThreadCount(max(2, min(4, self._thread_pool.maxThreadCount())))

        self._session = None
        self._volume_token = 0
        self._page_count = 0
        self._current_index = -1

        self._entries: dict[int, CacheEntry] = {}
        self._in_flight: set[tuple[int, int]] = set()
        self._total_bytes = 0

    def clear(self):
        self._entries.clear()
        self._in_flight.clear()
        self._total_bytes = 0

    def set_session(self, session, volume_token: int, page_count: int):
        self._session = session
        self._volume_token = int(volume_token)
        self._page_count = int(page_count)
        self._current_index = -1
        self.clear()

    def set_current_index(self, index: int):
        self._current_index = int(index)
        self._evict_if_needed()

    def get_entry(self, index: int):
        entry = self._entries.get(int(index))
        if entry is None:
            return None
        entry.last_used = time.monotonic()
        return entry

    def get_pixmap(self, index: int):
        entry = self.get_entry(index)
        return entry.pixmap if entry is not None else None

    def is_cached(self, index: int) -> bool:
        return int(index) in self._entries

    def get_cached_spread_indices(self):
        out = set()
        for idx, entry in self._entries.items():
            if bool(entry.spread):
                out.add(int(idx))
        return out

    def request_page(self, index: int):
        index = int(index)
        if self._session is None:
            return
        if index < 0 or index >= self._page_count:
            return
        if index in self._entries:
            self._entries[index].last_used = time.monotonic()
            self.page_ready.emit(index)
            return

        key = (self._volume_token, index)
        if key in self._in_flight:
            return
        self._in_flight.add(key)

        task = _DecodeTask(self._session, index, self._volume_token)
        task.signals.finished.connect(self._on_decode_finished)
        self._thread_pool.start(task)

    def prefetch_neighbors(self, center_index: int, radius: int = 2):
        center = int(center_index)
        for step in range(1, int(radius) + 1):
            self.request_page(center - step)
            self.request_page(center + step)

    def _on_decode_finished(self, payload):
        index = int(payload.get("index", -1))
        token = int(payload.get("volume_token", -1))
        self._in_flight.discard((token, index))

        if token != self._volume_token:
            return

        if not payload.get("ok"):
            self.page_failed.emit(index, payload.get("error", "Decode failed"))
            return

        image = payload.get("image")
        pixmap = QPixmap.fromImage(image)
        if pixmap.isNull():
            self.page_failed.emit(index, "Pixmap conversion failed")
            return

        width = int(payload.get("width") or pixmap.width())
        height = int(payload.get("height") or pixmap.height())
        spread = bool(height > 0 and (float(width) / float(height)) > self.spread_threshold)
        bytes_estimate = max(1, width * height * 4)

        prev = self._entries.get(index)
        if prev is not None:
            self._total_bytes -= prev.bytes_estimate

        self._entries[index] = CacheEntry(
            pixmap=pixmap,
            spread=spread,
            width=width,
            height=height,
            bytes_estimate=bytes_estimate,
            last_used=time.monotonic(),
        )
        self._total_bytes += bytes_estimate
        self._evict_if_needed()
        self.page_ready.emit(index)

    def _evict_if_needed(self):
        if not self._entries:
            return

        keep_set = set()
        if self._current_index >= 0:
            start = max(0, self._current_index - 5)
            end = min(self._page_count - 1, self._current_index + 6)
            for idx in range(start, end + 1):
                keep_set.add(idx)

        lock_set = set()
        if self._current_index >= 0:
            for idx in (self._current_index - 1, self._current_index, self._current_index + 1):
                if 0 <= idx < self._page_count:
                    lock_set.add(idx)

        def over_limit() -> bool:
            return self._total_bytes > self.memory_budget_bytes or len(self._entries) > self.keep_set_cap

        while over_limit() and self._entries:
            candidate = self._pick_evict_candidate(lock_set, keep_set)
            if candidate is None:
                candidate = self._pick_evict_candidate(lock_set, set())
            if candidate is None:
                break

            removed = self._entries.pop(candidate, None)
            if removed is not None:
                self._total_bytes = max(0, self._total_bytes - removed.bytes_estimate)

    def _pick_evict_candidate(self, lock_set: set[int], protected_set: set[int]):
        best_index = None
        best_last_used = None
        for idx, entry in self._entries.items():
            if idx in lock_set:
                continue
            if idx in protected_set:
                continue
            if best_index is None or entry.last_used < best_last_used:
                best_index = idx
                best_last_used = entry.last_used
        return best_index
