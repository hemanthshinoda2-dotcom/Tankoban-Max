"""
Omnibox - Chrome-style address/search bar with autocomplete dropdown.
"""

from __future__ import annotations

from PySide6.QtCore import Qt, Signal, QTimer, QPoint
from PySide6.QtGui import QFont, QFontMetrics, QColor, QPainter, QKeyEvent
from PySide6.QtWidgets import (
    QLineEdit, QWidget, QVBoxLayout,
)

from . import theme
from . import search_engines
from .data_bridge import DataBridge


class _CompletionItem(QWidget):
    """Single row in the completion popup."""

    clicked = Signal(str)

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

        if self._selected:
            p.fillRect(0, 0, w, h, QColor("rgba(255,255,255,0.12)"))
        elif self._hovered:
            p.fillRect(0, 0, w, h, QColor("rgba(255,255,255,0.06)"))

        kind = str(self._data.get("type", "history"))
        is_bookmark = kind == "bookmark"
        is_search = kind == "search"
        if is_bookmark:
            indicator = "\u2605"
            ind_color = QColor(theme.ACCENT)
        elif is_search:
            indicator = "\u2315"
            ind_color = QColor(theme.TEXT_SECONDARY)
        else:
            indicator = "\u29be"
            ind_color = QColor(theme.TEXT_SECONDARY)

        p.setPen(ind_color)
        p.setFont(QFont("Segoe UI", 10))
        p.drawText(12, 24, indicator)

        title = self._data.get("title", "")
        url = self._data.get("url", "")
        title_font = QFont("Segoe UI", 10)
        url_font = QFont("Segoe UI", 9)

        x = 32
        avail = w - x - 12

        p.setPen(QColor(theme.TEXT_PRIMARY))
        p.setFont(title_font)
        fm = QFontMetrics(title_font)
        elided_title = fm.elidedText(title, Qt.TextElideMode.ElideRight, avail // 2)
        p.drawText(x, 16, elided_title)
        title_w = fm.horizontalAdvance(elided_title)

        if url:
            p.setPen(QColor(theme.TEXT_SECONDARY))
            p.setFont(url_font)
            fm2 = QFontMetrics(url_font)
            display_url = url.replace("https://", "").replace("http://", "").rstrip("/")
            remaining = avail - title_w - 16
            if remaining > 40:
                elided_url = fm2.elidedText(" - " + display_url, Qt.TextElideMode.ElideRight, remaining)
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

    item_selected = Signal(str)

    def __init__(self, parent=None):
        super().__init__(parent, Qt.WindowType.ToolTip | Qt.WindowType.FramelessWindowHint)
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
        for item in self._items:
            self._layout.removeWidget(item)
            item.deleteLater()
        self._items.clear()
        self._selected_idx = -1

        for data in completions:
            item = _CompletionItem(data, self)
            item.clicked.connect(self.item_selected.emit)
            self._layout.addWidget(item)
            self._items.append(item)

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

    def current_items(self):
        return self._items

    def _update_selection(self):
        for i, item in enumerate(self._items):
            item.selected = i == self._selected_idx


class Omnibox(QLineEdit):
    """
    Chrome-style omnibox with autocomplete.
    """

    navigate_requested = Signal(str)
    draft_changed = Signal(str)

    def __init__(self, data_bridge: DataBridge | None = None, parent=None):
        super().__init__(parent)
        self._data_bridge = data_bridge
        self._popup = _CompletionPopup()
        self._popup.item_selected.connect(self._on_popup_selected)
        self._debounce_timer = QTimer(self)
        self._debounce_timer.setSingleShot(True)
        self._debounce_timer.setInterval(150)
        self._debounce_timer.timeout.connect(self._update_completions)

        self._security = "none"
        self._load_progress = 0
        self._is_loading = False
        self._ghost_suffix = ""
        self._suppress_text_signal = False

        self.setObjectName("addressBar")
        self.refresh_search_placeholder()
        self.setFixedHeight(30)
        self.setTextMargins(22, 0, 0, 0)

        self.textChanged.connect(self._on_text_changed)
        self.returnPressed.connect(self._on_submit)

    def set_data_bridge(self, bridge: DataBridge):
        self._data_bridge = bridge

    def refresh_search_placeholder(self):
        self.setPlaceholderText(f"Search {search_engines.get_engine_name()} or type a URL")

    def set_user_text(self, text: str):
        self._suppress_text_signal = True
        try:
            self.setText(str(text or ""))
        finally:
            self._suppress_text_signal = False

    def set_ghost_completion(self, suffix: str):
        self._ghost_suffix = str(suffix or "")
        self.update()

    def _on_text_changed(self, text: str):
        if not self._suppress_text_signal:
            self.draft_changed.emit(str(text or ""))
        self._ghost_suffix = ""
        if self.hasFocus() and text.strip():
            self._debounce_timer.start()
        else:
            self._popup.hide()
            self.update()

    def _update_completions(self):
        text = self.text().strip()
        if not text or not self._data_bridge:
            self._popup.hide()
            self._ghost_suffix = ""
            self.update()
            return

        completions = self._data_bridge.search_completions(text, limit=6)
        if not completions:
            self._popup.hide()
            self._ghost_suffix = ""
            self.update()
            return

        self._popup.set_items(completions)
        pos = self.mapToGlobal(QPoint(0, self.height()))
        self._popup.move(pos)
        self._popup.setFixedWidth(self.width())
        self._popup.show()

        ghost = ""
        text_lower = text.lower()
        if " " not in text and len(text) > 0:
            for item in completions:
                candidate = str(item.get("url", "") or "")
                if not candidate:
                    continue
                if candidate.lower().startswith(text_lower) and len(candidate) > len(text):
                    ghost = candidate[len(text):]
                    break
        self._ghost_suffix = ghost
        self.update()

    def _on_submit(self):
        self._popup.hide()
        selected_url = self._popup.selected_url()
        if selected_url:
            self.navigate_requested.emit(selected_url)
            return
        text = self.text().strip()
        if text:
            self.navigate_requested.emit(text)

    def _on_popup_selected(self, url: str):
        self._popup.hide()
        self.set_user_text(url)
        self.navigate_requested.emit(url)

    def keyPressEvent(self, event: QKeyEvent):
        if self._popup.isVisible():
            if event.key() == Qt.Key.Key_Down:
                self._popup.select_next()
                return
            if event.key() == Qt.Key.Key_Up:
                self._popup.select_prev()
                return
            if event.key() == Qt.Key.Key_Escape:
                self._popup.hide()
                self._ghost_suffix = ""
                self.update()
                return

        if self._ghost_suffix and event.key() in (Qt.Key.Key_Tab, Qt.Key.Key_Right):
            self.set_user_text(self.text() + self._ghost_suffix)
            self.setCursorPosition(len(self.text()))
            self._ghost_suffix = ""
            self.update()
            return

        super().keyPressEvent(event)

    def focusInEvent(self, event):
        super().focusInEvent(event)
        QTimer.singleShot(0, self.selectAll)

    def focusOutEvent(self, event):
        QTimer.singleShot(200, self._popup.hide)
        self._ghost_suffix = ""
        super().focusOutEvent(event)

    def set_security(self, secure: bool, url: str = ""):
        if not url or url.startswith("file://") or url.startswith("tanko-browser://"):
            self._security = "none"
        elif url.startswith("https://"):
            self._security = "secure"
        elif url.startswith("http://"):
            self._security = "insecure"
        else:
            self._security = "none"
        self.update()

    def set_load_progress(self, loading: bool, progress: int = 0):
        self._is_loading = loading
        self._load_progress = progress
        self.update()

    def paintEvent(self, event):
        super().paintEvent(event)
        p = QPainter(self)
        p.setRenderHint(QPainter.RenderHint.Antialiasing)
        h = self.height()

        if self._security == "secure":
            p.setPen(QColor(theme.TEXT_URL_SECURE))
            p.setFont(QFont("Segoe UI", 11))
            p.drawText(8, (h + 11) // 2, "\U0001f512")
        elif self._security == "insecure":
            p.setPen(QColor(theme.TEXT_SECONDARY))
            p.setFont(QFont("Segoe UI", 10))
            p.drawText(8, (h + 10) // 2, "\u24d8")

        if self.hasFocus() and self._ghost_suffix:
            fm = QFontMetrics(self.font())
            margins = self.textMargins()
            baseline = (h + fm.ascent() - fm.descent()) // 2
            prefix_w = fm.horizontalAdvance(self.text())
            x = margins.left() + 4 + prefix_w
            max_w = max(0, self.width() - x - 8)
            if max_w > 0:
                p.setPen(QColor("#7a7f86"))
                ghost = fm.elidedText(self._ghost_suffix, Qt.TextElideMode.ElideRight, max_w)
                p.drawText(x, baseline, ghost)

        if self._is_loading and self._load_progress > 0:
            bar_w = int((self.width() - 4) * self._load_progress / 100)
            p.setPen(Qt.PenStyle.NoPen)
            p.setBrush(QColor(theme.ACCENT))
            p.drawRect(2, h - 2, bar_w, 2)

        p.end()
