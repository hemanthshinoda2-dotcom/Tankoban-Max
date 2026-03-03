"""
Chrome-style navigation bar.
"""

from __future__ import annotations

import re

from PySide6.QtCore import Qt, Signal, QEvent, QTimer
from PySide6.QtGui import QPainter, QColor, QPen
from PySide6.QtWidgets import (
    QWidget, QHBoxLayout, QPushButton, QSizePolicy, QMenu,
)

from . import theme
from . import search_engines
from .omnibox import Omnibox
from .data_bridge import DataBridge

_ALLOWED_SCHEMES = {
    "http",
    "https",
    "file",
    "about",
    "view-source",
    "tanko-browser",
}


def _looks_like_url(text: str) -> bool:
    t = str(text or "").strip()
    if not t:
        return False
    if t.startswith("//"):
        return True
    if " " in t:
        return False
    if "." in t:
        return True
    return t.startswith(("localhost", "127.", "[::1]"))


def _fixup_url(text: str) -> str:
    """
    Convert omnibox input to a navigable URL.

    Security hardening:
    - Explicit scheme input is allowed only for a strict scheme list.
    - Unsafe schemes are treated as search text, not as navigation targets.
    """
    t = str(text or "").strip()
    if not t:
        return ""

    m = re.match(r"^([a-zA-Z][a-zA-Z0-9+.-]*):", t)
    if m:
        scheme = m.group(1).lower()
        if scheme in _ALLOWED_SCHEMES:
            return t
        return search_engines.get_search_url(t)

    if t.startswith("//"):
        return "https:" + t

    if _looks_like_url(t):
        return "https://" + t

    return search_engines.get_search_url(t)


