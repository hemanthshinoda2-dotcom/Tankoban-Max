"""
Bookmarks bar — toggleable row below the nav bar showing saved bookmarks.

Each bookmark is a compact pill button (favicon + title).
Ctrl+Shift+B toggles visibility.
"""

from __future__ import annotations

from PySide6.QtCore import Qt, Signal
from PySide6.QtGui import QFont, QFontMetrics
from PySide6.QtWidgets import (
    QWidget, QHBoxLayout, QPushButton, QScrollArea, QSizePolicy,
)

from . import theme
from .data_bridge import DataBridge


class BookmarkPill(QPushButton):
    """Compact bookmark button: title text, navigates on click."""

    navigate = Signal(str)  # url

    def __init__(self, url: str, title: str, parent=None):
        super().__init__(parent)
        self._url = url
        display = title or self._domain(url)
        fm = QFontMetrics(QFont("Segoe UI", 9))
        elided = fm.elidedText(display, Qt.TextElideMode.ElideRight, 140)
        self.setText(elided)
        self.setToolTip(f"{title}\n{url}")
        self.setFixedHeight(24)
        self.setMaximumWidth(160)
        self.setCursor(Qt.CursorShape.PointingHandCursor)
        self.setStyleSheet(f"""
            QPushButton {{
                background: transparent;
                color: {theme.TEXT_SECONDARY};
                border: none;
                border-radius: 4px;
                padding: 2px 8px;
                font-size: 12px;
                font-family: 'Segoe UI', sans-serif;
                text-align: left;
            }}
            QPushButton:hover {{
                background: rgba(255,255,255,0.08);
                color: {theme.TEXT_PRIMARY};
            }}
        """)
        self.clicked.connect(lambda: self.navigate.emit(self._url))

    @staticmethod
    def _domain(url: str) -> str:
        u = url.replace("https://", "").replace("http://", "")
        return u.split("/")[0] if "/" in u else u


class BookmarksBar(QWidget):
    """
    Horizontal bookmarks bar.

    Signals:
        navigate_requested(str): URL to navigate to.
    """

    navigate_requested = Signal(str)

    def __init__(self, data_bridge: DataBridge | None = None, parent=None):
        super().__init__(parent)
        self._data_bridge = data_bridge
        self.setFixedHeight(28)
        self.setStyleSheet(f"""
            QWidget {{
                background: {theme.BG_TOOLBAR};
                border-bottom: 1px solid {theme.BORDER_COLOR};
            }}
        """)
        self.setVisible(False)  # Hidden by default

        outer = QHBoxLayout(self)
        outer.setContentsMargins(8, 0, 8, 0)
        outer.setSpacing(2)

        # Scroll area
        self._scroll = QScrollArea()
        self._scroll.setWidgetResizable(True)
        self._scroll.setHorizontalScrollBarPolicy(Qt.ScrollBarPolicy.ScrollBarAlwaysOff)
        self._scroll.setVerticalScrollBarPolicy(Qt.ScrollBarPolicy.ScrollBarAlwaysOff)
        self._scroll.setFrameShape(self._scroll.Shape.NoFrame)
        self._scroll.setStyleSheet("background: transparent; border: none;")
        self._scroll.setFixedHeight(28)

        self._container = QWidget()
        self._container.setStyleSheet("background: transparent;")
        self._row = QHBoxLayout(self._container)
        self._row.setContentsMargins(0, 2, 0, 2)
        self._row.setSpacing(2)
        self._row.addStretch()

        self._scroll.setWidget(self._container)
        outer.addWidget(self._scroll, 1)

        self._pills: list[BookmarkPill] = []

    def set_data_bridge(self, bridge: DataBridge):
        self._data_bridge = bridge
        self.refresh()

    def toggle(self):
        self.setVisible(not self.isVisible())
        if self.isVisible():
            self.refresh()

    def refresh(self):
        """Rebuild pills from bookmark data."""
        # Clear existing
        for pill in self._pills:
            self._row.removeWidget(pill)
            pill.deleteLater()
        self._pills.clear()

        if not self._data_bridge:
            return

        bookmarks = self._data_bridge.get_bookmarks()
        for bm in bookmarks[:30]:  # Show up to 30
            url = bm.get("url", "")
            title = bm.get("title", "")
            if not url:
                continue
            pill = BookmarkPill(url, title)
            pill.navigate.connect(self.navigate_requested.emit)
            # Insert before stretch
            self._row.insertWidget(self._row.count() - 1, pill)
            self._pills.append(pill)
