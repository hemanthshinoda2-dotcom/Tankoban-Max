"""Detail view showing volumes/episodes for a selected series."""

from __future__ import annotations

import os
import time

from PySide6.QtCore import Qt, Signal
from PySide6.QtGui import QFont, QPixmap
from PySide6.QtWidgets import (
    QWidget, QVBoxLayout, QHBoxLayout, QLabel,
    QPushButton, QTableWidget, QTableWidgetItem, QHeaderView,
    QAbstractItemView, QSplitter,
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
    preview_requested = Signal(str, str, str)  # (key, item_path, item_id) for thumb loading

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

        # Splitter: table (left) + preview pane (right)
        self._splitter = QSplitter(Qt.Horizontal)
        self._splitter.setStyleSheet("QSplitter::handle { background-color: #0a0a1a; width: 1px; }")

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
        self._table.currentCellChanged.connect(self._on_row_changed)

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

        self._splitter.addWidget(self._table)

        # Preview pane
        self._preview_pane = QWidget()
        self._preview_pane.setFixedWidth(300)
        self._preview_pane.setStyleSheet(f"background-color: #0f0f23; border-left: 1px solid #1a2a3e;")
        preview_layout = QVBoxLayout(self._preview_pane)
        preview_layout.setContentsMargins(12, 12, 12, 12)
        preview_layout.setSpacing(8)

        # Cover image
        self._preview_cover = QLabel()
        self._preview_cover.setAlignment(Qt.AlignCenter)
        self._preview_cover.setMinimumHeight(300)
        self._preview_cover.setStyleSheet("background: transparent;")
        preview_layout.addWidget(self._preview_cover)

        # Item title
        self._preview_title = QLabel("")
        self._preview_title.setFont(QFont("Segoe UI", 12, QFont.Bold))
        self._preview_title.setStyleSheet(f"color: {TEXT_PRIMARY}; background: transparent;")
        self._preview_title.setWordWrap(True)
        self._preview_title.setAlignment(Qt.AlignCenter)
        preview_layout.addWidget(self._preview_title)

        # Item info lines
        self._preview_info = QLabel("")
        self._preview_info.setFont(QFont("Segoe UI", 9))
        self._preview_info.setStyleSheet(f"color: {TEXT_SECONDARY}; background: transparent;")
        self._preview_info.setWordWrap(True)
        self._preview_info.setAlignment(Qt.AlignCenter)
        preview_layout.addWidget(self._preview_info)

        preview_layout.addStretch()

        self._splitter.addWidget(self._preview_pane)
        self._splitter.setStretchFactor(0, 1)  # table stretches
        self._splitter.setStretchFactor(1, 0)  # preview fixed

        layout.addWidget(self._splitter)

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

        # Clear preview and select first row
        self._clear_preview()
        if items:
            self._table.selectRow(0)

    def set_preview_pixmap(self, item_id: str, px: QPixmap):
        """Called when a thumbnail is ready for a detail item."""
        # Only update if the currently selected row matches this item
        row = self._table.currentRow()
        if 0 <= row < len(self._items):
            if self._items[row].get("id") == item_id:
                scaled = px.scaled(
                    276, 400,
                    Qt.KeepAspectRatio,
                    Qt.SmoothTransformation,
                )
                self._preview_cover.setPixmap(scaled)

    def _on_row_changed(self, current_row, _col, _prev_row, _prev_col):
        if 0 <= current_row < len(self._items):
            item = self._items[current_row]
            self._update_preview_info(item)
            # Request thumbnail for this item
            item_id = item.get("id", "")
            path = item.get("path", "")
            thumb_path = item.get("thumb_path")
            if item_id and path:
                self.preview_requested.emit(
                    f"detail:{item_id}", path, item_id,
                )
        else:
            self._clear_preview()

    def _update_preview_info(self, item: dict):
        """Populate preview pane text from item data."""
        self._preview_title.setText(item.get("title", ""))

        info_parts = []
        size = item.get("size", 0)
        if size:
            info_parts.append(_fmt_size(size))

        mtime = item.get("mtime_ms", 0)
        if mtime:
            info_parts.append(_fmt_date(mtime))

        fmt = item.get("format", item.get("ext", ""))
        if fmt:
            info_parts.append(fmt.upper())

        dur = item.get("duration_sec")
        if dur:
            info_parts.append(_fmt_duration(dur))

        path = item.get("path", "")
        if path:
            info_parts.append(os.path.basename(path))

        self._preview_info.setText("\n".join(info_parts))

        # Clear old cover while new one loads
        self._preview_cover.clear()
        self._preview_cover.setText("Loading...")
        self._preview_cover.setStyleSheet(
            f"color: {TEXT_SECONDARY}; background: transparent; font-style: italic;"
        )

    def _clear_preview(self):
        self._preview_cover.clear()
        self._preview_cover.setText("Select an item")
        self._preview_cover.setStyleSheet(
            f"color: {TEXT_SECONDARY}; background: transparent; font-style: italic;"
        )
        self._preview_title.setText("")
        self._preview_info.setText("")

    def _on_context_menu(self, pos):
        row = self._table.rowAt(pos.y())
        if 0 <= row < len(self._items):
            menu = build_item_menu(self._items[row], self._table)
            menu.exec(self._table.viewport().mapToGlobal(pos))

    def _on_double_click(self, index):
        row = index.row()
        if 0 <= row < len(self._items):
            self.item_activated.emit(self._items[row].get("id", ""))
