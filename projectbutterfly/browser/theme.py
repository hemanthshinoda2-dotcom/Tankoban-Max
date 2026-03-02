"""
Tankoban glass-tint browser theme constants and stylesheet helpers.

Warm brown/amber/gold palette matching the main Tankoban app aesthetic.
Semi-transparent dark backgrounds with muted gold accents and beveled borders.
"""

# ---------------------------------------------------------------------------
# Color palette (Tankoban glass — dark)
# ---------------------------------------------------------------------------

BG_TITLEBAR = "#0a0a0a"       # Tab bar / title bar — deep black
BG_TOOLBAR = "#121110"         # Nav bar — warm-tinted dark
BG_TAB_ACTIVE = "#1c1812"     # Active tab — warm dark tint
BG_TAB_INACTIVE = "#0a0a0a"   # Inactive tabs — matches title bar
BG_TAB_HOVER = "#161310"      # Tab hover — subtle warm lift
BG_VIEWPORT = "#050505"       # Browser viewport — deepest black
BG_POPUP = "#141210"          # Dropdown/popup — warm dark
BG_INPUT = "#0c0b09"          # Address bar input — near-black warm

TEXT_PRIMARY = "rgba(245,245,245,0.92)"    # Primary text (ink)
TEXT_SECONDARY = "rgba(245,245,245,0.55)"  # Secondary / placeholder
TEXT_URL_SECURE = "#81c995"    # HTTPS green (keep)
TEXT_URL_DOMAIN = "rgba(245,245,245,0.92)" # Domain part of URL

BORDER_COLOR = "rgba(199,167,107,0.18)"    # Warm gold borders
BORDER_TAB = "rgba(199,167,107,0.12)"      # Tab separator — subtler

ACCENT = "#c7a76b"             # Muted gold accent (links, focus ring)
ACCENT_HOVER = "#d4b87a"       # Lighter gold hover

CLOSE_HOVER = "#c95a3a"        # Tab close button hover — warm red
CLOSE_BG = "rgba(199,167,107,0.08)"

LOADING_COLOR = "#c7a76b"      # Tab loading indicator — gold

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
        background: rgba(199,167,107,0.10);
    }}
    QPushButton:pressed {{
        background: rgba(199,167,107,0.16);
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
        background: rgba(199,167,107,0.10);
    }}
"""

# Tankoban-style window control buttons (beveled gradient, warm highlight)
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
        background: rgba(199,167,107,0.12);
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
