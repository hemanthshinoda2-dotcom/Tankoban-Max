"""
Chrome dark mode browser theme — matches Google Chrome's dark color scheme.
"""

# ---------------------------------------------------------------------------
# Color palette (Chrome dark mode)
# ---------------------------------------------------------------------------

BG_TITLEBAR = "#202124"        # Tab bar / title bar
BG_TOOLBAR = "#292a2d"         # Nav bar / toolbar
BG_TAB_ACTIVE = "#292a2d"     # Active tab — same as toolbar (Chrome style)
BG_TAB_INACTIVE = "#202124"   # Inactive tabs — same as title bar
BG_TAB_HOVER = "#35363a"      # Tab hover
BG_VIEWPORT = "#202124"       # Browser viewport
BG_POPUP = "#292a2d"          # Dropdown/popup
BG_INPUT = "#202124"          # Address bar input

TEXT_PRIMARY = "#e8eaed"       # Primary text
TEXT_SECONDARY = "#9aa0a6"     # Secondary / placeholder
TEXT_URL_SECURE = "#81c995"    # HTTPS green
TEXT_URL_DOMAIN = "#e8eaed"    # Domain part of URL

BORDER_COLOR = "#3c4043"       # Borders
BORDER_TAB = "#3c4043"         # Tab separator

ACCENT = "#8ab4f8"             # Chrome blue accent
ACCENT_HOVER = "#aecbfa"       # Lighter blue hover

CLOSE_HOVER = "#ea4335"        # Tab close button hover — red
CLOSE_BG = "rgba(255,255,255,0.08)"

LOADING_COLOR = "#8ab4f8"      # Tab loading indicator — blue

# ---------------------------------------------------------------------------
# Dimensions
# ---------------------------------------------------------------------------

TAB_HEIGHT = 34
TAB_MIN_WIDTH = 60
TAB_MAX_WIDTH = 240
TAB_PIN_WIDTH = 40
TAB_CLOSE_SIZE = 16
TOOLBAR_HEIGHT = 40
FIND_BAR_HEIGHT = 36

# ---------------------------------------------------------------------------
# Stylesheets
# ---------------------------------------------------------------------------

TAB_BAR_STYLE = f"""
    QWidget#tabBar {{
        background: {BG_TITLEBAR};
        border-bottom: 1px solid {BORDER_COLOR};
    }}
"""

NAV_BAR_STYLE = f"""
    QWidget#navBar {{
        background: {BG_TOOLBAR};
        border-bottom: 1px solid {BORDER_COLOR};
    }}
    QPushButton {{
        background: transparent;
        color: {TEXT_PRIMARY};
        border: none;
        border-radius: 4px;
        padding: 4px 8px;
        font-size: 17px;
        font-family: 'Segoe UI', sans-serif;
    }}
    QPushButton:hover {{
        background: rgba(255,255,255,0.08);
    }}
    QPushButton:pressed {{
        background: rgba(255,255,255,0.12);
    }}
    QPushButton:disabled {{
        color: {TEXT_SECONDARY};
        opacity: 0.5;
    }}
    QLineEdit#addressBar {{
        background: {BG_INPUT};
        color: {TEXT_PRIMARY};
        border: 1px solid {BORDER_COLOR};
        border-radius: 16px;
        padding: 4px 12px;
        font-size: 13px;
        font-family: 'Segoe UI', sans-serif;
        selection-background-color: {ACCENT};
    }}
    QLineEdit#addressBar:focus {{
        border-color: {ACCENT};
    }}
"""

FIND_BAR_STYLE = f"""
    QWidget#findBar {{
        background: {BG_TOOLBAR};
        border-bottom: 1px solid {BORDER_COLOR};
    }}
    QLineEdit {{
        background: {BG_INPUT};
        color: {TEXT_PRIMARY};
        border: 1px solid {BORDER_COLOR};
        border-radius: 4px;
        padding: 4px 8px;
        font-size: 13px;
        font-family: 'Segoe UI', sans-serif;
    }}
    QLineEdit:focus {{
        border-color: {ACCENT};
    }}
    QLabel {{
        color: {TEXT_SECONDARY};
        font-size: 12px;
        font-family: 'Segoe UI', sans-serif;
    }}
    QPushButton {{
        background: transparent;
        color: {TEXT_PRIMARY};
        border: none;
        border-radius: 4px;
        padding: 4px 6px;
        font-size: 13px;
    }}
    QPushButton:hover {{
        background: rgba(255,255,255,0.08);
    }}
"""

# Chrome-style window control buttons (flat, simple)
WINDOW_BTN_STYLE = f"""
    QPushButton {{
        background: transparent;
        border: none;
        border-radius: 0px;
        padding: 0px;
        color: {TEXT_SECONDARY};
        font-size: 13px;
        min-width: 46px;
        min-height: 34px;
    }}
    QPushButton:hover {{
        background: rgba(255,255,255,0.08);
        color: {TEXT_PRIMARY};
    }}
"""

WINDOW_CLOSE_BTN_STYLE = f"""
    QPushButton {{
        background: transparent;
        border: none;
        border-radius: 0px;
        padding: 0px;
        color: {TEXT_SECONDARY};
        font-size: 13px;
        min-width: 46px;
        min-height: 34px;
    }}
    QPushButton:hover {{
        background: #ea4335;
        color: #ffffff;
    }}
"""

CONTEXT_MENU_STYLE = f"""
    QMenu {{
        background: {BG_POPUP};
        color: {TEXT_PRIMARY};
        border: 1px solid {BORDER_COLOR};
        border-radius: 8px;
        padding: 4px 0;
        font-size: 13px;
        font-family: 'Segoe UI', sans-serif;
    }}
    QMenu::item {{
        padding: 6px 32px 6px 16px;
    }}
    QMenu::item:selected {{
        background: rgba(255,255,255,0.08);
    }}
    QMenu::item:disabled {{
        color: {TEXT_SECONDARY};
    }}
    QMenu::separator {{
        height: 1px;
        background: {BORDER_COLOR};
        margin: 4px 8px;
    }}
"""
