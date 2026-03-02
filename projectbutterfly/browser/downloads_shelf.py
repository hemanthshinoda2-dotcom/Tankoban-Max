"""
Downloads shelf — Chrome-style bar at the bottom of the browser viewport.

Shows active downloads with progress bars and completed downloads as
clickable file pills. Auto-hides when all downloads are dismissed.
"""

from __future__ import annotations

import os
from pathlib import Path

from PySide6.QtCore import Qt, Signal, QTimer
from PySide6.QtGui import QFont, QFontMetrics, QColor, QPainter, QPen
from PySide6.QtWidgets import (
    QWidget, QHBoxLayout, QPushButton, QScrollArea, QSizePolicy, QLabel,
    QFileDialog,
)
from PySide6.QtWebEngineCore import QWebEngineDownloadRequest

from . import theme

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _human_size(b: int) -> str:
    if b < 1024:
        return f"{b} B"
    elif b < 1024 * 1024:
        return f"{b / 1024:.1f} KB"
    elif b < 1024 * 1024 * 1024:
        return f"{b / (1024 * 1024):.1f} MB"
    else:
        return f"{b / (1024 * 1024 * 1024):.2f} GB"


# ---------------------------------------------------------------------------
# Download item widget
# ---------------------------------------------------------------------------

class DownloadItem(QWidget):
    """Single download in the shelf."""

    dismissed = Signal(object)  # self

    def __init__(self, download: QWebEngineDownloadRequest, parent=None):
        super().__init__(parent)
        self._download = download
        self._filename = Path(download.downloadFileName()).name or "download"
        self._done = False
        self._cancelled = False
        self._hovered = False

        self.setFixedHeight(32)
        self.setFixedWidth(200)
        self.setMouseTracking(True)
        self.setCursor(Qt.CursorShape.PointingHandCursor)

        # Connect download signals
        download.receivedBytesChanged.connect(self._on_progress)
        download.isFinishedChanged.connect(self._on_finished)

    @property
    def download(self):
        return self._download

    def _on_progress(self):
        self.update()

    def _on_finished(self):
        self._done = self._download.isFinished()
        state = self._download.state()
        self._cancelled = (
            state == QWebEngineDownloadRequest.DownloadState.DownloadCancelled
        )
        self.update()

    def paintEvent(self, event):
        p = QPainter(self)
        p.setRenderHint(QPainter.RenderHint.Antialiasing)
        w, h = self.width(), self.height()

        # Background
        bg = QColor(theme.BG_POPUP)
        if self._hovered:
            bg = QColor("rgba(199,167,107,0.10)")
        p.setPen(QPen(QColor(theme.BORDER_COLOR), 1))
        p.setBrush(bg)
        p.drawRoundedRect(1, 1, w - 2, h - 2, 6, 6)

        # Filename
        font = QFont("Segoe UI", 9)
        p.setFont(font)
        fm = QFontMetrics(font)

        x = 8
        close_zone = 24
        avail = w - x - close_zone - 4

        if self._cancelled:
            p.setPen(QColor(theme.TEXT_SECONDARY))
            elided = fm.elidedText(f"Cancelled: {self._filename}", Qt.TextElideMode.ElideRight, avail)
            p.drawText(x, 14, elided)
        elif self._done:
            p.setPen(QColor(theme.TEXT_URL_SECURE))
            elided = fm.elidedText(self._filename, Qt.TextElideMode.ElideRight, avail)
            p.drawText(x, 14, elided)
            # Size
            total = self._download.totalBytes()
            if total > 0:
                p.setPen(QColor(theme.TEXT_SECONDARY))
                p.setFont(QFont("Segoe UI", 8))
                p.drawText(x, 26, _human_size(total))
        else:
            # In progress
            p.setPen(QColor(theme.TEXT_PRIMARY))
            elided = fm.elidedText(self._filename, Qt.TextElideMode.ElideRight, avail)
            p.drawText(x, 14, elided)

            # Progress bar
            received = self._download.receivedBytes()
            total = self._download.totalBytes()
            if total > 0:
                pct = received / total
                bar_y = h - 4
                bar_w = w - 16
                # Background
                p.setPen(Qt.PenStyle.NoPen)
                p.setBrush(QColor(theme.BORDER_COLOR))
                p.drawRoundedRect(8, bar_y, bar_w, 2, 1, 1)
                # Progress
                p.setBrush(QColor(theme.ACCENT))
                p.drawRoundedRect(8, bar_y, int(bar_w * pct), 2, 1, 1)

            # Size text
            p.setPen(QColor(theme.TEXT_SECONDARY))
            p.setFont(QFont("Segoe UI", 8))
            size_text = _human_size(received)
            if total > 0:
                size_text += f" / {_human_size(total)}"
            p.drawText(x, 26, size_text)

        # Close/dismiss button (x) — top right
        cx = w - 20
        cy = 4
        cs = 12
        if self._hovered:
            p.setPen(QPen(QColor(theme.TEXT_SECONDARY), 1.2))
            p.drawLine(cx + 3, cy + 3, cx + cs - 3, cy + cs - 3)
            p.drawLine(cx + cs - 3, cy + 3, cx + 3, cy + cs - 3)

        p.end()

    def mousePressEvent(self, event):
        if event.button() == Qt.MouseButton.LeftButton:
            # Check if clicking close button
            cx = self.width() - 20
            cy = 4
            cs = 12
            if cx <= event.pos().x() <= cx + cs and cy <= event.pos().y() <= cy + cs:
                # Cancel if still downloading
                if not self._done and not self._cancelled:
                    self._download.cancel()
                self.dismissed.emit(self)
                return

            # If done, open the file
            if self._done:
                path = self._download.downloadDirectory() + "/" + self._download.downloadFileName()
                if os.path.exists(path):
                    import subprocess
                    subprocess.Popen(["explorer", "/select,", os.path.normpath(path)])

    def enterEvent(self, event):
        self._hovered = True
        self.update()

    def leaveEvent(self, event):
        self._hovered = False
        self.update()


