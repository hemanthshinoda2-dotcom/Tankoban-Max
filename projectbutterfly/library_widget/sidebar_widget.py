"""Sidebar with 'All' node and per-root-folder expandable tree."""

from __future__ import annotations

import os

from PySide6.QtCore import Qt, Signal
from PySide6.QtGui import QFont
from PySide6.QtWidgets import QTreeWidget, QTreeWidgetItem

from constants import SIDEBAR_BG, SIDEBAR_SELECTED, TEXT_PRIMARY, TEXT_SECONDARY

_ROLE_PATH = Qt.UserRole
_ROLE_KIND = Qt.UserRole + 1  # "all", "root", "series"
_ROLE_ID = Qt.UserRole + 2


class SidebarWidget(QTreeWidget):
    filter_changed = Signal(str)  # root path or "" for All

    def __init__(self, parent=None):
        super().__init__(parent)
        self.setHeaderHidden(True)
        self.setIndentation(16)
        self.setFixedWidth(220)
        self.setFocusPolicy(Qt.NoFocus)
        self.setStyleSheet(f"""
            QTreeWidget {{
                background-color: {SIDEBAR_BG};
                border: none;
                color: {TEXT_PRIMARY};
                font-family: 'Segoe UI';
                font-size: 11px;
                outline: none;
            }}
            QTreeWidget::item {{
                padding: 4px 8px;
                border-radius: 4px;
                margin: 1px 4px;
            }}
            QTreeWidget::item:hover {{
                background-color: {SIDEBAR_SELECTED};
            }}
            QTreeWidget::item:selected {{
                background-color: {SIDEBAR_SELECTED};
                color: {TEXT_PRIMARY};
            }}
        """)

        self.currentItemChanged.connect(self._on_current_changed)

    def populate(self, root_folders: list[str], series: list[dict]):
        """Rebuild the tree with All + root folders + child series."""
        self.blockSignals(True)
        self.clear()

        # "All" node
        all_item = QTreeWidgetItem(["All"])
        all_item.setData(0, _ROLE_PATH, "")
        all_item.setData(0, _ROLE_KIND, "all")
        all_item.setFont(0, QFont("Segoe UI", 11, QFont.Bold))
        self.addTopLevelItem(all_item)

        # Build a map of series paths to their root
        series_by_root: dict[str, list[dict]] = {}
        for root in root_folders:
            rk = os.path.normpath(root).lower()
            series_by_root[rk] = []

        for s in series:
            sp = os.path.normpath(s.get("path", "")).lower()
            matched_root = ""
            for root in root_folders:
                rk = os.path.normpath(root).lower()
                if sp.startswith(rk + os.sep) or sp == rk:
                    matched_root = rk
                    break
            if matched_root and matched_root in series_by_root:
                series_by_root[matched_root].append(s)

        # Root folder nodes
        for root in root_folders:
            rk = os.path.normpath(root).lower()
            root_name = os.path.basename(root) or root
            children = series_by_root.get(rk, [])
            label = f"{root_name}  ({len(children)})"

            root_item = QTreeWidgetItem([label])
            root_item.setData(0, _ROLE_PATH, root)
            root_item.setData(0, _ROLE_KIND, "root")
            self.addTopLevelItem(root_item)

            # Child series under this root
            for s in sorted(children, key=lambda x: x.get("name", "").lower()):
                count = s.get("item_count", 0)
                child_label = f"{s.get('name', '?')}  ({count})"
                child_item = QTreeWidgetItem([child_label])
                child_item.setData(0, _ROLE_PATH, s.get("path", ""))
                child_item.setData(0, _ROLE_KIND, "series")
                child_item.setData(0, _ROLE_ID, s.get("id", ""))
                root_item.addChild(child_item)

            root_item.setExpanded(True)

        self.setCurrentItem(all_item)
        self.blockSignals(False)

    def _on_current_changed(self, current: QTreeWidgetItem | None, _prev):
        if current is None:
            self.filter_changed.emit("")
            return
        kind = current.data(0, _ROLE_KIND)
        if kind == "all":
            self.filter_changed.emit("")
        elif kind == "root":
            self.filter_changed.emit(current.data(0, _ROLE_PATH))
        elif kind == "series":
            # For series, emit the series path so the grid can filter to just that one
            self.filter_changed.emit(current.data(0, _ROLE_PATH))
