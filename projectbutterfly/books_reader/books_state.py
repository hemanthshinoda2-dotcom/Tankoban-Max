"""Books reader state and default settings."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Optional


def default_book_settings() -> dict:
    return {
        "theme": "light",       # light | sepia | dark
        "fontSize": 100,        # 75-250 percentage
        "fontFamily": "serif",  # serif | sans-serif | monospace
        "lineHeight": 1.5,      # 1.0-2.0
        "margin": 1.0,          # factor 0-4
        "ruler": {
            "enabled": False,
            "yPct": 40,
            "heightPx": 92,
            "dimPct": 42,
            "tintPct": 12,
            "color": "warm",
        },
        "tts": {
            "voice": "",
            "rate": 1.0,
            "pitch": 1.0,
            "volume": 1.0,
            "preset": "natural",
        },
    }


THEME_COLORS = {
    "light": {"bg": "#ffffff", "fg": "#1a1a1a"},
    "sepia": {"bg": "#f4ecd8", "fg": "#5b4636"},
    "dark":  {"bg": "#1a1a2e", "fg": "#e0e0e0"},
}


@dataclass
class BooksReaderState:
    book_path: str = ""
    book_id: str = ""
    book_title: str = ""
    book_format: str = ""       # epub | pdf | txt
    series_id: str = ""
    is_open: bool = False
    settings: dict = field(default_factory=default_book_settings)
    locator: object = None      # BookLocator or None
