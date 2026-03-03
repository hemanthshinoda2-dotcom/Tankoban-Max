"""Top-level unified library widget."""

from __future__ import annotations

from PySide6.QtCore import Qt
from PySide6.QtGui import QFont
from PySide6.QtWidgets import QWidget, QVBoxLayout, QLabel

from constants import MediaKind, BG_COLOR, TEXT_PRIMARY
from data_provider import MediaDataProvider
from home_view import HomeView
from media_adapter import adapter_for


class UnifiedLibraryWidget(QWidget):

    def __init__(self, kind: MediaKind = "comics", parent=None):
        super().__init__(parent)
        self._kind = kind
        self._adapter = adapter_for(kind)

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

        # Home view (grid)
        self._home_view = HomeView()
        self._home_view.set_item_label(self._adapter.item_label)
        layout.addWidget(self._home_view)

        # Data provider
        self._provider = MediaDataProvider(kind, parent=self)
        self._provider.data_ready.connect(self._on_data_ready)

    def load(self):
        """Trigger data load from disk."""
        self._provider.load()

    def _on_data_ready(self):
        series = self._provider.series
        # Sort alphabetically by name
        series.sort(key=lambda s: (s.get("name", "").lower(), s.get("id", "")))
        self._home_view.set_series(series)

        count = len(series)
        self._header.setText(
            f"  Library — {self._kind.capitalize()} ({count} {self._adapter.series_label})"
        )
