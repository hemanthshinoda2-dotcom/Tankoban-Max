"""Extract cover images from comic archives (CBZ/CBR/CB7) and books (EPUB)."""

from __future__ import annotations

import os
import re
import zipfile

_IMAGE_RE = re.compile(r'\.(jpe?g|png|webp|bmp|gif)$', re.IGNORECASE)
_EPUB_COVER_RE = re.compile(r'cover', re.IGNORECASE)


def _sorted_image_entries(names: list[str]) -> list[str]:
    """Filter to image files and sort naturally (first page = cover)."""
    images = [n for n in names if _IMAGE_RE.search(n)]
    images.sort(key=lambda n: n.lower())
    return images


def extract_comic_cover(archive_path: str) -> bytes | None:
    """Extract the first image from a comic archive as raw bytes.

    Supports CBZ/ZIP natively. Falls back to rarfile for CBR/RAR,
    and py7zr for CB7/7Z.
    """
    ext = os.path.splitext(archive_path)[1].lower()

    if ext in (".cbz", ".zip"):
        return _extract_zip(archive_path)
    if ext in (".cbr", ".rar"):
        return _extract_rar(archive_path)
    if ext in (".cb7", ".7z"):
        return _extract_7z(archive_path)
    # For PDF, skip thumbnail extraction for now
    return None


def _extract_zip(path: str) -> bytes | None:
    try:
        with zipfile.ZipFile(path, "r") as zf:
            images = _sorted_image_entries(zf.namelist())
            if not images:
                return None
            return zf.read(images[0])
    except Exception:
        return None


def _extract_rar(path: str) -> bytes | None:
    try:
        import rarfile
        with rarfile.RarFile(path, "r") as rf:
            images = _sorted_image_entries(rf.namelist())
            if not images:
                return None
            return rf.read(images[0])
    except Exception:
        return None


def _extract_7z(path: str) -> bytes | None:
    try:
        import py7zr
        with py7zr.SevenZipFile(path, "r") as sz:
            images = _sorted_image_entries(sz.getnames())
            if not images:
                return None
            data = sz.read([images[0]])
            buf = data.get(images[0])
            if buf is None:
                return None
            return buf.read()
    except Exception:
        return None


def extract_book_cover(book_path: str) -> bytes | None:
    """Extract cover image from an EPUB file."""
    ext = os.path.splitext(book_path)[1].lower()
    if ext == ".epub":
        return _extract_epub_cover(book_path)
    return None


def _extract_epub_cover(path: str) -> bytes | None:
    """Extract cover from EPUB (which is a ZIP with OPF metadata)."""
    try:
        with zipfile.ZipFile(path, "r") as zf:
            names = zf.namelist()
            # Strategy 1: look for an image with "cover" in the name
            images = [n for n in names if _IMAGE_RE.search(n)]
            cover_candidates = [n for n in images if _EPUB_COVER_RE.search(os.path.basename(n))]
            if cover_candidates:
                return zf.read(cover_candidates[0])
            # Strategy 2: first image in the archive
            if images:
                images.sort(key=lambda n: n.lower())
                return zf.read(images[0])
    except Exception:
        pass
    return None
