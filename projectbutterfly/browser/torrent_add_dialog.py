"""
TorrentAddDialog — metadata-first torrent add dialog.

Mirrors the Electron app's add flow:
  1. User clicks magnet link → dialog opens immediately
  2. Metadata resolves in background (name, size, file tree)
  3. User picks destination (Comics/Videos/Books/Browse)
  4. User selects files, sets priorities, toggles sequential/streamable
  5. Click Download → starts configured torrent
"""

from __future__ import annotations

import json
import os
import threading
from pathlib import Path

from PySide6.QtCore import Qt, Signal, QTimer
from PySide6.QtGui import QColor, QFont
from PySide6.QtWidgets import (
    QDialog, QVBoxLayout, QHBoxLayout, QLabel, QLineEdit,
    QPushButton, QTreeWidget, QTreeWidgetItem, QHeaderView,
    QCheckBox, QComboBox, QFileDialog, QWidget, QProgressBar,
    QSizePolicy, QSpacerItem, QGroupBox,
)

from . import theme


def _fmt_size(b: int) -> str:
    """Format bytes to human-readable size."""
    if b <= 0:
        return "0 B"
    for unit in ("B", "KB", "MB", "GB", "TB"):
        if b < 1024:
            return f"{b:.1f} {unit}" if b != int(b) else f"{int(b)} {unit}"
        b /= 1024
    return f"{b:.1f} PB"


# ---------------------------------------------------------------------------
# Dialog stylesheet (Chrome dark mode)
# ---------------------------------------------------------------------------

_DIALOG_STYLE = f"""
    QDialog {{
        background: {theme.BG_TITLEBAR};
        color: {theme.TEXT_PRIMARY};
        font-family: 'Segoe UI', system-ui, sans-serif;
    }}
    QLabel {{
        color: {theme.TEXT_PRIMARY};
        font-size: 13px;
    }}
    QLabel#heading {{
        font-size: 16px;
        font-weight: 500;
    }}
    QLabel#subtext {{
        color: {theme.TEXT_SECONDARY};
        font-size: 12px;
    }}
    QLineEdit {{
        background: {theme.BG_INPUT};
        color: {theme.TEXT_PRIMARY};
        border: 1px solid {theme.BORDER_COLOR};
        border-radius: 6px;
        padding: 6px 10px;
        font-size: 13px;
    }}
    QLineEdit:focus {{
        border-color: {theme.ACCENT};
    }}
    QPushButton {{
        background: {theme.BG_TOOLBAR};
        color: {theme.TEXT_PRIMARY};
        border: 1px solid {theme.BORDER_COLOR};
        border-radius: 6px;
        padding: 6px 16px;
        font-size: 13px;
        min-height: 28px;
    }}
    QPushButton:hover {{
        background: {theme.BG_TAB_HOVER};
    }}
    QPushButton:pressed {{
        background: rgba(255,255,255,0.12);
    }}
    QPushButton#destActive {{
        border-color: {theme.ACCENT};
        color: {theme.ACCENT};
    }}
    QPushButton#downloadBtn {{
        background: {theme.ACCENT};
        color: #202124;
        border: none;
        font-weight: 600;
        padding: 8px 24px;
    }}
    QPushButton#downloadBtn:hover {{
        background: {theme.ACCENT_HOVER};
    }}
    QPushButton#downloadBtn:disabled {{
        background: {theme.BORDER_COLOR};
        color: {theme.TEXT_SECONDARY};
    }}
    QTreeWidget {{
        background: {theme.BG_INPUT};
        color: {theme.TEXT_PRIMARY};
        border: 1px solid {theme.BORDER_COLOR};
        border-radius: 6px;
        font-size: 13px;
        outline: none;
    }}
    QTreeWidget::item {{
        padding: 2px 0;
        min-height: 24px;
    }}
    QTreeWidget::item:selected {{
        background: rgba(138,180,248,0.15);
    }}
    QTreeWidget::item:hover {{
        background: rgba(255,255,255,0.04);
    }}
    QHeaderView::section {{
        background: {theme.BG_TOOLBAR};
        color: {theme.TEXT_SECONDARY};
        border: none;
        border-bottom: 1px solid {theme.BORDER_COLOR};
        padding: 4px 8px;
        font-size: 12px;
    }}
    QCheckBox {{
        color: {theme.TEXT_PRIMARY};
        font-size: 13px;
        spacing: 6px;
    }}
    QCheckBox::indicator {{
        width: 16px;
        height: 16px;
    }}
    QComboBox {{
        background: {theme.BG_TOOLBAR};
        color: {theme.TEXT_PRIMARY};
        border: 1px solid {theme.BORDER_COLOR};
        border-radius: 4px;
        padding: 2px 8px;
        font-size: 12px;
        min-height: 22px;
    }}
    QComboBox:hover {{
        border-color: {theme.TEXT_SECONDARY};
    }}
    QComboBox::drop-down {{
        border: none;
        width: 20px;
    }}
    QGroupBox {{
        color: {theme.TEXT_SECONDARY};
        border: 1px solid {theme.BORDER_COLOR};
        border-radius: 8px;
        margin-top: 12px;
        padding-top: 16px;
        font-size: 12px;
    }}
    QGroupBox::title {{
        subcontrol-origin: margin;
        subcontrol-position: top left;
        padding: 0 6px;
        left: 10px;
    }}
    QProgressBar {{
        background: {theme.BORDER_COLOR};
        border: none;
        border-radius: 3px;
        height: 6px;
        text-align: center;
    }}
    QProgressBar::chunk {{
        background: {theme.ACCENT};
        border-radius: 3px;
    }}
"""


