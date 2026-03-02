"""
TankoWeb Widget — Qt-native Web mode panel.

A pure-Qt widget that sits at stack index 2 in the QStackedWidget.
Glass aesthetic matching the Electron TankoBrowser: animated gradient
background skin, floating disconnected widgets, rounded browser viewport.

Every chrome element (buttons, URL bar, tabs, Bookmark, History) is its
own independent glass pill floating over the gradient — nothing is joined.

Slice 4: Homepage is an HTML file loaded inside QWebEngineView itself.
No Qt overlay widgets — avoids native widget z-order issues on Windows.
The home page communicates with Qt via tankoweb:// URL scheme interception.
"""

import json
import math
import os
import re
import threading
import urllib.parse

from PySide6.QtCore import Qt, QUrl, QTimer, QRectF, QPointF, QSize
from PySide6.QtGui import (
    QPainter, QRadialGradient, QLinearGradient, QColor,
    QPen, QPolygonF, QPainterPath, QShortcut, QKeySequence,
)
from PySide6.QtWidgets import (
    QWidget, QVBoxLayout, QHBoxLayout, QPushButton, QLineEdit, QLabel,
    QSizePolicy, QGraphicsDropShadowEffect, QFrame, QStackedWidget,
    QInputDialog,
)
from PySide6.QtWebEngineWidgets import QWebEngineView
from PySide6.QtWebEngineCore import (
    QWebEnginePage, QWebEngineProfile, QWebEngineSettings,
)

import storage
from cf_solver import CfSolver
from tor_proxy import TorProxy

# ---------------------------------------------------------------------------
# Home page — loaded inside QWebEngineView as an HTML file
# ---------------------------------------------------------------------------
_HOME_HTML_PATH = os.path.join(os.path.dirname(__file__), "data", "browser_home.html")
_HOME_URL = QUrl.fromLocalFile(_HOME_HTML_PATH)

# Hub page — torrent search/downloads loaded as a tab
_HUB_HTML_PATH = os.path.join(os.path.dirname(__file__), "data", "browser_hub.html")
_HUB_URL = QUrl.fromLocalFile(_HUB_HTML_PATH)

def _is_home_url(url):
    """Check if a QUrl points to the home page."""
    if not url or url.isEmpty():
        return True
    s = url.toString()
    return s == "about:blank" or s.startswith("file:") and "browser_home.html" in s

def _is_hub_url(url):
    """Check if a QUrl points to the hub page."""
    if not url or url.isEmpty():
        return False
    return "browser_hub.html" in url.toString()

def _is_special_url(url):
    """Check if a URL is home or hub (special pages with transparent background)."""
    return _is_home_url(url) or _is_hub_url(url)

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
    return "https://yandex.com/search/?text=" + text


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

