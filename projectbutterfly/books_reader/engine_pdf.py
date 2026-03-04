"""PDF engine — pymupdf/fitz rendering pages as QPixmaps in a scroll area."""

from __future__ import annotations

from typing import Optional

import fitz  # pymupdf

from PySide6.QtCore import Qt, QTimer
from PySide6.QtGui import QImage, QPixmap
from PySide6.QtWidgets import (
    QLabel,
    QScrollArea,
    QVBoxLayout,
    QWidget,
)

from engine_base import BookEngine, BookLocator, TocItem
from books_state import THEME_COLORS


class PdfEngine(BookEngine):
    """PDF engine using pymupdf to render pages as images."""

    def __init__(self, parent: QWidget | None = None):
        super().__init__(parent)
        self._scroll = QScrollArea()
        self._scroll.setWidgetResizable(True)
        self._scroll.setFrameShape(QScrollArea.Shape.NoFrame)
        self._scroll.setHorizontalScrollBarPolicy(Qt.ScrollBarPolicy.ScrollBarAlwaysOff)
        self._scroll.verticalScrollBar().valueChanged.connect(self._on_scroll)

        self._container = QWidget()
        self._layout = QVBoxLayout(self._container)
        self._layout.setContentsMargins(0, 0, 0, 0)
        self._layout.setSpacing(4)
        self._layout.setAlignment(Qt.AlignmentFlag.AlignHCenter)
        self._scroll.setWidget(self._container)

        self._doc: fitz.Document | None = None
        self._page_labels: list[QLabel] = []
        self._path = ""
        self._settings: dict = {}
        self._suppress_scroll = False

    def widget(self) -> QWidget:
        return self._scroll

    def open(self, path: str, locator: Optional[BookLocator] = None) -> None:
        self._path = path
        try:
            self._doc = fitz.open(path)
        except Exception as exc:
            self.engine_error.emit(str(exc))
            return

        self._render_all_pages()
        self._apply_container_bg()
        self.content_ready.emit()

        if locator and locator.page is not None:
            QTimer.singleShot(50, lambda: self._scroll_to_page(locator.page))

    def close(self) -> None:
        if self._doc:
            self._doc.close()
            self._doc = None
        for lbl in self._page_labels:
            lbl.deleteLater()
        self._page_labels.clear()
        self._path = ""

    def next_page(self) -> None:
        sb = self._scroll.verticalScrollBar()
        step = self._scroll.viewport().height() - 40
        sb.setValue(min(sb.value() + step, sb.maximum()))

    def prev_page(self) -> None:
        sb = self._scroll.verticalScrollBar()
        step = self._scroll.viewport().height() - 40
        sb.setValue(max(sb.value() - step, 0))

    def go_to(self, locator: BookLocator) -> None:
        if locator.page is not None:
            self._scroll_to_page(locator.page)

    def get_locator(self) -> BookLocator:
        page_idx = self._current_page_index()
        count = len(self._page_labels)
        frac = (page_idx / count) if count > 0 else 0.0
        return BookLocator(
            fraction=frac,
            page=page_idx + 1,
            page_count=count,
        )

    def get_toc(self) -> list[TocItem]:
        if not self._doc:
            return []
        items = []
        for level, title, page_num in self._doc.get_toc(simple=True):
            items.append(TocItem(
                title=title,
                href=str(page_num),
                level=level - 1,
            ))
        return items

    def apply_settings(self, settings: dict) -> None:
        self._settings = settings
        self._apply_container_bg()

    def search_text(self, query: str, match_case: bool = False,
                    whole_words: bool = False) -> list[dict]:
        if not self._doc or not query:
            return []
        results = []
        flags = 0 if match_case else fitz.TEXT_PRESERVE_WHITESPACE
        for i in range(len(self._doc)):
            page = self._doc[i]
            hits = page.search_for(query)
            if hits:
                # Get surrounding text for excerpt
                text = page.get_text("text")
                pos = text.lower().find(query.lower()) if not match_case else text.find(query)
                start = max(0, pos - 30) if pos >= 0 else 0
                end = min(len(text), (pos + len(query) + 30) if pos >= 0 else 60)
                excerpt = text[start:end].replace("\n", " ").strip()
                for j, _rect in enumerate(hits):
                    results.append({
                        "page": i + 1,
                        "chapter": f"Page {i + 1}",
                        "excerpt": f"\u2026{excerpt}\u2026" if excerpt else query,
                        "index": len(results),
                    })
        return results

    def clear_search(self) -> None:
        pass  # PDF doesn't have persistent highlights to clear

    def rerender(self) -> None:
        """Re-render pages after a resize."""
        if not self._doc:
            return
        page_idx = self._current_page_index()
        self._render_all_pages()
        self._apply_container_bg()
        QTimer.singleShot(30, lambda: self._scroll_to_page(page_idx + 1))

    # --- internals ---

    def _render_all_pages(self) -> None:
        for lbl in self._page_labels:
            lbl.deleteLater()
        self._page_labels.clear()

        if not self._doc:
            return

        vp_width = self._scroll.viewport().width() - 20  # small margin
        if vp_width < 100:
            vp_width = 600

        for i in range(len(self._doc)):
            page = self._doc[i]
            rect = page.rect
            scale = vp_width / rect.width if rect.width > 0 else 1.0
            mat = fitz.Matrix(scale, scale)
            pix = page.get_pixmap(matrix=mat)

            img = QImage(pix.samples, pix.width, pix.height, pix.stride, QImage.Format.Format_RGB888)
            qpx = QPixmap.fromImage(img)

            lbl = QLabel()
            lbl.setPixmap(qpx)
            lbl.setAlignment(Qt.AlignmentFlag.AlignCenter)
            self._layout.addWidget(lbl)
            self._page_labels.append(lbl)

    def _apply_container_bg(self) -> None:
        theme = self._settings.get("theme", "light")
        colors = THEME_COLORS.get(theme, THEME_COLORS["light"])
        bg = colors["bg"]
        # Darken the surround slightly for contrast
        self._scroll.setStyleSheet(f"QScrollArea {{ background-color: {bg}; border: none; }}")
        self._container.setStyleSheet(f"background-color: {bg};")

    def _scroll_to_page(self, page_num: int) -> None:
        """Scroll to 1-indexed page number."""
        idx = max(0, min(page_num - 1, len(self._page_labels) - 1))
        if idx < len(self._page_labels):
            self._suppress_scroll = True
            self._scroll.ensureWidgetVisible(self._page_labels[idx], 0, 0)
            self._suppress_scroll = False

    def _current_page_index(self) -> int:
        """Estimate current page from scroll position."""
        if not self._page_labels:
            return 0
        vp_top = self._scroll.verticalScrollBar().value()
        for i, lbl in enumerate(self._page_labels):
            y = lbl.geometry().y()
            h = lbl.geometry().height()
            if y + h / 2 > vp_top:
                return i
        return len(self._page_labels) - 1

    def _on_scroll(self) -> None:
        if self._suppress_scroll:
            return
        self.location_changed.emit(self.get_locator())