class NavBar(QWidget):
    """
    Navigation toolbar.
    """

    navigate_requested = Signal(str)
    back_clicked = Signal()
    forward_clicked = Signal()
    back_history_requested = Signal()
    forward_history_requested = Signal()
    reload_clicked = Signal()
    stop_clicked = Signal()
    home_clicked = Signal()
    library_clicked = Signal()
    new_tab_clicked = Signal()
    history_clicked = Signal()
    settings_clicked = Signal()
    bookmarks_bar_toggled = Signal()
    bookmark_toggled = Signal()
    omnibox_draft_changed = Signal(str)

    def __init__(self, data_bridge: DataBridge | None = None, parent=None):
        super().__init__(parent)
        self.setObjectName("navBar")
        self.setFixedHeight(theme.TOOLBAR_HEIGHT)
        self.setStyleSheet(theme.NAV_BAR_STYLE)

        self._loading = False
        self._nav_long_press_button = None
        self._nav_long_press_fired = False

        layout = QHBoxLayout(self)
        layout.setContentsMargins(8, 4, 8, 4)
        layout.setSpacing(2)

        self._library_btn = _LibraryButton()
        self._library_btn.setToolTip("Back to Library")
        self._library_btn.setCursor(Qt.CursorShape.PointingHandCursor)
        self._library_btn.clicked.connect(self.library_clicked.emit)
        layout.addWidget(self._library_btn)

        layout.addSpacing(4)

        self._back_btn = self._nav_button("\u2190", "Back")
        self._back_btn.setStyleSheet("font-size: 22px;")
        self._back_btn.clicked.connect(self.back_clicked.emit)
        layout.addWidget(self._back_btn)

        self._fwd_btn = self._nav_button("\u2192", "Forward")
        self._fwd_btn.setStyleSheet("font-size: 22px;")
        self._fwd_btn.clicked.connect(self.forward_clicked.emit)
        layout.addWidget(self._fwd_btn)

        self._nav_long_press_timer = QTimer(self)
        self._nav_long_press_timer.setSingleShot(True)
        self._nav_long_press_timer.setInterval(450)
        self._nav_long_press_timer.timeout.connect(self._on_nav_long_press_timeout)
        self._back_btn.installEventFilter(self)
        self._fwd_btn.installEventFilter(self)

        self._reload_btn = self._nav_button("\u27f3", "Reload")
        self._reload_btn.setStyleSheet("font-size: 22px;")
        self._reload_btn.clicked.connect(self._on_reload_stop)
        layout.addWidget(self._reload_btn)

        layout.addSpacing(4)

        self._address = Omnibox(data_bridge=data_bridge)
        self._address.setSizePolicy(QSizePolicy.Policy.Expanding, QSizePolicy.Policy.Fixed)
        self._address.navigate_requested.connect(self._on_omnibox_navigate)
        self._address.draft_changed.connect(self.omnibox_draft_changed.emit)
        layout.addWidget(self._address)

        layout.addSpacing(4)

        self._star_btn = self._nav_button("\u2606", "Bookmark this page (Ctrl+D)")
        self._star_btn.setStyleSheet("font-size: 20px;")
        self._star_btn.clicked.connect(self.bookmark_toggled.emit)
        self._bookmarked = False
        layout.addWidget(self._star_btn)

        self._home_btn = self._nav_button("\u2302", "Home")
        self._home_btn.setStyleSheet("font-size: 22px;")
        self._home_btn.clicked.connect(self.home_clicked.emit)
        layout.addWidget(self._home_btn)

        layout.addSpacing(4)

        self._menu_btn = self._nav_button("\u22ee", "Menu")
        self._menu_btn.setStyleSheet("font-size: 22px;")
        self._menu_btn.clicked.connect(self._show_menu)
        layout.addWidget(self._menu_btn)

    def _nav_button(self, text: str, tooltip: str) -> QPushButton:
        btn = QPushButton(text)
        btn.setToolTip(tooltip)
        btn.setFixedSize(36, 32)
        btn.setCursor(Qt.CursorShape.PointingHandCursor)
        return btn

    def _on_omnibox_navigate(self, text: str):
        url = _fixup_url(text)
        if url:
            self.navigate_requested.emit(url)

    def _on_reload_stop(self):
        if self._loading:
            self.stop_clicked.emit()
        else:
            self.reload_clicked.emit()

    def set_url(self, url: str):
        if not self._address.hasFocus():
            self._address.set_user_text(url)
            self._address.setCursorPosition(0)
        self._address.set_security(True, url)

    def set_loading(self, loading: bool, progress: int = 0):
        self._loading = loading
        self._reload_btn.setText("\u2715" if loading else "\u27f3")
        self._reload_btn.setToolTip("Stop" if loading else "Reload")
        self._address.set_load_progress(loading, progress)

    def set_nav_state(self, can_back: bool, can_forward: bool):
        self._back_btn.setEnabled(can_back)
        self._fwd_btn.setEnabled(can_forward)

    def set_bookmarked(self, bookmarked: bool):
        self._bookmarked = bookmarked
        if bookmarked:
            self._star_btn.setText("\u2605")
            self._star_btn.setToolTip("Remove bookmark (Ctrl+D)")
            self._star_btn.setStyleSheet(f"color: {theme.ACCENT};")
        else:
            self._star_btn.setText("\u2606")
            self._star_btn.setToolTip("Bookmark this page (Ctrl+D)")
            self._star_btn.setStyleSheet("")

    def focus_address_bar(self):
        self._address.setFocus()
        self._address.selectAll()

    def set_omnibox_ghost(self, suffix: str):
        self._address.set_ghost_completion(suffix)

    def get_omnibox_text(self):
        return self._address.text()

    def set_omnibox_text(self, text: str):
        self._address.set_user_text(text)

    def refresh_search_engine_ui(self):
        self._address.refresh_search_placeholder()

    def _show_menu(self):
        menu = QMenu(self)
        menu.setStyleSheet(f"""
            QMenu {{
                background: {theme.BG_POPUP};
                color: {theme.TEXT_PRIMARY};
                border: 1px solid {theme.BORDER_COLOR};
                border-radius: 8px;
                padding: 4px 0;
                font-family: 'Segoe UI', sans-serif;
                font-size: 13px;
            }}
            QMenu::item {{
                padding: 6px 32px 6px 12px;
            }}
            QMenu::item:selected {{
                background: rgba(255,255,255,0.08);
            }}
            QMenu::separator {{
                height: 1px;
                background: {theme.BORDER_COLOR};
                margin: 4px 8px;
            }}
        """)

        menu.addAction("New tab\tCtrl+T", self.new_tab_clicked.emit)
        menu.addSeparator()
        menu.addAction("History\tCtrl+H", self.history_clicked.emit)
        menu.addAction("Downloads\tCtrl+J", lambda: self.navigate_requested.emit("tanko-browser://downloads"))
        menu.addAction("Bookmark manager\tCtrl+Shift+O", lambda: self.navigate_requested.emit("tanko-browser://bookmarks"))
        menu.addAction("Bookmarks bar\tCtrl+Shift+B", self.bookmarks_bar_toggled.emit)
        menu.addSeparator()
        menu.addAction("Settings", self.settings_clicked.emit)

        pos = self._menu_btn.mapToGlobal(self._menu_btn.rect().bottomLeft())
        menu.exec(pos)

    def eventFilter(self, obj, event):
        if obj not in (self._back_btn, self._fwd_btn):
            return super().eventFilter(obj, event)

        et = event.type()
        if et == QEvent.Type.MouseButtonPress and event.button() == Qt.MouseButton.LeftButton:
            self._nav_long_press_button = obj
            self._nav_long_press_fired = False
            self._nav_long_press_timer.start()
        elif et == QEvent.Type.MouseButtonRelease and event.button() == Qt.MouseButton.LeftButton:
            self._nav_long_press_timer.stop()
            if self._nav_long_press_fired:
                self._nav_long_press_fired = False
                self._nav_long_press_button = None
                return True
            self._nav_long_press_button = None
        elif et == QEvent.Type.Leave:
            self._nav_long_press_timer.stop()
            self._nav_long_press_button = None
            self._nav_long_press_fired = False
        elif et == QEvent.Type.ContextMenu:
            self._nav_long_press_timer.stop()
            self._emit_history_for_button(obj)
            self._nav_long_press_button = None
            self._nav_long_press_fired = False
            return True

        return super().eventFilter(obj, event)

    def _on_nav_long_press_timeout(self):
        btn = self._nav_long_press_button
        if not btn:
            return
        self._nav_long_press_fired = True
        self._emit_history_for_button(btn)

    def _emit_history_for_button(self, btn):
        if btn is self._back_btn:
            self.back_history_requested.emit()
        elif btn is self._fwd_btn:
            self.forward_history_requested.emit()