class _TorButton(QPushButton):
    """30x30 glass button with a QPainter-drawn Tor onion icon + status badge.

    States:
      - off: muted grey onion
      - connecting: amber onion with pulsing glow
      - active: purple onion (#bb86fc) with green badge dot
    """
    # Tor purple (from Aspect browser)
    _PURPLE = QColor(187, 134, 252)       # #bb86fc
    _AMBER = QColor(220, 180, 50)
    _MUTED = QColor(200, 200, 200, 130)
    _GREEN = QColor(80, 220, 80)

    def __init__(self, parent=None):
        super().__init__(parent)
        self.setFixedSize(ICON_BTN_SIZE, ICON_BTN_SIZE)
        self.setCursor(Qt.CursorShape.PointingHandCursor)
        self.setToolTip("Connect to Tor (Ctrl+Shift+T)")
        self._state = "off"  # "off", "connecting", "active"
        self._update_style()

    def set_state(self, state):
        """Set state: 'off', 'connecting', or 'active'."""
        self._state = state
        self._update_style()
        self.update()

    def _update_style(self):
        if self._state == "active":
            self.setStyleSheet(
                f"QPushButton {{"
                f"  min-width: {ICON_BTN_SIZE}px; max-width: {ICON_BTN_SIZE}px;"
                f"  min-height: {ICON_BTN_SIZE}px; max-height: {ICON_BTN_SIZE}px;"
                f"  background: rgba(187,134,252,0.20); color: #bb86fc;"
                f"  border: 1px solid rgba(187,134,252,0.40); border-radius: {RADIUS}px;"
                f"}}"
                f"QPushButton:hover {{ background: rgba(187,134,252,0.30); }}"
                f"QPushButton:pressed {{ padding-top: 1px; }}"
            )
            self.setToolTip("Tor connected — click to disconnect")
        elif self._state == "connecting":
            self.setStyleSheet(
                f"QPushButton {{"
                f"  min-width: {ICON_BTN_SIZE}px; max-width: {ICON_BTN_SIZE}px;"
                f"  min-height: {ICON_BTN_SIZE}px; max-height: {ICON_BTN_SIZE}px;"
                f"  background: rgba(220,180,50,0.15); color: rgba(220,180,50,0.90);"
                f"  border: 1px solid rgba(220,180,50,0.30); border-radius: {RADIUS}px;"
                f"}}"
            )
            self.setToolTip("Connecting to Tor...")
        else:
            self.setStyleSheet(_icon_btn_ss())
            self.setToolTip("Connect to Tor (Ctrl+Shift+T)")

    def paintEvent(self, event):
        super().paintEvent(event)
        p = QPainter(self)
        p.setRenderHint(QPainter.RenderHint.Antialiasing)

        cx, cy = self.width() / 2, self.height() / 2

        # Choose icon color based on state
        if self._state == "active":
            color = self._PURPLE
        elif self._state == "connecting":
            color = self._AMBER
        else:
            color = self._MUTED

        # Draw onion icon — simplified Tor onion shape
        # Outer bulb (ellipse)
        pen = QPen(color)
        pen.setWidthF(1.5)
        p.setPen(pen)
        p.setBrush(Qt.BrushStyle.NoBrush)

        # Main onion body — slightly taller than wide
        ox, oy = cx, cy + 0.5
        rw, rh = 5.5, 7.0
        p.drawEllipse(QRectF(ox - rw, oy - rh, rw * 2, rh * 2))

        # Inner layer (smaller concentric ellipse)
        pen.setWidthF(1.2)
        p.setPen(pen)
        rw2, rh2 = 3.2, 4.5
        p.drawEllipse(QRectF(ox - rw2, oy - rh2 + 0.8, rw2 * 2, rh2 * 2))

        # Inner core (small circle)
        pen.setWidthF(1.0)
        p.setPen(pen)
        p.drawEllipse(QRectF(ox - 1.3, oy - 0.8, 2.6, 2.6))

        # Stem/leaf on top
        pen.setWidthF(1.4)
        p.setPen(pen)
        top_y = oy - rh
        path = QPainterPath()
        path.moveTo(ox, top_y)
        path.cubicTo(ox + 2, top_y - 3.5, ox + 4.5, top_y - 2, ox + 3.5, top_y + 0.5)
        p.drawPath(path)

        # Badge dot (bottom-right) — green when active
        if self._state == "active":
            badge_r = 3.5
            bx = self.width() - badge_r - 2
            by = self.height() - badge_r - 2
            p.setPen(Qt.PenStyle.NoPen)
            p.setBrush(self._GREEN)
            p.drawEllipse(QRectF(bx - badge_r, by - badge_r, badge_r * 2, badge_r * 2))
            # Dark outline for contrast
            outline_pen = QPen(QColor(5, 5, 5))
            outline_pen.setWidthF(1.5)
            p.setPen(outline_pen)
            p.setBrush(Qt.BrushStyle.NoBrush)
            p.drawEllipse(QRectF(bx - badge_r, by - badge_r, badge_r * 2, badge_r * 2))

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
    """QWebEnginePage subclass that routes _blank links to a new tab
    and intercepts tankoweb:// scheme for home page communication."""

    def __init__(self, profile, tab_host, parent=None):
        super().__init__(profile, parent)
        self._tab_host = tab_host

    def createWindow(self, window_type):
        return self._tab_host.create_tab_and_return_page()

    def acceptNavigationRequest(self, url, nav_type, is_main_frame):
        """Intercept tankoweb:// URLs from the home page and hub page."""
        if url.scheme() == "tankoweb":
            host = url.host()
            params = urllib.parse.parse_qs(QUrl(url).query())

            if host == "navigate":
                target = params.get("url", [""])[0]
                if target:
                    self._tab_host._navigate_from_home(self, target)
            elif host == "search":
                query = params.get("q", [""])[0]
                if query:
                    real_url = _fixup_url(query)
                    self._tab_host._navigate_from_home(self, real_url)
            elif host == "add-source":
                self._tab_host._add_source_dialog()
            # Hub commands
            elif host == "hub-search":
                query = params.get("q", [""])[0]
                source = params.get("source", ["all"])[0]
                provider = params.get("provider", ["prowlarr"])[0]
                if query:
                    self._tab_host._hub_search(query, source, provider)
            elif host == "hub-add-magnet":
                uri = params.get("uri", [""])[0]
                if uri:
                    self._tab_host._hub_add_magnet(uri)
            elif host.startswith("hub-torrent-"):
                action = host.replace("hub-torrent-", "")
                hash_ = params.get("hash", [""])[0]
                if action and hash_:
                    self._tab_host._hub_torrent_action(action, hash_)
            elif host == "hub-clear-downloads":
                self._tab_host._hub_clear_downloads()
            elif host == "open-url":
                target = params.get("url", [""])[0]
                if target:
                    self._tab_host._open_in_new_tab(target)
            elif host == "open-external":
                target = params.get("url", [""])[0]
                if target:
                    import webbrowser
                    webbrowser.open(target)
            return False  # block the tankoweb:// navigation
        return super().acceptNavigationRequest(url, nav_type, is_main_frame)


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
        # Each tab: {"view", "page", "title", "url"}
        self._tabs = []
        self._active_idx = -1

        # Sources cache
        self._sources = _read_sources()

        # Shared profile for all tabs
        self._profile = QWebEngineProfile("tankoweb", self)
        cache_path = storage.data_path("TankowebEngine")
        self._profile.setCachePath(cache_path)
        self._profile.setPersistentStoragePath(cache_path)
        # Real Chrome UA — avoids captcha triggers from "QtWebEngine" in default UA
        self._profile.setHttpUserAgent(
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/131.0.0.0 Safari/537.36"
        )
        # Inject anti-detection script before any page JS runs
        self._inject_antibot_script()

        # CF solver (lazy — created on first use, shares profile for cookies)
        self._cf_solver = None
        self._cf_pending_search = None  # (query, source) to retry after solve

        # Tor proxy — routes browser traffic through Tor SOCKS5
        self._tor = TorProxy(parent=self)
        self._tor.status_changed.connect(self._on_tor_status_changed)

        # Background animation — very slow drift, pauses when not needed
        self._bg_phase = 0.0
        self._bg_timer = QTimer(self)
        self._bg_timer.timeout.connect(self._tick_bg)
        self._bg_timer.start(500)  # repaint every 500ms (was 60ms — 8x less CPU)

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
        QShortcut(QKeySequence("Ctrl+Shift+T"), self, self._toggle_tor)

        # Create first tab — starts on home page
        self._create_tab()

    # ══════════════════════════════════════════════════════════════════════
    # Anti-bot script injection
    # ══════════════════════════════════════════════════════════════════════

    def _inject_antibot_script(self):
        """Inject a script into every page that hides automation fingerprints.

        Captcha services (Yandex SmartCaptcha, Cloudflare, hCaptcha) check for
        navigator.webdriver, missing plugins, and other signals to detect bots.
        This script runs before any page JS and patches those signals.
        """
        from PySide6.QtWebEngineCore import QWebEngineScript

        js = """
        // Hide webdriver flag
        Object.defineProperty(navigator, 'webdriver', { get: () => false });

        // Ensure navigator.plugins is non-empty (bots have 0 plugins)
        if (navigator.plugins.length === 0) {
            Object.defineProperty(navigator, 'plugins', {
                get: () => [
                    { name: 'Chrome PDF Plugin', filename: 'internal-pdf-viewer' },
                    { name: 'Chrome PDF Viewer', filename: 'mhjfbmdgcfjbbpaeojofohoefgiehjai' },
                    { name: 'Native Client', filename: 'internal-nacl-plugin' },
                ]
            });
        }

        // Ensure navigator.languages is populated
        if (!navigator.languages || navigator.languages.length === 0) {
            Object.defineProperty(navigator, 'languages', {
                get: () => ['en-US', 'en']
            });
        }

        // Chrome runtime stub (checked by some captcha scripts)
        if (!window.chrome) {
            window.chrome = { runtime: {}, loadTimes: function(){}, csi: function(){} };
        }

        // Fix permissions query for notifications (bot detection vector)
        const origQuery = window.Notification && Notification.permission;
        if (navigator.permissions && navigator.permissions.query) {
            const origPermQuery = navigator.permissions.query.bind(navigator.permissions);
            navigator.permissions.query = (params) => {
                if (params.name === 'notifications') {
                    return Promise.resolve({ state: Notification.permission || 'prompt' });
                }
                return origPermQuery(params);
            };
        }
        """

        script = QWebEngineScript()
        script.setName("tanko-antibot")
        script.setSourceCode(js)
        script.setInjectionPoint(QWebEngineScript.InjectionPoint.DocumentCreation)
        script.setWorldId(QWebEngineScript.ScriptWorldId.MainWorld)
        script.setRunsOnSubFrames(True)

        self._profile.scripts().insert(script)

    # ══════════════════════════════════════════════════════════════════════
    # Background painting — animated gradient skin (ports .bgFx)
    # ══════════════════════════════════════════════════════════════════════

    def _tick_bg(self):
        self._bg_phase += 0.005
        if self._bg_phase > 2.0:
            self._bg_phase -= 2.0
        # Only repaint the chrome areas (top ~120px), not the entire widget
        # The web view covers most of the window — no need to repaint under it
        self.update(0, 0, self.width(), 140)

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
        row = QWidget()
        row.setFixedHeight(20)
        row.setStyleSheet("background: transparent; border: none;")
        layout = QHBoxLayout(row)
        layout.setContentsMargins(0, 0, 0, 0)
        layout.setSpacing(0)

        label = QLabel("TANKOBROWSER")
        label.setStyleSheet(
            f"background: transparent; border: none;"
            f"color: {TEXT_TITLE};"
            f"font-family: '{FONT}';"
            f"font-size: 12px; font-weight: 700;"
            f"letter-spacing: 0.08em;"
            f"padding: 0 2px;"
        )
        layout.addWidget(label)
        layout.addStretch()

        hub_btn = QPushButton("HUB")
        hub_btn.setCursor(Qt.CursorShape.PointingHandCursor)
        hub_btn.setStyleSheet(
            f"QPushButton {{"
            f"  background: rgba({ACCENT_RGB},0.10); color: rgba({ACCENT_RGB},0.70);"
            f"  border: 1px solid rgba({ACCENT_RGB},0.25); border-radius: {RADIUS_SM}px;"
            f"  font-family: '{FONT}'; font-size: 10px; font-weight: 700;"
            f"  letter-spacing: 1.5px; padding: 2px 12px; min-height: 18px;"
            f"}}"
            f"QPushButton:hover {{ background: rgba({ACCENT_RGB},0.18); color: rgba({ACCENT_RGB},0.90); }}"
        )
        hub_btn.setToolTip("Tankoban Hub — Torrents & Search")
        hub_btn.clicked.connect(self._open_hub)
        layout.addWidget(hub_btn)

        return row

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

            title = tab["title"] or ("Hub" if self._is_tab_on_hub(tab) else "Home" if self._is_tab_on_home(tab) else "New Tab")
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
        self._address_bar_full_url = ""  # store full URL separately
        self._address_bar.installEventFilter(self)
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

        # Tor toggle — circular icon button matching Aspect browser nav-btn
        self._tor_btn = _TorButton()
        self._tor_btn.clicked.connect(self._toggle_tor)
        layout.addWidget(self._tor_btn)

        hist_btn = _ClockButton()
        layout.addWidget(hist_btn)

        return row

    # ══════════════════════════════════════════════════════════════════════
    # Row 5: Viewport — holds per-tab QStackedWidgets
    # ══════════════════════════════════════════════════════════════════════

    def _build_browser(self, root_layout):
        self._viewport_frame = QFrame(self)
        self._viewport_frame.setSizePolicy(
            QSizePolicy.Policy.Expanding, QSizePolicy.Policy.Expanding
        )
        # Start on home — transparent background, no shadow effect
        self._update_viewport_style(on_home=True)

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
            self._viewport_frame.setGraphicsEffect(None)
            # Resume background animation for special pages (gradient visible)
            if hasattr(self, "_bg_timer"):
                self._bg_timer.start(500)
        else:
            self._viewport_frame.setStyleSheet(
                f"QFrame {{"
                f"  background: rgba(10,16,24,0.92);"
                f"  border: 1px solid {SURFACE_BORDER2};"
                f"  border-radius: {RADIUS_VIEWPORT}px;"
                f"}}"
            )
            # NEVER use QGraphicsDropShadowEffect on a frame containing
            # QWebEngineView — it forces offscreen pixmap rendering of the
            # entire web view on every frame, destroying performance.
            self._viewport_frame.setGraphicsEffect(None)
            # Stop background animation — gradient is invisible under websites
            if hasattr(self, "_bg_timer"):
                self._bg_timer.stop()

    def _is_tab_on_home(self, tab):
        """Check if a tab is currently showing the home page."""
        return _is_home_url(tab["page"].url())

    def _is_tab_on_hub(self, tab):
        """Check if a tab is currently showing the hub page."""
        return _is_hub_url(tab["page"].url())

    def _is_tab_on_special(self, tab):
        """Check if a tab is on a special page (home or hub)."""
        return _is_special_url(tab["page"].url())

    def _load_home(self, view):
        """Load the home page HTML into a QWebEngineView, then inject sources."""
        view.load(_HOME_URL)

    def _inject_sources_into_home(self, tab_idx):
        """After home page loads, inject the sources data via JS."""
        if tab_idx < 0 or tab_idx >= len(self._tabs):
            return
        tab = self._tabs[tab_idx]
        sources_json = json.dumps(self._sources)
        tab["view"].page().runJavaScript(
            f"if(typeof renderSources==='function')renderSources({sources_json});"
        )

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
        s.setAttribute(QWebEngineSettings.WebAttribute.Accelerated2dCanvasEnabled, True)
        s.setAttribute(QWebEngineSettings.WebAttribute.WebGLEnabled, True)

        view = QWebEngineView(self)
        view.setPage(page)
        view.setSizePolicy(QSizePolicy.Policy.Expanding, QSizePolicy.Policy.Expanding)

        idx = len(self._tabs)

        self._tabs.append({
            "view": view,
            "page": page,
            "title": "",
            "url": url or "",
        })

        self._view_stack.addWidget(view)

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

        if url:
            view.load(QUrl(url))
        else:
            self._load_home(view)

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
        self._view_stack.removeWidget(tab["view"])
        tab["view"].deleteLater()
        tab["page"].deleteLater()

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
        self._view_stack.setCurrentWidget(tab["view"])

        is_special = self._is_tab_on_special(tab)
        self._update_viewport_style(is_special)

        if is_special:
            self._address_bar.clear()
            self._nav_back_btn.setEnabled(False)
            self._nav_fwd_btn.setEnabled(False)
            self._is_loading = False
            self._reload_btn.setText("\u27F3")
        else:
            url = tab["page"].url()
            if url and url.toString() and url.toString() != "about:blank":
                self._set_address_bar_url(url.toString())
            else:
                self._address_bar_full_url = ""
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

    # ══════════════════════════════════════════════════════════════════════
    # Home page interaction
    # ══════════════════════════════════════════════════════════════════════

    def _open_in_new_tab(self, url):
        """Open a URL in a new tab."""
        self._create_tab(url=url, switch_to=True)

    def _navigate_from_home(self, page, url):
        """Called by _TankoWebPage when user clicks a source or searches from home."""
        # Find which tab owns this page
        tab_idx = -1
        for i, tab in enumerate(self._tabs):
            if tab["page"] is page:
                tab_idx = i
                break
        if tab_idx < 0:
            return
        self._home_navigate(tab_idx, url)

    def _home_navigate(self, tab_idx, url):
        """Called when user clicks a source tile or searches from the home page."""
        if tab_idx < 0 or tab_idx >= len(self._tabs):
            return
        tab = self._tabs[tab_idx]
        tab["view"].load(QUrl(url))

        if tab_idx == self._active_idx:
            self._update_viewport_style(False)
            self._set_address_bar_url(url)

    def _go_home(self):
        """Return active tab to the home page."""
        if self._active_idx < 0 or self._active_idx >= len(self._tabs):
            return
        tab = self._tabs[self._active_idx]
        tab["title"] = ""
        tab["url"] = ""
        self._load_home(tab["view"])
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

        # Refresh any tabs currently showing the home page
        for i, tab in enumerate(self._tabs):
            if self._is_tab_on_home(tab):
                self._load_home(tab["view"])

    # ══════════════════════════════════════════════════════════════════════
    # Tab signal handlers
    # ══════════════════════════════════════════════════════════════════════

    def _on_tab_url_changed(self, tab_idx, qurl):
        if tab_idx < len(self._tabs):
            tab = self._tabs[tab_idx]
            is_special = _is_special_url(qurl)
            tab["url"] = "" if is_special else qurl.toString()
        if tab_idx == self._active_idx:
            if is_special:
                self._address_bar_full_url = ""
                self._address_bar.clear()
                self._update_viewport_style(True)
            else:
                self._set_address_bar_url(qurl.toString())
                self._update_viewport_style(False)

    def _on_tab_title_changed(self, tab_idx, title):
        if tab_idx < len(self._tabs):
            tab = self._tabs[tab_idx]
            if self._is_tab_on_home(tab):
                tab["title"] = ""
            elif self._is_tab_on_hub(tab):
                tab["title"] = "Hub"
            else:
                tab["title"] = title
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

        # Inject sources data into home page after it loads
        if tab_idx < len(self._tabs):
            tab = self._tabs[tab_idx]
            if self._is_tab_on_home(tab):
                self._inject_sources_into_home(tab_idx)
            elif self._is_tab_on_hub(tab):
                self._inject_hub_data(tab_idx)

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

    def _set_address_bar_url(self, full_url):
        """Show a clean domain in the address bar, storing the full URL."""
        self._address_bar_full_url = full_url
        if not full_url:
            self._address_bar.clear()
            return
        if self._address_bar.hasFocus():
            # User is editing — show full URL
            self._address_bar.setText(full_url)
        else:
            # Show clean domain only
            try:
                from urllib.parse import urlparse
                parsed = urlparse(full_url)
                domain = parsed.hostname or full_url
                # Strip www. prefix
                if domain.startswith("www."):
                    domain = domain[4:]
                self._address_bar.setText(domain)
            except Exception:
                self._address_bar.setText(full_url)

    def eventFilter(self, obj, event):
        """Show full URL when address bar gains focus, clean domain when it loses focus."""
        from PySide6.QtCore import QEvent
        if obj is self._address_bar:
            if event.type() == QEvent.Type.FocusIn:
                # Show full URL for editing
                if self._address_bar_full_url:
                    self._address_bar.setText(self._address_bar_full_url)
                    self._address_bar.selectAll()
            elif event.type() == QEvent.Type.FocusOut:
                # Show clean domain
                if self._address_bar_full_url:
                    self._set_address_bar_url(self._address_bar_full_url)
        return super().eventFilter(obj, event)

    def _navigate_to_input(self):
        text = self._address_bar.text().strip()
        if not text:
            return

        url = _fixup_url(text)
        if self._active_idx >= 0 and self._active_idx < len(self._tabs):
            tab = self._tabs[self._active_idx]
            self._update_viewport_style(False)
            tab["view"].load(QUrl(url))
            self._address_bar.clearFocus()

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
    # Tor proxy toggle
    # ══════════════════════════════════════════════════════════════════════

    def _toggle_tor(self):
        """Toggle Tor on/off."""
        if self._tor.active:
            self._tor.stop()
        else:
            self._tor.start_async()

    def _on_tor_status_changed(self, status):
        """Update Tor button appearance and set/clear proxy on profile."""
        active = status.get("active", False)
        connecting = status.get("connecting", False)

        if active:
            # Set SOCKS5 proxy on the tankoweb profile
            port = status.get("port", 0)
            if port:
                from PySide6.QtNetwork import QNetworkProxy
                proxy = QNetworkProxy(
                    QNetworkProxy.ProxyType.Socks5Proxy,
                    "127.0.0.1", port
                )
                QNetworkProxy.setApplicationProxy(proxy)
                print(f"[tor] SOCKS5 proxy set: 127.0.0.1:{port}")
            self._tor_btn.set_state("active")
        elif connecting:
            self._tor_btn.set_state("connecting")
        else:
            # Clear proxy
            from PySide6.QtNetwork import QNetworkProxy
            QNetworkProxy.setApplicationProxy(
                QNetworkProxy(QNetworkProxy.ProxyType.NoProxy)
            )
            self._tor_btn.set_state("off")

    # ══════════════════════════════════════════════════════════════════════
    # Hub tab — singleton tab for torrent search/downloads
    # ══════════════════════════════════════════════════════════════════════

    def _open_hub(self):
        """Open the Hub tab (singleton — switches to it if already open)."""
        for i, tab in enumerate(self._tabs):
            if self._is_tab_on_hub(tab):
                self._switch_tab(i)
                return
        # Create new tab with hub URL
        idx = self._create_tab(url=_HUB_URL.toString(), switch_to=True)
        if idx is not None and idx < len(self._tabs):
            self._tabs[idx]["title"] = "Hub"

    def _inject_hub_data(self, tab_idx):
        """After hub page loads, inject current torrent data and indexer list."""
        if tab_idx < 0 or tab_idx >= len(self._tabs):
            return

        # Start polling timer if not already running
        if not hasattr(self, "_hub_poll_timer"):
            self._hub_poll_timer = QTimer(self)
            self._hub_poll_timer.timeout.connect(self._poll_hub_data)
            self._hub_poll_timer.start(5000)  # 5s interval, not 2s
            self._hub_poll_busy = False

        # Inject data immediately (don't wait for first poll)
        self._fetch_and_push_hub_data()

    def _poll_hub_data(self):
        """Timer callback: fetch torrent data only when Hub is the active tab."""
        # Only poll if the ACTIVE tab is the Hub (not just any tab)
        if self._active_idx < 0 or self._active_idx >= len(self._tabs):
            return
        if not self._is_tab_on_hub(self._tabs[self._active_idx]):
            return
        # Don't pile up threads — skip if the last poll is still running
        if getattr(self, "_hub_poll_busy", False):
            return
        self._fetch_and_push_hub_data()

    def _fetch_and_push_hub_data(self):
        """Fetch torrent data in a background thread, then push to Hub JS."""
        # Cache references on the main thread
        qbit = self._get_qbit()
        prowlarr = self._get_prowlarr()
        jackett = self._get_jackett()

        # Nothing to poll — skip entirely
        if not qbit and not prowlarr and not jackett:
            return

        self._hub_poll_busy = True

        def _bg():
            try:
                torrents = qbit.list_torrents() if qbit else []
                indexers = prowlarr.list_indexers() if prowlarr else []
                jackett_indexers = jackett.list_indexers() if jackett else []
                QTimer.singleShot(0, lambda: self._push_hub_data(
                    torrents, indexers, jackett_indexers,
                    prowlarr_ok=prowlarr is not None,
                    jackett_ok=jackett is not None,
                ))
            except Exception as e:
                print(f"[hub] Poll error: {e}")
            finally:
                self._hub_poll_busy = False

        threading.Thread(target=_bg, daemon=True).start()

    def _push_hub_data(self, torrents, indexers, jackett_indexers=None,
                       prowlarr_ok=False, jackett_ok=False):
        """Push torrent and indexer data to all open Hub tabs."""
        torrents_json = json.dumps(torrents)
        indexers_json = json.dumps(indexers)
        jackett_indexers_json = json.dumps(jackett_indexers or [])
        # Get Prowlarr URL for the "Configure Indexers" button
        prowlarr_url = ""
        jackett_url = ""
        try:
            win = self.window()
            mgr = getattr(win, "_prowlarr_mgr", None)
            if mgr and mgr.base_url:
                prowlarr_url = mgr.base_url
            else:
                prowlarr = self._get_prowlarr()
                if prowlarr and hasattr(prowlarr, "_base"):
                    prowlarr_url = prowlarr._base
            jackett = self._get_jackett()
            if jackett and hasattr(jackett, "_base"):
                jackett_url = jackett._base
        except Exception:
            pass
        for tab in self._tabs:
            if self._is_tab_on_hub(tab):
                tab["page"].runJavaScript(
                    f"if(typeof updateTorrents==='function')updateTorrents({torrents_json});"
                )
                tab["page"].runJavaScript(
                    f"if(typeof updateSources==='function')updateSources({indexers_json});"
                )
                tab["page"].runJavaScript(
                    f"if(typeof updateJackettSources==='function')updateJackettSources({jackett_indexers_json});"
                )
                # Push provider availability
                tab["page"].runJavaScript(
                    f"if(typeof setProviderStatus==='function'){{"
                    f"setProviderStatus('prowlarr',{'true' if prowlarr_ok else 'false'});"
                    f"setProviderStatus('jackett',{'true' if jackett_ok else 'false'});"
                    f"}}"
                )
                if prowlarr_url:
                    tab["page"].runJavaScript(
                        f"if(typeof setProwlarrUrl==='function')setProwlarrUrl({json.dumps(prowlarr_url)});"
                    )
                if jackett_url:
                    tab["page"].runJavaScript(
                        f"if(typeof setJackettUrl==='function')setJackettUrl({json.dumps(jackett_url)});"
                    )

    def _get_qbit(self):
        """Get the QBitClient from the parent TankobanWindow (if available)."""
        try:
            win = self.window()
            return getattr(win, "_qbit", None)
        except Exception:
            return None

    def _get_prowlarr(self):
        """Get the ProwlarrClient from the parent TankobanWindow (if available)."""
        try:
            win = self.window()
            return getattr(win, "_prowlarr", None)
        except Exception:
            return None

    def _get_jackett(self):
        """Get the JackettClient from the parent TankobanWindow (if available)."""
        try:
            win = self.window()
            return getattr(win, "_jackett", None)
        except Exception:
            return None

    def _hub_search(self, query, source="all", provider="prowlarr"):
        """Run a search via Prowlarr or Jackett in background and push results to Hub."""
        # Push loading state
        for tab in self._tabs:
            if self._is_tab_on_hub(tab):
                tab["page"].runJavaScript("if(typeof setSearchLoading==='function')setSearchLoading(true);")

        if provider == "jackett":
            self._hub_search_jackett(query, source)
        else:
            self._hub_search_prowlarr(query, source)

    def _hub_search_prowlarr(self, query, source="all"):
        """Run a Prowlarr search in background."""
        prowlarr = self._get_prowlarr()
        if not prowlarr:
            print("[hub] Prowlarr not available")
            self._push_search_results([])
            return

        indexer_ids = None
        if source and source != "all":
            try:
                indexer_ids = [int(source)]
            except ValueError:
                pass

        def _bg():
            try:
                results, status = prowlarr.search_with_status(query, indexer_ids=indexer_ids)
                print(f"[hub] Prowlarr search returned {len(results)} results (status={status})")

                if status == "cf_blocked":
                    print(f"[hub] Search blocked by Cloudflare, attempting solve...")
                    QTimer.singleShot(0, lambda: self._start_cf_solve(query, source, indexer_ids))
                    return

                QTimer.singleShot(0, lambda: self._push_search_results(results))
            except Exception as e:
                print(f"[hub] Prowlarr search error: {e}")
                QTimer.singleShot(0, lambda: self._push_search_results([]))

        threading.Thread(target=_bg, daemon=True).start()

    def _hub_search_jackett(self, query, source="all"):
        """Run a Jackett search in background."""
        jackett = self._get_jackett()
        if not jackett:
            print("[hub] Jackett not available")
            self._push_search_results([])
            return

        indexer = source if source and source != "all" else "all"

        def _bg():
            try:
                results, status = jackett.search_with_status(query, indexer=indexer)
                print(f"[hub] Jackett search returned {len(results)} results (status={status})")

                if status == "cf_blocked":
                    print(f"[hub] Jackett search blocked by Cloudflare")
                    # CF solve for Jackett — use the indexer URL directly
                    QTimer.singleShot(0, lambda: self._start_cf_solve(query, source, None))
                    return

                QTimer.singleShot(0, lambda: self._push_search_results(results))
            except Exception as e:
                print(f"[hub] Jackett search error: {e}")
                QTimer.singleShot(0, lambda: self._push_search_results([]))

        threading.Thread(target=_bg, daemon=True).start()

    def _start_cf_solve(self, query, source, indexer_ids):
        """Trigger CF solver for blocked indexers, then retry search."""
        prowlarr = self._get_prowlarr()
        if not prowlarr:
            self._push_search_results([])
            return

        # Find the base URL of the indexer that's likely blocked
        solve_url = None
        if indexer_ids:
            indexers = prowlarr.list_indexers()
            for ix in indexers:
                if ix["id"] in indexer_ids and ix.get("baseUrl"):
                    solve_url = ix["baseUrl"]
                    break
        if not solve_url:
            # Try all enabled indexers' base URLs
            indexers = prowlarr.list_indexers()
            for ix in indexers:
                if ix.get("enabled") and ix.get("baseUrl"):
                    solve_url = ix["baseUrl"]
                    break

        if not solve_url:
            print("[hub] No indexer URL found for CF solving")
            self._push_search_results([])
            return

        self._cf_pending_search = (query, source)

        if not self._cf_solver:
            self._cf_solver = CfSolver(self._profile, parent=self)
            self._cf_solver.solved.connect(self._on_cf_solved)
            self._cf_solver.failed.connect(self._on_cf_failed)

        # Push a status message to Hub
        for tab in self._tabs:
            if self._is_tab_on_hub(tab):
                tab["page"].runJavaScript(
                    "if(typeof setSearchLoading==='function')setSearchLoading(true,'Solving Cloudflare challenge...');"
                )

        self._cf_solver.solve(solve_url)

    def _on_cf_solved(self, url):
        """CF challenge solved — retry the pending search."""
        print(f"[hub] CF solved for {url}, retrying search...")
        pending = self._cf_pending_search
        self._cf_pending_search = None
        if pending:
            query, source = pending
            self._hub_search(query, source)

    def _on_cf_failed(self, url, reason):
        """CF solve failed — show empty results."""
        print(f"[hub] CF solve failed for {url}: {reason}")
        self._cf_pending_search = None
        self._push_search_results([])

    def _push_search_results(self, results):
        """Push search results to all open Hub tabs."""
        results_json = json.dumps(results)
        for tab in self._tabs:
            if self._is_tab_on_hub(tab):
                tab["page"].runJavaScript(
                    f"if(typeof updateSearchResults==='function')updateSearchResults({results_json});"
                )
                tab["page"].runJavaScript(
                    f"if(typeof setSearchLoading==='function')setSearchLoading(false);"
                )
                tab["page"].runJavaScript(
                    f"if(typeof setSearchResultCount==='function')setSearchResultCount({len(results)});"
                )

    def _hub_add_magnet(self, uri):
        """Add a torrent via magnet URI in background."""
        qbit = self._get_qbit()
        if not qbit:
            print("[hub] qBittorrent not available for adding magnet")
            return

        def _bg():
            try:
                qbit.add_magnet(uri)
                import time
                time.sleep(1)
                QTimer.singleShot(0, lambda: self._fetch_and_push_hub_data())
            except Exception as e:
                print(f"[hub] Add magnet error: {e}")

        threading.Thread(target=_bg, daemon=True).start()

    def _hub_torrent_action(self, action, hash_):
        """Pause/resume/delete a torrent in background."""
        qbit = self._get_qbit()
        if not qbit:
            return

        def _bg():
            try:
                if action == "pause":
                    qbit.pause(hash_)
                elif action == "resume":
                    qbit.resume(hash_)
                elif action == "delete":
                    qbit.delete(hash_, delete_files=False)
                import time
                time.sleep(0.5)
                QTimer.singleShot(0, lambda: self._fetch_and_push_hub_data())
            except Exception as e:
                print(f"[hub] Torrent action error: {e}")

        threading.Thread(target=_bg, daemon=True).start()

    def _hub_clear_downloads(self):
        """Clear completed downloads."""
        qbit = self._get_qbit()
        if not qbit:
            return

        def _bg():
            try:
                torrents = qbit.list_torrents("completed")
                if torrents:
                    hashes = [t.get("hash", "") for t in torrents if t.get("hash")]
                    if hashes:
                        qbit.delete(hashes, delete_files=False)
                import time
                time.sleep(0.5)
                QTimer.singleShot(0, lambda: self._fetch_and_push_hub_data())
            except Exception as e:
                print(f"[hub] Clear downloads error: {e}")

        threading.Thread(target=_bg, daemon=True).start()

    # ══════════════════════════════════════════════════════════════════════
    # Top bar actions
    # ══════════════════════════════════════════════════════════════════════

    def _go_back(self):
        if self._on_back:
            self._on_back()

    def _window_action(self, action):
        if self._on_window_action:
            self._on_window_action(action)
