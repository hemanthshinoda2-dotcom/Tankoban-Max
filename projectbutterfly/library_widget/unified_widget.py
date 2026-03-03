"""Top-level unified library widget."""

from __future__ import annotations

import os

from PySide6.QtCore import Qt
from PySide6.QtGui import QFont, QPixmap
from PySide6.QtWidgets import QWidget, QVBoxLayout, QHBoxLayout, QLabel, QSplitter, QStackedWidget

from constants import MediaKind, BG_COLOR, TEXT_PRIMARY
from data_provider import MediaDataProvider
from detail_view import DetailView
from home_view import HomeView
from sidebar_widget import SidebarWidget
from media_adapter import adapter_for
from thumb_provider import ThumbProvider


class UnifiedLibraryWidget(QWidget):

    def __init__(self, kind: MediaKind = "comics", parent=None):
        super().__init__(parent)
        self._kind = kind
        self._adapter = adapter_for(kind)
        self._all_series: list[dict] = []
        self._filter_path = ""

        self.setStyleSheet(f"background-color: {BG_COLOR};")

        layout = QVBoxLayout(self)
        layout.setContentsMargins(0, 0, 0, 0)
        layout.setSpacing(0)

        # Header
        self._header = QLabel(f"  Library — {kind.capitalize()}")
        self._header.setFixedHeight(40)
        self._header.setFont(QFont("Segoe UI", 14, QFont.Bold))
        self._header.setStyleSheet(
            f"color: {TEXT_PRIMARY}; background-color: {BG_COLOR};"
            "padding-left: 16px;"
        )
        self._header.setAlignment(Qt.AlignVCenter | Qt.AlignLeft)
        layout.addWidget(self._header)

        # Splitter: sidebar + home view
        self._splitter = QSplitter(Qt.Horizontal)
        self._splitter.setStyleSheet("QSplitter::handle { background-color: #0a0a1a; width: 1px; }")

        self._sidebar = SidebarWidget()
        self._sidebar.filter_changed.connect(self._on_filter_changed)
        self._splitter.addWidget(self._sidebar)

        # Stacked widget: home (0) and detail (1)
        self._stack = QStackedWidget()

        self._home_view = HomeView()
        self._home_view.set_item_label(self._adapter.item_label)
        self._home_view.card_clicked.connect(self._on_card_clicked)
        self._stack.addWidget(self._home_view)

        self._detail_view = DetailView()
        self._detail_view.back_clicked.connect(self._go_home)
        self._stack.addWidget(self._detail_view)

        self._splitter.addWidget(self._stack)

        self._splitter.setStretchFactor(0, 0)  # sidebar: fixed
        self._splitter.setStretchFactor(1, 1)  # grid: stretch
        self._splitter.setSizes([220, 980])

        layout.addWidget(self._splitter)

        # Thumbnail provider
        self._thumb_provider = ThumbProvider(parent=self)
        self._thumb_provider.thumb_ready.connect(self._on_thumb_ready)

        # Data provider
        self._provider = MediaDataProvider(kind, parent=self)
        self._provider.data_ready.connect(self._on_data_ready)

    def load(self):
        """Trigger data load from disk."""
        self._provider.load()

    def _on_data_ready(self):
        self._all_series = list(self._provider.series)
        self._all_series.sort(key=lambda s: (s.get("name", "").lower(), s.get("id", "")))

        # Populate sidebar
        self._sidebar.populate(self._provider.root_folders, self._all_series)

        # Populate continue shelf
        continue_items = self._provider.continue_items(self._provider.items)
        self._home_view.set_continue_items(continue_items)
        self._request_continue_thumbs(continue_items)

        # Set continue label based on kind
        labels = {"comics": "Continue Reading", "books": "Continue Reading", "video": "Continue Watching"}
        self._home_view.set_continue_label(labels.get(self._kind, "Continue"))

        # Show all series initially
        self._apply_filter()

    def _on_filter_changed(self, path: str):
        self._filter_path = path
        self._apply_filter()

    def _apply_filter(self):
        if not self._filter_path:
            visible = self._all_series
        else:
            fp = os.path.normpath(self._filter_path).lower()
            visible = [
                s for s in self._all_series
                if os.path.normpath(s.get("path", "")).lower().startswith(fp)
            ]

        self._home_view.set_series(visible)
        self._request_thumbs()

        count = len(visible)
        total = len(self._all_series)
        if self._filter_path:
            folder_name = os.path.basename(self._filter_path) or self._filter_path
            self._header.setText(
                f"  Library — {self._kind.capitalize()} · {folder_name} ({count}/{total})"
            )
        else:
            self._header.setText(
                f"  Library — {self._kind.capitalize()} ({total} {self._adapter.series_label})"
            )

    def _on_card_clicked(self, series_id: str):
        """Navigate to detail view for the clicked series."""
        series = next((s for s in self._all_series if s.get("id") == series_id), None)
        if not series:
            return
        items = self._adapter.items_for_series(self._provider.items, series_id)
        # Sort items by title
        items.sort(key=lambda it: it.get("title", "").lower())
        self._detail_view.set_items(items, series.get("name", "Unknown"))
        self._stack.setCurrentIndex(1)
        self._header.setText(f"  {series.get('name', 'Unknown')} — {len(items)} {self._adapter.item_label}")

    def _go_home(self):
        """Navigate back to the home grid."""
        self._stack.setCurrentIndex(0)
        self._apply_filter()

    def _request_thumbs(self):
        """Request thumbnails for all visible cards."""
        items = self._provider.items
        # Build a map: series_id -> first item (by title sort)
        first_item_by_series: dict[str, dict] = {}
        for it in items:
            sid = it.get("series_id", "")
            if not sid:
                continue
            if sid not in first_item_by_series:
                first_item_by_series[sid] = it
            else:
                if it.get("title", "").lower() < first_item_by_series[sid].get("title", "").lower():
                    first_item_by_series[sid] = it

        for card in self._home_view.cards:
            sid = card.series_data.get("id", "")
            first = first_item_by_series.get(sid)
            if first:
                self._thumb_provider.request_thumb(
                    sid, first.get("path", ""), first.get("id", ""),
                )

    def _request_continue_thumbs(self, continue_items: list[dict]):
        """Request thumbnails for continue shelf tiles using the item's own ID."""
        for item in continue_items:
            item_id = item.get("id", "")
            path = item.get("path", "")
            if item_id and path:
                # Use item_id as the thumb key (prefix with "cont:" to avoid collision)
                self._thumb_provider.request_thumb(
                    f"cont:{item_id}", path, item_id,
                )

    def _on_thumb_ready(self, series_id: str, px: QPixmap):
        """Apply a loaded thumbnail to the matching card or continue tile."""
        # Check continue tiles first
        if series_id.startswith("cont:"):
            item_id = series_id[5:]
            for tile in self._home_view.tiles:
                if tile.item_data.get("id") == item_id:
                    tile.set_pixmap(px)
                    break
            return

        # Regular series cards
        for card in self._home_view.cards:
            if card.series_data.get("id") == series_id:
                card.set_pixmap(px)
                break
