"""Media kind adapters that normalize index data into a unified shape."""

from __future__ import annotations

from typing import Any, Protocol

from constants import MediaKind


class MediaKindAdapter(Protocol):
    """Contract every media adapter must implement."""

    kind: MediaKind
    series_label: str   # e.g. "series", "shows"
    item_label: str     # e.g. "volumes", "books", "episodes"

    def extract_series(self, index: dict[str, Any]) -> list[dict]:
        """Return unified series list from the raw index."""
        ...

    def extract_items(self, index: dict[str, Any]) -> list[dict]:
        """Return unified item list from the raw index."""
        ...

    def items_for_series(self, items: list[dict], series_id: str) -> list[dict]:
        """Filter items belonging to a given series."""
        ...

    def item_count_for_series(self, items: list[dict], series_id: str) -> int:
        """Count items for a series."""
        ...


class ComicsAdapter:
    kind: MediaKind = "comics"
    series_label = "series"
    item_label = "volumes"
    detail_columns = [
        ("#", "num", 50),
        ("Title", "title", None),
        ("Size", "size", 90),
        ("Date", "date", 100),
    ]

    def extract_series(self, index):
        return [
            {
                "id": s.get("id", ""),
                "name": s.get("name", ""),
                "path": s.get("path", ""),
                "item_count": s.get("count", 0),
            }
            for s in index.get("series", [])
        ]

    def extract_items(self, index):
        return [
            {
                "id": b.get("id", ""),
                "series_id": b.get("seriesId", ""),
                "title": b.get("title", ""),
                "path": b.get("path", ""),
                "size": b.get("size", 0),
                "mtime_ms": b.get("mtimeMs", 0),
                "ext": b.get("ext", ""),
            }
            for b in index.get("books", [])
        ]

    def items_for_series(self, items, series_id):
        return [it for it in items if it.get("series_id") == series_id]

    def item_count_for_series(self, items, series_id):
        return sum(1 for it in items if it.get("series_id") == series_id)


class BooksAdapter:
    kind: MediaKind = "books"
    series_label = "series"
    item_label = "books"
    detail_columns = [
        ("#", "num", 50),
        ("Title", "title", None),
        ("Format", "format", 70),
        ("Size", "size", 90),
        ("Date", "date", 100),
    ]

    def extract_series(self, index):
        return [
            {
                "id": s.get("id", ""),
                "name": s.get("name", ""),
                "path": s.get("path", ""),
                "item_count": s.get("count", 0),
            }
            for s in index.get("series", [])
        ]

    def extract_items(self, index):
        return [
            {
                "id": b.get("id", ""),
                "series_id": b.get("seriesId", ""),
                "title": b.get("title", ""),
                "path": b.get("path", ""),
                "size": b.get("size", 0),
                "mtime_ms": b.get("mtimeMs", 0),
                "format": b.get("format", ""),
            }
            for b in index.get("books", [])
        ]

    def items_for_series(self, items, series_id):
        return [it for it in items if it.get("series_id") == series_id]

    def item_count_for_series(self, items, series_id):
        return sum(1 for it in items if it.get("series_id") == series_id)


class VideoAdapter:
    kind: MediaKind = "video"
    series_label = "shows"
    item_label = "episodes"
    detail_columns = [
        ("#", "num", 50),
        ("Title", "title", None),
        ("Duration", "duration", 80),
        ("Ext", "ext", 60),
        ("Size", "size", 90),
        ("Date", "date", 100),
    ]

    def extract_series(self, index):
        return [
            {
                "id": s.get("id", ""),
                "name": s.get("name", ""),
                "path": s.get("path", ""),
                "item_count": s.get("episodeCount", 0),
                "thumb_path": s.get("thumbPath"),
            }
            for s in index.get("shows", [])
        ]

    def extract_items(self, index):
        return [
            {
                "id": e.get("id", ""),
                "series_id": e.get("showId", ""),
                "title": e.get("title", ""),
                "path": e.get("path", ""),
                "size": e.get("size", 0) or e.get("sizeBytes", 0),
                "mtime_ms": e.get("mtimeMs", 0),
                "duration_sec": e.get("durationSec"),
                "resolution": e.get("resolution"),
                "ext": e.get("ext", ""),
            }
            for e in index.get("episodes", [])
        ]

    def items_for_series(self, items, series_id):
        return [it for it in items if it.get("series_id") == series_id]

    def item_count_for_series(self, items, series_id):
        return sum(1 for it in items if it.get("series_id") == series_id)


def adapter_for(kind: MediaKind) -> ComicsAdapter | BooksAdapter | VideoAdapter:
    if kind == "comics":
        return ComicsAdapter()
    if kind == "books":
        return BooksAdapter()
    return VideoAdapter()
