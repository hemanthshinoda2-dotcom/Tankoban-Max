"""A single tile in the continue reading/watching shelf."""

from __future__ import annotations

from PySide6.QtCore import Qt, Signal, QSize
from PySide6.QtGui import QFont, QPixmap, QMouseEvent
from PySide6.QtWidgets import QWidget, QVBoxLayout, QLabel

from constants import (
    CARD_BG, CARD_HOVER_BG, CARD_BORDER_RADIUS,
    TEXT_PRIMARY, TEXT_SECONDARY, ACCENT_COLOR,
)

TILE_WIDTH = 140
TILE_COVER_HEIGHT = 160
TILE_HEIGHT = 210


class ContinueTile(QWidget):
    clicked = Signal(str)  # item ID

    def __init__(self, item: dict, parent=None):
        super().__init__(parent)
        self._item = item
        self._item_id = item.get("id", "")
        self._hovered = False

        self.setFixedSize(TILE_WIDTH, TILE_HEIGHT)
        self.setCursor(Qt.PointingHandCursor)
        self.setAttribute(Qt.WA_Hover, True)

        layout = QVBoxLayout(self)
        layout.setContentsMargins(0, 0, 0, 0)
        layout.setSpacing(0)

        # Cover image
        self._cover = QLabel(self)
        self._cover.setFixedSize(TILE_WIDTH, TILE_COVER_HEIGHT)
        self._cover.setAlignment(Qt.AlignCenter)
        self._cover.setStyleSheet(
            f"background-color: #1a2a4a;"
            f"border-top-left-radius: {CARD_BORDER_RADIUS}px;"
            f"border-top-right-radius: {CARD_BORDER_RADIUS}px;"
        )
        layout.addWidget(self._cover)

        # Progress badge (overlaid on cover bottom-right)
        pct = item.get("percent", 0)
        if pct > 0:
            self._badge = QLabel(f"{pct}%", self._cover)
            self._badge.setFont(QFont("Segoe UI", 8, QFont.Bold))
            self._badge.setAlignment(Qt.AlignCenter)
            self._badge.setFixedSize(40, 18)
            self._badge.move(TILE_WIDTH - 44, TILE_COVER_HEIGHT - 22)
            self._badge.setStyleSheet(
                f"background-color: {ACCENT_COLOR}; color: white;"
                "border-radius: 3px; padding: 1px 4px;"
            )

        # Title
        info = QWidget(self)
        info.setFixedHeight(TILE_HEIGHT - TILE_COVER_HEIGHT)
        info_layout = QVBoxLayout(info)
        info_layout.setContentsMargins(6, 3, 6, 3)
        info_layout.setSpacing(0)

        title = QLabel(item.get("title", item.get("series_name", "Unknown")))
        title.setWordWrap(True)
        title.setMaximumHeight(30)
        title.setFont(QFont("Segoe UI", 8))
        title.setStyleSheet(f"color: {TEXT_PRIMARY}; background: transparent;")
        info_layout.addWidget(title)
        info_layout.addStretch()
        layout.addWidget(info)

        self._update_bg()

    def _update_bg(self):
        bg = CARD_HOVER_BG if self._hovered else CARD_BG
        self.setStyleSheet(
            f"ContinueTile {{ background-color: {bg};"
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
            self.clicked.emit(self._item_id)
        super().mouseReleaseEvent(event)

    def set_pixmap(self, px: QPixmap):
        scaled = px.scaled(
            TILE_WIDTH, TILE_COVER_HEIGHT,
            Qt.KeepAspectRatioByExpanding, Qt.SmoothTransformation,
        )
        if scaled.width() > TILE_WIDTH or scaled.height() > TILE_COVER_HEIGHT:
            x = max(0, (scaled.width() - TILE_WIDTH) // 2)
            y = max(0, (scaled.height() - TILE_COVER_HEIGHT) // 2)
            scaled = scaled.copy(x, y, TILE_WIDTH, TILE_COVER_HEIGHT)
        self._cover.setPixmap(scaled)
        self._cover.setStyleSheet(
            f"border-top-left-radius: {CARD_BORDER_RADIUS}px;"
            f"border-top-right-radius: {CARD_BORDER_RADIUS}px;"
        )

    @property
    def item_data(self) -> dict:
        return self._item
