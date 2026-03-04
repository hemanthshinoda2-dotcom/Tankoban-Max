"""TTS progress persistence — track reading position per book."""

from __future__ import annotations

import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "shared"))
from storage import data_path, read_json, write_json_debounced


_FILE = "books_tts_progress.json"


class TtsProgressManager:
    """Persists TTS playback position per book."""

    def __init__(self):
        self._path = data_path(_FILE)

    def _load_all(self) -> dict:
        return read_json(self._path, {})

    def load(self, book_id: str) -> dict | None:
        """Load saved TTS progress for a book. Returns dict or None."""
        data = self._load_all()
        by_book = data.get("byBook", {})
        return by_book.get(book_id)

    def save(self, book_id: str, block_idx: int, block_count: int,
             title: str = "", fmt: str = "") -> None:
        """Save TTS progress for a book (debounced)."""
        import time
        data = self._load_all()
        by_book = data.setdefault("byBook", {})
        by_book[book_id] = {
            "blockIdx": block_idx,
            "blockCount": block_count,
            "title": title,
            "format": fmt,
            "updatedAt": int(time.time() * 1000),
        }
        write_json_debounced(self._path, data)

    def clear(self, book_id: str) -> None:
        """Remove TTS progress for a book."""
        data = self._load_all()
        by_book = data.get("byBook", {})
        if book_id in by_book:
            del by_book[book_id]
            write_json_debounced(self._path, data)
