"""Abstract base class for book rendering engines."""

from __future__ import annotations

from abc import abstractmethod
from dataclasses import dataclass, field
from typing import Optional

from PySide6.QtCore import QObject, Signal
from PySide6.QtWidgets import QWidget


@dataclass
class BookLocator:
    """Position within a book. Format-specific fields are optional."""

    fraction: float = 0.0
    # EPUB
    cfi: Optional[str] = None
    href: Optional[str] = None
    # PDF
    page: Optional[int] = None
    page_count: Optional[int] = None
    # TXT
    scroll_top: Optional[float] = None
    # Common
    chapter_label: Optional[str] = None


@dataclass
class TocItem:
    """Single entry in a table of contents."""

    title: str
    href: str
    level: int = 0


class BookEngine(QObject):
    """ABC that all book engines must implement."""

    location_changed = Signal(object)  # BookLocator
    content_ready = Signal()
    engine_error = Signal(str)

    @abstractmethod
    def widget(self) -> QWidget:
        """Return the QWidget that displays the content."""
        ...

    @abstractmethod
    def open(self, path: str, locator: Optional[BookLocator] = None) -> None:
        ...

    @abstractmethod
    def close(self) -> None:
        ...

    @abstractmethod
    def next_page(self) -> None:
        ...

    @abstractmethod
    def prev_page(self) -> None:
        ...

    @abstractmethod
    def go_to(self, locator: BookLocator) -> None:
        ...

    @abstractmethod
    def get_locator(self) -> BookLocator:
        ...

    @abstractmethod
    def get_toc(self) -> list[TocItem]:
        ...

    @abstractmethod
    def apply_settings(self, settings: dict) -> None:
        ...

    def search_text(self, query: str, match_case: bool = False,
                    whole_words: bool = False) -> list[dict]:
        """Search for text. Returns list of {chapter, page, excerpt, index}."""
        return []

    def clear_search(self) -> None:
        """Clear any active search highlights."""
        pass

    def get_selected_text(self) -> str:
        """Return currently selected text, if any."""
        return ""

    # --- TTS highlighting (overridden by format-specific engines) ---

    def highlight_tts_sentence(self, text: str) -> None:
        """Highlight the currently spoken sentence."""
        pass

    def highlight_tts_word(self, offset: int, length: int) -> None:
        """Highlight the currently spoken word within the sentence."""
        pass

    def clear_tts_highlights(self) -> None:
        """Remove all TTS highlight marks."""
        pass
