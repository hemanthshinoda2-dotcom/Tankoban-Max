"""
Chrome-style right-click context menus.

Builds different menus depending on what was right-clicked:
  - Page background
  - Link
  - Image
  - Selected text
"""

from __future__ import annotations

from PySide6.QtCore import QUrl
from PySide6.QtGui import QAction
from PySide6.QtWidgets import QMenu
from PySide6.QtWebEngineCore import QWebEngineContextMenuRequest

from . import theme
from . import search_engines


def build_context_menu(
    request: QWebEngineContextMenuRequest,
    parent,
    *,
    on_back=None,
    on_forward=None,
    on_reload=None,
    on_copy=None,
    on_paste=None,
    on_cut=None,
    on_select_all=None,
    on_open_link_new_tab=None,
    on_copy_link=None,
    on_save_image=None,
    on_copy_image=None,
    on_inspect=None,
    on_search_selection=None,
) -> QMenu:
    """
    Build and return a context menu for the given context menu request.
    """
    menu = QMenu(parent)
    menu.setStyleSheet(theme.CONTEXT_MENU_STYLE)

    link_url = request.linkUrl()
    media_url = request.mediaUrl()
    selected = request.selectedText()
    is_editable = request.isContentEditable()

    has_link = link_url.isValid() and not link_url.isEmpty()
    has_image = media_url.isValid() and not media_url.isEmpty()
    has_selection = bool(selected and selected.strip())

    # -- Link actions --
    if has_link:
        if on_open_link_new_tab:
            a = menu.addAction("Open link in new tab")
            a.triggered.connect(lambda: on_open_link_new_tab(link_url))

        if on_copy_link:
            a = menu.addAction("Copy link address")
            a.triggered.connect(lambda: on_copy_link(link_url))

        menu.addSeparator()

    # -- Image actions --
    if has_image:
        if on_save_image:
            a = menu.addAction("Save image as...")
            a.triggered.connect(lambda: on_save_image(media_url))

        if on_copy_image:
            a = menu.addAction("Copy image")
            a.triggered.connect(lambda: on_copy_image(media_url))

        if on_open_link_new_tab:
            a = menu.addAction("Open image in new tab")
            a.triggered.connect(lambda: on_open_link_new_tab(media_url))

        menu.addSeparator()

    # -- Text editing actions --
    if is_editable:
        if on_cut:
            a = menu.addAction("Cut")
            a.setShortcut("Ctrl+X")
            a.triggered.connect(on_cut)

    if has_selection or is_editable:
        if on_copy:
            a = menu.addAction("Copy")
            a.setShortcut("Ctrl+C")
            a.triggered.connect(on_copy)
            a.setEnabled(has_selection)

    if is_editable:
        if on_paste:
            a = menu.addAction("Paste")
            a.setShortcut("Ctrl+V")
            a.triggered.connect(on_paste)

    # -- Search selection --
    if has_selection and on_search_selection:
        # Truncate long selections for menu label
        snippet = selected.strip()[:30]
        if len(selected.strip()) > 30:
            snippet += "..."
        engine_name = search_engines.get_engine_name()
        a = menu.addAction(f'Search {engine_name} for "{snippet}"')
        a.triggered.connect(lambda: on_search_selection(selected.strip()))

    if has_selection or is_editable:
        menu.addSeparator()

    if on_select_all:
        a = menu.addAction("Select all")
        a.setShortcut("Ctrl+A")
        a.triggered.connect(on_select_all)

    # -- Navigation actions (when nothing specific is targeted) --
    if not has_link and not has_image and not has_selection and not is_editable:
        if on_back:
            a = menu.addAction("\u2190  Back")
            a.triggered.connect(on_back)

        if on_forward:
            a = menu.addAction("\u2192  Forward")
            a.triggered.connect(on_forward)

        if on_reload:
            a = menu.addAction("\u27f3  Reload")
            a.triggered.connect(on_reload)

        menu.addSeparator()

        if on_select_all:
            a = menu.addAction("Select all")
            a.triggered.connect(on_select_all)

    # -- Inspect element (dev tools) --
    if on_inspect:
        menu.addSeparator()
        a = menu.addAction("Inspect")
        a.triggered.connect(on_inspect)

    return menu
