"""
Tab data model and non-visual tab lifecycle manager.

TabData: per-tab state dataclass.
TabManager: owns the list of tabs, emits signals on changes.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass, field

from PySide6.QtCore import QObject, Signal
from PySide6.QtGui import QIcon
from PySide6.QtWebEngineWidgets import QWebEngineView


@dataclass
class TabData:
    """State for a single browser tab."""

    id: str = field(default_factory=lambda: uuid.uuid4().hex[:12])
    view: QWebEngineView | None = None
    title: str = "New Tab"
    url: str = ""
    icon: QIcon | None = None
    loading: bool = False
    progress: int = 0
    can_go_back: bool = False
    can_go_forward: bool = False
    pinned: bool = False
    audio_playing: bool = False
    muted: bool = False
    zoom_factor: float = 1.0


class TabManager(QObject):
    """
    Non-visual manager for browser tabs.

    Owns the ordered list of TabData and emits signals when tabs are
    created, closed, activated, or updated.  All identification is by
    string UUID — never by list index.
    """

    # Signals
    tab_added = Signal(str, int)          # (tab_id, index)
    tab_removed = Signal(str, int)        # (tab_id, index)
    tab_activated = Signal(str)           # (tab_id)
    tab_title_changed = Signal(str, str)  # (tab_id, title)
    tab_url_changed = Signal(str, str)    # (tab_id, url)
    tab_icon_changed = Signal(str, object)  # (tab_id, QIcon)
    tab_loading_changed = Signal(str, bool, int)  # (tab_id, loading, progress)
    tab_audio_changed = Signal(str, bool, bool)   # (tab_id, audio_playing, muted)

    MAX_TABS = 30

    def __init__(self, parent=None):
        super().__init__(parent)
        self._tabs: list[TabData] = []
        self._active_id: str | None = None

    # -- Queries --

    @property
    def tabs(self) -> list[TabData]:
        return list(self._tabs)

    @property
    def count(self) -> int:
        return len(self._tabs)

    @property
    def active_id(self) -> str | None:
        return self._active_id

    @property
    def active_tab(self) -> TabData | None:
        return self.get(self._active_id) if self._active_id else None

    def get(self, tab_id: str) -> TabData | None:
        for t in self._tabs:
            if t.id == tab_id:
                return t
        return None

    def index_of(self, tab_id: str) -> int:
        for i, t in enumerate(self._tabs):
            if t.id == tab_id:
                return i
        return -1

    # -- Mutations --

    def add(self, tab: TabData, activate: bool = True) -> int:
        """Add a tab and return its index. Respects MAX_TABS."""
        if len(self._tabs) >= self.MAX_TABS:
            return -1

        # Insert after active tab, or append
        active_idx = self.index_of(self._active_id) if self._active_id else -1
        insert_idx = active_idx + 1 if active_idx >= 0 else len(self._tabs)
        self._tabs.insert(insert_idx, tab)

        self.tab_added.emit(tab.id, insert_idx)

        if activate:
            self.activate(tab.id)

        return insert_idx

    def remove(self, tab_id: str) -> TabData | None:
        """Remove a tab by id. Returns the removed TabData or None."""
        idx = self.index_of(tab_id)
        if idx < 0:
            return None

        tab = self._tabs.pop(idx)
        self.tab_removed.emit(tab_id, idx)

        # If we removed the active tab, activate a neighbor
        if self._active_id == tab_id:
            self._active_id = None
            if self._tabs:
                neighbor = min(idx, len(self._tabs) - 1)
                self.activate(self._tabs[neighbor].id)

        return tab

    def activate(self, tab_id: str):
        """Make a tab the active tab."""
        if self.get(tab_id) is None:
            return
        if self._active_id == tab_id:
            return
        self._active_id = tab_id
        self.tab_activated.emit(tab_id)

    def activate_next(self):
        """Activate the next tab (wraps around)."""
        if not self._tabs or not self._active_id:
            return
        idx = self.index_of(self._active_id)
        next_idx = (idx + 1) % len(self._tabs)
        self.activate(self._tabs[next_idx].id)

    def activate_prev(self):
        """Activate the previous tab (wraps around)."""
        if not self._tabs or not self._active_id:
            return
        idx = self.index_of(self._active_id)
        prev_idx = (idx - 1) % len(self._tabs)
        self.activate(self._tabs[prev_idx].id)

    # -- State updates from ChromePage signals --

    def update_title(self, tab_id: str, title: str):
        tab = self.get(tab_id)
        if tab and title:
            tab.title = title
            self.tab_title_changed.emit(tab_id, title)

    def update_url(self, tab_id: str, url: str):
        tab = self.get(tab_id)
        if tab:
            tab.url = url
            self.tab_url_changed.emit(tab_id, url)

    def update_icon(self, tab_id: str, icon: QIcon):
        tab = self.get(tab_id)
        if tab:
            tab.icon = icon
            self.tab_icon_changed.emit(tab_id, icon)

    def update_loading(self, tab_id: str, loading: bool, progress: int = 0):
        tab = self.get(tab_id)
        if tab:
            tab.loading = loading
            tab.progress = progress
            self.tab_loading_changed.emit(tab_id, loading, progress)

    def update_nav_state(self, tab_id: str, can_back: bool, can_forward: bool):
        tab = self.get(tab_id)
        if tab:
            tab.can_go_back = can_back
            tab.can_go_forward = can_forward

    def reorder(self, source_id: str, target_id: str):
        """Move source tab to the position of target tab."""
        src_idx = self.index_of(source_id)
        tgt_idx = self.index_of(target_id)
        if src_idx < 0 or tgt_idx < 0 or src_idx == tgt_idx:
            return
        tab = self._tabs.pop(src_idx)
        self._tabs.insert(tgt_idx, tab)

    def set_pinned(self, tab_id: str, pinned: bool):
        """Pin or unpin a tab. Pinned tabs move to the front."""
        tab = self.get(tab_id)
        if not tab or tab.pinned == pinned:
            return
        tab.pinned = pinned
        if pinned:
            # Move to the end of pinned tabs
            idx = self.index_of(tab_id)
            self._tabs.pop(idx)
            pin_count = sum(1 for t in self._tabs if t.pinned)
            self._tabs.insert(pin_count, tab)
        return tab
