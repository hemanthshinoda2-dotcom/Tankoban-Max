"""Home view with continue shelf + series card grid."""

from __future__ import annotations

from PySide6.QtCore import Qt, Signal
from PySide6.QtGui import QFont
from PySide6.QtWidgets import QScrollArea, QWidget, QVBoxLayout, QHBoxLayout, QLabel

from constants import BG_COLOR, TEXT_PRIMARY, TEXT_SECONDARY, CARD_SPACING
from flow_layout import FlowLayout
from series_card import SeriesCard
from continue_tile import ContinueTile


class HomeView(QScrollArea):
    card_clicked = Signal(str)  # series ID
    continue_clicked = Signal(str)  # item ID

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

        # Continue shelf section (hidden by default)
        self._continue_section = QWidget()
        self._continue_section.setVisible(False)
        continue_layout = QVBoxLayout(self._continue_section)
        continue_layout.setContentsMargins(0, 0, 0, 0)
        continue_layout.setSpacing(8)

        self._continue_label = QLabel("Continue Reading")
        self._continue_label.setFont(QFont("Segoe UI", 12, QFont.Bold))
        self._continue_label.setStyleSheet(f"color: {TEXT_PRIMARY}; background: transparent;")
        continue_layout.addWidget(self._continue_label)

        self._continue_scroll = QScrollArea()
        self._continue_scroll.setWidgetResizable(True)
        self._continue_scroll.setHorizontalScrollBarPolicy(Qt.ScrollBarAlwaysOff)
        self._continue_scroll.setVerticalScrollBarPolicy(Qt.ScrollBarAlwaysOff)
        self._continue_scroll.setFixedHeight(220)
        self._continue_scroll.setStyleSheet("QScrollArea { background: transparent; border: none; }")

        self._continue_inner = QWidget()
        self._continue_inner.setStyleSheet("background: transparent;")
        self._continue_hlayout = QHBoxLayout(self._continue_inner)
        self._continue_hlayout.setContentsMargins(0, 0, 0, 0)
        self._continue_hlayout.setSpacing(10)
        self._continue_hlayout.addStretch()
        self._continue_scroll.setWidget(self._continue_inner)

        continue_layout.addWidget(self._continue_scroll)
        self._layout.addWidget(self._continue_section)

        # Grid area
        self._grid_widget = QWidget()
        self._grid_layout = FlowLayout(self._grid_widget, margin=0, h_spacing=CARD_SPACING, v_spacing=CARD_SPACING)
        self._layout.addWidget(self._grid_widget)
        self._layout.addStretch()

        self.setWidget(self._container)
        self._cards: list[SeriesCard] = []
        self._tiles: list[ContinueTile] = []
        self._item_label = "volumes"

    def set_item_label(self, label: str):
        self._item_label = label

    def set_continue_label(self, label: str):
        self._continue_label.setText(label)

    def set_continue_items(self, continue_items: list[dict]):
        """Populate the continue shelf."""
        for tile in self._tiles:
            self._continue_hlayout.removeWidget(tile)
            tile.deleteLater()
        self._tiles.clear()

        if not continue_items:
            self._continue_section.setVisible(False)
            return

        self._continue_section.setVisible(True)
        for i, item in enumerate(continue_items):
            tile = ContinueTile(item)
            tile.clicked.connect(self.continue_clicked)
            self._continue_hlayout.insertWidget(i, tile)
            self._tiles.append(tile)

    def set_series(self, series_list: list[dict]):
        """Clear and repopulate the grid with series cards."""
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

    @property
    def tiles(self) -> list[ContinueTile]:
        return list(self._tiles)
