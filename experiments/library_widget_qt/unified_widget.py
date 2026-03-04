"""Top-level unified library widget."""

from __future__ import annotations

import os

from PySide6.QtCore import Qt
from PySide6.QtGui import QFont, QPixmap
from PySide6.QtWidgets import (
    QWidget, QVBoxLayout, QHBoxLayout, QLabel, QSplitter, QStackedWidget,
    QPushButton, QProgressBar,
)

from constants import MediaKind, BG_COLOR, TEXT_PRIMARY, TEXT_SECONDARY, ACCENT_COLOR
from data_provider import MediaDataProvider
from detail_view import DetailView
from home_view import HomeView
from sidebar_widget import SidebarWidget
from media_adapter import adapter_for
from thumb_provider import ThumbProvider


class UnifiedLibraryWidget(QWidget):

    def __init__(self, kind: MediaKind = "comics", parent=None):
        super().__init__(parent)
        self._kind = kind
        self._adapter = adapter_for(kind)
        self._all_series: list[dict] = []
        self._filter_path = ""

        self.setStyleSheet(f"background-color: {BG_COLOR};")

        layout = QVBoxLayout(self)
        layout.setContentsMargins(0, 0, 0, 0)
        layout.setSpacing(0)

        # Header bar
        header_bar = QHBoxLayout()
        header_bar.setContentsMargins(0, 0, 8, 0)
        header_bar.setSpacing(8)

        self._header = QLabel(f"  Library — {kind.capitalize()}")
        self._header.setFixedHeight(40)
        self._header.setFont(QFont("Segoe UI", 14, QFont.Bold))
        self._header.setStyleSheet(
            f"color: {TEXT_PRIMARY}; background-color: {BG_COLOR};"
            "padding-left: 16px;"
        )
        self._header.setAlignment(Qt.AlignVCenter | Qt.AlignLeft)
        header_bar.addWidget(self._header, 1)

        self._scan_btn = QPushButton("Scan")
        self._scan_btn.setFixedSize(70, 28)
        self._scan_btn.setCursor(Qt.PointingHandCursor)
        self._scan_btn.setFont(QFont("Segoe UI", 9))
        self._scan_btn.setStyleSheet(f"""
            QPushButton {{
                background-color: {ACCENT_COLOR};
                color: white;
                border: none;
                border-radius: 4px;
                padding: 4px 12px;
            }}
            QPushButton:hover {{
                background-color: #f05070;
            }}
            QPushButton:disabled {{
                background-color: #555;
                color: #999;
            }}
        """)
        self._scan_btn.clicked.connect(self._on_scan_clicked)
        header_bar.addWidget(self._scan_btn)

        layout.addLayout(header_bar)

        # Splitter: sidebar + home view
        self._splitter = QSplitter(Qt.Horizontal)
        self._splitter.setStyleSheet("QSplitter::handle { background-color: #0a0a1a; width: 1px; }")

        self._sidebar = SidebarWidget()
        self._sidebar.filter_changed.connect(self._on_filter_changed)
        self._splitter.addWidget(self._sidebar)

        # Stacked widget: home (0) and detail (1)
        self._stack = QStackedWidget()

        self._home_view = HomeView()
        self._home_view.set_item_label(self._adapter.item_label)
        self._home_view.card_clicked.connect(self._on_card_clicked)
        self._home_view.sort_changed.connect(self._on_sort_changed)
        self._home_view.search_changed.connect(self._on_search_changed)
        self._home_view.hide_finished_changed.connect(self._on_hide_finished_changed)
        self._sort_index = 0
        self._search_text = ""
        self._hide_finished = False
        self._stack.addWidget(self._home_view)

        self._detail_view = DetailView()
        self._detail_view.set_columns(self._adapter.detail_columns)
        self._detail_view.back_clicked.connect(self._go_home)
        self._detail_view.preview_requested.connect(self._on_preview_requested)
        self._stack.addWidget(self._detail_view)

        self._splitter.addWidget(self._stack)

        self._splitter.setStretchFactor(0, 0)  # sidebar: fixed
        self._splitter.setStretchFactor(1, 1)  # grid: stretch
        self._splitter.setSizes([220, 980])

        layout.addWidget(self._splitter)

        # Status bar
        self._status_bar = QWidget()
        self._status_bar.setFixedHeight(28)
        self._status_bar.setStyleSheet(f"background-color: #0f0f23;")
        self._status_bar.setVisible(False)
        status_layout = QHBoxLayout(self._status_bar)
        status_layout.setContentsMargins(12, 0, 12, 0)
        status_layout.setSpacing(8)

        self._status_label = QLabel("")
        self._status_label.setFont(QFont("Segoe UI", 9))
        self._status_label.setStyleSheet(f"color: {TEXT_SECONDARY}; background: transparent;")
        status_layout.addWidget(self._status_label)

        self._status_progress = QProgressBar()
        self._status_progress.setFixedWidth(200)
        self._status_progress.setFixedHeight(14)
        self._status_progress.setTextVisible(False)
        self._status_progress.setStyleSheet(f"""
            QProgressBar {{
                background-color: #1a1a2e;
                border: 1px solid #2a2a4e;
                border-radius: 3px;
            }}
            QProgressBar::chunk {{
                background-color: {ACCENT_COLOR};
                border-radius: 2px;
            }}
        """)
        status_layout.addWidget(self._status_progress)
        status_layout.addStretch()

        layout.addWidget(self._status_bar)

        # Thumbnail provider
        self._thumb_provider = ThumbProvider(parent=self)
        self._thumb_provider.thumb_ready.connect(self._on_thumb_ready)

        # Data provider
        self._provider = MediaDataProvider(kind, parent=self)
        self._provider.data_ready.connect(self._on_data_ready)
        self._provider.scan_started.connect(self._on_scan_started)
        self._provider.scan_progress.connect(self._on_scan_progress)
        self._provider.scan_finished.connect(self._on_scan_done)
        self._provider.scan_error.connect(self._on_scan_error)

    def load(self):
        """Trigger data load from disk. Auto-scans if index is empty."""
        self._provider.load()
        # Auto-scan if no data loaded
        if not self._provider.series:
            self._provider.start_scan(force=True)

    def _on_data_ready(self):
        self._all_series = list(self._provider.series)

        # Populate sidebar
        self._sidebar.populate(self._provider.root_folders, self._all_series)

        # Populate continue shelf
        continue_items = self._provider.continue_items(self._provider.items)
        self._home_view.set_continue_items(continue_items)
        self._request_continue_thumbs(continue_items)

        # Set continue label based on kind
        labels = {"comics": "Continue Reading", "books": "Continue Reading", "video": "Continue Watching"}
        self._home_view.set_continue_label(labels.get(self._kind, "Continue"))

        # Show all series initially
        self._apply_filter()

    def _on_filter_changed(self, path: str):
        self._filter_path = path
        self._apply_filter()

    def _on_sort_changed(self, index: int):
        self._sort_index = index
        self._apply_filter()

    def _on_search_changed(self, text: str):
        self._search_text = text.strip().lower()
        self._apply_filter()

    def _on_hide_finished_changed(self, checked: bool):
        self._hide_finished = checked
        if checked:
            self._build_finished_set()
        self._apply_filter()

    def _build_finished_set(self):
        """Compute which series are fully finished based on progress data."""
        progress = self._provider.progress
        items = self._provider.items
        # Group items by series_id
        items_by_series: dict[str, list[dict]] = {}
        for it in items:
            sid = it.get("series_id", "")
            if sid:
                items_by_series.setdefault(sid, []).append(it)

        self._finished_series: set[str] = set()
        for sid, series_items in items_by_series.items():
            if not series_items:
                continue
            all_finished = all(
                progress.get(it.get("id", ""), {}).get("finished", False)
                for it in series_items
            )
            if all_finished:
                self._finished_series.add(sid)

    def _apply_filter(self):
        if not self._filter_path:
            visible = list(self._all_series)
        else:
            fp = os.path.normpath(self._filter_path).lower()
            visible = [
                s for s in self._all_series
                if os.path.normpath(s.get("path", "")).lower().startswith(fp)
            ]

        # Apply search filter
        if self._search_text:
            visible = [
                s for s in visible
                if self._search_text in s.get("name", "").lower()
            ]

        # Apply hide-finished filter
        if self._hide_finished and hasattr(self, "_finished_series"):
            visible = [
                s for s in visible
                if s.get("id", "") not in self._finished_series
            ]

        # Apply sort
        from home_view import SORT_OPTIONS
        if 0 <= self._sort_index < len(SORT_OPTIONS):
            _, key_fn = SORT_OPTIONS[self._sort_index]
            reverse = self._sort_index in (1, 2)  # Z-A, Count ↓
            visible.sort(key=key_fn, reverse=reverse)

        self._home_view.set_series(visible)
        self._request_thumbs()

        count = len(visible)
        total = len(self._all_series)
        if self._filter_path:
            folder_name = os.path.basename(self._filter_path) or self._filter_path
            self._header.setText(
                f"  Library — {self._kind.capitalize()} · {folder_name} ({count}/{total})"
            )
        else:
            self._header.setText(
                f"  Library — {self._kind.capitalize()} ({total} {self._adapter.series_label})"
            )

    def _on_card_clicked(self, series_id: str):
        """Navigate to detail view for the clicked series."""
        series = next((s for s in self._all_series if s.get("id") == series_id), None)
        if not series:
            return
        items = self._adapter.items_for_series(self._provider.items, series_id)
        # Sort items by title
        items.sort(key=lambda it: it.get("title", "").lower())
        self._detail_view.set_items(items, series.get("name", "Unknown"))
        self._stack.setCurrentIndex(1)
        self._header.setText(f"  {series.get('name', 'Unknown')} — {len(items)} {self._adapter.item_label}")

    def _go_home(self):
        """Navigate back to the home grid."""
        self._stack.setCurrentIndex(0)
        self._apply_filter()

    def _request_thumbs(self):
        """Request thumbnails for all visible cards."""
        items = self._provider.items
        # Build a map: series_id -> first item (by title sort)
        first_item_by_series: dict[str, dict] = {}
        for it in items:
            sid = it.get("series_id", "")
            if not sid:
                continue
            if sid not in first_item_by_series:
                first_item_by_series[sid] = it
            else:
                if it.get("title", "").lower() < first_item_by_series[sid].get("title", "").lower():
                    first_item_by_series[sid] = it

        for card in self._home_view.cards:
            sid = card.series_data.get("id", "")
            thumb_path = card.series_data.get("thumb_path")
            first = first_item_by_series.get(sid)
            if first:
                self._thumb_provider.request_thumb(
                    sid, first.get("path", ""), first.get("id", ""),
                    thumb_path=thumb_path,
                )

    def _request_continue_thumbs(self, continue_items: list[dict]):
        """Request thumbnails for continue shelf tiles using the item's own ID."""
        for item in continue_items:
            item_id = item.get("id", "")
            path = item.get("path", "")
            if item_id and path:
                # Use item_id as the thumb key (prefix with "cont:" to avoid collision)
                self._thumb_provider.request_thumb(
                    f"cont:{item_id}", path, item_id,
                )

    def _on_preview_requested(self, key: str, item_path: str, item_id: str):
        """Handle preview pane thumbnail request from detail view."""
        self._thumb_provider.request_thumb(key, item_path, item_id)

    def _on_thumb_ready(self, series_id: str, px: QPixmap):
        """Apply a loaded thumbnail to the matching card, tile, or preview."""
        # Detail preview pane
        if series_id.startswith("detail:"):
            item_id = series_id[7:]
            self._detail_view.set_preview_pixmap(item_id, px)
            return

        # Continue tiles
        if series_id.startswith("cont:"):
            item_id = series_id[5:]
            for tile in self._home_view.tiles:
                if tile.item_data.get("id") == item_id:
                    tile.set_pixmap(px)
                    break
            return

        # Regular series cards
        for card in self._home_view.cards:
            if card.series_data.get("id") == series_id:
                card.set_pixmap(px)
                break

    # ── Scan ─────────────────────────────────────────────────────────

    def _on_scan_clicked(self):
        self._provider.start_scan(force=True)

    def _on_scan_started(self):
        self._scan_btn.setEnabled(False)
        self._scan_btn.setText("Scanning")
        self._status_bar.setVisible(True)
        self._status_label.setText("Scanning...")
        self._status_progress.setValue(0)

    def _on_scan_progress(self, done: int, total: int, current: str):
        pct = int((done / max(total, 1)) * 100)
        self._status_progress.setValue(pct)
        if current:
            self._status_label.setText(f"Scanning: {current} ({done}/{total})")
        else:
            self._status_label.setText(f"Scanning... ({done}/{total})")

    def _on_scan_done(self):
        self._scan_btn.setEnabled(True)
        self._scan_btn.setText("Scan")
        self._status_bar.setVisible(False)
        # Clear thumb cache so new series get fresh thumbs
        self._thumb_provider.clear()

    def _on_scan_error(self, msg: str):
        self._scan_btn.setEnabled(True)
        self._scan_btn.setText("Scan")
        self._status_label.setText(f"Scan error: {msg}")
        # Keep status bar visible for a moment with error
