"""
Reader widget — top-level QWidget that composes the canvas, cache, archive,
scroll physics, and input handling into a working comic reader.

For Slice 1: manual portrait strip scroll with wheel input.
"""

import os

from PySide6.QtCore import Qt, Slot
from PySide6.QtGui import QWheelEvent, QKeyEvent
from PySide6.QtWidgets import QWidget, QVBoxLayout

from state import ReaderState, VolumeInfo
from archive_handler import ArchiveSession
from bitmap_cache import BitmapCache
from canvas_widget import CanvasWidget
from scroll_physics import WheelAccumulator, ManualWheelPump


class ReaderWidget(QWidget):
    """Top-level reader. Owns the state, archive, cache, canvas, and input."""

    def __init__(self, parent=None):
        super().__init__(parent)
        self.setFocusPolicy(Qt.FocusPolicy.StrongFocus)

        # State
        self.state = ReaderState()

        # Archive
        self._archive: ArchiveSession | None = None

        # Cache
        self.cache = BitmapCache(self.state, parent=self)
        self.cache.page_ready.connect(self._on_page_ready)
        self.cache.page_failed.connect(self._on_page_failed)

        # Canvas
        self.canvas = CanvasWidget(self.state, self.cache, parent=self)

        # Scroll physics
        self._wheel_accum = WheelAccumulator()
        self._wheel_pump = ManualWheelPump(parent=self)
        self._wheel_pump.scroll_step.connect(self._apply_scroll_step)

        # Layout — canvas fills the entire widget
        layout = QVBoxLayout(self)
        layout.setContentsMargins(0, 0, 0, 0)
        layout.setSpacing(0)
        layout.addWidget(self.canvas)
        self.setLayout(layout)

    def open_volume(self, file_path: str):
        """Open a CBZ file and display the first page."""
        # Bump tokens for stale protection
        self.state.volume_token += 1
        self.state.open_token += 1

        # Close previous
        if self._archive is not None:
            self._archive.close()

        # Open new archive
        self._archive = ArchiveSession(file_path)
        self._archive.open()

        # Build volume info
        title = os.path.splitext(os.path.basename(file_path))[0]
        series_dir = os.path.basename(os.path.dirname(file_path))
        self.state.volume = VolumeInfo(
            file_path=file_path,
            title=title,
            series=series_dir,
            series_id=series_dir,
            page_count=self._archive.page_count,
            entries=self._archive.entries,
        )

        # Reset navigation
        self.state.page_index = 0
        self.state.scroll_y = 0.0
        self.state.known_spread_indices.clear()
        self.state.known_normal_indices.clear()
        self.state.max_page_seen = 0
        self.state.bookmarks.clear()
        self.state.finished = False

        # Bind cache to new archive and request first pages
        self.cache.set_archive(self._archive)
        self.cache.prefetch(0)

        # Update window title
        window = self.window()
        if window is not None:
            window.setWindowTitle(title)

        self.canvas.update()

    # --- Input: wheel scroll ---

    def wheelEvent(self, event: QWheelEvent):
        delta = event.angleDelta().y()
        if delta == 0:
            event.ignore()
            return

        # Convert angle delta to pixels (standard: 120 units = ~one "click" ≈ 80px)
        px = delta * 80.0 / 120.0
        smoothed = self._wheel_accum.feed(px)
        if abs(smoothed) > 0:
            self._wheel_pump.add(smoothed)

        event.accept()

    # --- Input: keyboard ---

    def keyPressEvent(self, event: QKeyEvent):
        key = event.key()

        if key == Qt.Key.Key_Escape:
            self.window().close()
        elif key in (Qt.Key.Key_F, Qt.Key.Key_F11):
            win = self.window()
            if win.isFullScreen():
                win.showNormal()
            else:
                win.showFullScreen()
        elif key == Qt.Key.Key_Home:
            self._go_to_page(0)
        elif key == Qt.Key.Key_End:
            self._go_to_page(self.state.volume.page_count - 1 if self.state.volume else 0)
        elif key in (Qt.Key.Key_Down, Qt.Key.Key_PageDown):
            step = self.canvas.height() * (0.25 if key == Qt.Key.Key_Down else 0.85)
            self._wheel_pump.add(-step)
        elif key in (Qt.Key.Key_Up, Qt.Key.Key_PageUp):
            step = self.canvas.height() * (0.25 if key == Qt.Key.Key_Up else 0.85)
            self._wheel_pump.add(step)
        else:
            event.ignore()
            return

        event.accept()

    # --- Scroll application ---

    @Slot(float)
    def _apply_scroll_step(self, delta_px: float):
        """Apply a scroll step. Negative = scroll down (content moves up)."""
        if self.state.volume is None:
            return

        self.state.scroll_y -= delta_px

        # Clamp and handle page transitions
        self._normalize_scroll()
        self.canvas.update()

    def _normalize_scroll(self):
        """Clamp scroll_y within bounds of the current page, crossing
        page boundaries when the user scrolls past top or bottom."""
        volume = self.state.volume
        if volume is None:
            return

        canvas_h = self.canvas.height()

        # Scroll past bottom of current page → advance to next
        while True:
            page_h = self.canvas.page_height_at(self.state.page_index)
            max_y = max(0, page_h - canvas_h)

            if self.state.scroll_y > max_y:
                # Try to advance to next page
                if self.state.page_index < volume.page_count - 1:
                    overflow = self.state.scroll_y - max_y
                    self.state.page_index += 1
                    self.state.scroll_y = -overflow  # negative = start above next page top
                    self._on_page_change()
                else:
                    # At last page — clamp
                    self.state.scroll_y = max_y
                    break
            else:
                break

        # Scroll past top of current page → go to previous
        while self.state.scroll_y < 0:
            if self.state.page_index > 0:
                self.state.page_index -= 1
                prev_h = self.canvas.page_height_at(self.state.page_index)
                max_y = max(0, prev_h - canvas_h)
                self.state.scroll_y = max_y + self.state.scroll_y  # scroll_y is negative
                self._on_page_change()
            else:
                self.state.scroll_y = 0
                break

    def _go_to_page(self, index: int):
        """Jump to a specific page."""
        if self.state.volume is None:
            return
        index = max(0, min(index, self.state.volume.page_count - 1))
        self.state.page_index = index
        self.state.scroll_y = 0.0
        self._wheel_pump.stop()
        self._on_page_change()
        self.canvas.update()

    def _on_page_change(self):
        """Called whenever page_index changes — triggers prefetch and
        updates max_page_seen."""
        idx = self.state.page_index
        if idx > self.state.max_page_seen:
            self.state.max_page_seen = idx
        self.cache.prefetch(idx)

    # --- Cache callbacks ---

    @Slot(int)
    def _on_page_ready(self, page_index: int):
        """A page finished decoding — repaint if it's visible."""
        self.canvas.update()

    @Slot(int, str)
    def _on_page_failed(self, page_index: int, error: str):
        print(f"[WARN] Page {page_index} decode failed: {error}")

    # --- Cleanup ---

    def closeEvent(self, event):
        if self._archive is not None:
            self._archive.close()
            self._archive = None
        super().closeEvent(event)
