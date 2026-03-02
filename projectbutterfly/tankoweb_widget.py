"""
TankoWeb Widget — Qt-native Web mode panel.

A pure-Qt widget that sits at stack index 2 in the QStackedWidget.
Glass aesthetic matching the Electron TankoBrowser: animated gradient
background skin, floating disconnected widgets, rounded browser viewport.

Slice 2.5: Glass skin + floating chrome + proper URL bar.
"""

import re

from PySide6.QtCore import Qt, QUrl, QTimer, QRectF, QPointF
from PySide6.QtGui import (
    QPainter, QRadialGradient, QLinearGradient, QColor, QPainterPath, QFont,
)
from PySide6.QtWidgets import (
    QWidget, QVBoxLayout, QHBoxLayout, QPushButton, QLineEdit, QLabel,
    QSizePolicy, QGraphicsDropShadowEffect, QFrame,
)
from PySide6.QtWebEngineWidgets import QWebEngineView
from PySide6.QtWebEngineCore import (
    QWebEnginePage, QWebEngineProfile, QWebEngineSettings,
)

import storage

# ---------------------------------------------------------------------------
# Palette — ported from overhaul.css / web-browser.css tokens
# ---------------------------------------------------------------------------

# Base background (--vx-bg0)
BG = QColor(5, 5, 5)

# Gradient accent colours (from .bgFx radial-gradient stops)
GRAD_SMOKE = QColor(156, 163, 175, 56)    # rgba(--vx-accent2-rgb, .22)
GRAD_GOLD = QColor(199, 167, 107, 46)     # rgba(--vx-accent-rgb, .18)
GRAD_ROSE = QColor(251, 113, 133, 31)     # rgba(251,113,133, .12)

# Surface colours
SURFACE = "rgba(255,255,255,0.06)"         # --panel: rgba(chrome,.06)
SURFACE_HOVER = "rgba(255,255,255,0.10)"   # hover state
SURFACE_BORDER = "rgba(255,255,255,0.12)"  # --lib-border
SURFACE_BORDER2 = "rgba(255,255,255,0.16)" # --vx-border2

# Text
TEXT = "rgba(245,245,245,0.92)"            # --vx-ink
TEXT_MUTED = "rgba(245,245,245,0.60)"      # --vx-muted
TEXT_TITLE = "rgba(255,255,255,0.84)"      # panelTitle colour

# Accent (muted gold)
ACCENT = "#c7a76b"
ACCENT_RGB = "199,167,107"

# Radii matching overhaul.css
RADIUS = 12       # --vx-radius
RADIUS_SM = 10    # --vx-radius-sm
RADIUS_VIEWPORT = 8  # browser viewport

# Font
FONT = "Segoe UI"
FONT_FALLBACK = "sans-serif"

# Default home / new-tab URL
HOME_URL = "https://www.google.com"

# Content margins — space for the skin to show around the browser
SIDE_MARGIN = 14
BOTTOM_MARGIN = 14


# ---------------------------------------------------------------------------
# URL fixup
# ---------------------------------------------------------------------------

_SCHEME_RE = re.compile(r"^[a-zA-Z][a-zA-Z0-9+\-.]*://")


def _fixup_url(raw: str) -> str:
    text = raw.strip()
    if not text:
        return HOME_URL
    if _SCHEME_RE.match(text):
        return text
    if "." in text and " " not in text:
        return "https://" + text
    return "https://www.google.com/search?q=" + text


# ---------------------------------------------------------------------------
# Helper: apply drop shadow to a widget
# ---------------------------------------------------------------------------

def _apply_shadow(widget, blur=22, dy=8, color=QColor(0, 0, 0, 180)):
    fx = QGraphicsDropShadowEffect(widget)
    fx.setBlurRadius(blur)
    fx.setOffset(0, dy)
    fx.setColor(color)
    widget.setGraphicsEffect(fx)


# ---------------------------------------------------------------------------
# Helper: glass panel stylesheet (floating disconnected widget)
# ---------------------------------------------------------------------------

def _glass_panel_ss(radius=RADIUS_SM):
    return (
        f"background: {SURFACE};"
        f"border: 1px solid {SURFACE_BORDER};"
        f"border-radius: {radius}px;"
    )


# ---------------------------------------------------------------------------
# Rounded viewport frame — clips QWebEngineView to rounded corners
# ---------------------------------------------------------------------------

