"""
Chrome-style navigation bar.

Contains:
  - Back / Forward / Reload-Stop buttons
  - Address bar (QLineEdit, combined URL + search)
  - Home button
  - Window controls (minimize, maximize, close) — right side
"""

from __future__ import annotations

from PySide6.QtCore import Qt, Signal, QUrl
from PySide6.QtGui import QPainter, QColor, QPen
from PySide6.QtWidgets import (
    QWidget, QHBoxLayout, QLineEdit, QPushButton, QSizePolicy, QMenu,
)

from . import theme
from .omnibox import Omnibox
from .data_bridge import DataBridge

# ---------------------------------------------------------------------------
# URL helpers
# ---------------------------------------------------------------------------

DEFAULT_SEARCH_URL = "https://www.google.com/search?q={}"


def _fixup_url(text: str) -> str:
    """
    Convert address bar input to a navigable URL.
    - If it looks like a URL (has dot + no spaces), add https://
    - Otherwise, treat as a search query
    """
    t = text.strip()
    if not t:
        return ""

    # Already a full URL
    if t.startswith(("http://", "https://", "file://", "tanko-browser://")):
        return t

    # Looks like a domain (has dot, no spaces)
    if "." in t and " " not in t:
        return "https://" + t

    # Search query
    return DEFAULT_SEARCH_URL.format(QUrl.toPercentEncoding(t).data().decode())


# ---------------------------------------------------------------------------
# NavBar
# ---------------------------------------------------------------------------

class NavBar(QWidget):
    """
    Navigation toolbar: reload/stop + address bar + home + menu + library button.

    Window controls (min/max/close) live in the TabBar now.

    Signals:
        navigate_requested(str): URL or search to navigate to.
        back_clicked()
        forward_clicked()
        reload_clicked()
        stop_clicked()
        home_clicked()
        library_clicked()
        new_tab_clicked()
        history_clicked()
        settings_clicked()
        bookmarks_bar_toggled()
    """

    navigate_requested = Signal(str)
    back_clicked = Signal()
    forward_clicked = Signal()
    reload_clicked = Signal()
    stop_clicked = Signal()
    home_clicked = Signal()
    library_clicked = Signal()
    new_tab_clicked = Signal()
    history_clicked = Signal()
    settings_clicked = Signal()
    bookmarks_bar_toggled = Signal()
    bookmark_toggled = Signal()  # toggle bookmark on current page

    def __init__(self, data_bridge: DataBridge | None = None, parent=None):
        super().__init__(parent)
        self.setObjectName("navBar")
        self.setFixedHeight(theme.TOOLBAR_HEIGHT)
        self.setStyleSheet(theme.NAV_BAR_STYLE)

        self._loading = False

        layout = QHBoxLayout(self)
        layout.setContentsMargins(8, 4, 8, 4)
        layout.setSpacing(2)

        # -- Library button (leftmost, before back/forward) --
        self._library_btn = _LibraryButton()
        self._library_btn.setToolTip("Back to Library")
        self._library_btn.setCursor(Qt.CursorShape.PointingHandCursor)
        self._library_btn.clicked.connect(self.library_clicked.emit)
        layout.addWidget(self._library_btn)

        layout.addSpacing(4)

        # -- Back / Forward --
        self._back_btn = self._nav_button("\u2190", "Back")  # ←
        self._back_btn.setStyleSheet("font-size: 22px;")
        self._back_btn.clicked.connect(self.back_clicked.emit)
        layout.addWidget(self._back_btn)

        self._fwd_btn = self._nav_button("\u2192", "Forward")  # →
        self._fwd_btn.setStyleSheet("font-size: 22px;")
        self._fwd_btn.clicked.connect(self.forward_clicked.emit)
        layout.addWidget(self._fwd_btn)

        # -- Reload / Stop --
        self._reload_btn = self._nav_button("\u27f3", "Reload")  # ⟳
        self._reload_btn.setStyleSheet("font-size: 22px;")
        self._reload_btn.clicked.connect(self._on_reload_stop)
        layout.addWidget(self._reload_btn)

        layout.addSpacing(4)

        # -- Omnibox (address bar with autocomplete) --
        self._address = Omnibox(data_bridge=data_bridge)
        self._address.setSizePolicy(QSizePolicy.Policy.Expanding, QSizePolicy.Policy.Fixed)
        self._address.navigate_requested.connect(self._on_omnibox_navigate)
        layout.addWidget(self._address)

        layout.addSpacing(4)

        # -- Bookmark star --
        self._star_btn = self._nav_button("\u2606", "Bookmark this page (Ctrl+D)")  # ☆
        self._star_btn.setStyleSheet("font-size: 20px;")
        self._star_btn.clicked.connect(self.bookmark_toggled.emit)
        self._bookmarked = False
        layout.addWidget(self._star_btn)

        # -- Home button --
        self._home_btn = self._nav_button("\u2302", "Home")  # ⌂
        self._home_btn.setStyleSheet("font-size: 22px;")
        self._home_btn.clicked.connect(self.home_clicked.emit)
        layout.addWidget(self._home_btn)

        layout.addSpacing(4)

        # -- Three-dot menu --
        self._menu_btn = self._nav_button("\u22ee", "Menu")  # ⋮
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

    # -- Public state setters --

    def set_url(self, url: str):
        """Update the address bar text."""
        if not self._address.hasFocus():
            self._address.setText(url)

    def set_loading(self, loading: bool):
        """Toggle reload/stop button icon."""
        self._loading = loading
        self._reload_btn.setText("\u2715" if loading else "\u27f3")  # ✕ or ⟳
        self._reload_btn.setToolTip("Stop" if loading else "Reload")

    def set_nav_state(self, can_back: bool, can_forward: bool):
        """Enable/disable back/forward buttons."""
        self._back_btn.setEnabled(can_back)
        self._fwd_btn.setEnabled(can_forward)

    def set_bookmarked(self, bookmarked: bool):
        """Update the star icon to filled/unfilled."""
        self._bookmarked = bookmarked
        if bookmarked:
            self._star_btn.setText("\u2605")  # ★ filled
            self._star_btn.setToolTip("Remove bookmark (Ctrl+D)")
            self._star_btn.setStyleSheet(f"color: {theme.ACCENT};")
        else:
            self._star_btn.setText("\u2606")  # ☆ outline
            self._star_btn.setToolTip("Bookmark this page (Ctrl+D)")
            self._star_btn.setStyleSheet("")

    def focus_address_bar(self):
        """Focus and select all text in the address bar (Ctrl+L behavior)."""
        self._address.setFocus()
        self._address.selectAll()

    def _show_menu(self):
        """Show three-dot dropdown menu."""
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
        menu.addAction("Bookmarks bar\tCtrl+Shift+B", self.bookmarks_bar_toggled.emit)
        menu.addSeparator()
        menu.addAction("Settings", self.settings_clicked.emit)

        # Show below the menu button
        pos = self._menu_btn.mapToGlobal(self._menu_btn.rect().bottomLeft())
        menu.exec(pos)


