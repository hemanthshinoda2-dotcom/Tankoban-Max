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
    ("Ctrl+H",          "open_history"),
    ("F11",             "toggle_fullscreen"),
    ("Ctrl+D",          "toggle_bookmark"),
    ("Ctrl++",          "zoom_in"),
    ("Ctrl+=",          "zoom_in"),
    ("Ctrl+-",          "zoom_out"),
    ("Ctrl+0",          "zoom_reset"),
    ("F12",             "toggle_devtools"),
    ("Ctrl+Shift+I",    "toggle_devtools"),
    ("Ctrl+J",          "open_downloads"),
    ("Ctrl+Shift+Delete", "open_clear_data"),
    ("Ctrl+Shift+O",    "open_bookmarks_manager"),
    ("Ctrl+P",          "print_page"),
    ("Ctrl+U",          "view_source"),
    ("Ctrl+G",          "focus_address_bar"),
    ("Ctrl+Shift+J",    "toggle_devtools"),
    # Ctrl+1..8 switch to tab N, Ctrl+9 switches to last tab
    ("Ctrl+1",          "switch_to_tab_1"),
    ("Ctrl+2",          "switch_to_tab_2"),
    ("Ctrl+3",          "switch_to_tab_3"),
    ("Ctrl+4",          "switch_to_tab_4"),
    ("Ctrl+5",          "switch_to_tab_5"),
    ("Ctrl+6",          "switch_to_tab_6"),
    ("Ctrl+7",          "switch_to_tab_7"),
    ("Ctrl+8",          "switch_to_tab_8"),
    ("Ctrl+9",          "switch_to_last_tab"),
]
