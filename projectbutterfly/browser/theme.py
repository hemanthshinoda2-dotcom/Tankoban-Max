"""
Browser theme — supports dark and light palettes with runtime switching.

All module-level color/style constants are updated in-place when ``apply()``
is called, so existing ``theme.CONSTANT`` references in paint methods
continue to work without changes.
"""

# ---------------------------------------------------------------------------
# Palettes
# ---------------------------------------------------------------------------

DARK = {
    "BG_TITLEBAR": "#202124",
    "BG_TOOLBAR": "#292a2d",
    "BG_TAB_ACTIVE": "#292a2d",
    "BG_TAB_INACTIVE": "#202124",
    "BG_TAB_HOVER": "#35363a",
    "BG_VIEWPORT": "#202124",
    "BG_POPUP": "#292a2d",
    "BG_INPUT": "#202124",
    "TEXT_PRIMARY": "#e8eaed",
    "TEXT_SECONDARY": "#9aa0a6",
    "TEXT_URL_SECURE": "#81c995",
    "TEXT_URL_DOMAIN": "#e8eaed",
    "BORDER_COLOR": "#3c4043",
    "BORDER_TAB": "#3c4043",
    "ACCENT": "#8ab4f8",
    "ACCENT_HOVER": "#aecbfa",
    "CLOSE_HOVER": "#ea4335",
    "CLOSE_BG": "rgba(255,255,255,0.08)",
    "LOADING_COLOR": "#8ab4f8",
    "HOVER_BG": "rgba(255,255,255,0.08)",
    "PRESSED_BG": "rgba(255,255,255,0.12)",
}

LIGHT = {
    "BG_TITLEBAR": "#dee1e6",
    "BG_TOOLBAR": "#ffffff",
    "BG_TAB_ACTIVE": "#ffffff",
    "BG_TAB_INACTIVE": "#dee1e6",
    "BG_TAB_HOVER": "#d2d5da",
    "BG_VIEWPORT": "#ffffff",
    "BG_POPUP": "#ffffff",
    "BG_INPUT": "#f1f3f4",
    "TEXT_PRIMARY": "#202124",
    "TEXT_SECONDARY": "#5f6368",
    "TEXT_URL_SECURE": "#188038",
    "TEXT_URL_DOMAIN": "#202124",
    "BORDER_COLOR": "#dadce0",
    "BORDER_TAB": "#dadce0",
    "ACCENT": "#1a73e8",
    "ACCENT_HOVER": "#174ea6",
    "CLOSE_HOVER": "#ea4335",
    "CLOSE_BG": "rgba(0,0,0,0.06)",
    "LOADING_COLOR": "#1a73e8",
    "HOVER_BG": "rgba(0,0,0,0.06)",
    "PRESSED_BG": "rgba(0,0,0,0.10)",
}

THEMES = {"dark": DARK, "light": LIGHT}

# ---------------------------------------------------------------------------
# Active palette — module-level constants (updated by ``apply()``)
# ---------------------------------------------------------------------------

BG_TITLEBAR = DARK["BG_TITLEBAR"]
BG_TOOLBAR = DARK["BG_TOOLBAR"]
BG_TAB_ACTIVE = DARK["BG_TAB_ACTIVE"]
BG_TAB_INACTIVE = DARK["BG_TAB_INACTIVE"]
BG_TAB_HOVER = DARK["BG_TAB_HOVER"]
BG_VIEWPORT = DARK["BG_VIEWPORT"]
BG_POPUP = DARK["BG_POPUP"]
BG_INPUT = DARK["BG_INPUT"]

TEXT_PRIMARY = DARK["TEXT_PRIMARY"]
TEXT_SECONDARY = DARK["TEXT_SECONDARY"]
TEXT_URL_SECURE = DARK["TEXT_URL_SECURE"]
TEXT_URL_DOMAIN = DARK["TEXT_URL_DOMAIN"]

BORDER_COLOR = DARK["BORDER_COLOR"]
BORDER_TAB = DARK["BORDER_TAB"]

ACCENT = DARK["ACCENT"]
ACCENT_HOVER = DARK["ACCENT_HOVER"]

CLOSE_HOVER = DARK["CLOSE_HOVER"]
CLOSE_BG = DARK["CLOSE_BG"]

LOADING_COLOR = DARK["LOADING_COLOR"]

# ---------------------------------------------------------------------------
# Dimensions (theme-independent)
# ---------------------------------------------------------------------------

TAB_HEIGHT = 34
TAB_MIN_WIDTH = 60
TAB_MAX_WIDTH = 240
TAB_PIN_WIDTH = 40
TAB_CLOSE_SIZE = 16
TOOLBAR_HEIGHT = 40
FIND_BAR_HEIGHT = 36

# ---------------------------------------------------------------------------
# Stylesheet builders
# ---------------------------------------------------------------------------

_COLOR_KEYS = [
    "BG_TITLEBAR", "BG_TOOLBAR", "BG_TAB_ACTIVE", "BG_TAB_INACTIVE",
    "BG_TAB_HOVER", "BG_VIEWPORT", "BG_POPUP", "BG_INPUT",
    "TEXT_PRIMARY", "TEXT_SECONDARY", "TEXT_URL_SECURE", "TEXT_URL_DOMAIN",
    "BORDER_COLOR", "BORDER_TAB", "ACCENT", "ACCENT_HOVER",
    "CLOSE_HOVER", "CLOSE_BG", "LOADING_COLOR", "HOVER_BG", "PRESSED_BG",
]

# Current theme name
current_theme = "dark"