# ---------------------------------------------------------------------------
# Library icon button (painted, not emoji)
# ---------------------------------------------------------------------------

class _LibraryButton(QPushButton):
    """
    Custom-painted library icon button — three book spines with a shelf line.
    Clicking navigates back to the main Tankoban library.
    Uses gold accent color to be clearly visible.
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

        # Background — subtle on hover
        p.setPen(Qt.PenStyle.NoPen)
        if self._hovered:
            p.setBrush(QColor("rgba(255,255,255,0.08)"))
        else:
            p.setBrush(QColor("transparent"))
        p.drawRoundedRect(0, 0, w, h, 6, 6)

        # Icon color
        color = QColor(theme.TEXT_PRIMARY if self._hovered else theme.TEXT_SECONDARY)
        pen = QPen(color, 1.8)
        pen.setCapStyle(Qt.PenCapStyle.RoundCap)
        p.setPen(pen)
        p.setBrush(Qt.BrushStyle.NoBrush)

        # Draw three book spines (vertical rectangles), centered in 36px
        cx = w // 2  # 18
        base_y = 7
        book_h = 17
        shelf_y = base_y + book_h

        # Book 1 (left)
        p.drawRect(cx - 9, base_y, 5, book_h)
        # Book 2 (center, taller)
        p.drawRect(cx - 3, base_y - 1, 5, book_h + 1)
        # Book 3 (right)
        p.drawRect(cx + 3, base_y + 1, 5, book_h - 1)

        # Shelf line
        p.drawLine(cx - 11, shelf_y, cx + 10, shelf_y)

        p.end()

    def enterEvent(self, event):
        self._hovered = True
        self.update()

    def leaveEvent(self, event):
        self._hovered = False
        self.update()
