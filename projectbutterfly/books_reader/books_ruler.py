"""Reading ruler overlay — semi-transparent band with dimmed regions."""

from __future__ import annotations

from PySide6.QtCore import Qt, Signal, QRect
from PySide6.QtGui import QColor, QPainter, QMouseEvent
from PySide6.QtWidgets import QWidget

RULER_COLORS = {
    "warm":  (255, 236, 170),
    "green": (188, 247, 195),
    "blue":  (182, 224, 255),
    "gray":  (255, 255, 255),
}

RULER_DEFAULTS = {
    "enabled": False,
    "yPct": 40,
    "heightPx": 92,
    "dimPct": 42,
    "tintPct": 12,
    "color": "warm",
}


class BooksReadingRuler(QWidget):
    """Semi-transparent overlay with a highlighted band and dimmed regions."""

    settings_changed = Signal(dict)

    def __init__(self, parent: QWidget | None = None):
        super().__init__(parent)
        self.setAttribute(Qt.WidgetAttribute.WA_TransparentForMouseEvents, False)
        self.setMouseTracking(True)
        self._settings = dict(RULER_DEFAULTS)
        self._dragging = False
        self._drag_offset = 0

    def set_settings(self, settings: dict) -> None:
        self._settings = dict(settings)
        if self._settings.get("enabled"):
            self.show()
        else:
            self.hide()
        self.update()

    def is_enabled(self) -> bool:
        return self._settings.get("enabled", False)

    def toggle(self) -> None:
        enabled = not self._settings.get("enabled", False)
        self._settings["enabled"] = enabled
        self.settings_changed.emit(dict(self._settings))
        if enabled:
            self.show()
        else:
            self.hide()
        self.update()

    def paintEvent(self, event) -> None:
        if not self._settings.get("enabled"):
            return

        w, h = self.width(), self.height()
        y_pct = self._settings.get("yPct", 40)
        band_h = self._settings.get("heightPx", 92)
        dim_pct = self._settings.get("dimPct", 42)
        tint_pct = self._settings.get("tintPct", 12)
        color_name = self._settings.get("color", "warm")
        rgb = RULER_COLORS.get(color_name, RULER_COLORS["warm"])

        band_y = int(h * y_pct / 100) - band_h // 2
        band_y = max(0, min(band_y, h - band_h))

        painter = QPainter(self)
        painter.setRenderHint(QPainter.RenderHint.Antialiasing)

        # Top dim region
        dim_alpha = int(255 * dim_pct / 100)
        painter.fillRect(QRect(0, 0, w, band_y), QColor(0, 0, 0, dim_alpha))

        # Band (tinted)
        tint_alpha = int(255 * tint_pct / 100)
        painter.fillRect(QRect(0, band_y, w, band_h), QColor(*rgb, tint_alpha))

        # Bottom dim region
        bottom_y = band_y + band_h
        painter.fillRect(QRect(0, bottom_y, w, h - bottom_y), QColor(0, 0, 0, dim_alpha))

        # Handle (pill in center of band)
        handle_w, handle_h = 40, 6
        handle_x = (w - handle_w) // 2
        handle_y = band_y + (band_h - handle_h) // 2
        painter.setBrush(QColor(255, 255, 255, 120))
        painter.setPen(Qt.PenStyle.NoPen)
        painter.drawRoundedRect(handle_x, handle_y, handle_w, handle_h, 3, 3)

        painter.end()

    def mousePressEvent(self, event: QMouseEvent) -> None:
        if event.button() != Qt.MouseButton.LeftButton:
            event.ignore()
            return
        # Check if clicking near the handle area (center band)
        h = self.height()
        y_pct = self._settings.get("yPct", 40)
        band_h = self._settings.get("heightPx", 92)
        band_y = int(h * y_pct / 100) - band_h // 2
        band_y = max(0, min(band_y, h - band_h))

        click_y = int(event.position().y())
        if band_y <= click_y <= band_y + band_h:
            self._dragging = True
            self._drag_offset = click_y - band_y - band_h // 2
            event.accept()
        else:
            # Pass through clicks outside band
            event.ignore()

    def mouseMoveEvent(self, event: QMouseEvent) -> None:
        if not self._dragging:
            event.ignore()
            return
        h = self.height()
        if h <= 0:
            return
        new_center = int(event.position().y()) - self._drag_offset
        new_pct = int(new_center / h * 100)
        new_pct = max(8, min(92, new_pct))
        self._settings["yPct"] = new_pct
        self.update()
        event.accept()

    def mouseReleaseEvent(self, event: QMouseEvent) -> None:
        if self._dragging:
            self._dragging = False
            self.settings_changed.emit(dict(self._settings))
            event.accept()
        else:
            event.ignore()
