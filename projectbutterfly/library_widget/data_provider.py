"""Data provider that reads library index files and exposes series/items."""

from __future__ import annotations

import sys
import os

from PySide6.QtCore import QObject, Signal

# Add parent dir so we can import storage and QTRoute
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from storage import read_json, data_path
from QTRoute.src.store import QTRouteStore
from QTRoute.src.common import LIBRARY_CONFIG_FILE
import storage as storage_module

from constants import MediaKind
from media_adapter import adapter_for


class MediaDataProvider(QObject):
    """Reads index JSON files for a given media kind and emits data_ready."""

    data_ready = Signal()

    def __init__(self, kind: MediaKind, parent=None):
        super().__init__(parent)
        self._kind = kind
        self._adapter = adapter_for(kind)
        self._store = QTRouteStore(storage_module)
        self._series: list[dict] = []
        self._items: list[dict] = []
        self._config: dict = {}
        self._progress: dict = {}

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