class TorrentAddDialog(QDialog):
    """
    Metadata-first torrent add dialog.

    Args:
        magnet_uri: The magnet URI to resolve.
        bridge_root: The root bridge object (has .webTorrent).
        parent: Parent widget.
    """

    torrent_started = Signal(str)  # emits torrent ID on successful add

    def __init__(self, magnet_uri: str, bridge_root=None, parent=None):
        super().__init__(parent)
        self._magnet = magnet_uri
        self._bridge = bridge_root
        self._resolve_id = None
        self._files = []
        self._total_size = 0
        self._dest_path = ""
        self._dest_type = ""  # "comics", "videos", "books", "custom"

        self.setWindowTitle("Add Torrent")
        self.setMinimumSize(620, 520)
        self.resize(680, 600)
        self.setStyleSheet(_DIALOG_STYLE)
        self.setWindowFlags(
            Qt.WindowType.Dialog | Qt.WindowType.WindowTitleHint | Qt.WindowType.WindowCloseButtonHint
        )

        self._build_ui()
        self._load_library_paths()

        # Start metadata resolution in background
        QTimer.singleShot(100, self._start_resolve)

    # -------------------------------------------------------------------
    # UI construction
    # -------------------------------------------------------------------

    def _build_ui(self):
        layout = QVBoxLayout(self)
        layout.setContentsMargins(16, 16, 16, 16)
        layout.setSpacing(12)

        # -- Source --
        src_label = QLabel("Source")
        src_label.setObjectName("heading")
        layout.addWidget(src_label)

        self._source_input = QLineEdit()
        self._source_input.setText(self._magnet)
        self._source_input.setReadOnly(True)
        self._source_input.setPlaceholderText("Magnet URI or .torrent file")
        layout.addWidget(self._source_input)

        # -- Status line (resolving / name + size) --
        self._status_label = QLabel("Resolving metadata...")
        self._status_label.setObjectName("subtext")
        layout.addWidget(self._status_label)

        self._resolve_progress = QProgressBar()
        self._resolve_progress.setRange(0, 0)  # indeterminate
        self._resolve_progress.setFixedHeight(4)
        layout.addWidget(self._resolve_progress)

        # -- Destination --
        dest_group = QGroupBox("Save to")
        dest_layout = QVBoxLayout(dest_group)
        dest_layout.setSpacing(8)

        btn_row = QHBoxLayout()
        btn_row.setSpacing(8)

        self._btn_comics = QPushButton("Comics")
        self._btn_videos = QPushButton("Videos")
        self._btn_books = QPushButton("Books")
        self._btn_browse = QPushButton("Browse...")

        for btn in (self._btn_comics, self._btn_videos, self._btn_books, self._btn_browse):
            btn.setCursor(Qt.CursorShape.PointingHandCursor)
            btn_row.addWidget(btn)

        self._btn_comics.clicked.connect(lambda: self._pick_dest("comics"))
        self._btn_videos.clicked.connect(lambda: self._pick_dest("videos"))
        self._btn_books.clicked.connect(lambda: self._pick_dest("books"))
        self._btn_browse.clicked.connect(lambda: self._pick_dest("custom"))

        dest_layout.addLayout(btn_row)

        self._dest_display = QLabel("No destination selected")
        self._dest_display.setObjectName("subtext")
        self._dest_display.setWordWrap(True)
        dest_layout.addWidget(self._dest_display)

        layout.addWidget(dest_group)

        # -- File tree --
        files_group = QGroupBox("Files")
        files_layout = QVBoxLayout(files_group)
        files_layout.setSpacing(6)

        # Select all / deselect all row
        sel_row = QHBoxLayout()
        sel_row.setSpacing(8)
        btn_sel_all = QPushButton("Select All")
        btn_desel_all = QPushButton("Deselect All")
        btn_sel_all.clicked.connect(self._select_all_files)
        btn_desel_all.clicked.connect(self._deselect_all_files)
        sel_row.addWidget(btn_sel_all)
        sel_row.addWidget(btn_desel_all)
        sel_row.addStretch()
        files_layout.addLayout(sel_row)

        self._file_tree = QTreeWidget()
        self._file_tree.setHeaderLabels(["File", "Size", "Priority"])
        self._file_tree.setColumnCount(3)
        self._file_tree.setRootIsDecorated(True)
        self._file_tree.setAlternatingRowColors(False)
        self._file_tree.setSelectionMode(QTreeWidget.SelectionMode.NoSelection)

        header = self._file_tree.header()
        header.setStretchLastSection(False)
        header.setSectionResizeMode(0, QHeaderView.ResizeMode.Stretch)
        header.setSectionResizeMode(1, QHeaderView.ResizeMode.ResizeToContents)
        header.setSectionResizeMode(2, QHeaderView.ResizeMode.ResizeToContents)

        files_layout.addWidget(self._file_tree)

        self._files_summary = QLabel("Waiting for metadata...")
        self._files_summary.setObjectName("subtext")
        files_layout.addWidget(self._files_summary)

        layout.addWidget(files_group, 1)  # stretch

        # -- Options --
        opts_row = QHBoxLayout()
        opts_row.setSpacing(16)

        self._chk_sequential = QCheckBox("Sequential download")
        self._chk_sequential.setChecked(True)
        self._chk_sequential.setToolTip("Download pieces in order (enables streaming/playback before complete)")
        opts_row.addWidget(self._chk_sequential)

        self._chk_streamable = QCheckBox("Streamable (video library)")
        self._chk_streamable.setToolTip(
            "Create placeholders in video library for immediate indexing.\n"
            "Files stream on-demand via HTTP when played."
        )
        opts_row.addWidget(self._chk_streamable)
        opts_row.addStretch()

        layout.addLayout(opts_row)

        # -- Action buttons --
        action_row = QHBoxLayout()
        action_row.setSpacing(12)
        action_row.addStretch()

        btn_cancel = QPushButton("Cancel")
        btn_cancel.clicked.connect(self._on_cancel)
        action_row.addWidget(btn_cancel)

        self._btn_download = QPushButton("Download")
        self._btn_download.setObjectName("downloadBtn")
        self._btn_download.setEnabled(False)
        self._btn_download.clicked.connect(self._on_download)
        action_row.addWidget(self._btn_download)

        layout.addLayout(action_row)

    # -------------------------------------------------------------------
    # Library path loading
    # -------------------------------------------------------------------

    def _load_library_paths(self):
        """Read library root folders from storage config files."""
        self._lib_paths = {"comics": "", "videos": "", "books": ""}
        try:
            from .. import storage
            # Comics
            cfg = storage.read_json(storage.data_path("library_config.json"), {})
            roots = cfg.get("rootFolders", [])
            if roots:
                self._lib_paths["comics"] = roots[0]
            # Videos
            cfg = storage.read_json(storage.data_path("video_prefs.json"), {})
            roots = cfg.get("rootFolders", [])
            if roots:
                self._lib_paths["videos"] = roots[0]
            # Books
            cfg = storage.read_json(storage.data_path("books_settings.json"), {})
            roots = cfg.get("bookRootFolders", [])
            if roots:
                self._lib_paths["books"] = roots[0]
        except Exception:
            pass

        # Update button tooltips with paths
        for key, btn in [("comics", self._btn_comics), ("videos", self._btn_videos), ("books", self._btn_books)]:
            path = self._lib_paths.get(key, "")
            if path:
                btn.setToolTip(path)
            else:
                btn.setToolTip("Not configured")
                btn.setEnabled(False)

    # -------------------------------------------------------------------
    # Destination picking
    # -------------------------------------------------------------------

    def _pick_dest(self, dest_type: str):
        if dest_type == "custom":
            folder = QFileDialog.getExistingDirectory(
                self, "Select download folder", self._dest_path or ""
            )
            if not folder:
                return
            self._dest_path = folder
        else:
            path = self._lib_paths.get(dest_type, "")
            if not path:
                return
            self._dest_path = path

        self._dest_type = dest_type
        self._dest_display.setText(self._dest_path)

        # Update button styles — highlight active
        for key, btn in [("comics", self._btn_comics), ("videos", self._btn_videos),
                         ("books", self._btn_books), ("custom", self._btn_browse)]:
            if key == dest_type:
                btn.setObjectName("destActive")
            else:
                btn.setObjectName("")
            btn.style().unpolish(btn)
            btn.style().polish(btn)

        self._update_download_enabled()

    # -------------------------------------------------------------------
    # Metadata resolution (background thread)
    # -------------------------------------------------------------------

    def _start_resolve(self):
        """Start metadata resolution in a background thread."""
        if not self._bridge or not hasattr(self._bridge, "webTorrent"):
            self._status_label.setText("Bridge not available — cannot resolve metadata")
            self._resolve_progress.hide()
            return

        def _resolve():
            try:
                result_json = self._bridge.webTorrent.resolveMetadata(
                    json.dumps({"source": self._magnet})
                )
                result = json.loads(result_json) if isinstance(result_json, str) else result_json
            except Exception as e:
                result = {"ok": False, "error": str(e)}

            QTimer.singleShot(0, lambda: self._on_metadata_resolved(result))

        threading.Thread(target=_resolve, daemon=True).start()

    def _on_metadata_resolved(self, result: dict):
        """Called on main thread when metadata is ready."""
        self._resolve_progress.hide()

        if not result.get("ok", False):
            error = result.get("error", "Unknown error")
            self._status_label.setText(f"Failed: {error}")
            return

        self._resolve_id = result.get("resolveId", "")
        name = result.get("name", "Unknown")
        self._total_size = result.get("totalSize", 0)
        self._files = result.get("files", [])

        self._status_label.setText(f"{name}  ({_fmt_size(self._total_size)})")

        # Populate file tree
        self._populate_file_tree()
        self._update_download_enabled()

    # -------------------------------------------------------------------
    # File tree
    # -------------------------------------------------------------------

    def _populate_file_tree(self):
        """Build hierarchical file tree from flat file list."""
        self._file_tree.clear()

        if not self._files:
            self._files_summary.setText("No files found")
            return

        # Build folder hierarchy
        folders: dict[str, QTreeWidgetItem] = {}
        root_items = []

        for f in self._files:
            path = f.get("path", f.get("name", ""))
            parts = path.replace("\\", "/").split("/")
            size = f.get("length", 0)
            index = f.get("index", 0)

            if len(parts) == 1:
                # Top-level file
                item = QTreeWidgetItem()
                item.setCheckState(0, Qt.CheckState.Checked)
                item.setText(0, parts[0])
                item.setText(1, _fmt_size(size))
                item.setData(0, Qt.ItemDataRole.UserRole, index)
                item.setData(0, Qt.ItemDataRole.UserRole + 1, "file")

                # Priority combo
                combo = QComboBox()
                combo.addItems(["Normal", "High", "Low"])
                combo.setCurrentIndex(0)
                self._file_tree.addTopLevelItem(item)
                self._file_tree.setItemWidget(item, 2, combo)
                root_items.append(item)
            else:
                # File inside folder(s)
                parent = None
                for depth in range(len(parts) - 1):
                    folder_key = "/".join(parts[:depth + 1])
                    if folder_key not in folders:
                        folder_item = QTreeWidgetItem()
                        folder_item.setCheckState(0, Qt.CheckState.Checked)
                        folder_item.setText(0, parts[depth])
                        folder_item.setData(0, Qt.ItemDataRole.UserRole + 1, "folder")
                        if parent:
                            parent.addChild(folder_item)
                        else:
                            self._file_tree.addTopLevelItem(folder_item)
                            root_items.append(folder_item)
                        folders[folder_key] = folder_item
                    parent = folders[folder_key]

                # Add the file under its folder
                item = QTreeWidgetItem()
                item.setCheckState(0, Qt.CheckState.Checked)
                item.setText(0, parts[-1])
                item.setText(1, _fmt_size(size))
                item.setData(0, Qt.ItemDataRole.UserRole, index)
                item.setData(0, Qt.ItemDataRole.UserRole + 1, "file")
                if parent:
                    parent.addChild(item)

                combo = QComboBox()
                combo.addItems(["Normal", "High", "Low"])
                combo.setCurrentIndex(0)
                self._file_tree.setItemWidget(item, 2, combo)

        # Expand all
        self._file_tree.expandAll()

        # Connect check state changes
        self._file_tree.itemChanged.connect(self._on_item_changed)

        self._update_files_summary()

    def _on_item_changed(self, item: QTreeWidgetItem, column: int):
        """Handle checkbox changes — propagate to children for folders."""
        if column != 0:
            return
        item_type = item.data(0, Qt.ItemDataRole.UserRole + 1)
        if item_type == "folder":
            state = item.checkState(0)
            for i in range(item.childCount()):
                child = item.child(i)
                child.setCheckState(0, state)
        self._update_files_summary()
        self._update_download_enabled()

    def _get_selected_files(self) -> list[dict]:
        """Get list of selected file indices with priorities."""
        selected = []

        def _walk(item: QTreeWidgetItem):
            item_type = item.data(0, Qt.ItemDataRole.UserRole + 1)
            if item_type == "file" and item.checkState(0) == Qt.CheckState.Checked:
                index = item.data(0, Qt.ItemDataRole.UserRole)
                combo = self._file_tree.itemWidget(item, 2)
                priority = "normal"
                if combo:
                    text = combo.currentText().lower()
                    if text == "high":
                        priority = "high"
                    elif text == "low":
                        priority = "low"
                selected.append({"index": index, "priority": priority})
            for i in range(item.childCount()):
                _walk(item.child(i))

        for i in range(self._file_tree.topLevelItemCount()):
            _walk(self._file_tree.topLevelItem(i))

        return selected

    def _select_all_files(self):
        self._file_tree.blockSignals(True)
        for i in range(self._file_tree.topLevelItemCount()):
            self._set_check_recursive(self._file_tree.topLevelItem(i), Qt.CheckState.Checked)
        self._file_tree.blockSignals(False)
        self._update_files_summary()
        self._update_download_enabled()

    def _deselect_all_files(self):
        self._file_tree.blockSignals(True)
        for i in range(self._file_tree.topLevelItemCount()):
            self._set_check_recursive(self._file_tree.topLevelItem(i), Qt.CheckState.Unchecked)
        self._file_tree.blockSignals(False)
        self._update_files_summary()
        self._update_download_enabled()

    @staticmethod
    def _set_check_recursive(item: QTreeWidgetItem, state):
        item.setCheckState(0, state)
        for i in range(item.childCount()):
            TorrentAddDialog._set_check_recursive(item.child(i), state)

    def _update_files_summary(self):
        selected = self._get_selected_files()
        total_files = len(self._files)
        sel_count = len(selected)
        sel_size = 0
        file_map = {f["index"]: f for f in self._files}
        for s in selected:
            f = file_map.get(s["index"])
            if f:
                sel_size += f.get("length", 0)
        self._files_summary.setText(
            f"{sel_count} of {total_files} files selected ({_fmt_size(sel_size)})"
        )

    def _update_download_enabled(self):
        has_dest = bool(self._dest_path)
        has_files = bool(self._get_selected_files())
        has_resolve = bool(self._resolve_id)
        self._btn_download.setEnabled(has_dest and has_files and has_resolve)

    # -------------------------------------------------------------------
    # Actions
    # -------------------------------------------------------------------

    def _on_download(self):
        """Start the configured torrent download."""
        if not self._resolve_id or not self._bridge:
            return

        selected = self._get_selected_files()
        if not selected:
            return

        selected_indices = [s["index"] for s in selected]
        priorities = {str(s["index"]): s["priority"] for s in selected}
        sequential = self._chk_sequential.isChecked()
        streamable = self._chk_streamable.isChecked()

        # Call startConfigured on the bridge
        try:
            result_json = self._bridge.webTorrent.startConfigured(json.dumps({
                "resolveId": self._resolve_id,
                "savePath": self._dest_path,
                "selectedFiles": selected_indices,
                "priorities": priorities,
                "sequential": sequential,
                "origin": "browser",
            }))
            result = json.loads(result_json) if isinstance(result_json, str) else result_json

            if result.get("ok"):
                torrent_id = result.get("id", "")

                # If streamable + videos destination, use addToVideoLibrary
                if streamable and self._dest_type == "videos" and torrent_id:
                    try:
                        self._bridge.webTorrent.addToVideoLibrary(json.dumps({
                            "id": torrent_id,
                            "destinationRoot": self._dest_path,
                            "streamable": True,
                        }))
                    except Exception:
                        pass

                self.torrent_started.emit(torrent_id)
                self.accept()
            else:
                error = result.get("error", "Unknown error")
                self._status_label.setText(f"Failed to start: {error}")
        except Exception as e:
            self._status_label.setText(f"Error: {e}")

    def _on_cancel(self):
        """Cancel and clean up pending resolve."""
        if self._resolve_id and self._bridge and hasattr(self._bridge, "webTorrent"):
            try:
                self._bridge.webTorrent.cancelResolve(
                    json.dumps({"resolveId": self._resolve_id})
                )
            except Exception:
                pass
        self.reject()

    def closeEvent(self, event):
        """Clean up on dialog close."""
        self._on_cancel()
        super().closeEvent(event)
