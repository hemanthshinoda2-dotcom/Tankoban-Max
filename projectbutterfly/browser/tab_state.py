"""
Tab data model and non-visual tab lifecycle manager.
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
    opener_id: str = ""
    crashed: bool = False
    last_error: str = ""
    omnibox_draft: str = ""
    is_internal: bool = False


class TabManager(QObject):
    """
    Non-visual manager for browser tabs.
    """

    tab_added = Signal(str, int)  # (tab_id, index)
    tab_removed = Signal(str, int)  # (tab_id, index)
    tab_activated = Signal(str)  # (tab_id)
    tab_title_changed = Signal(str, str)  # (tab_id, title)
    tab_url_changed = Signal(str, str)  # (tab_id, url)
    tab_icon_changed = Signal(str, object)  # (tab_id, QIcon)
    tab_loading_changed = Signal(str, bool, int)  # (tab_id, loading, progress)
    tab_audio_changed = Signal(str, bool, bool)  # (tab_id, audio_playing, muted)
    tab_order_changed = Signal()

    MAX_TABS = 30

    def __init__(self, parent=None):
        super().__init__(parent)
        self._tabs: list[TabData] = []
        self._active_id: str | None = None

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

    def count_pinned(self) -> int:
        return sum(1 for t in self._tabs if t.pinned)

    def _find_opener_insert_index(self, opener_id: str) -> int:
        opener_idx = self.index_of(opener_id)
        if opener_idx < 0:
            return -1
        insert_idx = opener_idx + 1
        while insert_idx < len(self._tabs):
            sibling = self._tabs[insert_idx]
            if sibling and sibling.opener_id == opener_id:
                insert_idx += 1
                continue
            break
        return insert_idx

    def _sanitize_insert_index(self, requested: int, pinned: bool) -> int:
        pin_count = self.count_pinned()
        if pinned:
            if requested < 0:
                return pin_count
            return max(0, min(requested, pin_count))
        if requested < 0:
            return len(self._tabs)
        return max(pin_count, min(requested, len(self._tabs)))

    def _emit_order_changed(self):
        self.tab_order_changed.emit()

    def add(self, tab: TabData, activate: bool = True, opener_id: str = "") -> int:
        """
        Add a tab and return its index.

        Unpinned tabs are inserted after opener siblings when possible; otherwise
        after the active tab. Pinned tabs stay inside the pinned zone.
        """
        if len(self._tabs) >= self.MAX_TABS:
            return -1

        tab.opener_id = str(opener_id or tab.opener_id or "")

        insert_idx = -1
        if tab.opener_id:
            insert_idx = self._find_opener_insert_index(tab.opener_id)

        if insert_idx < 0:
            active_idx = self.index_of(self._active_id) if self._active_id else -1
            insert_idx = active_idx + 1 if active_idx >= 0 else len(self._tabs)

        insert_idx = self._sanitize_insert_index(insert_idx, tab.pinned)
        self._tabs.insert(insert_idx, tab)
        self.tab_added.emit(tab.id, insert_idx)
        self._emit_order_changed()

        if activate:
            self.activate(tab.id)

        return insert_idx

    def next_active_after_close(self, tab_id: str, prefer_opener: bool = True) -> str | None:
        idx = self.index_of(tab_id)
        if idx < 0:
            return None
        tab = self._tabs[idx]
        if prefer_opener and tab and tab.opener_id:
            opener = self.get(tab.opener_id)
            if opener:
                return opener.id
        if len(self._tabs) <= 1:
            return None
        neighbor = idx - 1 if idx > 0 else idx + 1
        if 0 <= neighbor < len(self._tabs):
            return self._tabs[neighbor].id
        return None

    def remove(self, tab_id: str, next_active_id: str | None = None) -> TabData | None:
        idx = self.index_of(tab_id)
        if idx < 0:
            return None

        tab = self._tabs.pop(idx)
        self.tab_removed.emit(tab_id, idx)
        self._emit_order_changed()

        if self._active_id == tab_id:
            self._active_id = None
            if next_active_id and self.get(next_active_id):
                self.activate(next_active_id)
            elif self._tabs:
                neighbor = min(idx, len(self._tabs) - 1)
                self.activate(self._tabs[neighbor].id)

        return tab

    def activate(self, tab_id: str):
        if self.get(tab_id) is None:
            return
        if self._active_id == tab_id:
            return
        self._active_id = tab_id
        self.tab_activated.emit(tab_id)

    def activate_next(self):
        if not self._tabs or not self._active_id:
            return
        idx = self.index_of(self._active_id)
        next_idx = (idx + 1) % len(self._tabs)
        self.activate(self._tabs[next_idx].id)

    def activate_prev(self):
        if not self._tabs or not self._active_id:
            return
        idx = self.index_of(self._active_id)
        prev_idx = (idx - 1) % len(self._tabs)
        self.activate(self._tabs[prev_idx].id)

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

    def can_reorder(self, source_id: str, target_id: str) -> bool:
        src = self.get(source_id)
        tgt = self.get(target_id)
        if not src or not tgt:
            return False
        return bool(src.pinned == tgt.pinned)

    def reorder(self, source_id: str, target_id: str) -> bool:
        src_idx = self.index_of(source_id)
        tgt_idx = self.index_of(target_id)
        if src_idx < 0 or tgt_idx < 0 or src_idx == tgt_idx:
            return False
        if not self.can_reorder(source_id, target_id):
            return False
        tab = self._tabs.pop(src_idx)
        if src_idx < tgt_idx:
            tgt_idx -= 1
        self._tabs.insert(tgt_idx, tab)
        self._emit_order_changed()
        return True

    def set_pinned(self, tab_id: str, pinned: bool):
        tab = self.get(tab_id)
        if not tab or tab.pinned == pinned:
            return None
        idx = self.index_of(tab_id)
        if idx < 0:
            return None
        self._tabs.pop(idx)
        tab.pinned = pinned
        pin_count = self.count_pinned()
        if pinned:
            self._tabs.insert(pin_count, tab)
        else:
            self._tabs.insert(pin_count, tab)
        self._emit_order_changed()
        return tab

    def close_other_ids(self, keep_id: str) -> list[str]:
        keep = self.get(keep_id)
        if not keep:
            return []
        out = []
        for t in self._tabs:
            if t.id == keep_id:
                continue
            if t.pinned:
                continue
            out.append(t.id)
        return out

    def close_right_ids(self, anchor_id: str) -> list[str]:
        idx = self.index_of(anchor_id)
        if idx < 0:
            return []
        out = []
        for t in self._tabs[idx + 1:]:
            if t.pinned:
                continue
            out.append(t.id)
        return out

