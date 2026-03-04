"""TXT engine — plain text rendered in a QTextBrowser."""

from __future__ import annotations

from typing import Optional

import re as _re

from PySide6.QtCore import Qt
from PySide6.QtGui import QTextCursor, QTextDocument
from PySide6.QtWidgets import QTextBrowser, QWidget

from engine_base import BookEngine, BookLocator, TocItem
from books_state import THEME_COLORS


class TxtEngine(BookEngine):
    """Plain-text book engine using QTextBrowser."""

    def __init__(self, parent: QWidget | None = None):
        super().__init__(parent)
        self._browser = QTextBrowser()
        self._browser.setOpenLinks(False)
        self._browser.setReadOnly(True)
        self._browser.setFrameShape(QTextBrowser.Shape.NoFrame)
        self._browser.verticalScrollBar().valueChanged.connect(self._on_scroll)
        self._path = ""
        self._settings: dict = {}
        self._suppress_scroll = False

    def widget(self) -> QWidget:
        return self._browser

    def open(self, path: str, locator: Optional[BookLocator] = None) -> None:
        self._path = path
        try:
            with open(path, encoding="utf-8", errors="replace") as f:
                text = f.read()
        except OSError as exc:
            self.engine_error.emit(str(exc))
            return

        self._suppress_scroll = True
        self._browser.setPlainText(text)
        self.content_ready.emit()

        if locator and locator.scroll_top is not None:
            sb = self._browser.verticalScrollBar()
            sb.setValue(int(locator.scroll_top * sb.maximum()))
        self._suppress_scroll = False

    def close(self) -> None:
        self._browser.clear()
        self._path = ""

    def next_page(self) -> None:
        sb = self._browser.verticalScrollBar()
        step = self._browser.viewport().height() - 40
        sb.setValue(min(sb.value() + step, sb.maximum()))

    def prev_page(self) -> None:
        sb = self._browser.verticalScrollBar()
        step = self._browser.viewport().height() - 40
        sb.setValue(max(sb.value() - step, 0))

    def go_to(self, locator: BookLocator) -> None:
        if locator.scroll_top is not None:
            sb = self._browser.verticalScrollBar()
            sb.setValue(int(locator.scroll_top * sb.maximum()))

    def get_locator(self) -> BookLocator:
        sb = self._browser.verticalScrollBar()
        mx = sb.maximum()
        frac = sb.value() / mx if mx > 0 else 0.0
        return BookLocator(fraction=frac, scroll_top=frac)

    def get_toc(self) -> list[TocItem]:
        return []

    def apply_settings(self, settings: dict) -> None:
        self._settings = settings
        theme = settings.get("theme", "light")
        colors = THEME_COLORS.get(theme, THEME_COLORS["light"])
        font_size = settings.get("fontSize", 100)
        font_family = settings.get("fontFamily", "serif")
        line_height = settings.get("lineHeight", 1.5)
        margin = settings.get("margin", 1.0)

        actual_size = max(12, int(16 * font_size / 100))
        margin_px = int(margin * 40)

        self._browser.setStyleSheet(f"""
            QTextBrowser {{
                background-color: {colors['bg']};
                color: {colors['fg']};
                font-family: {font_family};
                font-size: {actual_size}px;
                line-height: {line_height};
                padding: {margin_px}px;
                border: none;
            }}
        """)

    def search_text(self, query: str, match_case: bool = False,
                    whole_words: bool = False) -> list[dict]:
        text = self._browser.toPlainText()
        if not text or not query:
            return []
        flags = 0 if match_case else _re.IGNORECASE
        pattern = _re.escape(query)
        if whole_words:
            pattern = r"\b" + pattern + r"\b"
        results = []
        for m in _re.finditer(pattern, text, flags):
            start = max(0, m.start() - 30)
            end = min(len(text), m.end() + 30)
            excerpt = text[start:end].replace("\n", " ").strip()
            results.append({
                "chapter": "",
                "excerpt": f"\u2026{excerpt}\u2026",
                "index": len(results),
                "offset": m.start(),
            })
        # Highlight first match in the browser
        if results:
            find_flags = QTextDocument.FindFlags(0)
            if match_case:
                find_flags |= QTextDocument.FindFlag.FindCaseSensitively
            if whole_words:
                find_flags |= QTextDocument.FindFlag.FindWholeWords
            cursor = self._browser.textCursor()
            cursor.movePosition(QTextCursor.MoveOperation.Start)
            self._browser.setTextCursor(cursor)
            self._browser.find(query, find_flags)
        return results

    def clear_search(self) -> None:
        cursor = self._browser.textCursor()
        cursor.clearSelection()
        self._browser.setTextCursor(cursor)

    def get_selected_text(self) -> str:
        return self._browser.textCursor().selectedText()

    # --- TTS highlighting ---

    def highlight_tts_sentence(self, text: str) -> None:
        """Highlight a sentence using QTextCursor."""
        self.clear_tts_highlights()
        doc = self._browser.document()
        cursor = doc.find(text)
        if cursor.isNull():
            return
        fmt = cursor.charFormat()
        fmt.setBackground(Qt.GlobalColor.cyan)
        cursor.mergeCharFormat(fmt)
        self._browser.setTextCursor(cursor)
        self._browser.ensureCursorVisible()

    def highlight_tts_word(self, offset: int, length: int) -> None:
        """Highlight a word within the currently highlighted sentence."""
        # Word-level highlighting is not reliably supported in QTextBrowser
        pass

    def clear_tts_highlights(self) -> None:
        """Remove all TTS formatting."""
        cursor = self._browser.textCursor()
        cursor.select(QTextCursor.SelectionType.Document)
        fmt = cursor.charFormat()
        fmt.clearBackground()
        cursor.mergeCharFormat(fmt)
        cursor.clearSelection()
        self._browser.setTextCursor(cursor)

    def _on_scroll(self) -> None:
        if self._suppress_scroll:
            return
        self.location_changed.emit(self.get_locator())
