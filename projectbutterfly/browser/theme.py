"""
Chrome-like browser dark theme constants and stylesheet helpers.

Mirrors Chrome's dark mode palette with Tankoban accent touches.
"""

# ---------------------------------------------------------------------------
# Color palette (Chrome dark mode)
# ---------------------------------------------------------------------------

BG_TITLEBAR = "#202124"       # Tab bar / title bar background
BG_TOOLBAR = "#35363a"        # Nav bar background
BG_TAB_ACTIVE = "#35363a"     # Active tab matches toolbar
BG_TAB_INACTIVE = "#202124"   # Inactive tabs match title bar
BG_TAB_HOVER = "#2a2b2f"      # Tab hover state
BG_VIEWPORT = "#1a1a1a"       # Browser viewport background
BG_POPUP = "#2d2e30"          # Dropdown/popup background
BG_INPUT = "#202124"          # Address bar input background

TEXT_PRIMARY = "#e8eaed"       # Primary text
TEXT_SECONDARY = "#9aa0a6"     # Secondary / placeholder text
TEXT_URL_SECURE = "#81c995"    # HTTPS green
TEXT_URL_DOMAIN = "#e8eaed"    # Domain part of URL

BORDER_COLOR = "#3c4043"       # Subtle borders
BORDER_TAB = "#48494c"         # Tab separator

ACCENT = "#8ab4f8"             # Chrome blue accent (links, focus ring)
ACCENT_HOVER = "#aecbfa"       # Lighter accent hover

CLOSE_HOVER = "#e64a19"        # Tab close button hover
CLOSE_BG = "rgba(255,255,255,0.08)"

LOADING_COLOR = "#8ab4f8"      # Tab loading indicator

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
        font-size: 14px;
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

# Tankoban-style window control buttons (matches player_ui.py TopStrip)
WINDOW_BTN_STYLE = """
    QPushButton {
        background: qlineargradient(x1:0, y1:0, x2:0, y2:1,
            stop:0 rgba(78,78,78,0.98),
            stop:0.5 rgba(50,50,50,0.98),
            stop:1 rgba(28,28,28,0.98));
        border: 1px solid rgba(0,0,0,0.75);
        border-top-color: rgba(130,130,130,0.65);
        border-radius: 3px;
        padding: 2px 6px;
        color: rgba(245,245,245,0.96);
        font-size: 11px;
        font-weight: 600;
        min-width: 22px;
    }
    QPushButton:hover {
        background: qlineargradient(x1:0, y1:0, x2:0, y2:1,
            stop:0 rgba(98,98,98,0.98),
            stop:0.5 rgba(62,62,62,0.98),
            stop:1 rgba(34,34,34,0.98));
    }
"""

WINDOW_CLOSE_BTN_STYLE = """
    QPushButton {
        background: qlineargradient(x1:0, y1:0, x2:0, y2:1,
            stop:0 rgba(78,78,78,0.98),
            stop:0.5 rgba(50,50,50,0.98),
            stop:1 rgba(28,28,28,0.98));
        border: 1px solid rgba(0,0,0,0.75);
        border-top-color: rgba(130,130,130,0.65);
        border-radius: 3px;
        padding: 2px 6px;
        color: rgba(245,245,245,0.96);
        font-size: 11px;
        font-weight: 600;
        min-width: 22px;
    }
    QPushButton:hover {
        background: qlineargradient(x1:0, y1:0, x2:0, y2:1,
            stop:0 rgba(180,60,60,0.98),
            stop:0.5 rgba(160,40,40,0.98),
            stop:1 rgba(130,20,20,0.98));
    }
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
