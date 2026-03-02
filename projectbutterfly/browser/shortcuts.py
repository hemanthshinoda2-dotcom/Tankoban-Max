"""
Keyboard shortcut definitions for the Chrome-like browser.

Each shortcut maps a key sequence to a method name on ChromeBrowser.
"""

from __future__ import annotations

# (key_sequence, method_name)
SHORTCUTS = [
    ("Ctrl+T",          "new_tab"),
    ("Ctrl+W",          "close_active_tab"),
    ("Ctrl+Tab",        "next_tab"),
    ("Ctrl+Shift+Tab",  "prev_tab"),
    ("Ctrl+L",          "focus_address_bar"),
    ("Alt+D",           "focus_address_bar"),
    ("F5",              "reload_active"),
    ("Ctrl+R",          "reload_active"),
    ("Ctrl+F",          "toggle_find_bar"),
    ("Escape",          "on_escape"),
    ("Alt+Left",        "go_back"),
    ("Alt+Right",       "go_forward"),
    ("Ctrl+Shift+T",    "reopen_closed_tab"),
    ("Ctrl+Shift+B",    "toggle_bookmarks_bar"),
]
