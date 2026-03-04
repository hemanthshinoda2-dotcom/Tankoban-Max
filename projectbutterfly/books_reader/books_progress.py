"""Progress persistence for the books reader."""

from __future__ import annotations

import os
import time

import storage
from QTRoute.src.common import book_id_for_path
from engine_base import BookLocator


def make_book_id(path: str) -> str:
    """Generate a book ID matching the library's format."""
    try:
        st = os.stat(path)
        return book_id_for_path(path, st.st_size, int(st.st_mtime * 1000))
    except OSError:
        return book_id_for_path(path, 0, 0)


class BooksProgressManager:
    """Save/restore reading position per book."""

    def __init__(self):
        self._cache: dict | None = None

    def _load(self) -> dict:
        if self._cache is None:
            self._cache = storage.read_json(
                storage.data_path("books_progress.json"), {}
            )
        return self._cache

    def get(self, book_id: str) -> dict | None:
        return self._load().get(book_id)

    def save(self, book_id: str, locator: BookLocator, book_meta: dict):
        all_prog = self._load()
        pct = int(locator.fraction * 100) if locator.fraction else 0
        all_prog[book_id] = {
            "locator": {
                "fraction": locator.fraction,
                "cfi": locator.cfi,
                "href": locator.href,
                "page": locator.page,
                "pageCount": locator.page_count,
                "scrollTop": locator.scroll_top,
            },
            "percent": pct,
            "updatedAt": int(time.time() * 1000),
            "finished": pct >= 98,
            "bookMeta": book_meta,
        }
        storage.write_json_debounced(
            storage.data_path("books_progress.json"), all_prog
        )

    def save_sync(self, book_id: str, locator: BookLocator, book_meta: dict):
        """Immediate (non-debounced) save. Use on close_book."""
        all_prog = self._load()
        pct = int(locator.fraction * 100) if locator.fraction else 0
        all_prog[book_id] = {
            "locator": {
                "fraction": locator.fraction,
                "cfi": locator.cfi,
                "href": locator.href,
                "page": locator.page,
                "pageCount": locator.page_count,
                "scrollTop": locator.scroll_top,
            },
            "percent": pct,
            "updatedAt": int(time.time() * 1000),
            "finished": pct >= 98,
            "bookMeta": book_meta,
        }
        storage.write_json_sync(
            storage.data_path("books_progress.json"), all_prog
        )

    def locator_from_saved(self, saved: dict) -> BookLocator | None:
        """Reconstruct a BookLocator from a saved progress dict."""
        loc = saved.get("locator")
        if not loc or not isinstance(loc, dict):
            return None
        return BookLocator(
            fraction=loc.get("fraction", 0.0),
            cfi=loc.get("cfi"),
            href=loc.get("href"),
            page=loc.get("page"),
            page_count=loc.get("pageCount"),
            scroll_top=loc.get("scrollTop"),
        )
