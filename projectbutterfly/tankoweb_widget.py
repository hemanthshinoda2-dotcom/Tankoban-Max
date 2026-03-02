"""
TankoWeb Widget — Qt-native Web mode panel.

A pure-Qt widget that sits at stack index 2 in the QStackedWidget.
Glass aesthetic matching the Electron TankoBrowser: animated gradient
background skin, floating disconnected widgets, rounded browser viewport.

Every chrome element (buttons, URL bar, tabs, Bookmark, History) is its
own independent glass pill floating over the gradient — nothing is joined.

Slice 2.5: Glass skin + floating chrome + proper URL bar.
"""

import math
import re

from PySide6.QtCore import Qt, QUrl, QTimer, QRectF, QPointF
from PySide6.QtGui import (
    QPainter, QRadialGradient, QLinearGradient, QColor,
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

# Base background (--vx-bg0: #050505)
BG = QColor(5, 5, 5)

# Gradient accent colours (from .bgFx radial-gradient stops)
GRAD_SMOKE = QColor(156, 163, 175, 56)   # rgba(--vx-accent2-rgb, .22)
GRAD_GOLD = QColor(199, 167, 107, 46)    # rgba(--vx-accent-rgb, .18)
GRAD_ROSE = QColor(251, 113, 133, 31)    # rgba(251,113,133, .12)

# Text tokens
TEXT = "rgba(245,245,245,0.92)"           # --vx-ink
TEXT_MUTED = "rgba(245,245,245,0.60)"     # --vx-muted
TEXT_TITLE = "rgba(255,255,255,0.84)"     # .panelTitle color
TEXT_DISABLED = "rgba(255,255,255,0.20)"

# Surface tokens (glass pills)
SURFACE = "rgba(255,255,255,0.06)"        # --panel
SURFACE_HOVER = "rgba(255,255,255,0.10)"
SURFACE_BORDER = "rgba(255,255,255,0.12)" # --lib-border / iconBtn border
SURFACE_BORDER2 = "rgba(255,255,255,0.16)"  # --vx-border2

# Accent (muted gold from overhaul.css)
ACCENT = "#c7a76b"
ACCENT_RGB = "199,167,107"

# Tab specific (from web-browser.css .sourcesBrowserTab)
TAB_BG = "rgba(20,27,36,0.85)"
TAB_ACTIVE_BG = f"rgba({ACCENT_RGB},0.12)"
TAB_ACTIVE_BORDER = f"rgba({ACCENT_RGB},0.35)"

# Radii (from overhaul.css)
RADIUS = 12          # --vx-radius (iconBtn)
RADIUS_SM = 10       # --vx-radius-sm (tabs)
RADIUS_VIEWPORT = 8  # browser viewport

# Font (Windows system font = Segoe UI, matching --tx-font-sans)
FONT = "Segoe UI"

# Icon button size (from .sourcesBrowserIconBtn + overhaul .iconBtn)
ICON_BTN_SIZE = 30

# Default home URL
HOME_URL = "https://www.google.com"

# Content margins — 12px sides matching --lib-pad
SIDE_MARGIN = 12
BOTTOM_MARGIN = 12


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
# Stylesheet helpers
# ---------------------------------------------------------------------------

def _icon_btn_ss(extra=""):
    """30x30 glass icon button matching overhaul.css .iconBtn exactly."""
    return (
        f"QPushButton {{"
        f"  min-width: {ICON_BTN_SIZE}px; max-width: {ICON_BTN_SIZE}px;"
        f"  min-height: {ICON_BTN_SIZE}px; max-height: {ICON_BTN_SIZE}px;"
        f"  background: {SURFACE}; color: {TEXT};"
        f"  border: 1px solid {SURFACE_BORDER}; border-radius: {RADIUS}px;"
        f"  font-family: '{FONT}'; font-size: 12px;"
        f"  {extra}"
        f"}}"
        f"QPushButton:hover {{ background: {SURFACE_HOVER};"
        f"  box-shadow: 0 12px 26px -18px rgba(0,0,0,0.85); }}"
        f"QPushButton:pressed {{ padding-top: 1px; }}"
        f"QPushButton:disabled {{ color: {TEXT_DISABLED}; background: rgba(255,255,255,0.03); }}"
    )


def _pill_btn_ss(extra=""):
    """Pill-shaped text button (Bookmark, History, ← Library)."""
    return (
        f"QPushButton {{"
        f"  background: {SURFACE}; color: {TEXT};"
        f"  border: 1px solid {SURFACE_BORDER}; border-radius: {RADIUS}px;"
        f"  font-family: '{FONT}'; font-size: 12px; font-weight: 600;"
        f"  padding: 0 12px; min-height: {ICON_BTN_SIZE}px;"
        f"  {extra}"
        f"}}"
        f"QPushButton:hover {{ background: {SURFACE_HOVER}; }}"
        f"QPushButton:pressed {{ padding-top: 1px; }}"
    )


def _tab_ss(active=False):
    """Tab pill matching .sourcesBrowserTab from web-browser.css."""
    bg = TAB_ACTIVE_BG if active else TAB_BG
    border = TAB_ACTIVE_BORDER if active else SURFACE_BORDER2
    color = TEXT if active else TEXT_MUTED
    return (
        f"QPushButton {{"
        f"  background: {bg}; color: {color};"
        f"  border: 1px solid {border}; border-radius: {RADIUS_SM}px;"
        f"  font-family: '{FONT}'; font-size: 11px;"
        f"  padding: 3px 7px; min-width: 72px; max-width: 170px;"
        f"  min-height: 24px;"
        f"}}"
        f"QPushButton:hover {{ background: rgba({ACCENT_RGB},0.08); }}"
    )


def _omni_ss():
    """URL bar matching .sourcesBrowserOmniChip / omnibox styling."""
    return (
        f"QLineEdit {{"
        f"  background: {SURFACE}; color: {TEXT_MUTED};"
        f"  border: 1px solid {SURFACE_BORDER}; border-radius: {RADIUS}px;"
        f"  padding: 0 10px; min-height: {ICON_BTN_SIZE}px;"
        f"  font-family: '{FONT}'; font-size: 12px;"
        f"  selection-background-color: rgba({ACCENT_RGB},0.3);"
        f"}}"
        f"QLineEdit:focus {{ color: {TEXT}; border-color: rgba({ACCENT_RGB},0.35); }}"
    )


def _apply_shadow(widget, blur=22, dy=8, color=QColor(0, 0, 0, 180)):
    fx = QGraphicsDropShadowEffect(widget)
    fx.setBlurRadius(blur)
    fx.setOffset(0, dy)
    fx.setColor(color)
    widget.setGraphicsEffect(fx)


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

        # Background animation
        self._bg_phase = 0.0
        self._bg_timer = QTimer(self)
        self._bg_timer.timeout.connect(self._tick_bg)
        self._bg_timer.start(60)

        self.setAttribute(Qt.WidgetAttribute.WA_OpaquePaintEvent)

        root = QVBoxLayout(self)
        root.setContentsMargins(SIDE_MARGIN, 8, SIDE_MARGIN, BOTTOM_MARGIN)
        root.setSpacing(0)

        # Row 1: ← Library (left)  ...stretch...  — □ ✕ (right)
        root.addWidget(self._build_chrome_row())
        root.addSpacing(6)  # panelTitleRow is 12px below topbar, ~6px here

        # Row 2: TANKOBROWSER label
        root.addWidget(self._build_title_label())
        root.addSpacing(4)

        # Row 3: Tab row (individual tab pills + new-tab btn)
        root.addWidget(self._build_tab_row())
        root.addSpacing(6)  # gap between tabs and nav

        # Row 4: Nav row — each element is a separate glass pill
        root.addWidget(self._build_nav_row())
        root.addSpacing(8)  # margin-bottom: 8px from .sourcesBrowserTopBar

        # Row 5: Browser viewport
        self._build_browser(root)

        # Wire page signals
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

        self._view.load(QUrl(HOME_URL))

    # ══════════════════════════════════════════════════════════════════════
    # Background painting — animated gradient skin (ports .bgFx)
    # ══════════════════════════════════════════════════════════════════════

    def _tick_bg(self):
        self._bg_phase += 0.003
        if self._bg_phase > 2.0:
            self._bg_phase -= 2.0
        self.update()

    def paintEvent(self, event):
        p = QPainter(self)
        p.setRenderHint(QPainter.RenderHint.Antialiasing)
        w, h = self.width(), self.height()
        rect = QRectF(0, 0, w, h)

        p.fillRect(rect, BG)

        phase = self._bg_phase * math.pi
        dx = math.sin(phase) * 30
        dy = math.cos(phase * 0.7) * 15

        g1 = QRadialGradient(QPointF(w * 0.15 + dx, h * 0.10 + dy), max(w, h) * 0.6)
        g1.setColorAt(0.0, GRAD_SMOKE)
        g1.setColorAt(1.0, QColor(0, 0, 0, 0))
        p.fillRect(rect, g1)

        g2 = QRadialGradient(QPointF(w * 0.85 - dx, h * 0.20 - dy * 0.5), max(w, h) * 0.5)
        g2.setColorAt(0.0, GRAD_GOLD)
        g2.setColorAt(1.0, QColor(0, 0, 0, 0))
        p.fillRect(rect, g2)

        g3 = QRadialGradient(QPointF(w * 0.50 + dx * 0.5, h * 0.85 + dy), max(w, h) * 0.55)
        g3.setColorAt(0.0, GRAD_ROSE)
        g3.setColorAt(1.0, QColor(0, 0, 0, 0))
        p.fillRect(rect, g3)

        vignette = QLinearGradient(0, 0, 0, h)
        vignette.setColorAt(0.0, QColor(0, 0, 0, 0))
        vignette.setColorAt(1.0, QColor(0, 0, 0, 40))
        p.fillRect(rect, vignette)

        p.end()

    # ══════════════════════════════════════════════════════════════════════
    # Row 1: Chrome — ← Library ... — □ ✕
    # ══════════════════════════════════════════════════════════════════════

    def _build_chrome_row(self):
        row = QWidget()
        row.setFixedHeight(ICON_BTN_SIZE)
        row.setStyleSheet("background: transparent; border: none;")

        layout = QHBoxLayout(row)
        layout.setContentsMargins(0, 0, 0, 0)
        layout.setSpacing(6)

        # ← Library — pill button
        back_btn = QPushButton("\u2190 Library")
        back_btn.setCursor(Qt.CursorShape.PointingHandCursor)
        back_btn.setStyleSheet(_pill_btn_ss("font-size: 13px;"))
        back_btn.clicked.connect(self._go_back)
        _apply_shadow(back_btn, blur=18, dy=6, color=QColor(0, 0, 0, 140))
        layout.addWidget(back_btn)

        layout.addStretch()

        # Window controls — each a separate 30x28 glass icon button
        for label, action in [("\u2014", "minimize"), ("\u2610", "maximize"), ("\u2715", "close")]:
            btn = QPushButton(label)
            btn.setCursor(Qt.CursorShape.PointingHandCursor)
            hover_bg = "#e81123" if action == "close" else SURFACE_HOVER
            btn.setStyleSheet(
                f"QPushButton {{"
                f"  min-width: 34px; max-width: 34px; min-height: 28px; max-height: 28px;"
                f"  background: {SURFACE}; color: {TEXT_MUTED};"
                f"  border: 1px solid {SURFACE_BORDER}; border-radius: 8px;"
                f"  font-size: 13px;"
                f"}}"
                f"QPushButton:hover {{ color: {TEXT}; background: {hover_bg}; }}"
            )
            btn.clicked.connect(lambda checked=False, a=action: self._window_action(a))
            layout.addWidget(btn)

        return row

    # ══════════════════════════════════════════════════════════════════════
    # Row 2: TANKOBROWSER title
    # ══════════════════════════════════════════════════════════════════════

    def _build_title_label(self):
        label = QLabel("TANKOBROWSER")
        label.setStyleSheet(
            f"background: transparent; border: none;"
            f"color: {TEXT_TITLE};"
            f"font-family: '{FONT}';"
            f"font-size: 12px; font-weight: 700;"
            f"letter-spacing: 0.08em;"  # --tx-track-wide
            f"padding: 0 2px;"
        )
        label.setFixedHeight(16)
        return label

    # ══════════════════════════════════════════════════════════════════════
    # Row 3: Tab row — individual tab pills + new-tab button
    # Each tab is its own disconnected glass pill.
    # ══════════════════════════════════════════════════════════════════════

    def _build_tab_row(self):
        row = QWidget()
        row.setFixedHeight(ICON_BTN_SIZE)
        row.setStyleSheet("background: transparent; border: none;")

        self._tab_layout = QHBoxLayout(row)
        self._tab_layout.setContentsMargins(0, 0, 0, 0)
        self._tab_layout.setSpacing(6)  # gap: 6px from .sourcesBrowserTabList

        # Initial tab (will be updated by title signal)
        self._tab_btn = QPushButton("Google")
        self._tab_btn.setCursor(Qt.CursorShape.PointingHandCursor)
        self._tab_btn.setStyleSheet(_tab_ss(active=True))
        self._tab_layout.addWidget(self._tab_btn)

        self._tab_layout.addStretch()

        # + New tab button — 28x28 glass icon
        new_tab_btn = QPushButton("+")
        new_tab_btn.setCursor(Qt.CursorShape.PointingHandCursor)
        new_tab_btn.setStyleSheet(
            f"QPushButton {{"
            f"  min-width: 28px; max-width: 28px; min-height: 28px; max-height: 28px;"
            f"  background: {SURFACE}; color: {TEXT_MUTED};"
            f"  border: 1px solid {SURFACE_BORDER}; border-radius: {RADIUS_SM}px;"
            f"  font-family: '{FONT}'; font-size: 16px;"
            f"}}"
            f"QPushButton:hover {{ color: {TEXT}; background: {SURFACE_HOVER}; }}"
        )
        self._tab_layout.addWidget(new_tab_btn)

        return row

    # ══════════════════════════════════════════════════════════════════════
    # Row 4: Nav row — EVERY element is a separate glass widget
    # [◀] [▶] [↻]  [═══ url ═══]  [▶] [Bookmark] [History]
    #  ↑    ↑   ↑       ↑          ↑       ↑          ↑
    #  each one has its own border, radius, background
    # ══════════════════════════════════════════════════════════════════════

    def _build_nav_row(self):
        row = QWidget()
        row.setFixedHeight(ICON_BTN_SIZE + 6)  # min-height: 40px ≈ 30 + padding
        row.setStyleSheet("background: transparent; border: none;")

        layout = QHBoxLayout(row)
        layout.setContentsMargins(0, 0, 0, 0)
        layout.setSpacing(6)  # gap: 6px from .sourcesBrowserTopBar

        # ◀ Back — separate 30x30 glass icon button
        self._nav_back_btn = QPushButton("\u25C0")
        self._nav_back_btn.setEnabled(False)
        self._nav_back_btn.setCursor(Qt.CursorShape.PointingHandCursor)
        self._nav_back_btn.setStyleSheet(_icon_btn_ss())
        self._nav_back_btn.setToolTip("Back")
        self._nav_back_btn.clicked.connect(lambda: self._view.back())
        layout.addWidget(self._nav_back_btn)

        # ▶ Forward — separate 30x30 glass icon button
        self._nav_fwd_btn = QPushButton("\u25B6")
        self._nav_fwd_btn.setEnabled(False)
        self._nav_fwd_btn.setCursor(Qt.CursorShape.PointingHandCursor)
        self._nav_fwd_btn.setStyleSheet(_icon_btn_ss())
        self._nav_fwd_btn.setToolTip("Forward")
        self._nav_fwd_btn.clicked.connect(lambda: self._view.forward())
        layout.addWidget(self._nav_fwd_btn)

        # ↻ Reload/Stop — separate 30x30 glass icon button
        self._reload_btn = QPushButton("\u27F3")
        self._reload_btn.setCursor(Qt.CursorShape.PointingHandCursor)
        self._reload_btn.setStyleSheet(_icon_btn_ss())
        self._reload_btn.setToolTip("Reload")
        self._reload_btn.clicked.connect(self._reload_or_stop)
        self._is_loading = False
        layout.addWidget(self._reload_btn)

        # URL bar — separate glass pill, flex: 1, max-width: 520px
        self._address_bar = QLineEdit()
        self._address_bar.setPlaceholderText("Search or enter URL")
        self._address_bar.setSizePolicy(QSizePolicy.Policy.Expanding, QSizePolicy.Policy.Fixed)
        self._address_bar.setMaximumWidth(520)
        self._address_bar.setStyleSheet(_omni_ss())
        self._address_bar.returnPressed.connect(self._navigate_to_input)
        layout.addWidget(self._address_bar)

        # ▶ Go button — separate 30x30 glass icon button
        go_btn = QPushButton("\u25B6")
        go_btn.setCursor(Qt.CursorShape.PointingHandCursor)
        go_btn.setStyleSheet(_icon_btn_ss())
        go_btn.setToolTip("Go")
        go_btn.clicked.connect(self._navigate_to_input)
        layout.addWidget(go_btn)

        # Bookmark — separate pill button
        bk_btn = QPushButton("Bookmark")
        bk_btn.setCursor(Qt.CursorShape.PointingHandCursor)
        bk_btn.setStyleSheet(_pill_btn_ss("font-size: 11px;"))
        layout.addWidget(bk_btn)

        # History — separate pill button
        hist_btn = QPushButton("History")
        hist_btn.setCursor(Qt.CursorShape.PointingHandCursor)
        hist_btn.setStyleSheet(_pill_btn_ss("font-size: 11px;"))
        layout.addWidget(hist_btn)

        return row

    # ══════════════════════════════════════════════════════════════════════
    # Row 5: Browser viewport — rounded, with space for skin
    # ══════════════════════════════════════════════════════════════════════

    def _build_browser(self, root_layout):
        self._viewport_frame = QFrame(self)
        self._viewport_frame.setStyleSheet(
            f"QFrame {{"
            f"  background: rgba(10,16,24,0.92);"
            f"  border: 1px solid {SURFACE_BORDER2};"
            f"  border-radius: {RADIUS_VIEWPORT}px;"
            f"}}"
        )
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
        if title:
            # Truncate for tab display (max-width: 170px ≈ ~20 chars)
            display = title if len(title) <= 22 else title[:20] + "\u2026"
            self._tab_btn.setText(display)

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
