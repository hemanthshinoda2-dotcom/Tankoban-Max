"""Home view with series card grid (and later, continue shelf)."""

from __future__ import annotations

from PySide6.QtCore import Qt, Signal
from PySide6.QtGui import QFont
from PySide6.QtWidgets import QScrollArea, QWidget, QVBoxLayout, QLabel

from constants import BG_COLOR, TEXT_SECONDARY, CARD_SPACING
from flow_layout import FlowLayout
from series_card import SeriesCard


class HomeView(QScrollArea):
    card_clicked = Signal(str)  # series ID

    def __init__(self, parent=None):
        super().__init__(parent)
        self.setWidgetResizable(True)
        self.setHorizontalScrollBarPolicy(Qt.ScrollBarAlwaysOff)
        self.setStyleSheet(f"QScrollArea {{ background-color: {BG_COLOR}; border: none; }}")

        self._container = QWidget()
        self._container.setStyleSheet(f"background-color: {BG_COLOR};")
        self._layout = QVBoxLayout(self._container)
        self._layout.setContentsMargins(16, 16, 16, 16)
        self._layout.setSpacing(16)

        # Grid area
        self._grid_widget = QWidget()
        self._grid_layout = FlowLayout(self._grid_widget, margin=0, h_spacing=CARD_SPACING, v_spacing=CARD_SPACING)
        self._layout.addWidget(self._grid_widget)
        self._layout.addStretch()

        self.setWidget(self._container)
        self._cards: list[SeriesCard] = []
        self._item_label = "volumes"

    def set_item_label(self, label: str):
        self._item_label = label

    def set_series(self, series_list: list[dict]):
        """Clear and repopulate the grid with series cards."""
        # Remove old cards
        for card in self._cards:
            self._grid_layout.removeWidget(card)
            card.deleteLater()
        self._cards.clear()

        if not series_list:
            empty = QLabel("No items found. Add a root folder to get started.")
            empty.setAlignment(Qt.AlignCenter)
            empty.setStyleSheet(f"color: {TEXT_SECONDARY}; padding: 40px;")
            empty.setFont(QFont("Segoe UI", 12))
            self._grid_layout.addWidget(empty)
            self._cards.append(empty)
            return

        for s in series_list:
            card = SeriesCard(s, item_label=self._item_label)
            card.clicked.connect(self.card_clicked)
            self._grid_layout.addWidget(card)
            self._cards.append(card)

    @property
    def cards(self) -> list[SeriesCard]:
        return [c for c in self._cards if isinstance(c, SeriesCard)]
