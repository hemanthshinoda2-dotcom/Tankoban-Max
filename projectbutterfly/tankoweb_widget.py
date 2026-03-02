"""
TankoWeb Widget — Qt-native Web mode panel.

A pure-Qt widget that sits at stack index 2 in the QStackedWidget.
Glass aesthetic matching the Electron TankoBrowser: animated gradient
background skin, floating disconnected widgets, rounded browser viewport.

Every chrome element (buttons, URL bar, tabs, Bookmark, History) is its
own independent glass pill floating over the gradient — nothing is joined.

Slice 4: Qt-native homepage with sources grid. Each tab has a two-layer
QStackedWidget — index 0 is the Qt home page, index 1 is QWebEngineView.
New tabs start on the home page. Navigating flips to the web view.
"""

import json
import math
import os
import re

from PySide6.QtCore import Qt, QUrl, QTimer, QRectF, QPointF, QSize
from PySide6.QtGui import (
    QPainter, QRadialGradient, QLinearGradient, QColor,
    QPen, QPolygonF, QPainterPath, QShortcut, QKeySequence,
)
from PySide6.QtWidgets import (
    QWidget, QVBoxLayout, QHBoxLayout, QPushButton, QLineEdit, QLabel,
    QSizePolicy, QGraphicsDropShadowEffect, QFrame, QStackedWidget,
    QScrollArea, QGridLayout, QInputDialog,
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

# Content margins — 12px sides matching --lib-pad
SIDE_MARGIN = 12
BOTTOM_MARGIN = 12

# Tab limits
MAX_TABS = 20

# Default sources (matches main/domains/webSources DEFAULT_SOURCES)
DEFAULT_SOURCES = [
    {"id": "annasarchive", "name": "Anna's Archive", "url": "https://annas-archive.org", "color": "#e74c3c", "builtIn": True},
    {"id": "oceanofpdf", "name": "OceanofPDF", "url": "https://oceanofpdf.com", "color": "#3498db", "builtIn": True},
    {"id": "getcomics", "name": "GetComics", "url": "https://getcomics.org", "color": "#2ecc71", "builtIn": True},
    {"id": "zlibrary", "name": "Z-Library", "url": "https://z-lib.is", "color": "#f39c12", "builtIn": True},
    {"id": "nyaa", "name": "Nyaa", "url": "https://nyaa.si", "color": "#9b59b6", "builtIn": True},
    {"id": "libgen", "name": "Library Genesis", "url": "https://libgen.is", "color": "#1abc9c", "builtIn": True},
]


# ---------------------------------------------------------------------------
# URL fixup
# ---------------------------------------------------------------------------

_SCHEME_RE = re.compile(r"^[a-zA-Z][a-zA-Z0-9+\-.]*://")


def _fixup_url(raw: str) -> str:
    text = raw.strip()
    if not text:
        return ""
    if _SCHEME_RE.match(text):
        return text
    if "." in text and " " not in text:
        return "https://" + text
    return "https://www.google.com/search?q=" + text


# ---------------------------------------------------------------------------
# Sources persistence
# ---------------------------------------------------------------------------

_SOURCES_FILE = "web_sources.json"


def _read_sources():
    """Read sources from web_sources.json, falling back to defaults."""
    p = storage.data_path(_SOURCES_FILE)
    try:
        with open(p, "r", encoding="utf-8") as f:
            data = json.load(f)
        if isinstance(data, dict) and isinstance(data.get("sources"), list):
            return data["sources"]
    except (FileNotFoundError, json.JSONDecodeError, OSError):
        pass
    return list(DEFAULT_SOURCES)


def _write_sources(sources):
    """Persist sources to web_sources.json."""
    p = storage.data_path(_SOURCES_FILE)
    os.makedirs(os.path.dirname(p), exist_ok=True)
    with open(p, "w", encoding="utf-8") as f:
        json.dump({"sources": sources, "updatedAt": 0}, f, indent=2)


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
        f"  font-family: '{FONT}'; font-size: 14px;"
        f"  {extra}"
        f"}}"
        f"QPushButton:hover {{ background: {SURFACE_HOVER};"
        f"  box-shadow: 0 12px 26px -18px rgba(0,0,0,0.85); }}"
        f"QPushButton:pressed {{ padding-top: 1px; }}"
        f"QPushButton:disabled {{ color: {TEXT_DISABLED}; background: rgba(255,255,255,0.03); }}"
    )


def _pill_btn_ss(extra=""):
    """Pill-shaped text button (← Library)."""
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


def _tab_pill_ss(active=False):
    """Container QWidget for a tab — has the glass tint, border, and radius."""
    bg = TAB_ACTIVE_BG if active else TAB_BG
    border = TAB_ACTIVE_BORDER if active else SURFACE_BORDER2
    return (
        f"background: {bg};"
        f"border: 1px solid {border}; border-radius: {RADIUS_SM}px;"
        f"min-height: 24px;"
    )


def _tab_title_ss(active=False):
    """Flat label-button inside the tab pill — transparent, no border."""
    color = TEXT if active else TEXT_MUTED
    return (
        f"QPushButton {{"
        f"  background: transparent; color: {color};"
        f"  border: none;"
        f"  font-family: '{FONT}'; font-size: 11px;"
        f"  padding: 3px 4px 3px 7px;"
        f"}}"
        f"QPushButton:hover {{ color: {TEXT}; }}"
    )


