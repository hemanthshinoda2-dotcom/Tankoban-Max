"""Storage adapter for QTRoute routes."""

from __future__ import annotations

from typing import Any, Dict

from .common import (
    BOOKS_CONFIG_FILE,
    BOOKS_INDEX_FILE,
    LIBRARY_CONFIG_FILE,
    LIBRARY_INDEX_FILE,
    VIDEO_INDEX_FILE,
)
from .types import MediaKind


class QTRouteStore:
    """Small wrapper around projectbutterfly/storage.py style APIs."""

    def __init__(self, storage_module):
        self.storage = storage_module

    def data_path(self, rel: str) -> str:
        return self.storage.data_path(rel)

    def read_json(self, rel: str, default: Any):
        return self.storage.read_json(self.storage.data_path(rel), default)

    def write_json_sync(self, rel: str, data: Any):
        self.storage.write_json_sync(self.storage.data_path(rel), data)

    def write_json_debounced(self, rel: str, data: Any):
        self.storage.write_json_debounced(self.storage.data_path(rel), data)

    def read_shared_library_config(self) -> Dict[str, Any]:
        raw = self.read_json(LIBRARY_CONFIG_FILE, {})
        return {
            "seriesFolders": raw.get("seriesFolders", []),
            "rootFolders": raw.get("rootFolders", []),
            "ignoredSeries": raw.get("ignoredSeries", []),
            "scanIgnore": raw.get("scanIgnore", []),
            "videoFolders": raw.get("videoFolders", []),
            "videoShowFolders": raw.get("videoShowFolders", []),
            "videoHiddenShowIds": raw.get("videoHiddenShowIds", []),
            "videoFiles": raw.get("videoFiles", []),
        }

    def write_shared_library_config(self, cfg: Dict[str, Any]):
        self.write_json_sync(LIBRARY_CONFIG_FILE, cfg)

    def read_books_config(self) -> Dict[str, Any]:
        raw = self.read_json(BOOKS_CONFIG_FILE, {})
        return {
            "bookRootFolders": raw.get("bookRootFolders", []),
            "bookSeriesFolders": raw.get("bookSeriesFolders", []),
            "bookSingleFiles": raw.get("bookSingleFiles", []),
            "scanIgnore": raw.get("scanIgnore", []),
        }

    def write_books_config(self, cfg: Dict[str, Any]):
        self.write_json_sync(BOOKS_CONFIG_FILE, cfg)

    def read_index(self, kind: MediaKind) -> Dict[str, Any]:
        rel = self._index_file_for(kind)
        return self.read_json(rel, {})

    def write_index(self, kind: MediaKind, index_obj: Dict[str, Any]):
        rel = self._index_file_for(kind)
        self.write_json_sync(rel, index_obj)

    @staticmethod
    def _index_file_for(kind: MediaKind) -> str:
        if kind == "comics":
            return LIBRARY_INDEX_FILE
        if kind == "books":
            return BOOKS_INDEX_FILE
        return VIDEO_INDEX_FILE

