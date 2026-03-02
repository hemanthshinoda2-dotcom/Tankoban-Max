"""
Omnibox — Chrome-style address/search bar with autocomplete dropdown.

Features:
  - On focus: select all text, show full URL
  - On typing: show completion popup with history/bookmark matches
  - On Enter: navigate (URL-like) or search (query)
  - On Escape: close popup, defocus
  - Arrow keys navigate the popup
"""

from __future__ import annotations

from PySide6.QtCore import Qt, Signal, QTimer, QPoint
from PySide6.QtGui import QFont, QFontMetrics, QColor, QPainter, QKeyEvent
from PySide6.QtWidgets import (
    QLineEdit, QWidget, QVBoxLayout, QLabel, QSizePolicy,
)

from . import theme
from .data_bridge import DataBridge


class _CompletionItem(QWidget):
    """Single row in the completion popup."""

    clicked = Signal(str)  # url

    def __init__(self, data: dict, parent=None):
        super().__init__(parent)
        self._data = data
        self._hovered = False
        self._selected = False
        self.setFixedHeight(36)
        self.setMouseTracking(True)
        self.setCursor(Qt.CursorShape.PointingHandCursor)

    @property
    def url(self) -> str:
        return self._data.get("url", "")

    @property
    def selected(self) -> bool:
        return self._selected

    @selected.setter
    def selected(self, val: bool):
        self._selected = val
        self.update()

    def paintEvent(self, event):
        p = QPainter(self)
        p.setRenderHint(QPainter.RenderHint.Antialiasing)
        w, h = self.width(), self.height()

        # Background
        if self._selected:
            p.fillRect(0, 0, w, h, QColor("rgba(255,255,255,0.12)"))
        elif self._hovered:
            p.fillRect(0, 0, w, h, QColor("rgba(255,255,255,0.06)"))

        # Type indicator
        is_bookmark = self._data.get("type") == "bookmark"
        indicator = "\u2605" if is_bookmark else "\u29be"  # ★ or ⦾
        ind_color = QColor(theme.ACCENT) if is_bookmark else QColor(theme.TEXT_SECONDARY)
        p.setPen(ind_color)
        p.setFont(QFont("Segoe UI", 10))
        p.drawText(12, 24, indicator)

        # Title
        title = self._data.get("title", "")
        url = self._data.get("url", "")
        title_font = QFont("Segoe UI", 10)
        url_font = QFont("Segoe UI", 9)

        x = 32
        avail = w - x - 12

        # Title text
        p.setPen(QColor(theme.TEXT_PRIMARY))
        p.setFont(title_font)
        fm = QFontMetrics(title_font)
        elided_title = fm.elidedText(title, Qt.TextElideMode.ElideRight, avail // 2)
        p.drawText(x, 16, elided_title)
        title_w = fm.horizontalAdvance(elided_title)

        # URL (dimmer, after title)
        if url:
            p.setPen(QColor(theme.TEXT_SECONDARY))
            p.setFont(url_font)
            fm2 = QFontMetrics(url_font)
            # Show simplified URL
            display_url = url.replace("https://", "").replace("http://", "").rstrip("/")
            remaining = avail - title_w - 16
            if remaining > 40:
                elided_url = fm2.elidedText(f" — {display_url}", Qt.TextElideMode.ElideRight, remaining)
                p.drawText(x + title_w, 16, elided_url)

        p.end()

    def enterEvent(self, event):
        self._hovered = True
        self.update()

    def leaveEvent(self, event):
        self._hovered = False
        self.update()

    def mousePressEvent(self, event):
        if event.button() == Qt.MouseButton.LeftButton:
            self.clicked.emit(self.url)


class _CompletionPopup(QWidget):
    """Dropdown popup showing completion suggestions."""

    item_selected = Signal(str)  # url

    def __init__(self, parent=None):
        super().__init__(parent, Qt.WindowType.Popup | Qt.WindowType.FramelessWindowHint)
        self.setStyleSheet(f"""
            QWidget {{
                background: {theme.BG_POPUP};
                border: 1px solid {theme.BORDER_COLOR};
                border-radius: 8px;
            }}
        """)

        self._layout = QVBoxLayout(self)
        self._layout.setContentsMargins(4, 4, 4, 4)
        self._layout.setSpacing(0)

        self._items: list[_CompletionItem] = []
        self._selected_idx = -1

    def set_items(self, completions: list[dict]):
        """Replace popup contents with new completions."""
        # Clear old
        for item in self._items:
            self._layout.removeWidget(item)
            item.deleteLater()
        self._items.clear()
        self._selected_idx = -1

        # Add new
        for data in completions:
            item = _CompletionItem(data, self)
            item.clicked.connect(self.item_selected.emit)
            self._layout.addWidget(item)
            self._items.append(item)

        # Resize
        if self._items:
            h = len(self._items) * 36 + 8
            self.setFixedHeight(min(h, 300))
        else:
            self.hide()

    def select_next(self):
        if not self._items:
            return
        self._selected_idx = (self._selected_idx + 1) % len(self._items)
        self._update_selection()

    def select_prev(self):
        if not self._items:
            return
        self._selected_idx = (self._selected_idx - 1) % len(self._items)
        self._update_selection()

    def selected_url(self) -> str:
        if 0 <= self._selected_idx < len(self._items):
            return self._items[self._selected_idx].url
        return ""

    def _update_selection(self):
        for i, item in enumerate(self._items):
            item.selected = (i == self._selected_idx)


class Omnibox(QLineEdit):
    """
    Chrome-style omnibox with autocomplete.

    Signals:
        navigate_requested(str): URL or search query to navigate to.
    """

    navigate_requested = Signal(str)

    def __init__(self, data_bridge: DataBridge | None = None, parent=None):
        super().__init__(parent)
        self._data_bridge = data_bridge
        self._popup = _CompletionPopup()
        self._popup.item_selected.connect(self._on_popup_selected)
        self._debounce_timer = QTimer(self)
        self._debounce_timer.setSingleShot(True)
        self._debounce_timer.setInterval(150)
        self._debounce_timer.timeout.connect(self._update_completions)

        self.setObjectName("addressBar")
        self.setPlaceholderText("Search Google or type a URL")
        self.setFixedHeight(30)

        self.textChanged.connect(self._on_text_changed)
        self.returnPressed.connect(self._on_submit)

    def set_data_bridge(self, bridge: DataBridge):
        self._data_bridge = bridge

    def _on_text_changed(self, text: str):
        if self.hasFocus() and text.strip():
            self._debounce_timer.start()
        else:
            self._popup.hide()

    def _update_completions(self):
        text = self.text().strip()
        if not text or not self._data_bridge:
            self._popup.hide()
            return

        completions = self._data_bridge.search_completions(text, limit=6)
        if not completions:
            self._popup.hide()
            return

        self._popup.set_items(completions)
        # Position popup below the omnibox
        pos = self.mapToGlobal(QPoint(0, self.height()))
        self._popup.move(pos)
        self._popup.setFixedWidth(self.width())
        self._popup.show()

    def _on_submit(self):
        self._popup.hide()
        # If a popup item is selected, use its URL
        selected_url = self._popup.selected_url()
        if selected_url:
            self.navigate_requested.emit(selected_url)
            return
        # Otherwise, use the address bar text
        text = self.text().strip()
        if text:
            self.navigate_requested.emit(text)

    def _on_popup_selected(self, url: str):
        self._popup.hide()
        self.setText(url)
        self.navigate_requested.emit(url)

    def keyPressEvent(self, event: QKeyEvent):
        if self._popup.isVisible():
            if event.key() == Qt.Key.Key_Down:
                self._popup.select_next()
                return
            elif event.key() == Qt.Key.Key_Up:
                self._popup.select_prev()
                return
            elif event.key() == Qt.Key.Key_Escape:
                self._popup.hide()
                return

        super().keyPressEvent(event)

    def focusInEvent(self, event):
        super().focusInEvent(event)
        QTimer.singleShot(0, self.selectAll)

    def focusOutEvent(self, event):
        # Delay hiding so click on popup registers
        QTimer.singleShot(200, self._popup.hide)
        super().focusOutEvent(event)
