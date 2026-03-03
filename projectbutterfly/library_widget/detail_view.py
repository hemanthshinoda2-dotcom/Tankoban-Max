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


class DetailView(QWidget):
    back_clicked = Signal()
    item_activated = Signal(str)  # item ID on double-click

    def __init__(self, parent=None):
        super().__init__(parent)
        self.setStyleSheet(f"background-color: {BG_COLOR};")
        self._items: list[dict] = []

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
        self._table.setColumnCount(4)
        self._table.setHorizontalHeaderLabels(["#", "Title", "Size", "Date"])
        self._table.verticalHeader().setVisible(False)
        self._table.setSelectionBehavior(QAbstractItemView.SelectRows)
        self._table.setSelectionMode(QAbstractItemView.SingleSelection)
        self._table.setEditTriggers(QAbstractItemView.NoEditTriggers)
        self._table.setShowGrid(False)
        self._table.setAlternatingRowColors(True)
        self._table.setContextMenuPolicy(Qt.CustomContextMenu)
        self._table.customContextMenuRequested.connect(self._on_context_menu)
        self._table.doubleClicked.connect(self._on_double_click)

        header = self._table.horizontalHeader()
        header.setSectionResizeMode(0, QHeaderView.ResizeToContents)
        header.setSectionResizeMode(1, QHeaderView.Stretch)
        header.setSectionResizeMode(2, QHeaderView.ResizeToContents)
        header.setSectionResizeMode(3, QHeaderView.ResizeToContents)

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

    def set_items(self, items: list[dict], series_name: str):
        self._items = items
        self._title.setText(series_name)

        self._table.setRowCount(len(items))
        for i, item in enumerate(items):
            num_item = QTableWidgetItem(str(i + 1))
            num_item.setTextAlignment(Qt.AlignCenter)
            self._table.setItem(i, 0, num_item)

            title_item = QTableWidgetItem(item.get("title", ""))
            self._table.setItem(i, 1, title_item)

            size_item = QTableWidgetItem(_fmt_size(item.get("size", 0)))
            size_item.setTextAlignment(Qt.AlignRight | Qt.AlignVCenter)
            self._table.setItem(i, 2, size_item)

            date_item = QTableWidgetItem(_fmt_date(item.get("mtime_ms", 0)))
            date_item.setTextAlignment(Qt.AlignCenter)
            self._table.setItem(i, 3, date_item)

        self._table.setRowHeight(0, 32)
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