def _build_styles(p):
    """Build all stylesheet strings from palette *p*."""
    tab_bar = f"""
    QWidget#tabBar {{
        background: {p["BG_TITLEBAR"]};
        border-bottom: 1px solid {p["BORDER_COLOR"]};
    }}
"""

    nav_bar = f"""
    QWidget#navBar {{
        background: {p["BG_TOOLBAR"]};
        border-bottom: 1px solid {p["BORDER_COLOR"]};
    }}
    QPushButton {{
        background: transparent;
        color: {p["TEXT_PRIMARY"]};
        border: none;
        border-radius: 4px;
        padding: 4px 8px;
        font-size: 17px;
        font-family: 'Segoe UI', sans-serif;
    }}
    QPushButton:hover {{
        background: {p["HOVER_BG"]};
    }}
    QPushButton:pressed {{
        background: {p["PRESSED_BG"]};
    }}
    QPushButton:disabled {{
        color: {p["TEXT_SECONDARY"]};
        opacity: 0.5;
    }}
    QLineEdit#addressBar {{
        background: {p["BG_INPUT"]};
        color: {p["TEXT_PRIMARY"]};
        border: 1px solid {p["BORDER_COLOR"]};
        border-radius: 16px;
        padding: 4px 12px;
        font-size: 13px;
        font-family: 'Segoe UI', sans-serif;
        selection-background-color: {p["ACCENT"]};
    }}
    QLineEdit#addressBar:focus {{
        border-color: {p["ACCENT"]};
    }}
"""

    find_bar = f"""
    QWidget#findBar {{
        background: {p["BG_TOOLBAR"]};
        border-bottom: 1px solid {p["BORDER_COLOR"]};
    }}
    QLineEdit {{
        background: {p["BG_INPUT"]};
        color: {p["TEXT_PRIMARY"]};
        border: 1px solid {p["BORDER_COLOR"]};
        border-radius: 4px;
        padding: 4px 8px;
        font-size: 13px;
        font-family: 'Segoe UI', sans-serif;
    }}
    QLineEdit:focus {{
        border-color: {p["ACCENT"]};
    }}
    QLabel {{
        color: {p["TEXT_SECONDARY"]};
        font-size: 12px;
        font-family: 'Segoe UI', sans-serif;
    }}
    QPushButton {{
        background: transparent;
        color: {p["TEXT_PRIMARY"]};
        border: none;
        border-radius: 4px;
        padding: 4px 6px;
        font-size: 13px;
    }}
    QPushButton:hover {{
        background: {p["HOVER_BG"]};
    }}
"""

    window_btn = f"""
    QPushButton {{
        background: transparent;
        border: none;
        border-radius: 0px;
        padding: 0px;
        color: {p["TEXT_SECONDARY"]};
        font-size: 13px;
        min-width: 46px;
        min-height: 34px;
    }}
    QPushButton:hover {{
        background: {p["HOVER_BG"]};
        color: {p["TEXT_PRIMARY"]};
    }}
"""

    window_close_btn = f"""
    QPushButton {{
        background: transparent;
        border: none;
        border-radius: 0px;
        padding: 0px;
        color: {p["TEXT_SECONDARY"]};
        font-size: 13px;
        min-width: 46px;
        min-height: 34px;
    }}
    QPushButton:hover {{
        background: #ea4335;
        color: #ffffff;
    }}
"""

    context_menu = f"""
    QMenu {{
        background: {p["BG_POPUP"]};
        color: {p["TEXT_PRIMARY"]};
        border: 1px solid {p["BORDER_COLOR"]};
        border-radius: 8px;
        padding: 4px 0;
        font-size: 13px;
        font-family: 'Segoe UI', sans-serif;
    }}
    QMenu::item {{
        padding: 6px 32px 6px 16px;
    }}
    QMenu::item:selected {{
        background: {p["HOVER_BG"]};
    }}
    QMenu::item:disabled {{
        color: {p["TEXT_SECONDARY"]};
    }}
    QMenu::separator {{
        height: 1px;
        background: {p["BORDER_COLOR"]};
        margin: 4px 8px;
    }}
"""

    return {
        "TAB_BAR_STYLE": tab_bar,
        "NAV_BAR_STYLE": nav_bar,
        "FIND_BAR_STYLE": find_bar,
        "WINDOW_BTN_STYLE": window_btn,
        "WINDOW_CLOSE_BTN_STYLE": window_close_btn,
        "CONTEXT_MENU_STYLE": context_menu,
    }


# Build initial (dark) styles
_styles = _build_styles(DARK)
TAB_BAR_STYLE = _styles["TAB_BAR_STYLE"]
NAV_BAR_STYLE = _styles["NAV_BAR_STYLE"]
FIND_BAR_STYLE = _styles["FIND_BAR_STYLE"]
WINDOW_BTN_STYLE = _styles["WINDOW_BTN_STYLE"]
WINDOW_CLOSE_BTN_STYLE = _styles["WINDOW_CLOSE_BTN_STYLE"]
CONTEXT_MENU_STYLE = _styles["CONTEXT_MENU_STYLE"]


# ---------------------------------------------------------------------------
# Runtime theme switching
# ---------------------------------------------------------------------------

def get(name):
    """Return the palette dict for *name* (``'dark'`` or ``'light'``)."""
    return THEMES.get(str(name or "dark").strip().lower(), DARK)


def apply(name):
    """
    Switch the active theme to *name* and update every module-level constant.

    After calling this, any code that reads ``theme.BG_TITLEBAR`` etc. will
    get the new palette values on next access.
    """
    global current_theme
    import sys
    mod = sys.modules[__name__]

    name = str(name or "dark").strip().lower()
    if name not in THEMES:
        name = "dark"
    current_theme = name
    p = THEMES[name]

    # Update color constants
    for key in _COLOR_KEYS:
        setattr(mod, key, p[key])

    # Rebuild and update style strings
    styles = _build_styles(p)
    for key, val in styles.items():
        setattr(mod, key, val)
