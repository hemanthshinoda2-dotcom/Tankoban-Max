"""Standalone launcher for the unified library widget."""

from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

# Ensure this package's dir is on sys.path for local imports
sys.path.insert(0, os.path.dirname(__file__))
# Parent dir for storage / QTRoute
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from PySide6.QtWidgets import QApplication

import storage
from unified_widget import UnifiedLibraryWidget


def _pick_user_data_dir() -> str:
    """Find the userData dir with the most real data (same logic as app.py)."""
    if sys.platform == "win32":
        base = Path(os.environ.get("APPDATA", Path.home() / "AppData" / "Roaming"))
    elif sys.platform == "darwin":
        base = Path.home() / "Library" / "Application Support"
    else:
        base = Path(os.environ.get("XDG_CONFIG_HOME", Path.home() / ".config"))

    candidates = [
        base / "Tankoban",
        base / "Tankoban Max",
        base / "Tankoban Pro",
        base / "Tankoban Plus",
        base / "TankobanPlus",
        base / "manga-scroller",
        base / "manga_scroller",
        base / "Manga-Scroller",
    ]

    best = str(candidates[0])
    best_score = _score(best)
    for c in candidates[1:]:
        s = _score(str(c))
        if s > best_score:
            best_score = s
            best = str(c)
    return best


def _score(d: str) -> int:
    import json
    score = 0
    if not os.path.isdir(d):
        return 0
    for f in os.listdir(d):
        fp = os.path.join(d, f)
        if os.path.isfile(fp):
            score += min(os.path.getsize(fp), 5000)

    def read_json_safe(name):
        try:
            with open(os.path.join(d, name), "r", encoding="utf-8") as fh:
                return json.load(fh)
        except Exception:
            return None

    lib_state = read_json_safe("library_state.json")
    if isinstance(lib_state, dict):
        score += 50
        for key in ("rootFolders", "seriesFolders", "videoFolders"):
            items = lib_state.get(key, [])
            if isinstance(items, list) and items:
                score += 500 + len(items) * 10

    lib_index = read_json_safe("library_index.json")
    if isinstance(lib_index, dict):
        score += 25
        books = lib_index.get("books", [])
        series = lib_index.get("series", [])
        if isinstance(books, list):
            score += min(500, len(books)) * 2
        if isinstance(series, list):
            score += min(200, len(series)) * 5

    return score


def main():
    parser = argparse.ArgumentParser(description="Unified QT library widget launcher.")
    parser.add_argument("--kind", choices=["comics", "books", "video"], default="comics",
                        help="Media kind to display (default: comics)")
    parser.add_argument("--data-dir", help="Override userData directory path")
    args = parser.parse_args()

    app = QApplication(sys.argv)

    # Initialize storage
    data_dir = args.data_dir or _pick_user_data_dir()
    print(f"[library_widget] Using userData: {data_dir}")
    storage.init_data_dir(data_dir)

    widget = UnifiedLibraryWidget(kind=args.kind)
    widget.resize(1200, 800)
    widget.setWindowTitle(f"Tankoban Library — {args.kind.capitalize()}")
    widget.show()
    widget.activateWindow()
    widget.raise_()

    # Load data after event loop starts
    widget.load()

    return app.exec()


if __name__ == "__main__":
    raise SystemExit(main())
