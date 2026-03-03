"""Detail view showing volumes/episodes for a selected series."""

from __future__ import annotations

import os
import time

from PySide6.QtCore import Qt, Signal
from PySide6.QtGui import QFont
from PySide6.QtWidgets import (
    QWidget, QVBoxLayout, QHBoxLayout, QLabel,
    QPushButton, QTableWidget, QTableWidgetItem, QHeaderView,
    QAbstractItemView,
)

from constants import BG_COLOR, TEXT_PRIMARY, TEXT_SECONDARY, ACCENT_COLOR
from context_menu import build_item_menu


def _fmt_size(b):
    if not b:
        return "—"
    if b < 1024:
        return f"{b} B"
    if b < 1024 * 1024:
        return f"{b / 1024:.1f} KB"
    if b < 1024 * 1024 * 1024:
        return f"{b / (1024 * 1024):.1f} MB"
    return f"{b / (1024 * 1024 * 1024):.2f} GB"


def _fmt_date(ms):
    if not ms:
        return "—"
    try:
        return time.strftime("%Y-%m-%d", time.localtime(ms / 1000))
    except Exception:
        return "—"


def _fmt_duration(sec):
    if not sec:
        return "—"
    sec = int(sec)
    h, m, s = sec // 3600, (sec % 3600) // 60, sec % 60
    if h:
        return f"{h}:{m:02d}:{s:02d}"
    return f"{m}:{s:02d}"


# Maps column type to (formatter, alignment)
_COLUMN_FORMATTERS = {
    "num":      (lambda item, i: str(i + 1),                    Qt.AlignCenter),
    "title":    (lambda item, i: item.get("title", ""),          Qt.AlignLeft | Qt.AlignVCenter),
    "size":     (lambda item, i: _fmt_size(item.get("size", 0)), Qt.AlignRight | Qt.AlignVCenter),
    "date":     (lambda item, i: _fmt_date(item.get("mtime_ms", 0)), Qt.AlignCenter),
    "format":   (lambda item, i: item.get("format", item.get("ext", "")).upper(), Qt.AlignCenter),
    "duration": (lambda item, i: _fmt_duration(item.get("duration_sec")), Qt.AlignCenter),
    "ext":      (lambda item, i: item.get("ext", "").upper(),    Qt.AlignCenter),
}

# Default column spec (comics)
DEFAULT_COLUMNS = [
    ("#", "num", 50),
    ("Title", "title", None),
    ("Size", "size", 90),
    ("Date", "date", 100),
]


class DetailView(QWidget):
    back_clicked = Signal()
    item_activated = Signal(str)  # item ID on double-click

    def __init__(self, parent=None):
        super().__init__(parent)
        self.setStyleSheet(f"background-color: {BG_COLOR};")
        self._items: list[dict] = []
        self._columns = DEFAULT_COLUMNS

        layout = QVBoxLayout(self)
        layout.setContentsMargins(16, 8, 16, 8)
        layout.setSpacing(8)

        # Top bar: back button + series name
        top = QHBoxLayout()
        top.setSpacing(12)

        self._back_btn = QPushButton("← Back")
        self._back_btn.setFixedHeight(32)
        self._back_btn.setCursor(Qt.PointingHandCursor)
        self._back_btn.setFont(QFont("Segoe UI", 10))
        self._back_btn.setStyleSheet(f"""
            QPushButton {{
                background-color: #1a3a5c;
                color: {TEXT_PRIMARY};
                border: none;
                border-radius: 4px;
                padding: 4px 16px;
            }}
            QPushButton:hover {{
                background-color: #245080;
            }}
        """)
        self._back_btn.clicked.connect(self.back_clicked)
        top.addWidget(self._back_btn)

        self._title = QLabel("")
        self._title.setFont(QFont("Segoe UI", 16, QFont.Bold))
        self._title.setStyleSheet(f"color: {TEXT_PRIMARY}; background: transparent;")
        top.addWidget(self._title, 1)

        layout.addLayout(top)

        # Table
        self._table = QTableWidget()
        self._table.verticalHeader().setVisible(False)
        self._table.setSelectionBehavior(QAbstractItemView.SelectRows)
        self._table.setSelectionMode(QAbstractItemView.SingleSelection)
        self._table.setEditTriggers(QAbstractItemView.NoEditTriggers)
        self._table.setShowGrid(False)
        self._table.setAlternatingRowColors(True)
        self._table.setContextMenuPolicy(Qt.CustomContextMenu)
        self._table.customContextMenuRequested.connect(self._on_context_menu)
        self._table.doubleClicked.connect(self._on_double_click)

        self._table.setStyleSheet(f"""
            QTableWidget {{
                background-color: {BG_COLOR};
                color: {TEXT_PRIMARY};
                border: none;
                font-family: 'Segoe UI';
                font-size: 11px;
                gridline-color: transparent;
            }}
            QTableWidget::item {{
                padding: 6px 8px;
                border-bottom: 1px solid #1a2a3e;
            }}
            QTableWidget::item:selected {{
                background-color: #1a3a5c;
                color: {TEXT_PRIMARY};
            }}
            QTableWidget::item:alternate {{
                background-color: #141428;
            }}
            QHeaderView::section {{
                background-color: #0f0f23;
                color: {TEXT_SECONDARY};
                border: none;
                padding: 6px 8px;
                font-weight: bold;
                font-size: 10px;
            }}
        """)

        layout.addWidget(self._table)

        # Apply default columns
        self._apply_columns()

    def set_columns(self, columns: list[tuple]):
        """Set column spec: list of (header, type, width|None)."""
        self._columns = columns
        self._apply_columns()

    def _apply_columns(self):
        cols = self._columns
        self._table.setColumnCount(len(cols))
        self._table.setHorizontalHeaderLabels([c[0] for c in cols])

        header = self._table.horizontalHeader()
        for i, (_, col_type, width) in enumerate(cols):
            if width is None:
                header.setSectionResizeMode(i, QHeaderView.Stretch)
            else:
                header.setSectionResizeMode(i, QHeaderView.Fixed)
                self._table.setColumnWidth(i, width)

    def set_items(self, items: list[dict], series_name: str):
        self._items = items
        self._title.setText(series_name)

        self._table.setRowCount(len(items))
        for i, item in enumerate(items):
            for col_idx, (_, col_type, _) in enumerate(self._columns):
                fmt_fn, align = _COLUMN_FORMATTERS.get(
                    col_type, (lambda it, idx: "", Qt.AlignLeft)
                )
                cell = QTableWidgetItem(fmt_fn(item, i))
                cell.setTextAlignment(align)
                self._table.setItem(i, col_idx, cell)

        for i in range(len(items)):
            self._table.setRowHeight(i, 32)

    def _on_context_menu(self, pos):
        row = self._table.rowAt(pos.y())
        if 0 <= row < len(self._items):
            menu = build_item_menu(self._items[row], self._table)
            menu.exec(self._table.viewport().mapToGlobal(pos))

    def _on_double_click(self, index):
        row = index.row()
        if 0 <= row < len(self._items):
            self.item_activated.emit(self._items[row].get("id", ""))
