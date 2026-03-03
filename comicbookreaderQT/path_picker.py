"""
Path picker widget for the comic reader.

Two-column layout:
  Left   — folder tree (QTreeView on QFileSystemModel)
  Right  — comic file list for the selected folder + recent files header

Persists the last-used comic root and recent files in
  %APPDATA%/Tankoban/comic_reader_qt/picker_prefs.json
"""

from __future__ import annotations

import os
import time

from PySide6.QtCore import (
    QDir,
    QModelIndex,
    QSortFilterProxyModel,
    Qt,
    Signal,
)
from PySide6.QtGui import QColor, QFont, QPainter
from PySide6.QtWidgets import (
    QAbstractItemView,
    QFileDialog,
    QFileSystemModel,
    QFrame,
    QHBoxLayout,
    QLabel,
    QLineEdit,
    QListWidget,
    QListWidgetItem,
    QPushButton,
    QSplitter,
    QTreeView,
    QVBoxLayout,
    QWidget,
)

from settings_store import read_json, write_json

_COMIC_EXTS = {".cbz", ".cbr", ".zip", ".rar"}
_MAX_RECENT = 24


def _prefs_path() -> str:
    appdata = os.environ.get("APPDATA") or os.path.expanduser("~")
    return os.path.join(appdata, "Tankoban", "comic_reader_qt", "picker_prefs.json")


def _load_prefs() -> dict:
    return read_json(_prefs_path(), fallback={}) or {}


def _save_prefs(prefs: dict):
    write_json(_prefs_path(), prefs)


# ── styles ──────────────────────────────────────────────────────────

_ROOT_SS = """
QWidget#pickerRoot {
  background: #111111;
}
QLabel#pickerTitle {
  color: #ffffff;
  font-size: 20px;
  font-weight: 700;
}
QLabel#sectionLabel {
  color: rgba(255, 255, 255, 0.55);
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  padding: 6px 0 2px 0;
}
QPushButton#pickerBtn {
  color: #ffffff;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 8px;
  padding: 6px 16px;
  font-size: 13px;
  font-weight: 600;
  min-height: 28px;
}
QPushButton#pickerBtn:hover {
  background: rgba(255, 255, 255, 0.14);
}
QPushButton#pickerBtnAccent {
  color: #ffffff;
  background: rgba(199, 167, 107, 0.25);
  border: 1px solid rgba(199, 167, 107, 0.45);
  border-radius: 8px;
  padding: 6px 16px;
  font-size: 13px;
  font-weight: 600;
  min-height: 28px;
}
QPushButton#pickerBtnAccent:hover {
  background: rgba(199, 167, 107, 0.40);
}
QLineEdit#searchInput {
  color: #ffffff;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 8px;
  padding: 6px 12px;
  font-size: 13px;
  selection-background-color: rgba(199, 167, 107, 0.4);
}
QLineEdit#searchInput:focus {
  border-color: rgba(199, 167, 107, 0.5);
}
"""

_TREE_SS = """
QTreeView {
  background: #0e0e0e;
  color: #d6d6d6;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 8px;
  font-size: 13px;
  outline: 0;
}
QTreeView::item {
  padding: 3px 6px;
  border-radius: 4px;
}
QTreeView::item:selected {
  background: rgba(199, 167, 107, 0.22);
  color: #ffffff;
}
QTreeView::item:hover {
  background: rgba(255, 255, 255, 0.06);
}
QTreeView::branch {
  background: transparent;
}
QHeaderView::section {
  background: #0e0e0e;
  color: #888888;
  border: 0;
  font-size: 11px;
  padding: 4px 8px;
}
"""

_LIST_SS = """
QListWidget {
  background: #0e0e0e;
  color: #d6d6d6;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 8px;
  font-size: 13px;
  outline: 0;
}
QListWidget::item {
  padding: 6px 12px;
  border-radius: 4px;
}
QListWidget::item:selected {
  background: rgba(199, 167, 107, 0.22);
  color: #ffffff;
}
QListWidget::item:hover {
  background: rgba(255, 255, 255, 0.06);
}
"""


# ── proxy to show only directories ─────────────────────────────────

class _DirOnlyProxy(QSortFilterProxyModel):
    def filterAcceptsRow(self, source_row: int, source_parent: QModelIndex) -> bool:
        model = self.sourceModel()
        idx = model.index(source_row, 0, source_parent)
        return model.isDir(idx)


# ── main widget ─────────────────────────────────────────────────────