class _RoundedFrame(QFrame):
    """A QFrame that clips its children to a rounded rect."""

    def __init__(self, radius=RADIUS_VIEWPORT, parent=None):
        super().__init__(parent)
        self._radius = radius
        self.setStyleSheet(
            f"background: rgba(10,16,24,0.92);"
            f"border: 1px solid {SURFACE_BORDER2};"
            f"border-radius: {radius}px;"
        )


# ═══════════════════════════════════════════════════════════════════════════
# TankoWebWidget
# ═══════════════════════════════════════════════════════════════════════════

class TankoWebWidget(QWidget):
    """
    Qt-native Web mode panel with Tankoban glass aesthetic.

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

        # Animation phase for background gradient drift
        self._bg_phase = 0.0
        self._bg_timer = QTimer(self)
        self._bg_timer.timeout.connect(self._tick_bg)
        self._bg_timer.start(60)  # ~16 fps, lightweight

        # No widget-level stylesheet — we paint the background ourselves
        self.setAttribute(Qt.WidgetAttribute.WA_OpaquePaintEvent)

        root = QVBoxLayout(self)
        root.setContentsMargins(SIDE_MARGIN, 8, SIDE_MARGIN, BOTTOM_MARGIN)
        root.setSpacing(0)

        # --- Row 1: floating ← Library (left) + window controls (right) ---
        root.addWidget(self._build_chrome_row())
        root.addSpacing(8)

        # --- Row 2: "TANKOBROWSER" title label ---
        root.addWidget(self._build_title_label())
        root.addSpacing(4)

        # --- Row 3: floating nav bar ---
        root.addWidget(self._build_nav_bar())
        root.addSpacing(8)

        # --- Row 4: browser viewport (rounded, with margins) ---
        self._build_browser(root)

        # --- Wire page signals ---
        self._page.urlChanged.connect(self._on_url_changed)
        self._page.titleChanged.connect(self._on_title_changed)
        self._page.loadStarted.connect(self._on_load_started)
        self._page.loadFinished.connect(self._on_load_finished)

        back_action = self._page.action(QWebEnginePage.WebAction.Back)
        back_action.changed.connect(
            lambda: self._nav_back_btn.setEnabled(back_action.isEnabled())
        )
        fwd_action = self._page.action(QWebEnginePage.WebAction.Forward)
        fwd_action.changed.connect(
            lambda: self._nav_fwd_btn.setEnabled(fwd_action.isEnabled())
        )

        # Load home
        self._view.load(QUrl(HOME_URL))

    # ══════════════════════════════════════════════════════════════════════
    # Background painting — animated gradient skin (ports .bgFx)
    # ══════════════════════════════════════════════════════════════════════

    def _tick_bg(self):
        self._bg_phase += 0.003
        if self._bg_phase > 2.0:
            self._bg_phase -= 2.0
        self.update()  # triggers paintEvent

    def paintEvent(self, event):
        p = QPainter(self)
        p.setRenderHint(QPainter.RenderHint.Antialiasing)
        w, h = self.width(), self.height()
        rect = QRectF(0, 0, w, h)

        # Base fill
        p.fillRect(rect, BG)

        # Phase-dependent offsets for gentle drift
        import math
        phase = self._bg_phase * math.pi
        dx = math.sin(phase) * 30
        dy = math.cos(phase * 0.7) * 15

        # Radial gradient 1: smoke (top-left area)
        g1 = QRadialGradient(QPointF(w * 0.15 + dx, h * 0.10 + dy), max(w, h) * 0.6)
        g1.setColorAt(0.0, GRAD_SMOKE)
        g1.setColorAt(1.0, QColor(0, 0, 0, 0))
        p.fillRect(rect, g1)

        # Radial gradient 2: gold (top-right area)
        g2 = QRadialGradient(QPointF(w * 0.85 - dx, h * 0.20 - dy * 0.5), max(w, h) * 0.5)
        g2.setColorAt(0.0, GRAD_GOLD)
        g2.setColorAt(1.0, QColor(0, 0, 0, 0))
        p.fillRect(rect, g2)

        # Radial gradient 3: rose (bottom-center)
        g3 = QRadialGradient(QPointF(w * 0.50 + dx * 0.5, h * 0.85 + dy), max(w, h) * 0.55)
        g3.setColorAt(0.0, GRAD_ROSE)
        g3.setColorAt(1.0, QColor(0, 0, 0, 0))
        p.fillRect(rect, g3)

        # Subtle top-to-bottom darkening vignette
        vignette = QLinearGradient(0, 0, 0, h)
        vignette.setColorAt(0.0, QColor(0, 0, 0, 0))
        vignette.setColorAt(1.0, QColor(0, 0, 0, 40))
        p.fillRect(rect, vignette)

        p.end()

    # ══════════════════════════════════════════════════════════════════════
    # Row 1: Chrome row — ← Library (left) | window controls (right)
    # ══════════════════════════════════════════════════════════════════════

    def _build_chrome_row(self):
        row = QWidget()
        row.setFixedHeight(34)
        row.setStyleSheet("background: transparent;")

        layout = QHBoxLayout(row)
        layout.setContentsMargins(0, 0, 0, 0)
        layout.setSpacing(6)

        # ← Library button — floating glass pill
        back_btn = QPushButton("\u2190 Library")
        back_btn.setCursor(Qt.CursorShape.PointingHandCursor)
        back_btn.setFixedHeight(30)
        back_btn.setStyleSheet(
            f"QPushButton {{"
            f"  color: {TEXT}; background: {SURFACE};"
            f"  border: 1px solid {SURFACE_BORDER}; border-radius: {RADIUS_SM}px;"
            f"  font-family: '{FONT}', {FONT_FALLBACK}; font-size: 13px;"
            f"  font-weight: 600; padding: 0 14px;"
            f"}}"
            f"QPushButton:hover {{ background: {SURFACE_HOVER}; }}"
        )
        back_btn.clicked.connect(self._go_back)
        _apply_shadow(back_btn, blur=18, dy=6, color=QColor(0, 0, 0, 140))
        layout.addWidget(back_btn)

        layout.addStretch()

        # Window controls — floating glass pills, disconnected
        for label, action in [("\u2014", "minimize"), ("\u2610", "maximize"), ("\u2715", "close")]:
            btn = QPushButton(label)
            btn.setFixedSize(34, 28)
            btn.setCursor(Qt.CursorShape.PointingHandCursor)
            hover_bg = "#e81123" if action == "close" else SURFACE_HOVER
            btn.setStyleSheet(
                f"QPushButton {{"
                f"  color: {TEXT_MUTED}; background: {SURFACE};"
                f"  border: 1px solid {SURFACE_BORDER}; border-radius: 8px;"
                f"  font-size: 13px;"
                f"}}"
                f"QPushButton:hover {{ color: {TEXT}; background: {hover_bg}; }}"
            )
            btn.clicked.connect(lambda checked=False, a=action: self._window_action(a))
            layout.addWidget(btn)

        return row

    # ══════════════════════════════════════════════════════════════════════
    # Row 2: "TANKOBROWSER" title label
    # ══════════════════════════════════════════════════════════════════════

    def _build_title_label(self):
        label = QLabel("TANKOBROWSER")
        label.setStyleSheet(
            f"background: transparent; border: none;"
            f"color: {TEXT_TITLE};"
            f"font-family: '{FONT}', {FONT_FALLBACK};"
            f"font-size: 11px; font-weight: 700;"
            f"letter-spacing: 0.3px;"
            f"padding: 2px 4px;"
        )
        return label

    # ══════════════════════════════════════════════════════════════════════
    # Row 3: Floating nav bar
    # ══════════════════════════════════════════════════════════════════════

    def _build_nav_bar(self):
        bar = QWidget()
        bar.setFixedHeight(36)
        bar.setStyleSheet(_glass_panel_ss(RADIUS_SM))
        _apply_shadow(bar, blur=20, dy=6, color=QColor(0, 0, 0, 160))

        layout = QHBoxLayout(bar)
        layout.setContentsMargins(6, 0, 6, 0)
        layout.setSpacing(4)

        # Shared nav button style — transparent inside the glass bar
        nav_btn_ss = (
            f"QPushButton {{"
            f"  color: {TEXT_MUTED}; background: transparent; border: none;"
            f"  font-family: '{FONT}', {FONT_FALLBACK}; font-size: 14px;"
            f"  min-width: 28px; min-height: 28px; border-radius: 6px;"
            f"}}"
            f"QPushButton:hover {{ color: {TEXT}; background: {SURFACE_HOVER}; }}"
            f"QPushButton:disabled {{ color: rgba(255,255,255,0.20); }}"
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

        layout.addSpacing(4)

        # Address bar — capped width, proper ellipsis
        self._address_bar = QLineEdit()
        self._address_bar.setPlaceholderText("Search or enter URL")
        self._address_bar.setSizePolicy(QSizePolicy.Policy.Expanding, QSizePolicy.Policy.Fixed)
        self._address_bar.setFixedHeight(26)
        self._address_bar.setMaximumWidth(520)
        self._address_bar.setStyleSheet(
            f"QLineEdit {{"
            f"  background: rgba(255,255,255,0.05); color: {TEXT_MUTED};"
            f"  border: 1px solid {SURFACE_BORDER}; border-radius: 8px;"
            f"  padding: 0 10px;"
            f"  font-family: '{FONT}', {FONT_FALLBACK}; font-size: 12px;"
            f"  selection-background-color: rgba({ACCENT_RGB}, 0.3);"
            f"}}"
            f"QLineEdit:focus {{ color: {TEXT}; border-color: rgba({ACCENT_RGB}, 0.45); }}"
        )
        self._address_bar.returnPressed.connect(self._navigate_to_input)
        layout.addWidget(self._address_bar)

        layout.addSpacing(4)

        # Bookmark button
        bk_btn = QPushButton("Bookmark")
        bk_btn.setCursor(Qt.CursorShape.PointingHandCursor)
        bk_btn.setFixedHeight(26)
        bk_btn.setStyleSheet(
            f"QPushButton {{"
            f"  color: {TEXT_MUTED}; background: rgba(255,255,255,0.05);"
            f"  border: 1px solid {SURFACE_BORDER}; border-radius: 8px;"
            f"  font-family: '{FONT}', {FONT_FALLBACK}; font-size: 11px;"
            f"  padding: 0 10px;"
            f"}}"
            f"QPushButton:hover {{ color: {TEXT}; background: {SURFACE_HOVER}; }}"
        )
        layout.addWidget(bk_btn)

        # History button
        hist_btn = QPushButton("History")
        hist_btn.setCursor(Qt.CursorShape.PointingHandCursor)
        hist_btn.setFixedHeight(26)
        hist_btn.setStyleSheet(bk_btn.styleSheet())
        layout.addWidget(hist_btn)

        return bar

    # ══════════════════════════════════════════════════════════════════════
    # Row 4: Browser viewport — rounded, with space for skin
    # ══════════════════════════════════════════════════════════════════════

    def _build_browser(self, root_layout):
        # Rounded container frame
        self._viewport_frame = _RoundedFrame(radius=RADIUS_VIEWPORT, parent=self)
        self._viewport_frame.setSizePolicy(
            QSizePolicy.Policy.Expanding, QSizePolicy.Policy.Expanding
        )
        _apply_shadow(self._viewport_frame, blur=28, dy=10, color=QColor(0, 0, 0, 200))

        frame_layout = QVBoxLayout(self._viewport_frame)
        frame_layout.setContentsMargins(0, 0, 0, 0)
        frame_layout.setSpacing(0)

        # QWebEngineView with isolated profile
        self._profile = QWebEngineProfile("tankoweb", self)
        cache_path = storage.data_path("TankowebEngine")
        self._profile.setCachePath(cache_path)
        self._profile.setPersistentStoragePath(cache_path)

        self._page = QWebEnginePage(self._profile, self)
        self._page.setBackgroundColor(QColor(10, 16, 24))

        s = self._page.settings()
        s.setAttribute(QWebEngineSettings.WebAttribute.JavascriptEnabled, True)
        s.setAttribute(QWebEngineSettings.WebAttribute.LocalStorageEnabled, True)
        s.setAttribute(QWebEngineSettings.WebAttribute.PluginsEnabled, True)

        self._view = QWebEngineView(self)
        self._view.setPage(self._page)
        self._view.setSizePolicy(
            QSizePolicy.Policy.Expanding, QSizePolicy.Policy.Expanding
        )

        frame_layout.addWidget(self._view)
        root_layout.addWidget(self._viewport_frame)

    # ══════════════════════════════════════════════════════════════════════
    # Navigation actions
    # ══════════════════════════════════════════════════════════════════════

    def _navigate_to_input(self):
        url = _fixup_url(self._address_bar.text())
        self._view.load(QUrl(url))

    def _reload_or_stop(self):
        if self._is_loading:
            self._view.stop()
        else:
            self._view.reload()

    # ══════════════════════════════════════════════════════════════════════
    # Page signals
    # ══════════════════════════════════════════════════════════════════════

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

    # ══════════════════════════════════════════════════════════════════════
    # Top bar actions
    # ══════════════════════════════════════════════════════════════════════

    def _go_back(self):
        if self._on_back:
            self._on_back()

    def _window_action(self, action):
        if self._on_window_action:
            self._on_window_action(action)
