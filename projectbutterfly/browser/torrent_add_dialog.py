"""
TorrentAddDialog â€” metadata-first torrent add dialog.

Mirrors the Electron app's add flow:
  1. User clicks magnet link â†’ dialog opens immediately
  2. Metadata resolves in background (name, size, file tree)
  3. User picks destination (Comics/Videos/Books/Browse)
  4. User selects files, sets priorities, toggles sequential/streamable
  5. Click Download â†’ starts configured torrent
"""

from __future__ import annotations

import json
import os
import threading
import time
from pathlib import Path

from PySide6.QtCore import Qt, Signal, QTimer
from PySide6.QtGui import QColor, QFont
from PySide6.QtWidgets import (
    QDialog, QVBoxLayout, QHBoxLayout, QLabel, QLineEdit,
    QPushButton, QTreeWidget, QTreeWidgetItem, QHeaderView,
    QCheckBox, QComboBox, QWidget, QProgressBar,
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

    def __init__(self, magnet_uri: str, bridge_root=None, parent=None, manage_torrent=None):
        super().__init__(parent)
        self._magnet = magnet_uri
        self._bridge = bridge_root
        self._manage_torrent = manage_torrent if isinstance(manage_torrent, dict) else None
        self._manage_mode = bool(self._manage_torrent)
        self._torrent_id = str((self._manage_torrent or {}).get("id", "") or "")
        self._resolve_id = None
        self._resolve_started_ms = 0
        self._resolve_timeout_ms = 90000
        self._resolve_poll_timer = QTimer(self)
        self._resolve_poll_timer.setInterval(350)
        self._resolve_poll_timer.timeout.connect(self._poll_resolve_status)
        self._files = []
        self._total_size = 0
        self._dest_path = ""
        self._dest_type = ""  # "comics", "videos", "books"
        self._lib_paths = {"comics": "", "videos": "", "books": ""}
        self._lib_roots = {"comics": [], "videos": [], "books": []}
        self._last_dest_by_cat = {}
        self._dest_mode_value = "standalone"

        self.setWindowTitle("Manage Torrent Files" if self._manage_mode else "Add Torrent")
        self.setMinimumSize(620, 520)
        self.resize(680, 600)
        self.setStyleSheet(_DIALOG_STYLE)
        self.setWindowFlags(
            Qt.WindowType.Dialog | Qt.WindowType.WindowTitleHint | Qt.WindowType.WindowCloseButtonHint
        )

        self._build_ui()
        self._load_last_destinations()
        self._load_library_paths()

        if self._manage_mode:
            QTimer.singleShot(50, self._load_manage_snapshot)
        else:
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
        if self._manage_mode:
            self._source_input.setText(str((self._manage_torrent or {}).get("name", "") or self._torrent_id))
            self._source_input.setPlaceholderText("Existing torrent")
        else:
            self._source_input.setText(self._magnet)
            self._source_input.setPlaceholderText("Magnet URI or .torrent file")
        self._source_input.setReadOnly(True)
        layout.addWidget(self._source_input)

        # -- Status line (resolving / name + size) --
        self._status_label = QLabel("Loading torrent info..." if self._manage_mode else "Resolving metadata...")
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
        self._btn_standalone = QPushButton("Standalone")

        for btn in (self._btn_comics, self._btn_videos, self._btn_books, self._btn_standalone):
            btn.setCursor(Qt.CursorShape.PointingHandCursor)
            btn_row.addWidget(btn)

        self._btn_comics.clicked.connect(lambda: self._pick_dest("comics"))
        self._btn_videos.clicked.connect(lambda: self._pick_dest("videos"))
        self._btn_books.clicked.connect(lambda: self._pick_dest("books"))
        self._btn_standalone.clicked.connect(lambda: self._set_dest_mode("standalone"))

        dest_layout.addLayout(btn_row)

        mode_row = QHBoxLayout()
        mode_row.setSpacing(8)
        mode_lbl = QLabel("Destination mode")
        mode_lbl.setObjectName("subtext")
        self._dest_mode = QComboBox()
        self._dest_mode.addItem("Standalone download (default)", "standalone")
        self._dest_mode.addItem("Pick existing folder", "existing")
        self._dest_mode.addItem("Create new folder", "new")
        self._dest_mode.currentIndexChanged.connect(self._on_destination_mode_changed)
        mode_row.addWidget(mode_lbl)
        mode_row.addWidget(self._dest_mode, 1)
        dest_layout.addLayout(mode_row)

        self._existing_folder_combo = QComboBox()
        self._existing_folder_combo.currentIndexChanged.connect(self._on_existing_folder_changed)
        dest_layout.addWidget(self._existing_folder_combo)

        self._new_folder_input = QLineEdit()
        self._new_folder_input.setPlaceholderText("Enter new folder name")
        self._new_folder_input.textChanged.connect(lambda _text: self._recompute_destination())
        dest_layout.addWidget(self._new_folder_input)

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

        self._btn_retry = QPushButton("Retry")
        self._btn_retry.clicked.connect(self._retry_resolve)
        self._btn_retry.setVisible(False)
        action_row.addWidget(self._btn_retry)

        self._btn_download = QPushButton("Apply" if self._manage_mode else "Download")
        self._btn_download.setObjectName("downloadBtn")
        self._btn_download.setEnabled(False)
        self._btn_download.clicked.connect(self._on_download)
        action_row.addWidget(self._btn_download)

        layout.addLayout(action_row)

    # -------------------------------------------------------------------
    # Library path loading
    # -------------------------------------------------------------------

    def _load_library_paths(self):
        """Read library root folders using WebSourcesBridge destinations API."""
        self._lib_paths = {"comics": "", "videos": "", "books": ""}
        self._lib_roots = {"comics": [], "videos": [], "books": []}

        loaded = False
        if self._bridge and hasattr(self._bridge, "webSources"):
            try:
                raw = self._bridge.webSources.getDestinations()
                data = json.loads(raw) if isinstance(raw, str) else raw
                if isinstance(data, dict) and data.get("ok"):
                    self._lib_roots["comics"] = [str(p) for p in (data.get("allComics") or []) if p]
                    self._lib_roots["videos"] = [str(p) for p in (data.get("allVideos") or []) if p]
                    self._lib_roots["books"] = [str(p) for p in (data.get("allBooks") or []) if p]
                    for key in ("comics", "videos", "books"):
                        roots = self._lib_roots.get(key, [])
                        self._lib_paths[key] = str(roots[0]) if roots else ""
                    loaded = True
            except Exception:
                loaded = False

        if not loaded:
            try:
                from .. import storage
                cfg = storage.read_json(storage.data_path("library_state.json"), {})
                comics = [str(p) for p in (cfg.get("rootFolders") or []) if p]
                videos = [str(p) for p in (cfg.get("videoFolders") or []) if p]
                bcfg = storage.read_json(storage.data_path("books_library_state.json"), {})
                books = [str(p) for p in (bcfg.get("bookRootFolders") or []) if p]
                self._lib_roots = {"comics": comics, "videos": videos, "books": books}
                for key in ("comics", "videos", "books"):
                    roots = self._lib_roots.get(key, [])
                    self._lib_paths[key] = str(roots[0]) if roots else ""
            except Exception:
                pass

        for key, btn in [("comics", self._btn_comics), ("videos", self._btn_videos), ("books", self._btn_books)]:
            path = self._lib_paths.get(key, "")
            btn.setEnabled(bool(path))
            btn.setToolTip(path or "Not configured")

        preferred = "videos" if self._lib_paths.get("videos") else ""
        if not preferred:
            for key in ("comics", "books", "videos"):
                if self._lib_paths.get(key):
                    preferred = key
                    break
        if preferred:
            self._pick_dest(preferred)

    # -------------------------------------------------------------------
    # Destination picking
    # -------------------------------------------------------------------

    def _load_last_destinations(self):
        self._last_dest_by_cat = {}
        if not self._bridge or not hasattr(self._bridge, "webBrowserSettings"):
            return
        try:
            raw = self._bridge.webBrowserSettings.get()
            data = json.loads(raw) if isinstance(raw, str) else raw
            settings = data.get("settings", {}) if isinstance(data, dict) else {}
            saved = settings.get("sourcesLastDestinationByCategory", {}) if isinstance(settings, dict) else {}
            if isinstance(saved, dict):
                for key in ("comics", "videos", "books"):
                    path = str(saved.get(key, "") or "").strip()
                    if path:
                        self._last_dest_by_cat[key] = path
        except Exception:
            self._last_dest_by_cat = {}

    def _save_last_destination(self):
        if not self._bridge or not hasattr(self._bridge, "webBrowserSettings"):
            return
        cat = str(self._dest_type or "").strip()
        if cat not in ("comics", "videos", "books") or not self._dest_path:
            return
        try:
            raw = self._bridge.webBrowserSettings.get()
            data = json.loads(raw) if isinstance(raw, str) else raw
            settings = data.get("settings", {}) if isinstance(data, dict) else {}
            if not isinstance(settings, dict):
                settings = {}
            rows = settings.get("sourcesLastDestinationByCategory", {})
            if not isinstance(rows, dict):
                rows = {}
            rows[cat] = self._dest_path
            settings["sourcesLastDestinationByCategory"] = rows
            self._last_dest_by_cat = dict(rows)
            self._bridge.webBrowserSettings.save(json.dumps(settings))
        except Exception:
            pass

    def _set_dest_mode(self, mode: str):
        val = str(mode or "").strip()
        if val not in ("standalone", "existing", "new"):
            val = "standalone"
        idx = self._dest_mode.findData(val)
        if idx >= 0 and idx != self._dest_mode.currentIndex():
            self._dest_mode.setCurrentIndex(idx)
        self._dest_mode_value = val
        self._refresh_destination_mode_widgets()
        self._recompute_destination()

    def _on_destination_mode_changed(self, _index: int):
        self._dest_mode_value = str(self._dest_mode.currentData() or "standalone")
        self._refresh_destination_mode_widgets()
        self._recompute_destination()

    def _refresh_destination_mode_widgets(self):
        mode = str(self._dest_mode.currentData() or "standalone")
        self._existing_folder_combo.setVisible(mode == "existing")
        self._new_folder_input.setVisible(mode == "new")

    def _on_existing_folder_changed(self, _index: int):
        self._recompute_destination()

    def _reload_existing_folders(self):
        self._existing_folder_combo.blockSignals(True)
        self._existing_folder_combo.clear()
        cat = str(self._dest_type or "").strip()
        root = str(self._lib_paths.get(cat, "") or "").strip()
        if not cat or not root:
            self._existing_folder_combo.blockSignals(False)
            return

        rows = [{"name": os.path.basename(root) or root, "path": root}]
        if self._bridge and hasattr(self._bridge, "webSources"):
            try:
                raw = self._bridge.webSources.listDestinationFolders(json.dumps({
                    "mode": cat,
                    "path": root,
                }))
                data = json.loads(raw) if isinstance(raw, str) else raw
                if isinstance(data, dict) and data.get("ok"):
                    for row in (data.get("folders") or []):
                        if isinstance(row, dict):
                            p = str(row.get("path", "") or "").strip()
                            if p:
                                rows.append({
                                    "name": str(row.get("name", "") or os.path.basename(p) or p),
                                    "path": p,
                                })
            except Exception:
                pass

        seen = set()
        for row in rows:
            p = os.path.abspath(str(row.get("path", "") or ""))
            if not p:
                continue
            key = p.lower()
            if key in seen:
                continue
            seen.add(key)
            self._existing_folder_combo.addItem(str(row.get("name", "") or os.path.basename(p) or p), p)

        last = str(self._last_dest_by_cat.get(cat, "") or "").strip()
        if last:
            last_abs = os.path.abspath(last).lower()
            for i in range(self._existing_folder_combo.count()):
                if str(self._existing_folder_combo.itemData(i) or "").lower() == last_abs:
                    self._existing_folder_combo.setCurrentIndex(i)
                    break
        self._existing_folder_combo.blockSignals(False)

    def _recompute_destination(self):
        cat = str(self._dest_type or "").strip()
        root = str(self._lib_paths.get(cat, "") or "").strip()
        mode = str(self._dest_mode.currentData() or "standalone")
        path = ""
        if root:
            if mode == "existing":
                path = str(self._existing_folder_combo.currentData() or root)
            elif mode == "new":
                name = str(self._new_folder_input.text() or "").strip()
                if name:
                    safe = "".join(ch if ch not in '<>:"/\\|?*' and ord(ch) >= 32 else "_" for ch in name).strip(" .")
                    path = os.path.join(root, safe) if safe else root
                else:
                    path = root
            else:
                path = root
        self._dest_path = path
        self._dest_display.setText(path or "No destination selected")
        if path:
            self._save_last_destination()
        self._update_download_enabled()

    def _pick_dest(self, dest_type: str):
        if dest_type not in ("comics", "videos", "books"):
            return
        path = str(self._lib_paths.get(dest_type, "") or "").strip()
        if not path:
            return

        self._dest_type = dest_type
        self._reload_existing_folders()
        self._recompute_destination()

        # Update button styles to highlight active category.
        for key, btn in [("comics", self._btn_comics), ("videos", self._btn_videos), ("books", self._btn_books)]:
            if key == dest_type:
                btn.setObjectName("destActive")
            else:
                btn.setObjectName("")
            btn.style().unpolish(btn)
            btn.style().polish(btn)

        self._chk_streamable.setEnabled(dest_type == "videos")
        if dest_type != "videos":
            self._chk_streamable.setChecked(False)
        last = str(self._last_dest_by_cat.get(dest_type, "") or "").strip()
        if last:
            self._set_dest_mode("existing")
        else:
            self._set_dest_mode(self._dest_mode_value or "standalone")

    # -------------------------------------------------------------------
    # Metadata resolution (background thread)
    # -------------------------------------------------------------------

    def _set_resolve_error(self, message: str, *, allow_retry: bool = True):
        self._resolve_poll_timer.stop()
        self._resolve_progress.hide()
        self._status_label.setText(str(message or "Metadata resolve failed"))
        if hasattr(self, "_btn_retry"):
            self._btn_retry.setVisible(bool(allow_retry and not self._manage_mode))

    def _retry_resolve(self):
        if self._manage_mode:
            return
        if self._resolve_id and self._bridge and hasattr(self._bridge, "webTorrent"):
            try:
                self._bridge.webTorrent.cancelResolve(
                    json.dumps({"resolveId": self._resolve_id})
                )
            except Exception:
                pass
        self._resolve_id = None
        self._resolve_started_ms = 0
        self._files = []
        self._file_tree.clear()
        self._files_summary.setText("Waiting for metadata...")
        if hasattr(self, "_btn_retry"):
            self._btn_retry.setVisible(False)
        self._btn_download.setEnabled(False)
        self._start_resolve()

    def _start_resolve(self):
        """Start metadata resolution in a background thread."""
        if not self._bridge or not hasattr(self._bridge, "webTorrent"):
            self._set_resolve_error("Bridge not available - cannot resolve metadata", allow_retry=False)
            return

        self._resolve_poll_timer.stop()
        self._resolve_id = None
        self._resolve_started_ms = int(time.time() * 1000)
        if hasattr(self, "_btn_retry"):
            self._btn_retry.setVisible(False)
        self._status_label.setText("Resolving metadata... finding peers")
        self._resolve_progress.setRange(0, 0)
        self._resolve_progress.show()

        def _resolve():
            try:
                if hasattr(self._bridge.webTorrent, "startResolve"):
                    result_json = self._bridge.webTorrent.startResolve(
                        json.dumps({
                            "source": self._magnet,
                            "timeoutMs": self._resolve_timeout_ms,
                            "retryAfterMs": 20000,
                            "maxRetries": 1,
                        })
                    )
                else:
                    result_json = self._bridge.webTorrent.resolveMetadata(
                        json.dumps({"source": self._magnet, "timeoutMs": self._resolve_timeout_ms})
                    )
                result = json.loads(result_json) if isinstance(result_json, str) else result_json
            except Exception as e:
                result = {"ok": False, "error": str(e)}

            QTimer.singleShot(0, lambda: self._on_resolve_started(result))

        threading.Thread(target=_resolve, daemon=True).start()

    def _on_resolve_started(self, result: dict):
        if not result.get("ok", False):
            self._set_resolve_error(f"Failed: {result.get('error', 'Unknown error')}", allow_retry=True)
            return
        self._resolve_id = str(result.get("resolveId", "") or "")
        self._resolve_started_ms = int(time.time() * 1000)
        state = str(result.get("state", "") or "").strip().lower()
        if state in ("timeout", "error"):
            self._set_resolve_error(
                str(result.get("error", "") or ("Resolve " + state)),
                allow_retry=True,
            )
            return
        if result.get("done") or result.get("metadataReady") or result.get("files"):
            self._on_metadata_resolved(result)
            return
        self._resolve_poll_timer.start()

    def _poll_resolve_status(self):
        if not self._resolve_id:
            self._resolve_poll_timer.stop()
            return
        if not self._bridge or not hasattr(self._bridge, "webTorrent"):
            self._set_resolve_error("Bridge unavailable while resolving", allow_retry=True)
            return
        try:
            raw = self._bridge.webTorrent.getResolveStatus(
                json.dumps({"resolveId": self._resolve_id})
            )
            status = json.loads(raw) if isinstance(raw, str) else raw
        except Exception as e:
            status = {"ok": False, "error": str(e)}

        if not status.get("ok", False):
            self._set_resolve_error(f"Failed: {status.get('error', 'Unknown error')}", allow_retry=True)
            return

        elapsed_ms = int(status.get("elapsedMs", int(time.time() * 1000) - self._resolve_started_ms) or 0)
        secs = max(0, elapsed_ms // 1000)
        state = str(status.get("state", "") or "").strip().lower()
        if state in ("timeout", "error"):
            self._set_resolve_error(
                str(status.get("error", "") or ("Resolve " + state)),
                allow_retry=True,
            )
            return
        if elapsed_ms >= self._resolve_timeout_ms and not status.get("done", False):
            self._set_resolve_error(
                "Metadata resolution timed out. Retry or cancel.",
                allow_retry=True,
            )
            return
        if not status.get("done", False):
            retry_count = int(status.get("retryCount", 0) or 0)
            if secs >= 25:
                hint = "slow magnet, still trying"
                if retry_count > 0:
                    hint = "slow magnet, retry #" + str(retry_count)
                self._status_label.setText(f"Resolving metadata... {secs}s ({hint})")
            else:
                self._status_label.setText(f"Resolving metadata... {secs}s")
            return

        self._resolve_poll_timer.stop()
        self._on_metadata_resolved(status)

    def _on_metadata_resolved(self, result: dict):
        """Called on main thread when metadata is ready."""
        self._resolve_poll_timer.stop()
        self._resolve_progress.hide()

        if not result.get("ok", False):
            error = result.get("error", "Unknown error")
            self._set_resolve_error(f"Failed: {error}", allow_retry=True)
            return

        state = str(result.get("state", "") or "").strip().lower()
        if state in ("timeout", "error"):
            self._set_resolve_error(
                str(result.get("error", "") or ("Resolve " + state)),
                allow_retry=True,
            )
            return

        self._resolve_id = result.get("resolveId", "")
        name = result.get("name", "Unknown")
        self._total_size = result.get("totalSize", 0)
        self._files = result.get("files", [])
        if hasattr(self, "_btn_retry"):
            self._btn_retry.setVisible(False)

        self._status_label.setText(f"{name}  ({_fmt_size(self._total_size)})")

        # Populate file tree
        self._populate_file_tree()
        self._update_download_enabled()

    def _load_manage_snapshot(self):
        """Initialize dialog from an existing torrent row for manage mode."""
        row = self._manage_torrent or {}
        self._resolve_progress.hide()
        self._resolve_id = None
        self._torrent_id = str(row.get("id", "") or self._torrent_id)
        self._files = row.get("files", []) if isinstance(row.get("files"), list) else []
        self._total_size = int(row.get("totalSize", 0) or 0)
        name = str(row.get("name", "") or self._torrent_id or "Torrent")
        self._status_label.setText(f"Manage: {name}  ({_fmt_size(self._total_size)})")

        if not self._files and self._bridge and hasattr(self._bridge, "webTorrent") and self._torrent_id:
            try:
                raw = self._bridge.webTorrent.getActive()
                data = json.loads(raw) if isinstance(raw, str) else raw
                for item in (data.get("torrents", []) if isinstance(data, dict) else []):
                    if isinstance(item, dict) and str(item.get("id", "") or "") == self._torrent_id:
                        self._files = item.get("files", []) if isinstance(item.get("files"), list) else []
                        self._total_size = int(item.get("totalSize", self._total_size) or self._total_size)
                        break
            except Exception:
                pass

        save_path = str(row.get("destinationRoot", "") or row.get("savePath", "") or "").strip()
        if save_path:
            for key in ("videos", "comics", "books"):
                roots = self._lib_roots.get(key, [])
                if any(os.path.abspath(save_path).lower().startswith(os.path.abspath(r).lower()) for r in roots):
                    self._dest_type = key
                    break
            if self._dest_type:
                self._pick_dest(self._dest_type)
                self._dest_path = save_path
                self._dest_display.setText(save_path)

        self._chk_sequential.setChecked(bool(row.get("sequential", True)))
        self._chk_streamable.setChecked(bool(row.get("videoLibraryStreamable", False)))

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
            selected = bool(f.get("selected", True))
            pr = str(f.get("priority", "normal") or "normal").strip().lower()
            if pr not in ("high", "normal", "low"):
                pr = "normal"

            if len(parts) == 1:
                # Top-level file
                item = QTreeWidgetItem()
                item.setCheckState(0, Qt.CheckState.Checked if selected else Qt.CheckState.Unchecked)
                item.setText(0, parts[0])
                item.setText(1, _fmt_size(size))
                item.setData(0, Qt.ItemDataRole.UserRole, index)
                item.setData(0, Qt.ItemDataRole.UserRole + 1, "file")

                # Priority combo
                combo = QComboBox()
                combo.addItems(["Normal", "High", "Low"])
                combo.setCurrentIndex(1 if pr == "high" else (2 if pr == "low" else 0))
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
                item.setCheckState(0, Qt.CheckState.Checked if selected else Qt.CheckState.Unchecked)
                item.setText(0, parts[-1])
                item.setText(1, _fmt_size(size))
                item.setData(0, Qt.ItemDataRole.UserRole, index)
                item.setData(0, Qt.ItemDataRole.UserRole + 1, "file")
                if parent:
                    parent.addChild(item)

                combo = QComboBox()
                combo.addItems(["Normal", "High", "Low"])
                combo.setCurrentIndex(1 if pr == "high" else (2 if pr == "low" else 0))
                self._file_tree.setItemWidget(item, 2, combo)

        # Expand all
        self._file_tree.expandAll()

        # Connect check state changes
        self._file_tree.itemChanged.connect(self._on_item_changed)

        self._update_files_summary()

    def _on_item_changed(self, item: QTreeWidgetItem, column: int):
        """Handle checkbox changes â€” propagate to children for folders."""
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
        has_ticket = bool(self._torrent_id) if self._manage_mode else bool(self._resolve_id)
        self._btn_download.setEnabled(has_dest and has_files and has_ticket)

    # -------------------------------------------------------------------
    # Actions
    # -------------------------------------------------------------------

    def _on_download(self):
        """Start the configured torrent download."""
        if not self._bridge:
            return

        selected = self._get_selected_files()
        if not selected:
            return

        selected_indices = [s["index"] for s in selected]
        priorities = {str(s["index"]): s["priority"] for s in selected}
        sequential = self._chk_sequential.isChecked()
        streamable = self._chk_streamable.isChecked()

        try:
            if self._manage_mode:
                if not self._torrent_id:
                    self._status_label.setText("Missing torrent id for manage flow")
                    return
                result_json = self._bridge.webTorrent.selectFiles(json.dumps({
                    "id": self._torrent_id,
                    "selectedIndices": selected_indices,
                    "priorities": priorities,
                    "sequential": sequential,
                    "destinationRoot": self._dest_path,
                }))
                result = json.loads(result_json) if isinstance(result_json, str) else result_json
                if not result.get("ok"):
                    self._status_label.setText(f"Failed to apply changes: {result.get('error', 'Unknown error')}")
                    return
                torrent_id = self._torrent_id
            else:
                if not self._resolve_id:
                    return
                result_json = self._bridge.webTorrent.startConfigured(json.dumps({
                    "resolveId": self._resolve_id,
                    "savePath": self._dest_path,
                    "selectedFiles": selected_indices,
                    "priorities": priorities,
                    "sequential": sequential,
                    "streamableOnly": bool(streamable and self._dest_type == "videos"),
                    "origin": "browser",
                }))
                result = json.loads(result_json) if isinstance(result_json, str) else result_json
                if not result.get("ok"):
                    self._status_label.setText(f"Failed to start: {result.get('error', 'Unknown error')}")
                    return
                torrent_id = str(result.get("id", "") or "")

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
        except Exception as e:
            self._status_label.setText(f"Error: {e}")

    def _on_cancel(self):
        """Cancel and clean up pending resolve."""
        self._resolve_poll_timer.stop()
        if (not self._manage_mode) and self._resolve_id and self._bridge and hasattr(self._bridge, "webTorrent"):
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

