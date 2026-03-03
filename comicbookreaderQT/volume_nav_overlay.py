"""
Volume Navigator overlay for the comic reader.

Shows sibling volumes in the same directory with progress info,
time-ago stamps, search filtering, and keyboard navigation.
Matches the Electron reader's volume_nav_overlay.js.
"""

from __future__ import annotations

import os
import time

from PySide6.QtCore import Qt, Signal, QTimer
from PySide6.QtGui import QColor, QPainter
from PySide6.QtWidgets import (
    QHBoxLayout,
    QLabel,
    QLineEdit,
    QPushButton,
    QScrollArea,
    QVBoxLayout,
    QWidget,
)


# ── helpers ─────────────────────────────────────────────────────

def _format_time_ago(ts) -> str:
    """Format a timestamp (epoch seconds) as a human-friendly time-ago string."""
    if not ts:
        return ""
    try:
        diff = time.time() - float(ts)
    except (TypeError, ValueError):
        return ""
    if diff < 0 or not isinstance(diff, (int, float)):
        return ""
    if diff < 45:
        return "just now"
    minutes = int(diff / 60)
    if minutes < 60:
        return f"{minutes} minute{'s' if minutes != 1 else ''} ago"
    hours = int(diff / 3600)
    if hours < 24:
        return f"{hours} hour{'s' if hours != 1 else ''} ago"
    days = int(diff / 86400)
    return f"{days} day{'s' if days != 1 else ''} ago"


def _matches_query(name: str, query: str) -> bool:
    """Check if a volume name matches a search query."""
    if not query:
        return True
    q = query.lower().strip()
    n = name.lower()
    if q in n:
        return True
    # Extract numbers from query and check if they appear in name
    import re
    nums = re.findall(r"\d+", q)
    for num in nums:
        if num in n:
            return True
    return False


_OVERLAY_SS = """
QWidget#volNavCard {
  background: rgba(24, 24, 24, 240);
  border: 1px solid rgba(255, 255, 255, 50);
  border-radius: 14px;
}
QLabel#volNavTitle {
  color: #ffffff;
  font-size: 16px;
  font-weight: 700;
}
QPushButton#volNavClose {
  color: #b8b8b8;
  background: rgba(255, 255, 255, 14);
  border: 1px solid rgba(255, 255, 255, 30);
  border-radius: 8px;
  padding: 4px 12px;
  font-size: 12px;
}
QPushButton#volNavClose:hover {
  background: rgba(255, 255, 255, 28);
}
QLineEdit#volNavSearch {
  color: #ffffff;
  background: rgba(255, 255, 255, 14);
  border: 1px solid rgba(255, 255, 255, 30);
  border-radius: 8px;
  padding: 6px 12px;
  font-size: 13px;
  selection-background-color: rgba(199, 167, 107, 120);
}
QLineEdit#volNavSearch::placeholder {
  color: rgba(255, 255, 255, 80);
}
QScrollArea {
  background: transparent;
  border: none;
}
QWidget#volNavListInner {
  background: transparent;
}
QLabel#volNavHint {
  color: rgba(255, 255, 255, 80);
  font-size: 11px;
}
"""

_ITEM_SS = """
QPushButton.volNavItem {
  color: #ffffff;
  background: transparent;
  border: none;
  border-bottom: 1px solid rgba(255, 255, 255, 12);
  padding: 10px 14px;
  font-size: 13px;
  text-align: left;
}
QPushButton.volNavItem:hover {
  background: rgba(255, 255, 255, 18);
}
QPushButton.volNavItem:focus {
  background: rgba(255, 255, 255, 28);
  outline: none;
}
QPushButton.volNavItemCurrent {
  color: #ffffff;
  background: rgba(199, 167, 107, 40);
  border: none;
  border-bottom: 1px solid rgba(255, 255, 255, 12);
  border-left: 3px solid rgba(199, 167, 107, 200);
  padding: 10px 14px;
  font-size: 13px;
  text-align: left;
}
QPushButton.volNavItemCurrent:hover {
  background: rgba(199, 167, 107, 60);
}
QPushButton.volNavItemCurrent:focus {
  background: rgba(199, 167, 107, 70);
  outline: none;
}
"""