def _tab_close_ss():
    """Tiny × button inside a tab pill — transparent, no border."""
    return (
        f"QPushButton {{"
        f"  background: transparent; color: {TEXT_MUTED};"
        f"  border: none; border-radius: 4px;"
        f"  font-family: '{FONT}'; font-size: 10px;"
        f"  min-width: 16px; max-width: 16px; min-height: 16px; max-height: 16px;"
        f"  padding: 0; margin: 0 2px 0 0;"
        f"}}"
        f"QPushButton:hover {{ background: rgba(255,255,255,0.15); color: {TEXT}; }}"
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


# ---------------------------------------------------------------------------
# QPainter icon buttons — crisp vector icons at any DPI
# ---------------------------------------------------------------------------

class _StarButton(QPushButton):
    """30x30 glass button with a QPainter-drawn 5-pointed star (bookmark)."""

    def __init__(self, parent=None):
        super().__init__(parent)
        self.setFixedSize(ICON_BTN_SIZE, ICON_BTN_SIZE)
        self.setCursor(Qt.CursorShape.PointingHandCursor)
        self.setToolTip("Bookmark")
        self.setStyleSheet(_icon_btn_ss())

    def paintEvent(self, event):
        super().paintEvent(event)
        p = QPainter(self)
        p.setRenderHint(QPainter.RenderHint.Antialiasing)
        pen = QPen(QColor(245, 245, 245, 200))
        pen.setWidthF(1.4)
        p.setPen(pen)
        p.setBrush(Qt.BrushStyle.NoBrush)

        cx, cy, r = self.width() / 2, self.height() / 2, 6.5
        ri = r * 0.40
        pts = []
        for i in range(10):
            angle = math.radians(-90 + i * 36)
            rad = r if i % 2 == 0 else ri
            pts.append(QPointF(cx + rad * math.cos(angle), cy + rad * math.sin(angle)))
        p.drawPolygon(QPolygonF(pts))
        p.end()


class _ClockButton(QPushButton):
    """30x30 glass button with a QPainter-drawn clock + CCW arrow (history)."""

    def __init__(self, parent=None):
        super().__init__(parent)
        self.setFixedSize(ICON_BTN_SIZE, ICON_BTN_SIZE)
        self.setCursor(Qt.CursorShape.PointingHandCursor)
        self.setToolTip("History")
        self.setStyleSheet(_icon_btn_ss())

    def paintEvent(self, event):
        super().paintEvent(event)
        p = QPainter(self)
        p.setRenderHint(QPainter.RenderHint.Antialiasing)
        pen = QPen(QColor(245, 245, 245, 200))
        pen.setWidthF(1.4)
        p.setPen(pen)
        p.setBrush(Qt.BrushStyle.NoBrush)

        cx, cy, r = self.width() / 2, self.height() / 2, 6.5
        arc_rect = QRectF(cx - r, cy - r, r * 2, r * 2)
        p.drawArc(arc_rect, 150 * 16, 300 * 16)
        p.drawLine(QPointF(cx, cy), QPointF(cx, cy - 4.5))
        p.drawLine(QPointF(cx, cy), QPointF(cx + 3.5, cy))

        ax = cx - r * math.cos(math.radians(30))
        ay = cy + r * math.sin(math.radians(30))
        p.drawLine(QPointF(ax, ay), QPointF(ax - 3, ay - 1.5))
        p.drawLine(QPointF(ax, ay), QPointF(ax + 0.5, ay - 3.5))
        p.end()


# ---------------------------------------------------------------------------
# Custom QWebEnginePage — intercepts target=_blank to open in new tab
# ---------------------------------------------------------------------------

class _TankoWebPage(QWebEnginePage):
    """QWebEnginePage subclass that routes _blank links to a new tab."""

    def __init__(self, profile, tab_host, parent=None):
        super().__init__(profile, parent)
        self._tab_host = tab_host

    def createWindow(self, window_type):
        return self._tab_host.create_tab_and_return_page()


# ═══════════════════════════════════════════════════════════════════════════
# _HomeWidget — Qt-native homepage (sources grid, search bar, recent tabs)
# ═══════════════════════════════════════════════════════════════════════════

class _HomeWidget(QScrollArea):
    """
    Qt-native homepage shown when a tab has no URL loaded.

    Contains:
    - Search bar (Google search or URL entry)
    - SOURCES section — grid of source tiles
    - "+ Add Source" tile
    """

    def __init__(self, on_navigate, on_add_source, parent=None):
        super().__init__(parent)
        self._on_navigate = on_navigate    # callback(url: str)
        self._on_add_source = on_add_source  # callback() -> triggers add dialog

        self.setWidgetResizable(True)
        self.setFrameShape(QFrame.Shape.NoFrame)
        self.setStyleSheet(
            "QScrollArea { background: transparent; border: none; }"
            "QWidget#homeInner { background: transparent; }"
            f"QScrollBar:vertical {{"
            f"  background: transparent; width: 8px; margin: 0;"
            f"}}"
            f"QScrollBar::handle:vertical {{"
            f"  background: rgba(255,255,255,0.12); border-radius: 4px; min-height: 30px;"
            f"}}"
            f"QScrollBar::handle:vertical:hover {{ background: rgba(255,255,255,0.20); }}"
            f"QScrollBar::add-line:vertical, QScrollBar::sub-line:vertical {{ height: 0; }}"
        )

        inner = QWidget()
        inner.setObjectName("homeInner")
        self._inner_layout = QVBoxLayout(inner)
        self._inner_layout.setContentsMargins(24, 24, 24, 24)
        self._inner_layout.setSpacing(0)

        # Search bar row
        self._inner_layout.addWidget(self._build_search_bar())
        self._inner_layout.addSpacing(28)

        # SOURCES section header
        self._inner_layout.addWidget(self._build_section_header("SOURCES"))
        self._inner_layout.addSpacing(12)

        # Sources grid — will be populated by refresh_sources()
        self._sources_grid_widget = QWidget()
        self._sources_grid_widget.setStyleSheet("background: transparent; border: none;")
        self._sources_grid = QGridLayout(self._sources_grid_widget)
        self._sources_grid.setContentsMargins(0, 0, 0, 0)
        self._sources_grid.setSpacing(10)
        self._inner_layout.addWidget(self._sources_grid_widget)

        self._inner_layout.addStretch()
        self.setWidget(inner)

    def _build_search_bar(self):
        row = QWidget()
        row.setStyleSheet("background: transparent; border: none;")
        layout = QHBoxLayout(row)
        layout.setContentsMargins(0, 0, 0, 0)
        layout.setSpacing(8)

        self._search_input = QLineEdit()
        self._search_input.setPlaceholderText("Search the web or type a URL")
        self._search_input.setSizePolicy(QSizePolicy.Policy.Expanding, QSizePolicy.Policy.Fixed)
        self._search_input.setStyleSheet(
            f"QLineEdit {{"
            f"  background: {SURFACE}; color: {TEXT};"
            f"  border: 1px solid {SURFACE_BORDER}; border-radius: {RADIUS}px;"
            f"  padding: 0 14px; min-height: 38px;"
            f"  font-family: '{FONT}'; font-size: 13px;"
            f"  selection-background-color: rgba({ACCENT_RGB},0.3);"
            f"}}"
            f"QLineEdit:focus {{ border-color: rgba({ACCENT_RGB},0.35); }}"
        )
        self._search_input.returnPressed.connect(self._do_search)
        layout.addWidget(self._search_input)

        search_btn = QPushButton("Search")
        search_btn.setCursor(Qt.CursorShape.PointingHandCursor)
        search_btn.setStyleSheet(
            f"QPushButton {{"
            f"  background: rgba({ACCENT_RGB},0.15); color: {TEXT};"
            f"  border: 1px solid rgba({ACCENT_RGB},0.30); border-radius: {RADIUS}px;"
            f"  font-family: '{FONT}'; font-size: 12px; font-weight: 600;"
            f"  padding: 0 18px; min-height: 38px;"
            f"}}"
            f"QPushButton:hover {{ background: rgba({ACCENT_RGB},0.25); }}"
        )
        search_btn.clicked.connect(self._do_search)
        layout.addWidget(search_btn)

        return row

    def _build_section_header(self, text):
        header = QWidget()
        header.setFixedHeight(20)
        header.setStyleSheet("background: transparent; border: none;")
        layout = QHBoxLayout(header)
        layout.setContentsMargins(0, 0, 0, 0)
        layout.setSpacing(8)

        label = QLabel(text)
        label.setStyleSheet(
            f"background: transparent; border: none;"
            f"color: {TEXT_MUTED};"
            f"font-family: '{FONT}'; font-size: 11px; font-weight: 700;"
            f"letter-spacing: 0.10em;"
        )
        layout.addWidget(label)

        line = QFrame()
        line.setFrameShape(QFrame.Shape.HLine)
        line.setStyleSheet(f"background: {SURFACE_BORDER}; border: none; max-height: 1px;")
        line.setSizePolicy(QSizePolicy.Policy.Expanding, QSizePolicy.Policy.Fixed)
        layout.addWidget(line)

        return header

    def refresh_sources(self, sources):
        """Rebuild the sources grid from a list of source dicts."""
        # Clear existing tiles
        while self._sources_grid.count():
            item = self._sources_grid.takeAt(0)
            w = item.widget()
            if w:
                w.deleteLater()

        cols = 3  # tiles per row
        for i, src in enumerate(sources):
            tile = self._build_source_tile(src)
            self._sources_grid.addWidget(tile, i // cols, i % cols)

        # "+ Add Source" tile
        add_tile = self._build_add_tile()
        n = len(sources)
        self._sources_grid.addWidget(add_tile, n // cols, n % cols)

    def _build_source_tile(self, src):
        tile = QPushButton()
        tile.setCursor(Qt.CursorShape.PointingHandCursor)
        tile.setFixedHeight(60)
        tile.setSizePolicy(QSizePolicy.Policy.Expanding, QSizePolicy.Policy.Fixed)

        color = src.get("color", "#888888")
        name = src.get("name", "")
        url = src.get("url", "")
        # Show just the domain for the subtitle
        domain = url.replace("https://", "").replace("http://", "").rstrip("/")

        tile.setStyleSheet(
            f"QPushButton {{"
            f"  background: {SURFACE};"
            f"  border: 1px solid {SURFACE_BORDER}; border-radius: 8px;"
            f"  border-left: 4px solid {color};"
            f"  text-align: left; padding: 8px 12px;"
            f"  font-family: '{FONT}';"
            f"}}"
            f"QPushButton:hover {{ background: {SURFACE_HOVER}; }}"
        )

        # Use two-line layout via rich text isn't great in QPushButton,
        # so we use a custom widget inside. But for simplicity, use the
        # button text with a line break via \n — QPushButton respects it
        # if we set word wrap... Actually QPushButton doesn't support that.
        # Instead, overlay a QWidget with labels on top of the button.
        tile.setText("")
        tile.clicked.connect(lambda checked=False, u=url: self._on_navigate(u))

        # Overlay layout
        overlay = QVBoxLayout(tile)
        overlay.setContentsMargins(12, 6, 12, 6)
        overlay.setSpacing(2)

        name_label = QLabel(name)
        name_label.setStyleSheet(
            f"background: transparent; border: none; color: {TEXT};"
            f"font-family: '{FONT}'; font-size: 13px; font-weight: 600;"
        )
        name_label.setAttribute(Qt.WidgetAttribute.WA_TransparentForMouseEvents)
        overlay.addWidget(name_label)

        url_label = QLabel(domain)
        url_label.setStyleSheet(
            f"background: transparent; border: none; color: {TEXT_MUTED};"
            f"font-family: '{FONT}'; font-size: 11px;"
        )
        url_label.setAttribute(Qt.WidgetAttribute.WA_TransparentForMouseEvents)
        overlay.addWidget(url_label)

        return tile

    def _build_add_tile(self):
        tile = QPushButton("+ Add Source")
        tile.setCursor(Qt.CursorShape.PointingHandCursor)
        tile.setFixedHeight(60)
        tile.setSizePolicy(QSizePolicy.Policy.Expanding, QSizePolicy.Policy.Fixed)
        tile.setStyleSheet(
            f"QPushButton {{"
            f"  background: transparent;"
            f"  border: 2px dashed {SURFACE_BORDER}; border-radius: 8px;"
            f"  color: {TEXT_MUTED};"
            f"  font-family: '{FONT}'; font-size: 12px;"
            f"}}"
            f"QPushButton:hover {{ background: {SURFACE}; color: {TEXT}; }}"
        )
        tile.clicked.connect(self._on_add_source)
        return tile

    def _do_search(self):
        text = self._search_input.text().strip()
        if text:
            url = _fixup_url(text)
            self._on_navigate(url)


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

        # Tab state
        # Each tab: {"stack", "home", "view", "page", "title", "url", "on_home"}
        self._tabs = []
        self._active_idx = -1

        # Sources cache
        self._sources = _read_sources()

        # Shared profile for all tabs
        self._profile = QWebEngineProfile("tankoweb", self)
        cache_path = storage.data_path("TankowebEngine")
        self._profile.setCachePath(cache_path)
        self._profile.setPersistentStoragePath(cache_path)

        # Background animation
        self._bg_phase = 0.0
        self._bg_timer = QTimer(self)
        self._bg_timer.timeout.connect(self._tick_bg)
        self._bg_timer.start(60)

        self.setAttribute(Qt.WidgetAttribute.WA_OpaquePaintEvent)

        root = QVBoxLayout(self)
        root.setContentsMargins(SIDE_MARGIN, 8, SIDE_MARGIN, BOTTOM_MARGIN)
        root.setSpacing(0)

        # Row 1: ← Library ... — □ ✕
        root.addWidget(self._build_chrome_row())
        root.addSpacing(12)

        # Row 2: TANKOBROWSER
        root.addWidget(self._build_title_label())
        root.addSpacing(12)

        # Row 3: Tab row
        self._tab_row = self._build_tab_row()
        root.addWidget(self._tab_row)
        root.addSpacing(6)

        # Row 4: Nav row
        root.addWidget(self._build_nav_row())
        root.addSpacing(8)

        # Row 5: Viewport — holds per-tab QStackedWidgets
        self._build_browser(root)

        # Keyboard shortcuts
        QShortcut(QKeySequence("Ctrl+T"), self, self._shortcut_new_tab)
        QShortcut(QKeySequence("Ctrl+W"), self, self._shortcut_close_tab)
        QShortcut(QKeySequence("Ctrl+Tab"), self, self._shortcut_next_tab)
        QShortcut(QKeySequence("Ctrl+Shift+Tab"), self, self._shortcut_prev_tab)

        # Create first tab — starts on home page
        self._create_tab()

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
        row.setMinimumHeight(ICON_BTN_SIZE)
        row.setFixedHeight(ICON_BTN_SIZE)
        row.setStyleSheet("background: transparent; border: none;")

        layout = QHBoxLayout(row)
        layout.setContentsMargins(0, 0, 0, 0)
        layout.setSpacing(6)

        back_btn = QPushButton("\u2190 Library")
        back_btn.setCursor(Qt.CursorShape.PointingHandCursor)
        back_btn.setStyleSheet(_pill_btn_ss("font-size: 13px;"))
        back_btn.clicked.connect(self._go_back)
        _apply_shadow(back_btn, blur=18, dy=6, color=QColor(0, 0, 0, 140))
        layout.addWidget(back_btn)

        layout.addStretch()

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
            f"letter-spacing: 0.08em;"
            f"padding: 0 2px;"
        )
        label.setFixedHeight(16)
        return label

    # ══════════════════════════════════════════════════════════════════════
    # Row 3: Tab row — dynamic tab pills + new-tab button
    # ══════════════════════════════════════════════════════════════════════

    def _build_tab_row(self):
        row = QWidget()
        row.setMinimumHeight(ICON_BTN_SIZE)
        row.setFixedHeight(ICON_BTN_SIZE)
        row.setStyleSheet("background: transparent; border: none;")

        self._tab_layout = QHBoxLayout(row)
        self._tab_layout.setContentsMargins(0, 0, 0, 0)
        self._tab_layout.setSpacing(6)

        self._tab_layout.addStretch()

        self._new_tab_btn = QPushButton("+")
        self._new_tab_btn.setCursor(Qt.CursorShape.PointingHandCursor)
        self._new_tab_btn.setStyleSheet(
            f"QPushButton {{"
            f"  min-width: 28px; max-width: 28px; min-height: 28px; max-height: 28px;"
            f"  background: {SURFACE}; color: {TEXT_MUTED};"
            f"  border: 1px solid {SURFACE_BORDER}; border-radius: {RADIUS_SM}px;"
            f"  font-family: '{FONT}'; font-size: 16px;"
            f"}}"
            f"QPushButton:hover {{ color: {TEXT}; background: {SURFACE_HOVER}; }}"
        )
        self._new_tab_btn.clicked.connect(lambda: self._create_tab())
        self._tab_layout.addWidget(self._new_tab_btn)

        return row

    def _rebuild_tab_pills(self):
        """Clear and rebuild all tab pill buttons to match self._tabs."""
        while self._tab_layout.count() > 2:
            item = self._tab_layout.takeAt(0)
            w = item.widget()
            if w:
                w.deleteLater()

        for i, tab in enumerate(self._tabs):
            is_active = (i == self._active_idx)

            pill = QWidget()
            pill.setStyleSheet(_tab_pill_ss(active=is_active))
            pill.setCursor(Qt.CursorShape.PointingHandCursor)
            pill_layout = QHBoxLayout(pill)
            pill_layout.setContentsMargins(0, 0, 0, 0)
            pill_layout.setSpacing(0)

            title = tab["title"] or ("Home" if tab["on_home"] else "New Tab")
            display = title if len(title) <= 20 else title[:18] + "\u2026"
            title_btn = QPushButton(display)
            title_btn.setCursor(Qt.CursorShape.PointingHandCursor)
            title_btn.setStyleSheet(_tab_title_ss(active=is_active))
            idx = i
            title_btn.clicked.connect(lambda checked=False, x=idx: self._switch_tab(x))
            pill_layout.addWidget(title_btn)

            if len(self._tabs) > 1:
                close_btn = QPushButton("\u2715")
                close_btn.setCursor(Qt.CursorShape.PointingHandCursor)
                close_btn.setStyleSheet(_tab_close_ss())
                close_btn.clicked.connect(lambda checked=False, x=idx: self._close_tab(x))
                pill_layout.addWidget(close_btn)

            self._tab_layout.insertWidget(i, pill)

    # ══════════════════════════════════════════════════════════════════════
    # Row 4: Nav row
    # ══════════════════════════════════════════════════════════════════════

    def _build_nav_row(self):
        row = QWidget()
        row.setMinimumHeight(ICON_BTN_SIZE + 6)
        row.setFixedHeight(ICON_BTN_SIZE + 6)
        row.setStyleSheet("background: transparent; border: none;")

        layout = QHBoxLayout(row)
        layout.setContentsMargins(0, 0, 0, 0)
        layout.setSpacing(6)

        self._nav_back_btn = QPushButton("\u25C0")
        self._nav_back_btn.setEnabled(False)
        self._nav_back_btn.setCursor(Qt.CursorShape.PointingHandCursor)
        self._nav_back_btn.setStyleSheet(_icon_btn_ss())
        self._nav_back_btn.setToolTip("Back")
        self._nav_back_btn.clicked.connect(self._nav_back)
        layout.addWidget(self._nav_back_btn)

        self._nav_fwd_btn = QPushButton("\u25B6")
        self._nav_fwd_btn.setEnabled(False)
        self._nav_fwd_btn.setCursor(Qt.CursorShape.PointingHandCursor)
        self._nav_fwd_btn.setStyleSheet(_icon_btn_ss())
        self._nav_fwd_btn.setToolTip("Forward")
        self._nav_fwd_btn.clicked.connect(self._nav_forward)
        layout.addWidget(self._nav_fwd_btn)

        self._reload_btn = QPushButton("\u27F3")
        self._reload_btn.setCursor(Qt.CursorShape.PointingHandCursor)
        self._reload_btn.setStyleSheet(_icon_btn_ss())
        self._reload_btn.setToolTip("Reload")
        self._reload_btn.clicked.connect(self._reload_or_stop)
        self._is_loading = False
        layout.addWidget(self._reload_btn)

        self._address_bar = QLineEdit()
        self._address_bar.setPlaceholderText("Search or enter URL")
        self._address_bar.setSizePolicy(QSizePolicy.Policy.Expanding, QSizePolicy.Policy.Fixed)
        self._address_bar.setStyleSheet(_omni_ss())
        self._address_bar.returnPressed.connect(self._navigate_to_input)
        layout.addWidget(self._address_bar)

        go_btn = QPushButton("\u25B6")
        go_btn.setCursor(Qt.CursorShape.PointingHandCursor)
        go_btn.setStyleSheet(_icon_btn_ss())
        go_btn.setToolTip("Go")
        go_btn.clicked.connect(self._navigate_to_input)
        layout.addWidget(go_btn)

        # Home button — returns active tab to home page
        self._home_btn = QPushButton("\u2302")  # ⌂
        self._home_btn.setCursor(Qt.CursorShape.PointingHandCursor)
        self._home_btn.setStyleSheet(_icon_btn_ss())
        self._home_btn.setToolTip("Home")
        self._home_btn.clicked.connect(self._go_home)
        layout.addWidget(self._home_btn)

        bk_btn = _StarButton()
        layout.addWidget(bk_btn)

        hist_btn = _ClockButton()
        layout.addWidget(hist_btn)

        return row

    # ══════════════════════════════════════════════════════════════════════
    # Row 5: Viewport — holds per-tab QStackedWidgets
    # ══════════════════════════════════════════════════════════════════════

    def _build_browser(self, root_layout):
        self._viewport_frame = QFrame(self)
        self._update_viewport_style(on_home=True)
        self._viewport_frame.setSizePolicy(
            QSizePolicy.Policy.Expanding, QSizePolicy.Policy.Expanding
        )
        _apply_shadow(self._viewport_frame, blur=28, dy=10, color=QColor(0, 0, 0, 200))

        frame_layout = QVBoxLayout(self._viewport_frame)
        frame_layout.setContentsMargins(0, 0, 0, 0)
        frame_layout.setSpacing(0)

        # Master stack holds per-tab stacks
        self._view_stack = QStackedWidget()
        self._view_stack.setSizePolicy(
            QSizePolicy.Policy.Expanding, QSizePolicy.Policy.Expanding
        )
        frame_layout.addWidget(self._view_stack)
        root_layout.addWidget(self._viewport_frame, 1)

    def _update_viewport_style(self, on_home):
        """Toggle viewport frame between transparent (home) and opaque (web)."""
        if on_home:
            self._viewport_frame.setStyleSheet(
                "QFrame { background: transparent; border: none; }"
            )
            effect = self._viewport_frame.graphicsEffect()
            if effect:
                effect.setEnabled(False)
        else:
            self._viewport_frame.setStyleSheet(
                f"QFrame {{"
                f"  background: rgba(10,16,24,0.92);"
                f"  border: 1px solid {SURFACE_BORDER2};"
                f"  border-radius: {RADIUS_VIEWPORT}px;"
                f"}}"
            )
            effect = self._viewport_frame.graphicsEffect()
            if effect:
                effect.setEnabled(True)

    # ══════════════════════════════════════════════════════════════════════
    # Tab lifecycle
    # ══════════════════════════════════════════════════════════════════════

    def _create_tab(self, url=None, switch_to=True):
        """Create a new tab. If url is None, starts on the home page."""
        if len(self._tabs) >= MAX_TABS:
            return self._active_idx

        page = _TankoWebPage(self._profile, self, self)
        page.setBackgroundColor(QColor(10, 16, 24))

        s = page.settings()
        s.setAttribute(QWebEngineSettings.WebAttribute.JavascriptEnabled, True)
        s.setAttribute(QWebEngineSettings.WebAttribute.LocalStorageEnabled, True)
        s.setAttribute(QWebEngineSettings.WebAttribute.PluginsEnabled, True)

        view = QWebEngineView(self)
        view.setPage(page)
        view.setSizePolicy(QSizePolicy.Policy.Expanding, QSizePolicy.Policy.Expanding)

        # Per-tab stack: index 0 = home, index 1 = web view
        tab_stack = QStackedWidget()
        tab_stack.setSizePolicy(QSizePolicy.Policy.Expanding, QSizePolicy.Policy.Expanding)

        idx = len(self._tabs)

        home = _HomeWidget(
            on_navigate=lambda u, i=idx: self._home_navigate(i, u),
            on_add_source=self._add_source_dialog,
        )
        home.refresh_sources(self._sources)

        tab_stack.addWidget(home)     # index 0 = home
        tab_stack.addWidget(view)     # index 1 = web view

        start_on_home = (url is None)

        self._tabs.append({
            "stack": tab_stack,
            "home": home,
            "view": view,
            "page": page,
            "title": "" if not start_on_home else "",
            "url": url or "",
            "on_home": start_on_home,
        })

        self._view_stack.addWidget(tab_stack)

        # Wire signals
        tab_idx = idx
        page.urlChanged.connect(lambda qurl, i=tab_idx: self._on_tab_url_changed(i, qurl))
        page.titleChanged.connect(lambda title, i=tab_idx: self._on_tab_title_changed(i, title))
        page.loadStarted.connect(lambda i=tab_idx: self._on_tab_load_started(i))
        page.loadFinished.connect(lambda ok, i=tab_idx: self._on_tab_load_finished(i, ok))

        back_action = page.action(QWebEnginePage.WebAction.Back)
        back_action.changed.connect(lambda i=tab_idx: self._update_nav_state(i))
        fwd_action = page.action(QWebEnginePage.WebAction.Forward)
        fwd_action.changed.connect(lambda i=tab_idx: self._update_nav_state(i))

        if start_on_home:
            tab_stack.setCurrentIndex(0)
        else:
            tab_stack.setCurrentIndex(1)
            view.load(QUrl(url))

        if switch_to:
            self._switch_tab(idx)
        else:
            self._rebuild_tab_pills()

        return idx

    def create_tab_and_return_page(self):
        """Called by _TankoWebPage.createWindow — creates tab and returns its page."""
        if len(self._tabs) >= MAX_TABS:
            return None
        idx = self._create_tab(url=None, switch_to=True)
        # Flip to web view since content is coming
        self._tabs[idx]["on_home"] = False
        self._tabs[idx]["stack"].setCurrentIndex(1)
        self._update_viewport_style(False)
        return self._tabs[idx]["page"]

    def _close_tab(self, idx):
        """Close tab at index. If last tab, create a fresh one first."""
        if idx < 0 or idx >= len(self._tabs):
            return

        if len(self._tabs) == 1:
            self._create_tab(switch_to=False)
            idx = 0

        tab = self._tabs.pop(idx)
        self._view_stack.removeWidget(tab["stack"])
        tab["view"].deleteLater()
        tab["page"].deleteLater()
        tab["home"].deleteLater()
        tab["stack"].deleteLater()

        self._rewire_tab_signals()

        if self._active_idx >= len(self._tabs):
            self._active_idx = len(self._tabs) - 1
        elif self._active_idx > idx:
            self._active_idx -= 1
        elif self._active_idx == idx:
            self._active_idx = min(idx, len(self._tabs) - 1)

        self._switch_tab(self._active_idx)

    def _switch_tab(self, idx):
        """Activate tab at index."""
        if idx < 0 or idx >= len(self._tabs):
            return
        self._active_idx = idx
        tab = self._tabs[idx]
        self._view_stack.setCurrentWidget(tab["stack"])

        self._update_viewport_style(tab["on_home"])

        if tab["on_home"]:
            self._address_bar.clear()
            self._nav_back_btn.setEnabled(False)
            self._nav_fwd_btn.setEnabled(False)
            self._is_loading = False
            self._reload_btn.setText("\u27F3")
        else:
            url = tab["page"].url()
            if url and url.toString() and url.toString() != "about:blank":
                self._address_bar.setText(url.toString())
            else:
                self._address_bar.clear()
            self._update_nav_state(idx)

        self._rebuild_tab_pills()

    def _rewire_tab_signals(self):
        """Rewire all tab signals after an index shift (tab close)."""
        for i, tab in enumerate(self._tabs):
            page = tab["page"]
            try:
                page.urlChanged.disconnect()
                page.titleChanged.disconnect()
                page.loadStarted.disconnect()
                page.loadFinished.disconnect()
            except RuntimeError:
                pass

            idx = i
            page.urlChanged.connect(lambda qurl, x=idx: self._on_tab_url_changed(x, qurl))
            page.titleChanged.connect(lambda title, x=idx: self._on_tab_title_changed(x, title))
            page.loadStarted.connect(lambda x=idx: self._on_tab_load_started(x))
            page.loadFinished.connect(lambda ok, x=idx: self._on_tab_load_finished(x, ok))

            back_action = page.action(QWebEnginePage.WebAction.Back)
            fwd_action = page.action(QWebEnginePage.WebAction.Forward)
            try:
                back_action.changed.disconnect()
                fwd_action.changed.disconnect()
            except RuntimeError:
                pass
            back_action.changed.connect(lambda x=idx: self._update_nav_state(x))
            fwd_action.changed.connect(lambda x=idx: self._update_nav_state(x))

        # Also update home widget navigate callbacks
        for i, tab in enumerate(self._tabs):
            tab["home"]._on_navigate = lambda u, x=i: self._home_navigate(x, u)

    # ══════════════════════════════════════════════════════════════════════
    # Home page interaction
    # ══════════════════════════════════════════════════════════════════════

    def _home_navigate(self, tab_idx, url):
        """Called when user clicks a source tile or searches from the home page."""
        if tab_idx < 0 or tab_idx >= len(self._tabs):
            return
        tab = self._tabs[tab_idx]
        tab["on_home"] = False
        tab["stack"].setCurrentIndex(1)
        tab["view"].load(QUrl(url))

        if tab_idx == self._active_idx:
            self._update_viewport_style(False)
            self._address_bar.setText(url)

    def _go_home(self):
        """Return active tab to the home page."""
        if self._active_idx < 0 or self._active_idx >= len(self._tabs):
            return
        tab = self._tabs[self._active_idx]
        tab["on_home"] = True
        tab["title"] = ""
        tab["url"] = ""
        tab["stack"].setCurrentIndex(0)
        tab["home"].refresh_sources(self._sources)
        self._update_viewport_style(True)
        self._address_bar.clear()
        self._nav_back_btn.setEnabled(False)
        self._nav_fwd_btn.setEnabled(False)
        self._is_loading = False
        self._reload_btn.setText("\u27F3")
        self._rebuild_tab_pills()

    def _add_source_dialog(self):
        """Show input dialogs to add a new source."""
        name, ok1 = QInputDialog.getText(self, "Add Source", "Source name:")
        if not ok1 or not name.strip():
            return
        url, ok2 = QInputDialog.getText(self, "Add Source", "Source URL:")
        if not ok2 or not url.strip():
            return

        url = url.strip()
        if not _SCHEME_RE.match(url):
            url = "https://" + url

        # Pick a color from a rotating palette
        colors = ["#e74c3c", "#3498db", "#2ecc71", "#f39c12", "#9b59b6", "#1abc9c", "#e67e22", "#34495e"]
        color = colors[len(self._sources) % len(colors)]

        new_source = {
            "id": f"src_{len(self._sources)}_{name.strip().lower().replace(' ', '')}",
            "name": name.strip(),
            "url": url,
            "color": color,
            "builtIn": False,
        }
        self._sources.append(new_source)
        _write_sources(self._sources)

        # Refresh all home widgets
        for tab in self._tabs:
            tab["home"].refresh_sources(self._sources)

    # ══════════════════════════════════════════════════════════════════════
    # Tab signal handlers
    # ══════════════════════════════════════════════════════════════════════

    def _on_tab_url_changed(self, tab_idx, qurl):
        if tab_idx < len(self._tabs):
            self._tabs[tab_idx]["url"] = qurl.toString()
        if tab_idx == self._active_idx:
            self._address_bar.setText(qurl.toString())

    def _on_tab_title_changed(self, tab_idx, title):
        if tab_idx < len(self._tabs):
            self._tabs[tab_idx]["title"] = title
        if tab_idx == self._active_idx:
            self._rebuild_tab_pills()

    def _on_tab_load_started(self, tab_idx):
        if tab_idx == self._active_idx:
            self._is_loading = True
            self._reload_btn.setText("\u2715")
            self._reload_btn.setToolTip("Stop")

    def _on_tab_load_finished(self, tab_idx, ok):
        if tab_idx == self._active_idx:
            self._is_loading = False
            self._reload_btn.setText("\u27F3")
            self._reload_btn.setToolTip("Reload")

    def _update_nav_state(self, tab_idx):
        if tab_idx != self._active_idx:
            return
        if tab_idx < len(self._tabs):
            page = self._tabs[tab_idx]["page"]
            self._nav_back_btn.setEnabled(
                page.action(QWebEnginePage.WebAction.Back).isEnabled()
            )
            self._nav_fwd_btn.setEnabled(
                page.action(QWebEnginePage.WebAction.Forward).isEnabled()
            )

    # ══════════════════════════════════════════════════════════════════════
    # Navigation actions — operate on active tab
    # ══════════════════════════════════════════════════════════════════════

    def _active_view(self):
        if 0 <= self._active_idx < len(self._tabs):
            return self._tabs[self._active_idx]["view"]
        return None

    def _navigate_to_input(self):
        text = self._address_bar.text().strip()
        if not text:
            return

        url = _fixup_url(text)
        if self._active_idx >= 0 and self._active_idx < len(self._tabs):
            tab = self._tabs[self._active_idx]
            if tab["on_home"]:
                tab["on_home"] = False
                tab["stack"].setCurrentIndex(1)
                self._update_viewport_style(False)
            tab["view"].load(QUrl(url))

    def _reload_or_stop(self):
        view = self._active_view()
        if not view:
            return
        if self._is_loading:
            view.stop()
        else:
            view.reload()

    def _nav_back(self):
        view = self._active_view()
        if view:
            view.back()

    def _nav_forward(self):
        view = self._active_view()
        if view:
            view.forward()

    # ══════════════════════════════════════════════════════════════════════
    # Keyboard shortcuts
    # ══════════════════════════════════════════════════════════════════════

    def _shortcut_new_tab(self):
        self._create_tab()

    def _shortcut_close_tab(self):
        self._close_tab(self._active_idx)

    def _shortcut_next_tab(self):
        if len(self._tabs) > 1:
            self._switch_tab((self._active_idx + 1) % len(self._tabs))

    def _shortcut_prev_tab(self):
        if len(self._tabs) > 1:
            self._switch_tab((self._active_idx - 1) % len(self._tabs))

    # ══════════════════════════════════════════════════════════════════════
    # Top bar actions
    # ══════════════════════════════════════════════════════════════════════

    def _go_back(self):
        if self._on_back:
            self._on_back()

    def _window_action(self, action):
        if self._on_window_action:
            self._on_window_action(action)
