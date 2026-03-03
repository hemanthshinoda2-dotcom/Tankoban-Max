"""
Loupe / magnifier widget for the comic reader.

Shows a circular zoomed view of the page content under the cursor.
Relies on ``last_frame_rects`` populated by the canvas during each
paint cycle to map screen coordinates back to source bitmap regions.
"""

from __future__ import annotations

from PySide6.QtCore import QPoint, QRect, QRectF, Qt
from PySide6.QtGui import QColor, QPainter, QPainterPath, QPen, QPixmap
from PySide6.QtWidgets import QWidget


class LoupeWidget(QWidget):
    """Circular magnifier overlay parented to the reader widget."""

    def __init__(self, parent=None):
        super().__init__(parent)
        self._zoom = 2.0
        self._size = 220
        self._cursor_pos = QPoint(0, 0)
        self._frame_rects: list[tuple[QRect, QPixmap, QRect]] = []
        self.setFixedSize(self._size, self._size)
        self.setAttribute(Qt.WidgetAttribute.WA_TransparentForMouseEvents, True)
        self.setAttribute(Qt.WidgetAttribute.WA_TranslucentBackground, True)
        self.setVisible(False)

    # ── public API ──────────────────────────────────────────────

    def set_zoom(self, zoom: float):
        self._zoom = max(0.5, min(3.5, float(zoom)))
        self.update()

    def zoom(self) -> float:
        return self._zoom

    def set_loupe_size(self, size: int):
        self._size = max(140, min(640, int(size)))
        self.setFixedSize(self._size, self._size)
        self.update()

    def loupe_size(self) -> int:
        return self._size

    def set_frame_rects(self, rects: list[tuple[QRect, QPixmap, QRect]]):
        """Called after each canvas paint with the draw-rect mapping."""
        self._frame_rects = list(rects)

    def update_cursor(self, global_cursor: QPoint):
        """Move the loupe to follow the cursor (in parent-local coords)."""
        self._cursor_pos = QPoint(global_cursor)
        # Position loupe offset from cursor: upper-left by default,
        # flip to lower-right if near the top-left edge.
        offset = 24
        x = global_cursor.x() - self._size - offset
        y = global_cursor.y() - self._size - offset
        parent = self.parentWidget()
        if parent is not None:
            if x < 8:
                x = global_cursor.x() + offset
            if y < 8:
                y = global_cursor.y() + offset
        self.move(x, y)
        self.update()

    # ── paint ───────────────────────────────────────────────────

    def paintEvent(self, event):
        painter = QPainter(self)
        painter.setRenderHint(QPainter.RenderHint.Antialiasing, True)
        painter.setRenderHint(QPainter.RenderHint.SmoothPixmapTransform, True)

        w = self.width()
        h = self.height()
        radius = min(w, h) / 2.0

        # Circular clip
        clip = QPainterPath()
        clip.addEllipse(QRectF(0, 0, w, h))
        painter.setClipPath(clip)

        # Background
        painter.fillRect(self.rect(), QColor(0, 0, 0, 200))

        # Find the source bitmap under the cursor
        drawn = False
        cx = self._cursor_pos.x()
        cy = self._cursor_pos.y()
        for screen_rect, pixmap, source_rect in self._frame_rects:
            if pixmap is None or pixmap.isNull():
                continue
            if not screen_rect.contains(cx, cy):
                continue

            # Map cursor to source coordinates
            fx = (cx - screen_rect.x()) / max(1.0, float(screen_rect.width()))
            fy = (cy - screen_rect.y()) / max(1.0, float(screen_rect.height()))
            src_cx = source_rect.x() + fx * source_rect.width()
            src_cy = source_rect.y() + fy * source_rect.height()

            # Compute the source region to sample
            sample_w = (w / self._zoom) * (source_rect.width() / max(1.0, float(screen_rect.width())))
            sample_h = (h / self._zoom) * (source_rect.height() / max(1.0, float(screen_rect.height())))
            src_rect = QRectF(
                src_cx - sample_w / 2.0,
                src_cy - sample_h / 2.0,
                sample_w,
                sample_h,
            )

            dest_rect = QRectF(0, 0, w, h)
            painter.drawPixmap(dest_rect, pixmap, src_rect)
            drawn = True
            break

        if not drawn:
            painter.setPen(QColor(160, 160, 160))
            painter.drawText(self.rect(), Qt.AlignmentFlag.AlignCenter, "No page")

        # Border ring
        painter.setClipping(False)
        pen = QPen(QColor(255, 255, 255, 140), 2.0)
        painter.setPen(pen)
        painter.setBrush(Qt.BrushStyle.NoBrush)
        painter.drawEllipse(QRectF(1, 1, w - 2, h - 2))

        # Crosshair dot at center
        painter.setPen(Qt.PenStyle.NoPen)
        painter.setBrush(QColor(255, 255, 255, 180))
        painter.drawEllipse(QRectF(w / 2.0 - 2, h / 2.0 - 2, 4, 4))

        painter.end()
