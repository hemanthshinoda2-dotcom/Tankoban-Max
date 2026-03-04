"""
Archive handler — CBZ (zip) open/read/close with natural-sort entry listing.
CBR support will be added in a later slice.
"""

import os
import re
import zipfile
from typing import Optional

from state import PageEntry

# Image extensions we accept from archives
IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp"}


def natural_sort_key(s: str):
    """Sort key that handles embedded numbers correctly.
    'page9.jpg' sorts before 'page10.jpg'.
    """
    parts = re.split(r"(\d+)", s.lower())
    result = []
    for part in parts:
        if part.isdigit():
            result.append((0, int(part)))
        else:
            result.append((1, part))
    return result


class ArchiveSession:
    """Holds an open archive handle and its filtered, sorted image entries."""

    def __init__(self, file_path: str):
        self.file_path = file_path
        self.title = os.path.splitext(os.path.basename(file_path))[0]
        self._zf: Optional[zipfile.ZipFile] = None
        self.entries: list[PageEntry] = []

    def open(self):
        """Open the archive and build the sorted image entry list."""
        self._zf = zipfile.ZipFile(self.file_path, "r")
        raw_names = self._zf.namelist()

        # Filter to image files, skip directories and hidden files
        image_entries = []
        for raw_idx, name in enumerate(raw_names):
            if name.endswith("/"):
                continue
            basename = os.path.basename(name)
            if basename.startswith(".") or basename.startswith("__"):
                continue
            ext = os.path.splitext(basename)[1].lower()
            if ext in IMAGE_EXTENSIONS:
                image_entries.append((name, raw_idx))

        # Natural sort by filename
        image_entries.sort(key=lambda x: natural_sort_key(x[0]))

        # Build PageEntry list
        self.entries = [
            PageEntry(index=i, filename=name, entry_index=raw_idx)
            for i, (name, raw_idx) in enumerate(image_entries)
        ]

    def read_page(self, page_index: int) -> bytes:
        """Read raw image bytes for a page by its sorted index."""
        if self._zf is None:
            raise RuntimeError("Archive not open")
        if page_index < 0 or page_index >= len(self.entries):
            raise IndexError(f"Page index {page_index} out of range [0, {len(self.entries)})")
        entry = self.entries[page_index]
        return self._zf.read(self._zf.namelist()[entry.entry_index])

    def close(self):
        """Close the archive handle."""
        if self._zf is not None:
            self._zf.close()
            self._zf = None

    @property
    def page_count(self) -> int:
        return len(self.entries)

    def __enter__(self):
        self.open()
        return self

    def __exit__(self, *args):
        self.close()
