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

        self.data_ready.emit()
