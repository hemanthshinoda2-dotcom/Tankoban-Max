"""Top-level unified library widget."""

from __future__ import annotations

import os

from PySide6.QtCore import Qt
from PySide6.QtGui import QFont
from PySide6.QtWidgets import QWidget, QVBoxLayout, QHBoxLayout, QLabel, QSplitter

from constants import MediaKind, BG_COLOR, TEXT_PRIMARY
from data_provider import MediaDataProvider
from home_view import HomeView
from sidebar_widget import SidebarWidget
from media_adapter import adapter_for


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

        self._home_view = HomeView()
        self._home_view.set_item_label(self._adapter.item_label)
        self._splitter.addWidget(self._home_view)

        self._splitter.setStretchFactor(0, 0)  # sidebar: fixed
        self._splitter.setStretchFactor(1, 1)  # grid: stretch
        self._splitter.setSizes([220, 980])

        layout.addWidget(self._splitter)

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