class VolumeNavOverlay(QWidget):
    volume_selected = Signal(str)  # path of selected volume

    def __init__(self, parent=None):
        super().__init__(parent)
        self.setVisible(False)
        self.setAttribute(Qt.WidgetAttribute.WA_TranslucentBackground, True)
        self.setFocusPolicy(Qt.FocusPolicy.StrongFocus)

        self._reader = parent
        self._books: list[dict] = []  # [{path, name, is_current, progress_page, time_ago}]
        self._filtered: list[dict] = []
        self._sel: int = 0
        self._item_widgets: list[QPushButton] = []

        # ── card ──────────────────────────────────────────────
        self._card = QWidget(self)
        self._card.setObjectName("volNavCard")
        self._card.setFixedWidth(460)
        self._card.setStyleSheet(_OVERLAY_SS + _ITEM_SS)

        card_layout = QVBoxLayout(self._card)
        card_layout.setContentsMargins(16, 16, 16, 12)
        card_layout.setSpacing(10)

        # top row
        top = QHBoxLayout()
        self._title = QLabel("Volumes", self._card)
        self._title.setObjectName("volNavTitle")
        top.addWidget(self._title, 1)

        self._close_btn = QPushButton("Close", self._card)
        self._close_btn.setObjectName("volNavClose")
        self._close_btn.clicked.connect(self.close)
        top.addWidget(self._close_btn, 0)
        card_layout.addLayout(top)

        # search
        self._search = QLineEdit(self._card)
        self._search.setObjectName("volNavSearch")
        self._search.setPlaceholderText("Search volumes (try: vol 12)")
        self._search.textChanged.connect(self._on_search_changed)
        card_layout.addWidget(self._search)

        # list
        self._scroll = QScrollArea(self._card)
        self._scroll.setWidgetResizable(True)
        self._scroll.setHorizontalScrollBarPolicy(Qt.ScrollBarPolicy.ScrollBarAlwaysOff)
        self._scroll.setVerticalScrollBarPolicy(Qt.ScrollBarPolicy.ScrollBarAsNeeded)

        self._list_inner = QWidget()
        self._list_inner.setObjectName("volNavListInner")
        self._list_layout = QVBoxLayout(self._list_inner)
        self._list_layout.setContentsMargins(0, 0, 0, 0)
        self._list_layout.setSpacing(0)
        self._scroll.setWidget(self._list_inner)
        card_layout.addWidget(self._scroll, 1)

        # hint
        hint = QLabel("Enter: open \u00B7 Esc: close", self._card)
        hint.setObjectName("volNavHint")
        hint.setAlignment(Qt.AlignmentFlag.AlignCenter)
        card_layout.addWidget(hint)

    # ── public API ────────────────────────────────────────────

    def open(self, books: list[dict] | None = None):
        self._books = list(books or [])
        self._search.clear()
        self._filter_and_render()

        # Default selection to current volume
        for i, b in enumerate(self._filtered):
            if b.get("is_current"):
                self._sel = i
                break
        else:
            self._sel = 0

        self.setVisible(True)
        self.raise_()
        self._position_card()
        self._search.setFocus()
        self._update_selection()

    def close(self):
        self.setVisible(False)

    def is_open(self) -> bool:
        return self.isVisible()

    # ── paint backdrop ────────────────────────────────────────

    def paintEvent(self, event):
        painter = QPainter(self)
        painter.fillRect(self.rect(), QColor(0, 0, 0, 100))
        painter.end()

    def resizeEvent(self, event):
        super().resizeEvent(event)
        self._position_card()

    def _position_card(self):
        cw = self._card.width()
        max_h = max(200, self.height() - 60)
        self._card.setMaximumHeight(max_h)
        ch = min(self._card.sizeHint().height(), max_h)
        self._card.setFixedHeight(ch)
        x = (self.width() - cw) // 2
        y = (self.height() - ch) // 2
        self._card.move(max(0, x), max(0, y))

    # ── keyboard ──────────────────────────────────────────────

    def keyPressEvent(self, event):
        key = event.key()
        if key == Qt.Key.Key_Escape:
            self.close()
            return
        if key == Qt.Key.Key_Down:
            self._move_selection(1)
            return
        if key == Qt.Key.Key_Up:
            self._move_selection(-1)
            return
        if key in (Qt.Key.Key_Return, Qt.Key.Key_Enter):
            self._select_current()
            return
        # Let search field handle other keys
        if not self._search.hasFocus():
            self._search.setFocus()
        super().keyPressEvent(event)

    def mousePressEvent(self, event):
        child = self.childAt(event.position().toPoint())
        if child is None:
            self.close()
            return
        super().mousePressEvent(event)

    # ── search ────────────────────────────────────────────────

    def _on_search_changed(self, text: str):
        self._filter_and_render()
        self._sel = 0
        self._update_selection()

    def _filter_and_render(self):
        query = self._search.text().strip()
        self._filtered = [b for b in self._books if _matches_query(b.get("name", ""), query)]

        count = len(self._filtered)
        total = len(self._books)
        if query:
            self._title.setText(f"Volumes ({count}/{total})")
        else:
            self._title.setText(f"Volumes ({total})")

        self._render_list()

    def _render_list(self):
        # clear
        layout = self._list_layout
        while layout.count():
            item = layout.takeAt(0)
            w = item.widget()
            if w:
                w.deleteLater()
        self._item_widgets.clear()

        for i, book in enumerate(self._filtered):
            btn = QPushButton(self._list_inner)
            is_cur = bool(book.get("is_current"))
            btn.setProperty("class", "volNavItemCurrent" if is_cur else "volNavItem")
            btn.setCursor(Qt.CursorShape.PointingHandCursor)
            btn.setFocusPolicy(Qt.FocusPolicy.StrongFocus)

            name = book.get("name", "?")
            parts = [name]

            prog_page = book.get("progress_page")
            if prog_page is not None:
                parts.append(f"  \u00B7  Continue \u00B7 page {int(prog_page) + 1}")

            badge = ""
            if is_cur:
                badge = "  [Current]"
            else:
                ta = book.get("time_ago", "")
                if ta:
                    badge = f"  [Last read {ta}]"

            btn.setText("".join(parts) + badge)
            btn.clicked.connect(lambda _checked=False, idx=i: self._on_item_clicked(idx))
            layout.addWidget(btn)
            self._item_widgets.append(btn)

        layout.addStretch(1)

    # ── selection ─────────────────────────────────────────────

    def _move_selection(self, delta: int):
        if not self._filtered:
            return
        self._sel = max(0, min(len(self._filtered) - 1, self._sel + delta))
        self._update_selection()

    def _update_selection(self):
        for i, btn in enumerate(self._item_widgets):
            if i == self._sel:
                btn.setFocus()
                btn.ensurePolished()
                # scroll into view
                self._scroll.ensureWidgetVisible(btn)

    def _on_item_clicked(self, idx: int):
        self._sel = idx
        self._select_current()

    def _select_current(self):
        if not self._filtered or self._sel >= len(self._filtered):
            return
        book = self._filtered[self._sel]
        path = book.get("path", "")
        if book.get("is_current"):
            self.close()
            return
        if path:
            self.close()
            self.volume_selected.emit(path)