# ---------------------------------------------------------------------------
# Downloads shelf
# ---------------------------------------------------------------------------

class DownloadsShelf(QWidget):
    """
    Horizontal bar at the bottom of the browser showing downloads.

    Auto-shows when a download starts, auto-hides when all dismissed.
    """

    def __init__(self, parent=None):
        super().__init__(parent)
        self.setFixedHeight(40)
        self.setStyleSheet(f"""
            QWidget {{
                background: {theme.BG_TOOLBAR};
                border-top: 1px solid {theme.BORDER_COLOR};
            }}
        """)
        self.setVisible(False)

        layout = QHBoxLayout(self)
        layout.setContentsMargins(8, 4, 8, 4)
        layout.setSpacing(4)

        # Scroll area for download items
        self._scroll = QScrollArea()
        self._scroll.setWidgetResizable(True)
        self._scroll.setHorizontalScrollBarPolicy(Qt.ScrollBarPolicy.ScrollBarAlwaysOff)
        self._scroll.setVerticalScrollBarPolicy(Qt.ScrollBarPolicy.ScrollBarAlwaysOff)
        self._scroll.setFrameShape(self._scroll.Shape.NoFrame)
        self._scroll.setStyleSheet("background: transparent; border: none;")

        self._container = QWidget()
        self._container.setStyleSheet("background: transparent;")
        self._row = QHBoxLayout(self._container)
        self._row.setContentsMargins(0, 0, 0, 0)
        self._row.setSpacing(4)
        self._row.addStretch()

        self._scroll.setWidget(self._container)
        layout.addWidget(self._scroll, 1)

        # Close all button
        close_all = QPushButton("\u2715")
        close_all.setFixedSize(24, 24)
        close_all.setToolTip("Close shelf")
        close_all.setStyleSheet(f"""
            QPushButton {{
                background: transparent;
                color: {theme.TEXT_SECONDARY};
                border: none;
                border-radius: 12px;
                font-size: 14px;
            }}
            QPushButton:hover {{
                background: rgba(199,167,107,0.10);
                color: {theme.TEXT_PRIMARY};
            }}
        """)
        close_all.clicked.connect(self._close_shelf)
        layout.addWidget(close_all)

        self._items: list[DownloadItem] = []

    def add_download(self, download: QWebEngineDownloadRequest):
        """Add a new download to the shelf."""
        item = DownloadItem(download, self)
        item.dismissed.connect(self._on_item_dismissed)

        # Insert before stretch
        self._row.insertWidget(self._row.count() - 1, item)
        self._items.append(item)

        self.setVisible(True)

    def _on_item_dismissed(self, item: DownloadItem):
        if item in self._items:
            self._items.remove(item)
            self._row.removeWidget(item)
            item.deleteLater()

        if not self._items:
            self.setVisible(False)

    def _close_shelf(self):
        self.setVisible(False)
