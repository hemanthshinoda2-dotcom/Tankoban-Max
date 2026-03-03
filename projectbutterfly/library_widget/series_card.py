"""A single series/show card widget for the library grid."""

from __future__ import annotations

import hashlib

from PySide6.QtCore import Qt, Signal, QSize
from PySide6.QtGui import QColor, QPainter, QFont, QPixmap, QMouseEvent
from PySide6.QtWidgets import QWidget, QVBoxLayout, QLabel, QSizePolicy

from context_menu import build_series_menu

from constants import (
    CARD_WIDTH, CARD_HEIGHT, CARD_COVER_HEIGHT,
    CARD_BG, CARD_HOVER_BG, CARD_BORDER_RADIUS,
    TEXT_PRIMARY, TEXT_SECONDARY,
)


def _color_for_name(name: str) -> QColor:
    """Generate a deterministic muted color from a series name."""
    h = int(hashlib.md5(name.encode()).hexdigest()[:8], 16)
    hue = h % 360
    return QColor.fromHsv(hue, 80, 90)


class SeriesCard(QWidget):
    clicked = Signal(str)  # series ID

    def __init__(self, series: dict, item_label: str = "volumes", parent=None):
        super().__init__(parent)
        self._series = series
        self._sid = series.get("id", "")
        self._hovered = False

        self.setFixedSize(CARD_WIDTH, CARD_HEIGHT)
        self.setCursor(Qt.PointingHandCursor)
        self.setAttribute(Qt.WA_Hover, True)

        layout = QVBoxLayout(self)
        layout.setContentsMargins(0, 0, 0, 0)
        layout.setSpacing(0)

        # Cover placeholder
        self._cover = QLabel(self)
        self._cover.setFixedSize(CARD_WIDTH, CARD_COVER_HEIGHT)
        self._cover.setAlignment(Qt.AlignCenter)
        self._cover.setStyleSheet(
            f"background-color: {_color_for_name(series.get('name', ''))};"
            f"border-top-left-radius: {CARD_BORDER_RADIUS}px;"
            f"border-top-right-radius: {CARD_BORDER_RADIUS}px;"
        )
        # Initials label on cover
        initials = series.get("name", "?")[:2].upper()
        self._cover.setText(initials)
        self._cover.setFont(QFont("Segoe UI", 28, QFont.Bold))
        self._cover.setStyleSheet(
            self._cover.styleSheet() + f"color: rgba(255,255,255,0.6);"
        )
        layout.addWidget(self._cover)

        # Info area
        info = QWidget(self)
        info.setFixedHeight(CARD_HEIGHT - CARD_COVER_HEIGHT)
        info_layout = QVBoxLayout(info)
        info_layout.setContentsMargins(8, 4, 8, 4)
        info_layout.setSpacing(2)

        name_label = QLabel(series.get("name", "Unknown"))
        name_label.setWordWrap(True)
        name_label.setMaximumHeight(32)
        name_label.setFont(QFont("Segoe UI", 9, QFont.Bold))
        name_label.setStyleSheet(f"color: {TEXT_PRIMARY}; background: transparent;")
        info_layout.addWidget(name_label)

        count = series.get("item_count", 0)
        sub_label = QLabel(f"{count} {item_label}")
        sub_label.setFont(QFont("Segoe UI", 8))
        sub_label.setStyleSheet(f"color: {TEXT_SECONDARY}; background: transparent;")
        info_layout.addWidget(sub_label)

        info_layout.addStretch()
        layout.addWidget(info)

        self._update_bg()

    def _update_bg(self):
        bg = CARD_HOVER_BG if self._hovered else CARD_BG
        self.setStyleSheet(
            f"SeriesCard {{ background-color: {bg};"
            f"border-radius: {CARD_BORDER_RADIUS}px; }}"
        )

    def enterEvent(self, event):
        self._hovered = True
        self._update_bg()
        super().enterEvent(event)

    def leaveEvent(self, event):
        self._hovered = False
        self._update_bg()
        super().leaveEvent(event)

    def mouseReleaseEvent(self, event: QMouseEvent):
        if event.button() == Qt.LeftButton:
            self.clicked.emit(self._sid)
        super().mouseReleaseEvent(event)

    def contextMenuEvent(self, event):
        menu = build_series_menu(self._series, self)
        menu.exec(event.globalPos())

    def set_pixmap(self, px: QPixmap):
        """Replace the placeholder with an actual cover image."""
        scaled = px.scaled(
            CARD_WIDTH, CARD_COVER_HEIGHT,
            Qt.KeepAspectRatioByExpanding, Qt.SmoothTransformation,
        )
        # Center-crop if larger than the label
        if scaled.width() > CARD_WIDTH or scaled.height() > CARD_COVER_HEIGHT:
            x = max(0, (scaled.width() - CARD_WIDTH) // 2)
            y = max(0, (scaled.height() - CARD_COVER_HEIGHT) // 2)
            scaled = scaled.copy(x, y, CARD_WIDTH, CARD_COVER_HEIGHT)
        self._cover.setPixmap(scaled)
        self._cover.setStyleSheet(
            f"border-top-left-radius: {CARD_BORDER_RADIUS}px;"
            f"border-top-right-radius: {CARD_BORDER_RADIUS}px;"
        )

    def sizeHint(self):
        return QSize(CARD_WIDTH, CARD_HEIGHT)

    @property
    def series_data(self) -> dict:
        return self._series