class PathPickerWidget(QWidget):
    """File browser for picking a comic archive to open."""

    file_selected = Signal(str)  # absolute path of chosen archive

    def __init__(self, parent=None):
        super().__init__(parent)
        self.setObjectName("pickerRoot")
        self.setStyleSheet(_ROOT_SS)

        self._prefs = _load_prefs()
        self._comic_root = self._prefs.get("comic_root", "")
        self._recent: list[dict] = self._prefs.get("recent", [])

        outer = QVBoxLayout(self)
        outer.setContentsMargins(20, 16, 20, 16)
        outer.setSpacing(10)

        # ── header row ──────────────────────────────────────────
        header = QHBoxLayout()
        header.setSpacing(12)

        title = QLabel("Comic Reader", self)
        title.setObjectName("pickerTitle")
        header.addWidget(title, 1)

        self._root_label = QLabel("", self)
        self._root_label.setObjectName("sectionLabel")
        self._root_label.setAlignment(Qt.AlignmentFlag.AlignRight | Qt.AlignmentFlag.AlignVCenter)
        header.addWidget(self._root_label, 0)

        set_root_btn = QPushButton("Set Root", self)
        set_root_btn.setObjectName("pickerBtn")
        set_root_btn.clicked.connect(self._on_set_root)
        header.addWidget(set_root_btn, 0)

        open_file_btn = QPushButton("Open File", self)
        open_file_btn.setObjectName("pickerBtnAccent")
        open_file_btn.clicked.connect(self._on_open_file)
        header.addWidget(open_file_btn, 0)

        outer.addLayout(header)

        # ── search bar ──────────────────────────────────────────
        self._search = QLineEdit(self)
        self._search.setObjectName("searchInput")
        self._search.setPlaceholderText("Search files...")
        self._search.textChanged.connect(self._on_search_changed)
        outer.addWidget(self._search)

        # ── splitter: tree | file list ──────────────────────────
        splitter = QSplitter(Qt.Orientation.Horizontal, self)
        splitter.setHandleWidth(4)
        splitter.setStyleSheet("QSplitter::handle { background: rgba(255,255,255,0.06); }")

        # left: folder tree
        left = QWidget(splitter)
        left_lay = QVBoxLayout(left)
        left_lay.setContentsMargins(0, 0, 0, 0)
        left_lay.setSpacing(4)

        folders_label = QLabel("FOLDERS", left)
        folders_label.setObjectName("sectionLabel")
        left_lay.addWidget(folders_label)

        self._fs_model = QFileSystemModel(self)
        self._fs_model.setFilter(QDir.Filter.Dirs | QDir.Filter.NoDotAndDotDot | QDir.Filter.AllDirs)
        self._fs_model.setNameFilterDisables(False)

        self._dir_proxy = _DirOnlyProxy(self)
        self._dir_proxy.setSourceModel(self._fs_model)

        self._tree = QTreeView(left)
        self._tree.setModel(self._dir_proxy)
        self._tree.setStyleSheet(_TREE_SS)
        self._tree.setHeaderHidden(False)
        self._tree.setAnimated(True)
        self._tree.setIndentation(16)
        self._tree.setSelectionMode(QAbstractItemView.SelectionMode.SingleSelection)
        # hide size, type, date columns
        for col in (1, 2, 3):
            self._tree.setColumnHidden(col, True)
        self._tree.clicked.connect(self._on_tree_clicked)
        left_lay.addWidget(self._tree, 1)

        splitter.addWidget(left)

        # right: file list
        right = QWidget(splitter)
        right_lay = QVBoxLayout(right)
        right_lay.setContentsMargins(0, 0, 0, 0)
        right_lay.setSpacing(4)

        self._files_label = QLabel("FILES", right)
        self._files_label.setObjectName("sectionLabel")
        right_lay.addWidget(self._files_label)

        self._file_list = QListWidget(right)
        self._file_list.setStyleSheet(_LIST_SS)
        self._file_list.itemDoubleClicked.connect(self._on_file_double_clicked)
        self._file_list.itemActivated.connect(self._on_file_double_clicked)
        right_lay.addWidget(self._file_list, 1)

        splitter.addWidget(right)
        splitter.setSizes([280, 520])

        outer.addWidget(splitter, 1)

        # ── recent section ──────────────────────────────────────
        recent_label = QLabel("RECENT", self)
        recent_label.setObjectName("sectionLabel")
        outer.addWidget(recent_label)

        self._recent_list = QListWidget(self)
        self._recent_list.setStyleSheet(_LIST_SS)
        self._recent_list.setMaximumHeight(160)
        self._recent_list.itemDoubleClicked.connect(self._on_recent_double_clicked)
        self._recent_list.itemActivated.connect(self._on_recent_double_clicked)
        outer.addWidget(self._recent_list, 0)

        # ── init state ──────────────────────────────────────────
        self._apply_root(self._comic_root)
        self._refresh_recent_list()

    # ── public API ──────────────────────────────────────────────

    def set_comic_root(self, path: str):
        """Programmatically set the comic root folder."""
        self._apply_root(path)

    def add_recent(self, path: str):
        """Record a recently opened file."""
        ap = os.path.abspath(path)
        self._recent = [r for r in self._recent if r.get("path") != ap]
        self._recent.insert(0, {"path": ap, "opened_at": time.time()})
        self._recent = self._recent[:_MAX_RECENT]
        self._save()
        self._refresh_recent_list()

    # ── internal ────────────────────────────────────────────────

    def _apply_root(self, path: str):
        root = str(path or "").strip()
        if root and os.path.isdir(root):
            self._comic_root = os.path.abspath(root)
        elif not root:
            # fallback to home
            self._comic_root = os.path.expanduser("~")
        else:
            self._comic_root = os.path.expanduser("~")

        self._root_label.setText(self._comic_root)
        root_idx = self._fs_model.setRootPath(self._comic_root)
        proxy_idx = self._dir_proxy.mapFromSource(root_idx)
        self._tree.setRootIndex(proxy_idx)

        self._save()
        self._populate_files(self._comic_root)

    def _save(self):
        self._prefs["comic_root"] = self._comic_root
        self._prefs["recent"] = self._recent[:_MAX_RECENT]
        _save_prefs(self._prefs)

    def _populate_files(self, folder: str):
        self._file_list.clear()
        self._files_label.setText(f"FILES — {os.path.basename(folder) or folder}")
        if not folder or not os.path.isdir(folder):
            return
        try:
            entries = sorted(os.listdir(folder), key=lambda n: n.lower())
        except OSError:
            return
        query = self._search.text().strip().lower()
        for name in entries:
            full = os.path.join(folder, name)
            ext = os.path.splitext(name)[1].lower()
            if os.path.isdir(full):
                # show sub-dirs as clickable items with folder indicator
                if query and query not in name.lower():
                    continue
                item = QListWidgetItem(f"\U0001F4C1  {name}")
                item.setData(Qt.ItemDataRole.UserRole, full)
                item.setData(Qt.ItemDataRole.UserRole + 1, "dir")
                item.setForeground(QColor(180, 180, 180))
                self._file_list.addItem(item)
            elif ext in _COMIC_EXTS:
                if query and query not in name.lower():
                    continue
                display = os.path.splitext(name)[0]
                item = QListWidgetItem(display)
                item.setData(Qt.ItemDataRole.UserRole, full)
                item.setData(Qt.ItemDataRole.UserRole + 1, "file")
                self._file_list.addItem(item)

    def _refresh_recent_list(self):
        self._recent_list.clear()
        for entry in self._recent[:_MAX_RECENT]:
            path = entry.get("path", "")
            if not path:
                continue
            name = os.path.splitext(os.path.basename(path))[0]
            folder = os.path.basename(os.path.dirname(path))
            label = f"{name}   ({folder})" if folder else name
            item = QListWidgetItem(label)
            item.setData(Qt.ItemDataRole.UserRole, path)
            exists = os.path.isfile(path)
            if not exists:
                item.setForeground(QColor(100, 100, 100))
                item.setToolTip("File not found")
            self._recent_list.addItem(item)

    # ── slots ───────────────────────────────────────────────────

    def _on_set_root(self):
        folder = QFileDialog.getExistingDirectory(
            self, "Select Comics Root Folder", self._comic_root
        )
        if folder:
            self._apply_root(folder)

    def _on_open_file(self):
        path, _ = QFileDialog.getOpenFileName(
            self,
            "Open Comic Archive",
            self._comic_root,
            "Comic Archives (*.cbz *.cbr *.zip *.rar);;All Files (*.*)",
        )
        if path:
            self._emit_file(path)

    def _on_tree_clicked(self, proxy_index: QModelIndex):
        source_index = self._dir_proxy.mapToSource(proxy_index)
        folder = self._fs_model.filePath(source_index)
        if folder and os.path.isdir(folder):
            self._populate_files(folder)

    def _on_file_double_clicked(self, item: QListWidgetItem):
        path = item.data(Qt.ItemDataRole.UserRole)
        kind = item.data(Qt.ItemDataRole.UserRole + 1)
        if not path:
            return
        if kind == "dir":
            # navigate into subfolder
            self._populate_files(path)
            # also expand in tree
            source_idx = self._fs_model.index(path)
            proxy_idx = self._dir_proxy.mapFromSource(source_idx)
            self._tree.setCurrentIndex(proxy_idx)
            self._tree.scrollTo(proxy_idx)
            return
        if os.path.isfile(path):
            self._emit_file(path)

    def _on_recent_double_clicked(self, item: QListWidgetItem):
        path = item.data(Qt.ItemDataRole.UserRole)
        if path and os.path.isfile(path):
            self._emit_file(path)

    def _on_search_changed(self, text: str):
        # re-filter current file list
        # find current folder from files_label
        current_folder = self._current_folder()
        if current_folder:
            self._populate_files(current_folder)

    def _current_folder(self) -> str:
        """Get the folder currently shown in the file list."""
        proxy_idx = self._tree.currentIndex()
        if proxy_idx.isValid():
            source_idx = self._dir_proxy.mapToSource(proxy_idx)
            path = self._fs_model.filePath(source_idx)
            if path and os.path.isdir(path):
                return path
        return self._comic_root

    def _emit_file(self, path: str):
        ap = os.path.abspath(path)
        self.add_recent(ap)
        self.file_selected.emit(ap)

    # ── keyboard ────────────────────────────────────────────────

    def keyPressEvent(self, event):
        key = event.key()
        if key == Qt.Key.Key_Escape:
            # clear search or do nothing
            if self._search.text():
                self._search.clear()
                return
        if key == Qt.Key.Key_F and event.modifiers() & Qt.KeyboardModifier.ControlModifier:
            self._search.setFocus()
            self._search.selectAll()
            return
        super().keyPressEvent(event)
