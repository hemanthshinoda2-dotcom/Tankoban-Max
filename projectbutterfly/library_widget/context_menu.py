"""Context menu builders for series cards and item rows."""

from __future__ import annotations

import os
import subprocess
import sys

from PySide6.QtGui import QAction
from PySide6.QtWidgets import QMenu, QApplication


def _reveal_in_explorer(path: str):
    """Open the containing folder and select the file."""
    path = os.path.normpath(path)
    if sys.platform == "win32":
        if os.path.isdir(path):
            subprocess.Popen(["explorer", path])
        else:
            subprocess.Popen(["explorer", "/select,", path])
    elif sys.platform == "darwin":
        subprocess.Popen(["open", "-R", path])
    else:
        folder = path if os.path.isdir(path) else os.path.dirname(path)
        subprocess.Popen(["xdg-open", folder])


def _copy_to_clipboard(text: str):
    cb = QApplication.clipboard()
    if cb:
        cb.setText(text)


def build_series_menu(series: dict, parent=None) -> QMenu:
    """Build a right-click menu for a series card."""
    menu = QMenu(parent)
    menu.setStyleSheet("""
        QMenu {
            background-color: #1a1a2e;
            color: #e0e0f0;
            border: 1px solid #2a2a4e;
            padding: 4px 0;
        }
        QMenu::item {
            padding: 6px 24px;
        }
        QMenu::item:selected {
            background-color: #1a3a5c;
        }
        QMenu::separator {
            height: 1px;
            background: #2a2a4e;
            margin: 4px 8px;
        }
    """)

    path = series.get("path", "")
    name = series.get("name", "Unknown")

    reveal = menu.addAction("Reveal in Explorer")
    reveal.setEnabled(bool(path))
    reveal.triggered.connect(lambda: _reveal_in_explorer(path))

    copy_path = menu.addAction("Copy Path")
    copy_path.setEnabled(bool(path))
    copy_path.triggered.connect(lambda: _copy_to_clipboard(path))

    menu.addSeparator()

    copy_name = menu.addAction("Copy Name")
    copy_name.triggered.connect(lambda: _copy_to_clipboard(name))

    return menu


def build_item_menu(item: dict, parent=None) -> QMenu:
    """Build a right-click menu for a volume/episode row."""
    menu = QMenu(parent)
    menu.setStyleSheet("""
        QMenu {
            background-color: #1a1a2e;
            color: #e0e0f0;
            border: 1px solid #2a2a4e;
            padding: 4px 0;
        }
        QMenu::item {
            padding: 6px 24px;
        }
        QMenu::item:selected {
            background-color: #1a3a5c;
        }
        QMenu::separator {
            height: 1px;
            background: #2a2a4e;
            margin: 4px 8px;
        }
    """)

    path = item.get("path", "")
    title = item.get("title", "Unknown")

    reveal = menu.addAction("Reveal in Explorer")
    reveal.setEnabled(bool(path))
    reveal.triggered.connect(lambda: _reveal_in_explorer(path))

    copy_path = menu.addAction("Copy Path")
    copy_path.setEnabled(bool(path))
    copy_path.triggered.connect(lambda: _copy_to_clipboard(path))

    menu.addSeparator()

    copy_title = menu.addAction("Copy Title")
    copy_title.triggered.connect(lambda: _copy_to_clipboard(title))

    return menu
