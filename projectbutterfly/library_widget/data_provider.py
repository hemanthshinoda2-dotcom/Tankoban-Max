"""Data provider that reads library index files and exposes series/items."""

from __future__ import annotations

import sys
import os

from PySide6.QtCore import QObject, QThread, Signal

# Add parent dir so we can import storage and QTRoute
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from storage import read_json, data_path
from QTRoute.src.store import QTRouteStore
from QTRoute.src.common import LIBRARY_CONFIG_FILE, list_immediate_subdirs
import storage as storage_module

from constants import MediaKind
from media_adapter import adapter_for
from scan_worker import ScanWorker


class MediaDataProvider(QObject):
    """Reads index JSON files for a given media kind and emits data_ready."""

    data_ready = Signal()
    scan_started = Signal()
    scan_progress = Signal(int, int, str)  # done, total, current folder
    scan_finished = Signal()
    scan_error = Signal(str)

    def __init__(self, kind: MediaKind, parent=None):
        super().__init__(parent)
        self._kind = kind
        self._adapter = adapter_for(kind)
        self._store = QTRouteStore(storage_module)
        self._series: list[dict] = []
        self._items: list[dict] = []
        self._config: dict = {}
        self._progress: dict = {}
        self._scan_thread: QThread | None = None
        self._scan_worker: ScanWorker | None = None

    @property
    def kind(self) -> MediaKind:
        return self._kind

    @property
    def series(self) -> list[dict]:
        return self._series

    @property
    def items(self) -> list[dict]:
        return self._items

    @property
    def config(self) -> dict:
        return self._config

    @property
    def progress(self) -> dict:
        return self._progress

    @property
    def scanning(self) -> bool:
        return self._scan_thread is not None and self._scan_thread.isRunning()

    @property
    def root_folders(self) -> list[str]:
        if self._kind == "comics":
            return self._config.get("rootFolders", [])
        if self._kind == "books":
            return self._config.get("bookRootFolders", [])
        return self._config.get("videoFolders", [])

    def load(self):
        """Read index + config from disk and populate series/items."""
        # Read config
        if self._kind == "comics":
            self._config = self._store.read_shared_library_config()
        elif self._kind == "books":
            self._config = self._store.read_books_config()
        else:
            self._config = self._store.read_shared_library_config()

        # Read index
        raw_index = self._store.read_index(self._kind)
        self._series = self._adapter.extract_series(raw_index)
        self._items = self._adapter.extract_items(raw_index)

        # Read progress
        progress_file = {
            "comics": "progress.json",
            "books": "books_progress.json",
            "video": "video_progress.json",
        }.get(self._kind, "progress.json")
        self._progress = self._store.read_json(progress_file, {})

        self.data_ready.emit()

    def start_scan(self, force: bool = False):
        """Start a background scan of configured folders."""
        if self.scanning:
            return

        # Determine folders to scan
        folders = self._effective_folders()
        if not folders:
            self.scan_error.emit("No folders configured")
            return

        # Skip if we already have data and not forced
        if not force and self._series:
            return

        ignore_subs = []
        if self._kind in ("comics", "video"):
            ignore_subs = [s.lower() for s in self._config.get("scanIgnore", []) if s]
        elif self._kind == "books":
            ignore_subs = [s.lower() for s in self._config.get("scanIgnore", []) if s]

        self._scan_thread = QThread()
        self._scan_worker = ScanWorker(self._kind, folders, ignore_subs)
        self._scan_worker.moveToThread(self._scan_thread)

        self._scan_worker.progress.connect(self.scan_progress)
        self._scan_worker.finished.connect(self._on_scan_finished)
        self._scan_worker.error.connect(self._on_scan_error)

        self._scan_thread.started.connect(self._scan_worker.run)
        self.scan_started.emit()
        self._scan_thread.start()

    def cancel_scan(self):
        if self._scan_worker:
            self._scan_worker.cancel()

    def _effective_folders(self) -> list[str]:
        """Get the list of folders to scan (series-level for comics/books, root-level for video)."""
        if self._kind == "comics":
            roots = self._config.get("rootFolders", [])
            series = self._config.get("seriesFolders", [])
            ignored = set(self._config.get("ignoredSeries", []))
            # Expand roots into their immediate subdirs
            expanded = []
            for r in roots:
                expanded.extend(list_immediate_subdirs(r))
            # Add explicit series folders
            all_folders = list(set(expanded + series))
            # Remove ignored
            return [f for f in all_folders if f not in ignored]
        elif self._kind == "books":
            roots = self._config.get("bookRootFolders", [])
            series = self._config.get("bookSeriesFolders", [])
            expanded = []
            for r in roots:
                expanded.extend(list_immediate_subdirs(r))
            return list(set(expanded + series))
        else:
            # Video: root folders are scanned as-is (show discovery inside)
            return list(self._config.get("videoFolders", []))

    def _on_scan_finished(self, index_data: dict):
        """Handle scan completion: save index, reload data."""
        # Safety: don't overwrite good cache with empty results
        has_series = bool(index_data.get("series") or index_data.get("shows"))
        if not has_series and self._series:
            print("[scan] Scan found 0 series but cache has data – skipping overwrite")
        else:
            self._store.write_index(self._kind, index_data)

        # Cleanup thread
        if self._scan_thread:
            self._scan_thread.quit()
            self._scan_thread.wait()
            self._scan_thread = None
            self._scan_worker = None

        # Reload from disk
        self.load()
        self.scan_finished.emit()

    def _on_scan_error(self, msg: str):
        if self._scan_thread:
            self._scan_thread.quit()
            self._scan_thread.wait()
            self._scan_thread = None
            self._scan_worker = None
        self.scan_error.emit(msg)

    def continue_items(self, items: list[dict], max_count: int = 10) -> list[dict]:
        """Get the most recently read/watched items that aren't finished.

        Returns items enriched with 'percent' and 'updated_at' from progress.
        One item per series (the most recently updated).
        """
        # Enrich items with progress
        enriched = []
        for it in items:
            iid = it.get("id", "")
            prog = self._progress.get(iid)
            if not prog or not isinstance(prog, dict):
                continue
            if prog.get("finished"):
                continue
            updated_at = prog.get("updatedAt", 0)
            if not updated_at:
                continue

            # Compute percent
            page_count = prog.get("pageCount", 0)
            max_page = prog.get("maxPageIndexSeen", 0)
            pct = 0
            if page_count and page_count > 0:
                pct = min(99, int((max_page / page_count) * 100))
            # Books use 'percent' or 'locator.fraction'
            if "percent" in prog:
                pct = int(prog["percent"])
            elif isinstance(prog.get("locator"), dict):
                frac = prog["locator"].get("fraction", 0)
                pct = min(99, int(frac * 100))
            # Video uses positionSec/durationSec
            if "positionSec" in prog and "durationSec" in prog:
                dur = prog["durationSec"] or 1
                pct = min(99, int((prog["positionSec"] / dur) * 100))

            enriched.append({
                **it,
                "percent": pct,
                "updated_at": updated_at,
            })

        # One per series (most recent)
        by_series: dict[str, dict] = {}
        for it in enriched:
            sid = it.get("series_id", "")
            if not sid:
                sid = it.get("id", "")
            if sid not in by_series or it["updated_at"] > by_series[sid]["updated_at"]:
                by_series[sid] = it

        result = sorted(by_series.values(), key=lambda x: x["updated_at"], reverse=True)
        return result[:max_count]
