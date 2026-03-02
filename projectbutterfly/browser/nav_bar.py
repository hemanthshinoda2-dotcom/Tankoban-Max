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
from PySide6.QtWidgets import (
    QWidget, QHBoxLayout, QLineEdit, QPushButton, QSizePolicy,
)

from . import theme

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
    Navigation toolbar with back/forward/reload, address bar, and window controls.

    Signals:
        navigate_requested(str): URL or search to navigate to.
        back_clicked()
        forward_clicked()
        reload_clicked()
        stop_clicked()
        home_clicked()
        minimize_clicked()
        maximize_clicked()
        close_clicked()
    """

    navigate_requested = Signal(str)
    back_clicked = Signal()
    forward_clicked = Signal()
    reload_clicked = Signal()
    stop_clicked = Signal()
    home_clicked = Signal()
    minimize_clicked = Signal()
    maximize_clicked = Signal()
    close_clicked = Signal()

    def __init__(self, parent=None):
        super().__init__(parent)
        self.setObjectName("navBar")
        self.setFixedHeight(theme.TOOLBAR_HEIGHT)
        self.setStyleSheet(theme.NAV_BAR_STYLE)

        self._loading = False

        layout = QHBoxLayout(self)
        layout.setContentsMargins(8, 4, 8, 4)
        layout.setSpacing(2)

        # -- Navigation buttons --
        self._back_btn = self._nav_button("\u2190", "Back")  # ←
        self._back_btn.clicked.connect(self.back_clicked.emit)
        layout.addWidget(self._back_btn)

        self._fwd_btn = self._nav_button("\u2192", "Forward")  # →
        self._fwd_btn.clicked.connect(self.forward_clicked.emit)
        layout.addWidget(self._fwd_btn)

        self._reload_btn = self._nav_button("\u27f3", "Reload")  # ⟳
        self._reload_btn.clicked.connect(self._on_reload_stop)
        layout.addWidget(self._reload_btn)

        layout.addSpacing(4)

        # -- Address bar --
        self._address = QLineEdit()
        self._address.setObjectName("addressBar")
        self._address.setPlaceholderText("Search Google or type a URL")
        self._address.setSizePolicy(QSizePolicy.Policy.Expanding, QSizePolicy.Policy.Fixed)
        self._address.setFixedHeight(30)
        self._address.returnPressed.connect(self._on_address_submit)
        layout.addWidget(self._address)

        layout.addSpacing(4)

        # -- Home button --
        self._home_btn = self._nav_button("\u2302", "Home")  # ⌂
        self._home_btn.clicked.connect(self.home_clicked.emit)
        layout.addWidget(self._home_btn)

        layout.addSpacing(12)

        # -- Window controls --
        self._min_btn = self._window_button("\u2014", "Minimize")  # —
        self._min_btn.clicked.connect(self.minimize_clicked.emit)
        layout.addWidget(self._min_btn)

        self._max_btn = self._window_button("\u25a1", "Maximize")  # □
        self._max_btn.clicked.connect(self.maximize_clicked.emit)
        layout.addWidget(self._max_btn)

        self._close_btn = self._window_button("\u2715", "Close")  # ✕
        self._close_btn.setStyleSheet(f"""
            QPushButton {{
                background: transparent;
                color: {theme.TEXT_PRIMARY};
                border: none;
                border-radius: 4px;
                padding: 4px 8px;
                font-size: 14px;
            }}
            QPushButton:hover {{
                background: {theme.CLOSE_HOVER};
                color: white;
            }}
        """)
        self._close_btn.clicked.connect(self.close_clicked.emit)
        layout.addWidget(self._close_btn)

    def _nav_button(self, text: str, tooltip: str) -> QPushButton:
        btn = QPushButton(text)
        btn.setToolTip(tooltip)
        btn.setFixedSize(32, 32)
        btn.setCursor(Qt.CursorShape.PointingHandCursor)
        return btn

    def _window_button(self, text: str, tooltip: str) -> QPushButton:
        btn = QPushButton(text)
        btn.setToolTip(tooltip)
        btn.setFixedSize(32, 32)
        btn.setCursor(Qt.CursorShape.PointingHandCursor)
        return btn

    def _on_address_submit(self):
        url = _fixup_url(self._address.text())
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

    def focus_address_bar(self):
        """Focus and select all text in the address bar (Ctrl+L behavior)."""
        self._address.setFocus()
        self._address.selectAll()
