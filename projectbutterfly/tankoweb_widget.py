"""
TankoWeb Widget — Qt-native Web mode panel.

A pure-Qt widget that sits at stack index 2 in the QStackedWidget.
Provides its own top bar (back button, window controls) since
the HTML topbar is hidden when this widget is active.

Slice 2: Navigation toolbar + single QWebEngineView.
"""

import re

from PySide6.QtCore import Qt, QUrl
from PySide6.QtWidgets import (
    QWidget, QVBoxLayout, QHBoxLayout, QPushButton, QLineEdit, QSizePolicy,
)
from PySide6.QtWebEngineWidgets import QWebEngineView
from PySide6.QtWebEngineCore import (
    QWebEnginePage, QWebEngineProfile, QWebEngineSettings,
)

import storage

# ---------------------------------------------------------------------------
# Theme constants (reused across all slices)
# ---------------------------------------------------------------------------

BG = "#0a0e14"
SURFACE = "#141820"
ACCENT = "#5ee7ff"
TEXT = "#e8eaed"
TEXT_DIM = "#8b949e"
BORDER = "#1e2530"
SURFACE_RAISED = "#1a2030"

# System font stack matching the main app (styles.css body rule)
FONT_FAMILY = '-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, Roboto, Helvetica, Arial, sans-serif'

# Default home / new-tab URL
HOME_URL = "https://www.google.com"

# ---------------------------------------------------------------------------
# URL fixup
# ---------------------------------------------------------------------------

_SCHEME_RE = re.compile(r"^[a-zA-Z][a-zA-Z0-9+\-.]*://")


def _fixup_url(raw: str) -> str:
    """
    Turn user input into a navigable URL.
    - Already has a scheme → use as-is.
    - Looks like a domain (contains dot, no spaces) → prepend https://
    - Otherwise → Google search query.
    """
    text = raw.strip()
    if not text:
        return HOME_URL
    if _SCHEME_RE.match(text):
        return text
    if "." in text and " " not in text:
        return "https://" + text
    return "https://www.google.com/search?q=" + text