class _LibraryButton(QPushButton):
    """
    Custom-painted library icon button.
    """

    def __init__(self, parent=None):
        super().__init__(parent)
        self.setFixedSize(36, 32)
        self._hovered = False
        self.setMouseTracking(True)

    def paintEvent(self, event):
        p = QPainter(self)
        p.setRenderHint(QPainter.RenderHint.Antialiasing)
        w, h = self.width(), self.height()

        p.setPen(Qt.PenStyle.NoPen)
        if self._hovered:
            p.setBrush(QColor("rgba(255,255,255,0.08)"))
        else:
            p.setBrush(QColor("transparent"))
        p.drawRoundedRect(0, 0, w, h, 6, 6)

        color = QColor(theme.TEXT_PRIMARY if self._hovered else theme.TEXT_SECONDARY)
        pen = QPen(color, 1.8)
        pen.setCapStyle(Qt.PenCapStyle.RoundCap)
        p.setPen(pen)
        p.setBrush(Qt.BrushStyle.NoBrush)

        cx = w // 2
        base_y = 7
        book_h = 17
        shelf_y = base_y + book_h

        p.drawRect(cx - 9, base_y, 5, book_h)
        p.drawRect(cx - 3, base_y - 1, 5, book_h + 1)
        p.drawRect(cx + 3, base_y + 1, 5, book_h - 1)
        p.drawLine(cx - 11, shelf_y, cx + 10, shelf_y)

        p.end()

    def enterEvent(self, event):
        self._hovered = True
        self.update()

    def leaveEvent(self, event):
        self._hovered = False
        self.update()
