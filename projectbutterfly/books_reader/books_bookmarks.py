"""Bookmark management for the books reader."""

from __future__ import annotations

import time
import uuid

from PySide6.QtCore import QObject, Signal

import storage
from engine_base import BookLocator


class BooksBookmarkManager(QObject):
    """CRUD for per-book bookmarks, persisted to books_bookmarks.json."""

    bookmarks_changed = Signal(str, list)  # (book_id, [bookmark_dicts])

    def __init__(self, parent=None):
        super().__init__(parent)
        self._cache: dict | None = None

    def _data(self) -> dict:
        if self._cache is None:
            self._cache = storage.read_json(
                storage.data_path("books_bookmarks.json"), {}
            )
        return self._cache

    def _persist(self) -> None:
        storage.write_json_debounced(
            storage.data_path("books_bookmarks.json"), self._data()
        )

    def load(self, book_id: str) -> list[dict]:
        return list(self._data().get(book_id, []))

    def toggle(self, book_id: str, locator: BookLocator,
               chapter_label: str = "") -> bool:
        """Toggle bookmark at locator. Returns True if added, False if removed."""
        bookmarks = self._data().setdefault(book_id, [])

        # Check for existing bookmark at this location
        existing_idx = self._find_at_location(bookmarks, locator)
        if existing_idx is not None:
            bookmarks.pop(existing_idx)
            self._persist()
            self.bookmarks_changed.emit(book_id, list(bookmarks))
            return False

        # Create new bookmark
        now = int(time.time() * 1000)
        snippet = self._make_snippet(locator, chapter_label)
        bm = {
            "id": str(uuid.uuid4()),
            "bookId": book_id,
            "locator": {
                "fraction": locator.fraction,
                "cfi": locator.cfi,
                "href": locator.href,
                "page": locator.page,
                "pageCount": locator.page_count,
                "scrollTop": locator.scroll_top,
            },
            "snippet": snippet,
            "label": "",
            "createdAt": now,
            "updatedAt": now,
        }
        bookmarks.append(bm)
        self._persist()
        self.bookmarks_changed.emit(book_id, list(bookmarks))
        return True

    def delete(self, book_id: str, bookmark_id: str) -> None:
        bookmarks = self._data().get(book_id, [])
        self._data()[book_id] = [b for b in bookmarks if b.get("id") != bookmark_id]
        self._persist()
        self.bookmarks_changed.emit(book_id, list(self._data()[book_id]))

    def is_bookmarked(self, book_id: str, locator: BookLocator) -> bool:
        bookmarks = self._data().get(book_id, [])
        return self._find_at_location(bookmarks, locator) is not None

    @staticmethod
    def locator_from_bookmark(bm: dict) -> BookLocator:
        loc = bm.get("locator", {})
        return BookLocator(
            fraction=loc.get("fraction", 0.0),
            cfi=loc.get("cfi"),
            href=loc.get("href"),
            page=loc.get("page"),
            page_count=loc.get("pageCount"),
            scroll_top=loc.get("scrollTop"),
        )

    @staticmethod
    def _find_at_location(bookmarks: list[dict], locator: BookLocator) -> int | None:
        for i, bm in enumerate(bookmarks):
            loc = bm.get("locator", {})
            # Match by CFI first
            if locator.cfi and loc.get("cfi") == locator.cfi:
                return i
            # Match by page
            if locator.page is not None and loc.get("page") == locator.page:
                return i
            # Match by fraction (within tolerance)
            bm_frac = loc.get("fraction", -1)
            if abs(locator.fraction - bm_frac) < 0.001:
                return i
        return None

    @staticmethod
    def _make_snippet(locator: BookLocator, chapter_label: str) -> str:
        pct = int(locator.fraction * 100)
        if locator.page is not None:
            return f"Page {locator.page}"
        if chapter_label:
            return f"{chapter_label} \u00b7 {pct}%"
        return f"{pct}%"