class TankoWebWidget(QWidget):
    """
    Qt-native Web mode panel.

    Parameters
    ----------
    on_back : callable
        Called when the user clicks "← Library" to return to the renderer.
    on_window_action : callable(str)
        Called with "minimize", "maximize", or "close" for frameless window controls.
    """

    def __init__(self, on_back=None, on_window_action=None, parent=None):
        super().__init__(parent)
        self._on_back = on_back
        self._on_window_action = on_window_action

        self.setStyleSheet(f"background-color: {BG};")

        root = QVBoxLayout(self)
        root.setContentsMargins(0, 0, 0, 0)
        root.setSpacing(0)

        # --- Top bar ---
        root.addWidget(self._build_top_bar())

        # --- Navigation toolbar ---
        root.addWidget(self._build_nav_bar())

        # --- QWebEngineView (isolated profile) ---
        self._profile = QWebEngineProfile("tankoweb", self)
        cache_path = storage.data_path("TankowebEngine")
        self._profile.setCachePath(cache_path)
        self._profile.setPersistentStoragePath(cache_path)

        self._page = QWebEnginePage(self._profile, self)
        self._page.setBackgroundColor(Qt.GlobalColor.black)

        s = self._page.settings()
        s.setAttribute(QWebEngineSettings.WebAttribute.JavascriptEnabled, True)
        s.setAttribute(QWebEngineSettings.WebAttribute.LocalStorageEnabled, True)
        s.setAttribute(QWebEngineSettings.WebAttribute.PluginsEnabled, True)

        self._view = QWebEngineView(self)
        self._view.setPage(self._page)
        self._view.setSizePolicy(QSizePolicy.Policy.Expanding, QSizePolicy.Policy.Expanding)
        root.addWidget(self._view)

        # --- Wire signals ---
        self._page.urlChanged.connect(self._on_url_changed)
        self._page.titleChanged.connect(self._on_title_changed)
        self._page.loadStarted.connect(self._on_load_started)
        self._page.loadFinished.connect(self._on_load_finished)

        # Nav button state
        back_action = self._page.action(QWebEnginePage.WebAction.Back)
        back_action.changed.connect(lambda: self._nav_back_btn.setEnabled(back_action.isEnabled()))
        fwd_action = self._page.action(QWebEnginePage.WebAction.Forward)
        fwd_action.changed.connect(lambda: self._nav_fwd_btn.setEnabled(fwd_action.isEnabled()))

        # Load home page
        self._view.load(QUrl(HOME_URL))

    # ------------------------------------------------------------------
    # Top bar
    # ------------------------------------------------------------------

    def _build_top_bar(self):
        bar = QWidget()
        bar.setFixedHeight(38)
        bar.setStyleSheet(
            f"background-color: {SURFACE}; border-bottom: 1px solid {BORDER};"
        )

        layout = QHBoxLayout(bar)
        layout.setContentsMargins(8, 0, 8, 0)
        layout.setSpacing(8)

        # Back button — white, system font matching main app topbar
        back_btn = QPushButton("\u2190 Library")
        back_btn.setCursor(Qt.CursorShape.PointingHandCursor)
        back_btn.setStyleSheet(
            f"QPushButton {{"
            f"  color: {TEXT}; background: transparent; border: none;"
            f"  font-family: {FONT_FAMILY}; font-size: 13px; padding: 4px 10px;"
            f"}}"
            f"QPushButton:hover {{ background: {SURFACE_RAISED}; border-radius: 4px; }}"
        )
        back_btn.clicked.connect(self._go_back)
        layout.addWidget(back_btn)

        layout.addStretch()

        # Window controls (frameless window — need our own)
        for label, action in [("\u2014", "minimize"), ("\u2610", "maximize"), ("\u2715", "close")]:
            btn = QPushButton(label)
            btn.setFixedSize(36, 28)
            btn.setCursor(Qt.CursorShape.PointingHandCursor)
            btn.setStyleSheet(self._window_btn_style(action))
            btn.clicked.connect(lambda checked=False, a=action: self._window_action(a))
            layout.addWidget(btn)

        return bar

    # ------------------------------------------------------------------
    # Navigation toolbar
    # ------------------------------------------------------------------

    def _build_nav_bar(self):
        bar = QWidget()
        bar.setFixedHeight(36)
        bar.setStyleSheet(f"background-color: {BG}; border-bottom: 1px solid {BORDER};")

        layout = QHBoxLayout(bar)
        layout.setContentsMargins(8, 0, 8, 0)
        layout.setSpacing(4)

        nav_btn_ss = (
            f"QPushButton {{"
            f"  color: {TEXT_DIM}; background: transparent; border: none;"
            f"  font-family: {FONT_FAMILY}; font-size: 16px;"
            f"  min-width: 28px; min-height: 28px;"
            f"}}"
            f"QPushButton:hover {{ color: {TEXT}; background: {SURFACE_RAISED}; border-radius: 4px; }}"
            f"QPushButton:disabled {{ color: #3a3f4b; }}"
        )

        # Back
        self._nav_back_btn = QPushButton("\u25C0")
        self._nav_back_btn.setEnabled(False)
        self._nav_back_btn.setCursor(Qt.CursorShape.PointingHandCursor)
        self._nav_back_btn.setStyleSheet(nav_btn_ss)
        self._nav_back_btn.setToolTip("Back")
        self._nav_back_btn.clicked.connect(lambda: self._view.back())
        layout.addWidget(self._nav_back_btn)

        # Forward
        self._nav_fwd_btn = QPushButton("\u25B6")
        self._nav_fwd_btn.setEnabled(False)
        self._nav_fwd_btn.setCursor(Qt.CursorShape.PointingHandCursor)
        self._nav_fwd_btn.setStyleSheet(nav_btn_ss)
        self._nav_fwd_btn.setToolTip("Forward")
        self._nav_fwd_btn.clicked.connect(lambda: self._view.forward())
        layout.addWidget(self._nav_fwd_btn)

        # Reload / Stop
        self._reload_btn = QPushButton("\u27F3")
        self._reload_btn.setCursor(Qt.CursorShape.PointingHandCursor)
        self._reload_btn.setStyleSheet(nav_btn_ss)
        self._reload_btn.setToolTip("Reload")
        self._reload_btn.clicked.connect(self._reload_or_stop)
        self._is_loading = False
        layout.addWidget(self._reload_btn)

        # Address bar
        self._address_bar = QLineEdit()
        self._address_bar.setPlaceholderText("Search or enter URL")
        self._address_bar.setSizePolicy(QSizePolicy.Policy.Expanding, QSizePolicy.Policy.Fixed)
        self._address_bar.setFixedHeight(28)
        self._address_bar.setStyleSheet(
            f"QLineEdit {{"
            f"  background: {SURFACE}; color: {TEXT};"
            f"  border: 1px solid {BORDER}; border-radius: 6px;"
            f"  padding: 0 8px;"
            f"  font-family: {FONT_FAMILY}; font-size: 13px;"
            f"  selection-background-color: rgba(94, 231, 255, 0.3);"
            f"}}"
            f"QLineEdit:focus {{ border-color: {ACCENT}; }}"
        )
        self._address_bar.returnPressed.connect(self._navigate_to_input)
        layout.addWidget(self._address_bar)

        return bar

    # ------------------------------------------------------------------
    # Navigation actions
    # ------------------------------------------------------------------

    def _navigate_to_input(self):
        url = _fixup_url(self._address_bar.text())
        self._view.load(QUrl(url))

    def _reload_or_stop(self):
        if self._is_loading:
            self._view.stop()
        else:
            self._view.reload()

    # ------------------------------------------------------------------
    # Page signals
    # ------------------------------------------------------------------

    def _on_url_changed(self, url: QUrl):
        self._address_bar.setText(url.toString())

    def _on_title_changed(self, title: str):
        pass  # will be used in Slice 3 for tab titles

    def _on_load_started(self):
        self._is_loading = True
        self._reload_btn.setText("\u2715")
        self._reload_btn.setToolTip("Stop")

    def _on_load_finished(self, ok: bool):
        self._is_loading = False
        self._reload_btn.setText("\u27F3")
        self._reload_btn.setToolTip("Reload")

    # ------------------------------------------------------------------
    # Top bar actions
    # ------------------------------------------------------------------

    def _go_back(self):
        if self._on_back:
            self._on_back()

    def _window_action(self, action):
        if self._on_window_action:
            self._on_window_action(action)

    # ------------------------------------------------------------------
    # Styles
    # ------------------------------------------------------------------

    @staticmethod
    def _window_btn_style(action=""):
        hover_bg = "#e81123" if action == "close" else SURFACE_RAISED
        return (
            f"QPushButton {{"
            f"  color: {TEXT_DIM}; background: transparent; border: none;"
            f"  font-size: 14px;"
            f"}}"
            f"QPushButton:hover {{ color: {TEXT}; background: {hover_bg}; }}"
        )
