"""Home view with continue shelf + series card grid."""

from __future__ import annotations

from PySide6.QtCore import Qt, Signal
from PySide6.QtGui import QFont
from PySide6.QtWidgets import (
    QScrollArea, QWidget, QVBoxLayout, QHBoxLayout, QLabel, QComboBox,
    QLineEdit, QCheckBox,
)

from constants import BG_COLOR, TEXT_PRIMARY, TEXT_SECONDARY, CARD_SPACING, ACCENT_COLOR
from flow_layout import FlowLayout
from series_card import SeriesCard
from continue_tile import ContinueTile


SORT_OPTIONS = [
    ("Name A–Z", lambda s: s.get("name", "").lower()),
    ("Name Z–A", lambda s: s.get("name", "").lower()),
    ("Volume Count ↓", lambda s: s.get("item_count", 0)),
    ("Volume Count ↑", lambda s: s.get("item_count", 0)),
]


class HomeView(QScrollArea):
    card_clicked = Signal(str)  # series ID
    continue_clicked = Signal(str)  # item ID
    sort_changed = Signal(int)  # sort index
    search_changed = Signal(str)  # search text
    hide_finished_changed = Signal(bool)  # checked state

    def __init__(self, parent=None):
        super().__init__(parent)
        self.setWidgetResizable(True)
        self.setHorizontalScrollBarPolicy(Qt.ScrollBarAlwaysOff)
        self.setStyleSheet(f"""
            QScrollArea {{
                background-color: {BG_COLOR};
                border: none;
            }}
            QScrollBar:vertical {{
                background-color: #0f0f23;
                width: 10px;
                margin: 0;
                border: none;
            }}
            QScrollBar::handle:vertical {{
                background-color: #2a3a5e;
                border-radius: 4px;
                min-height: 30px;
                margin: 2px;
            }}
            QScrollBar::handle:vertical:hover {{
                background-color: #3a5a8e;
            }}
            QScrollBar::add-line:vertical, QScrollBar::sub-line:vertical {{
                height: 0;
            }}
            QScrollBar::add-page:vertical, QScrollBar::sub-page:vertical {{
                background: none;
            }}
        """)

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

        # Toolbar: search + hide finished + sort
        toolbar = QHBoxLayout()
        toolbar.setContentsMargins(0, 0, 0, 0)
        toolbar.setSpacing(12)

        _input_style = f"""
            QLineEdit {{
                background-color: #1a2a3e;
                color: {TEXT_PRIMARY};
                border: 1px solid #2a3a5e;
                border-radius: 4px;
                padding: 5px 8px;
                font-family: 'Segoe UI';
                font-size: 10px;
            }}
            QLineEdit:focus {{
                border-color: #4a6a9e;
            }}
        """

        self._search_input = QLineEdit()
        self._search_input.setPlaceholderText("Search...")
        self._search_input.setFixedWidth(200)
        self._search_input.setStyleSheet(_input_style)
        self._search_input.textChanged.connect(self.search_changed)
        toolbar.addWidget(self._search_input)

        self._hide_finished_cb = QCheckBox("Hide finished")
        self._hide_finished_cb.setFont(QFont("Segoe UI", 9))
        self._hide_finished_cb.setStyleSheet(f"""
            QCheckBox {{
                color: {TEXT_SECONDARY};
                background: transparent;
                spacing: 5px;
            }}
            QCheckBox::indicator {{
                width: 14px;
                height: 14px;
                border: 1px solid #4a5a7e;
                border-radius: 3px;
                background-color: #1a2a3e;
            }}
            QCheckBox::indicator:checked {{
                background-color: {ACCENT_COLOR};
                border-color: {ACCENT_COLOR};
            }}
        """)
        self._hide_finished_cb.toggled.connect(self.hide_finished_changed)
        toolbar.addWidget(self._hide_finished_cb)

        toolbar.addStretch()

        sort_label = QLabel("Sort:")
        sort_label.setFont(QFont("Segoe UI", 9))
        sort_label.setStyleSheet(f"color: {TEXT_SECONDARY}; background: transparent;")
        toolbar.addWidget(sort_label)

        self._sort_combo = QComboBox()
        self._sort_combo.setFixedWidth(160)
        self._sort_combo.setFont(QFont("Segoe UI", 9))
        for label, _ in SORT_OPTIONS:
            self._sort_combo.addItem(label)
        self._sort_combo.setStyleSheet(f"""
            QComboBox {{
                background-color: #1a2a3e;
                color: {TEXT_PRIMARY};
                border: 1px solid #2a3a5e;
                border-radius: 4px;
                padding: 4px 8px;
            }}
            QComboBox::drop-down {{
                border: none;
                width: 20px;
            }}
            QComboBox QAbstractItemView {{
                background-color: #1a1a2e;
                color: {TEXT_PRIMARY};
                border: 1px solid #2a3a5e;
                selection-background-color: #1a3a5c;
            }}
        """)
        self._sort_combo.currentIndexChanged.connect(self.sort_changed)
        toolbar.addWidget(self._sort_combo)

        self._layout.addLayout(toolbar)

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
