"""Main books reader widget — orchestrates engine, HUD, navigation, and progress."""

from __future__ import annotations

import os

from PySide6.QtCore import Qt, QTimer, Signal
from PySide6.QtGui import QMouseEvent, QKeyEvent
from PySide6.QtWidgets import QApplication, QWidget, QStackedLayout

import storage
from engine_base import BookEngine, BookLocator, TocItem
from books_state import BooksReaderState, default_book_settings
from books_progress import BooksProgressManager, make_book_id
from books_hud import BooksTopBar, BooksBottomBar, BooksHudController
from books_appearance import BooksAppearanceOverlay
from books_nav import BooksNavHandler
from books_sidebar import BooksSidebar
from books_bookmarks import BooksBookmarkManager
from books_annotations import BooksAnnotationManager, BooksAnnotationPopup, make_pseudo_cfi
from books_search import BooksSearchOverlay
from books_dict import BooksDictPopup
from books_ruler import BooksReadingRuler
from books_hud import TtsTransportBar
from tts_controller import TtsController
from tts_engine_base import TtsState
from tts_settings_overlay import TtsSettingsOverlay
from tts_progress import TtsProgressManager
from tts_back_button import TtsBackToLocationButton


class BookReaderWidget(QWidget):
    """Top-level widget for the books reader."""

    book_opened = Signal(dict)   # {"path": ..., "title": ..., "format": ...}
    book_closed = Signal()
    audiobook_requested = Signal(str)  # audiobook folder path

    def __init__(self, parent: QWidget | None = None):
        super().__init__(parent)
        self.setFocusPolicy(Qt.FocusPolicy.StrongFocus)

        self._state = BooksReaderState()
        self._engine: BookEngine | None = None
        self._progress = BooksProgressManager()

        # Global and per-book settings
        self._global_settings = storage.read_json(
            storage.data_path("books_reader_settings.json"),
            default_book_settings(),
        )
        self._per_book_settings: dict = storage.read_json(
            storage.data_path("books_per_book_settings.json"), {}
        )

        # Main stacked layout (engine widget goes here)
        self._stack = QStackedLayout(self)
        self._stack.setContentsMargins(0, 0, 0, 0)
        self._stack.setStackingMode(QStackedLayout.StackingMode.StackAll)

        # Placeholder
        self._placeholder = QWidget()
        self._placeholder.setStyleSheet("background: #1a1a2e;")
        self._stack.addWidget(self._placeholder)

        # HUD
        self._top_bar = BooksTopBar(self)
        self._bottom_bar = BooksBottomBar(self)
        self._hud = BooksHudController(self._top_bar, self._bottom_bar, self)

        # Appearance overlay
        self._appearance = BooksAppearanceOverlay(self)
        self._appearance.hide()
        self._appearance.settings_changed.connect(self._on_settings_changed)
        self._appearance.close_requested.connect(self._close_appearance)
        self._appearance_visible = False

        # Sidebar
        self._sidebar = BooksSidebar(self)
        self._sidebar.hide()
        self._sidebar_visible = False
        self._sidebar.toc_navigate.connect(self._on_toc_navigate)
        self._sidebar.bookmark_navigate.connect(self._on_bookmark_navigate)
        self._sidebar.annotation_navigate.connect(self._on_annotation_navigate)
        self._sidebar.bookmark_delete.connect(self._on_bookmark_delete)
        self._sidebar.annotation_delete.connect(self._on_annotation_delete)
        self._sidebar.export_annotations.connect(self._on_export_annotations)
        self._sidebar.close_requested.connect(self._close_sidebar)

        # Bookmarks
        self._bookmarks = BooksBookmarkManager(self)

        # Annotations
        self._annotations = BooksAnnotationManager(self)
        self._annot_popup = BooksAnnotationPopup(self)
        self._annot_popup.hide()
        self._annot_popup_visible = False
        self._annot_popup.save_requested.connect(self._on_annotation_save)
        self._annot_popup.delete_requested.connect(self._on_annotation_popup_delete)
        self._annot_popup.close_requested.connect(self._close_annot_popup)

        # Search
        self._search = BooksSearchOverlay(self)
        self._search.hide()
        self._search_visible = False
        self._search.close_requested.connect(self._close_search)
        self._search.search_requested.connect(self._do_search)
        self._search.navigate_to.connect(self._on_search_navigate)
        self._search.prev_result.connect(self._on_search_prev)
        self._search.next_result.connect(self._on_search_next)

        # Dictionary
        self._dict_popup = BooksDictPopup(self)
        self._dict_popup.hide()
        self._dict_visible = False
        self._dict_popup.close_requested.connect(self._close_dict)

        # Reading ruler
        self._ruler = BooksReadingRuler(self)
        self._ruler.hide()
        self._ruler.settings_changed.connect(self._on_ruler_settings)

        # TTS
        self._tts = TtsController(self)
        self._tts.state_changed.connect(self._on_tts_state_changed)
        self._tts.block_changed.connect(self._on_tts_block_changed)
        self._tts.word_boundary.connect(self._on_tts_word_boundary)
        self._tts.progress_changed.connect(self._on_tts_progress_changed)
        self._tts.error_occurred.connect(self._on_tts_error)
        self._tts_progress = TtsProgressManager()

        # TTS engine selection
        self._tts_engine = self._create_tts_engine()
        self._tts.set_engine(self._tts_engine)

        # TTS transport bar
        self._tts_transport = TtsTransportBar(self)
        self._tts_transport.hide()
        self._tts_transport.play_pause.connect(self._tts_toggle)
        self._tts_transport.skip_back.connect(self._tts.skip_back)
        self._tts_transport.skip_forward.connect(self._tts.skip_forward)
        self._tts_transport.speed_changed.connect(self._on_tts_speed_changed)
        self._tts_transport.stop.connect(self._tts_stop)

        # TTS settings overlay
        self._tts_settings = TtsSettingsOverlay(self)
        self._tts_settings.hide()
        self._tts_settings_visible = False
        self._tts_settings.close_requested.connect(self._close_tts_settings)
        self._tts_settings.settings_changed.connect(self._on_tts_settings_changed)

        # TTS back button
        self._tts_back = TtsBackToLocationButton(self)
        self._tts_back.go_back.connect(self._tts_go_back)
        self._pending_tts_start = False

        # Navigation
        self._nav = BooksNavHandler(self)
        self._nav.prev_requested.connect(self._prev_page)
        self._nav.next_requested.connect(self._next_page)
        self._nav.hud_toggle_requested.connect(self._hud.toggle)
        self._nav.close_requested.connect(self._on_nav_close)
        self._nav.appearance_toggle_requested.connect(self._toggle_appearance)
        self._nav.go_start_requested.connect(self._go_start)
        self._nav.go_end_requested.connect(self._go_end)
        self._nav.sidebar_toggle_requested.connect(self._toggle_sidebar)
        self._nav.toc_toggle_requested.connect(self._toggle_sidebar_to_toc)
        self._nav.bookmark_toggle_requested.connect(self._toggle_bookmark)
        self._nav.search_toggle_requested.connect(self._toggle_search)
        self._nav.dict_lookup_requested.connect(self._trigger_dict_lookup)
        self._nav.tts_toggle_requested.connect(self._tts_toggle)
        self._nav.tts_settings_requested.connect(self._toggle_tts_settings)

        # Bottom bar arrows
        self._bottom_bar.prev_clicked.connect(self._prev_page)
        self._bottom_bar.next_clicked.connect(self._next_page)
        self._bottom_bar.audiobook_clicked.connect(self._on_audiobook_btn_clicked)
        self._paired_audiobook_path = ""

        # Top bar back
        self._top_bar.back_clicked.connect(self.close_book)

        # Debounce timer for progress saves
        self._save_timer = QTimer(self)
        self._save_timer.setSingleShot(True)
        self._save_timer.setInterval(500)
        self._save_timer.timeout.connect(self._save_progress_debounced)

        # Search results cache
        self._search_results: list[dict] = []
        self._search_index = -1

    # ── Public API ──

    def open_book(self, path: str, series_id: str = "") -> None:
        """Open a book file. Closes any previously open book first."""
        if self._state.is_open:
            self.close_book()

        ext = os.path.splitext(path)[1].lower()
        fmt = {".epub": "epub", ".pdf": "pdf", ".txt": "txt"}.get(ext)
        if not fmt:
            return

        book_id = make_book_id(path)
        title = os.path.splitext(os.path.basename(path))[0]

        self._state = BooksReaderState(
            book_path=path,
            book_id=book_id,
            book_title=title,
            book_format=fmt,
            series_id=series_id,
            is_open=True,
            settings=self._load_settings(book_id),
        )

        # Create engine
        self._engine = self._create_engine(fmt)
        if not self._engine:
            return

        # Wire engine signals
        self._engine.location_changed.connect(self._on_location_changed)
        self._engine.content_ready.connect(self._on_content_ready)
        self._engine.engine_error.connect(self._on_engine_error)

        # Wire EPUB text selection signal
        if fmt == "epub":
            from engine_epub import EpubEngine
            if isinstance(self._engine, EpubEngine):
                self._engine.text_selected.connect(self._on_text_selected)

        # Add engine widget to stack
        ew = self._engine.widget()
        self._stack.addWidget(ew)
        self._stack.setCurrentWidget(ew)

        # Apply settings to engine
        self._engine.apply_settings(self._state.settings)

        # Restore progress
        saved = self._progress.get(book_id)
        locator = self._progress.locator_from_saved(saved) if saved else None

        self._engine.open(path, locator)

        # Update HUD
        self._hud.update_info(title, "", locator.fraction if locator else 0.0)
        self._hud.show()

        # Load sidebar data
        toc = self._engine.get_toc()
        self._sidebar.set_toc_items(toc)
        self._sidebar.set_bookmarks(self._bookmarks.load(book_id))
        self._sidebar.set_epub_mode(fmt == "epub")
        if fmt == "epub":
            self._sidebar.set_annotations(self._annotations.load(book_id))

        # Ruler
        ruler_settings = self._state.settings.get("ruler", {})
        self._ruler.set_settings(ruler_settings)

        self.book_opened.emit({
            "path": path,
            "title": title,
            "format": fmt,
            "book_id": book_id,
        })

    def close_book(self) -> None:
        """Close the current book and save progress immediately."""
        if not self._state.is_open:
            return

        # Stop TTS
        self._tts_stop()

        # Save progress immediately
        if self._engine:
            loc = self._engine.get_locator()
            self._progress.save_sync(
                self._state.book_id, loc, self._book_meta()
            )
            self._engine.close()

            # Remove engine widget from stack
            ew = self._engine.widget()
            self._stack.removeWidget(ew)
            ew.deleteLater()
            self._engine = None

        self._save_timer.stop()
        self._hud.hide()
        self._close_appearance()
        self._close_sidebar()
        self._close_search()
        self._close_dict()
        self._close_annot_popup()
        self._close_tts_settings()
        self._ruler.hide()
        self._stack.setCurrentWidget(self._placeholder)

        self._state = BooksReaderState()
        self.book_closed.emit()

    # ── Event handling ──

    def mousePressEvent(self, event: QMouseEvent) -> None:
        if self._appearance_visible or self._annot_popup_visible:
            return
        if not self._state.is_open:
            return
        x_frac = event.position().x() / self.width() if self.width() > 0 else 0.5
        self._nav.handle_click(x_frac)

    def keyPressEvent(self, event: QKeyEvent) -> None:
        # Escape chain: search > annot popup > dict > tts settings > sidebar > appearance > tts > close book
        if event.key() == Qt.Key.Key_Escape:
            if self._search_visible:
                self._close_search()
                return
            if self._annot_popup_visible:
                self._close_annot_popup()
                return
            if self._dict_visible:
                self._close_dict()
                return
            if self._tts_settings_visible:
                self._close_tts_settings()
                return
            if self._sidebar_visible:
                self._close_sidebar()
                return
            if self._appearance_visible:
                self._close_appearance()
                return
            if self._tts.state != TtsState.IDLE:
                self._tts_stop()
                return
            self.close_book()
            return

        if self._appearance_visible or self._search_visible:
            return
        if self._state.is_open and self._nav.handle_key(event):
            return
        super().keyPressEvent(event)

    def resizeEvent(self, event) -> None:
        super().resizeEvent(event)
        w, h = self.width(), self.height()

        # Sidebar
        sidebar_w = 300 if self._sidebar_visible else 0
        self._sidebar.setGeometry(0, 0, 300, h)

        # Position HUD bars (offset by sidebar)
        self._top_bar.setGeometry(sidebar_w, 0, w - sidebar_w, 60)
        self._bottom_bar.setGeometry(sidebar_w, h - 48, w - sidebar_w, 48)

        # Appearance overlay
        self._appearance.setGeometry(0, 0, w, h)

        # Search overlay (top of reader area)
        self._search.setGeometry(sidebar_w, 0, w - sidebar_w, 280)

        # Ruler (covers engine area)
        self._ruler.setGeometry(sidebar_w, 0, w - sidebar_w, h)

        # TTS settings overlay
        self._tts_settings.setGeometry(0, 0, w, h)

        # TTS transport bar (center bottom, above bottom bar)
        tw = min(400, w - 40)
        self._tts_transport.setFixedWidth(tw)
        self._tts_transport.move((w - tw) // 2, h - 110)
        self._tts_transport.raise_()

        # TTS back button
        self._tts_back.position_in_parent()

        # Re-render PDF if needed
        if self._engine and self._state.book_format == "pdf":
            from engine_pdf import PdfEngine
            if isinstance(self._engine, PdfEngine):
                self._engine.rerender()

    # ── Internal ──

    def _create_engine(self, fmt: str) -> BookEngine | None:
        if fmt == "epub":
            from engine_epub import EpubEngine
            return EpubEngine(self)
        elif fmt == "pdf":
            from engine_pdf import PdfEngine
            return PdfEngine(self)
        elif fmt == "txt":
            from engine_txt import TxtEngine
            return TxtEngine(self)
        return None

    def _on_location_changed(self, locator: BookLocator) -> None:
        self._state.locator = locator
        chapter = locator.chapter_label or ""
        self._hud.update_info(self._state.book_title, chapter, locator.fraction)
        self._hud.reset_timer()

        # Update sidebar active chapter
        if locator.href:
            self._sidebar.set_active_chapter(locator.href)

        # Load annotations for current chapter (EPUB)
        if self._state.book_format == "epub" and locator.href:
            from engine_epub import EpubEngine
            if isinstance(self._engine, EpubEngine):
                chapter_annots = self._annotations.load_for_chapter(
                    self._state.book_id, locator.href
                )
                self._engine.set_chapter_annotations(chapter_annots)

        # Debounced save
        self._save_timer.start()

    def _on_content_ready(self) -> None:
        self.setFocus()

    def _on_engine_error(self, msg: str) -> None:
        parent = self.parent()
        if parent and hasattr(parent, "show_toast"):
            parent.show_toast(f"Books reader error: {msg}")

    def _prev_page(self) -> None:
        if self._engine:
            self._engine.prev_page()

    def _next_page(self) -> None:
        if self._engine:
            self._engine.next_page()

    def _go_start(self) -> None:
        if self._engine:
            self._engine.go_to(BookLocator(fraction=0.0, page=1, scroll_top=0.0))

    def _go_end(self) -> None:
        if self._engine:
            self._engine.go_to(BookLocator(fraction=1.0))

    def _on_nav_close(self) -> None:
        """Escape from nav handler — use escape chain."""
        if self._search_visible:
            self._close_search()
        elif self._annot_popup_visible:
            self._close_annot_popup()
        elif self._dict_visible:
            self._close_dict()
        elif self._tts_settings_visible:
            self._close_tts_settings()
        elif self._sidebar_visible:
            self._close_sidebar()
        elif self._appearance_visible:
            self._close_appearance()
        elif self._tts.state != TtsState.IDLE:
            self._tts_stop()
        else:
            self.close_book()

    # ── Appearance ──

    def _toggle_appearance(self) -> None:
        if self._appearance_visible:
            self._close_appearance()
        else:
            self._appearance.set_settings(self._state.settings)
            self._appearance.setGeometry(0, 0, self.width(), self.height())
            self._appearance.show()
            self._appearance.raise_()
            self._appearance_visible = True

    def _close_appearance(self) -> None:
        self._appearance.hide()
        self._appearance_visible = False
        self.setFocus()

    def _on_settings_changed(self, new_settings: dict) -> None:
        self._state.settings = new_settings
        if self._engine:
            self._engine.apply_settings(new_settings)
        # Update ruler
        ruler_s = new_settings.get("ruler", {})
        self._ruler.set_settings(ruler_s)
        # Persist
        self._per_book_settings[self._state.book_id] = new_settings
        storage.write_json_debounced(
            storage.data_path("books_per_book_settings.json"),
            self._per_book_settings,
        )

    # ── Sidebar ──

    def _toggle_sidebar(self) -> None:
        self._sidebar_visible = not self._sidebar_visible
        self._sidebar.toggle(self._sidebar_visible)
        self._relayout()
        self.setFocus()

    def _toggle_sidebar_to_toc(self) -> None:
        if not self._sidebar_visible:
            self._sidebar_visible = True
            self._sidebar.toggle(True)
        self._sidebar.switch_tab("toc")
        self._relayout()

    def _close_sidebar(self) -> None:
        self._sidebar_visible = False
        self._sidebar.hide()
        self._relayout()
        self.setFocus()

    def _relayout(self) -> None:
        """Trigger resizeEvent to reposition all overlays."""
        self.resizeEvent(None)

    # ── TOC ──

    def _on_toc_navigate(self, toc_item: TocItem) -> None:
        if self._engine:
            href = toc_item.href.split("#")[0] if "#" in toc_item.href else toc_item.href
            self._engine.go_to(BookLocator(href=href))

    # ── Bookmarks ──

    def _toggle_bookmark(self) -> None:
        if not self._engine or not self._state.is_open:
            return
        loc = self._engine.get_locator()
        chapter = loc.chapter_label or ""
        added = self._bookmarks.toggle(self._state.book_id, loc, chapter)
        # Update sidebar
        self._sidebar.set_bookmarks(self._bookmarks.load(self._state.book_id))
        # Toast
        msg = "Bookmark added" if added else "Bookmark removed"
        parent = self.parent()
        if parent and hasattr(parent, "show_toast"):
            parent.show_toast(msg)

    def _on_bookmark_navigate(self, bm: dict) -> None:
        if self._engine:
            loc = BooksBookmarkManager.locator_from_bookmark(bm)
            self._engine.go_to(loc)

    def _on_bookmark_delete(self, bm_id: str) -> None:
        self._bookmarks.delete(self._state.book_id, bm_id)
        self._sidebar.set_bookmarks(self._bookmarks.load(self._state.book_id))

    # ── Annotations ──

    def _on_text_selected(self, text: str, href: str) -> None:
        """Called when user selects text in EPUB."""
        if not text or not self._state.is_open:
            return
        cfi = make_pseudo_cfi(href, text)
        chapter_label = self._engine.get_locator().chapter_label if self._engine else ""
        # Show annotation popup near center
        px = self.width() // 2 - 160
        py = self.height() // 3
        self._annot_popup.show_for_new(
            self._state.book_id, cfi, text,
            chapter_label or "", (px, py)
        )
        self._annot_popup_visible = True

    def _on_annotation_save(self, annot: dict) -> None:
        self._annotations.save(self._state.book_id, annot)
        self._sidebar.set_annotations(self._annotations.load(self._state.book_id))
        self._close_annot_popup()
        # Re-apply highlights
        self._refresh_chapter_annotations()

    def _on_annotation_popup_delete(self, annot_id: str) -> None:
        self._annotations.delete(self._state.book_id, annot_id)
        self._sidebar.set_annotations(self._annotations.load(self._state.book_id))
        self._close_annot_popup()
        self._refresh_chapter_annotations()

    def _on_annotation_navigate(self, cfi: str) -> None:
        """Navigate to an annotation's location."""
        if not self._engine or not cfi:
            return
        # Extract href from pseudo-CFI
        href = cfi.split("#")[0] if "#" in cfi else ""
        if href:
            self._engine.go_to(BookLocator(href=href))

    def _on_annotation_delete(self, annot_id: str) -> None:
        self._annotations.delete(self._state.book_id, annot_id)
        self._sidebar.set_annotations(self._annotations.load(self._state.book_id))
        self._refresh_chapter_annotations()

    def _on_export_annotations(self) -> None:
        md = self._annotations.export_markdown(
            self._state.book_id, self._state.book_title
        )
        if md:
            QApplication.clipboard().setText(md)
            parent = self.parent()
            if parent and hasattr(parent, "show_toast"):
                parent.show_toast("Annotations copied to clipboard")

    def _close_annot_popup(self) -> None:
        self._annot_popup.hide()
        self._annot_popup_visible = False
        self.setFocus()

    def _refresh_chapter_annotations(self) -> None:
        """Re-inject annotations for current chapter in EPUB."""
        if self._state.book_format != "epub" or not self._engine:
            return
        loc = self._engine.get_locator()
        if loc.href:
            from engine_epub import EpubEngine
            if isinstance(self._engine, EpubEngine):
                annots = self._annotations.load_for_chapter(
                    self._state.book_id, loc.href
                )
                self._engine.set_chapter_annotations(annots)

    # ── Search ──

    def _toggle_search(self) -> None:
        if self._search_visible:
            self._close_search()
        else:
            self._search.setGeometry(
                300 if self._sidebar_visible else 0, 0,
                self.width() - (300 if self._sidebar_visible else 0), 280,
            )
            self._search.show_search()
            self._search_visible = True

    def _close_search(self) -> None:
        self._search.hide_search()
        self._search_visible = False
        if self._engine:
            self._engine.clear_search()
        self._search_results.clear()
        self._search_index = -1
        self.setFocus()

    def _do_search(self, query: str, match_case: bool, whole_words: bool) -> None:
        if not self._engine:
            return
        results = self._engine.search_text(query, match_case, whole_words)
        self._search_results = results
        self._search_index = 0 if results else -1
        self._search.set_results(results, len(results))
        if results:
            self._search.set_active_index(0)

    def _on_search_navigate(self, index: int) -> None:
        if not self._engine or index < 0 or index >= len(self._search_results):
            return
        self._search_index = index
        result = self._search_results[index]
        # Navigate by page (PDF) or offset
        if result.get("page"):
            self._engine.go_to(BookLocator(page=result["page"]))
        self._search.set_active_index(index)

    def _on_search_prev(self) -> None:
        if self._search_results and self._search_index > 0:
            self._on_search_navigate(self._search_index - 1)

    def _on_search_next(self) -> None:
        if self._search_results and self._search_index < len(self._search_results) - 1:
            self._on_search_navigate(self._search_index + 1)

    # ── Dictionary ──

    def _trigger_dict_lookup(self) -> None:
        if not self._engine or not self._state.is_open:
            return
        # Try to get selected text
        text = self._engine.get_selected_text()
        if text:
            self._show_dict(text)
        else:
            # For EPUB, the async callback will handle it
            if self._state.book_format == "epub":
                pass  # text_selected signal will fire
            else:
                parent = self.parent()
                if parent and hasattr(parent, "show_toast"):
                    parent.show_toast("Select a word first")

    def _show_dict(self, word: str) -> None:
        word = word.strip().split()[0] if word.strip() else ""
        if not word:
            return
        px = self.width() // 2 - 180
        py = self.height() // 4
        self._dict_popup.show_near(px, py)
        self._dict_popup.lookup(word)
        self._dict_visible = True

    def _close_dict(self) -> None:
        self._dict_popup.hide()
        self._dict_visible = False
        self.setFocus()

    # ── TTS ──

    def _create_tts_engine(self) -> TtsEngineBase | None:
        """Select the best available TTS engine."""
        from tts_engine_edge import EdgeTtsEngine
        edge = EdgeTtsEngine(self)
        if edge.is_available():
            return edge
        from tts_engine_system import SystemTtsEngine
        sys_engine = SystemTtsEngine(self)
        if sys_engine.is_available():
            return sys_engine
        return None

    def _tts_toggle(self) -> None:
        """T key handler: IDLE → play, PLAYING → pause, PAUSED → resume."""
        if not self._state.is_open or not self._engine:
            return
        if self._tts.state == TtsState.IDLE:
            self._tts_start()
        elif self._tts.state == TtsState.PLAYING:
            self._tts.pause()
        elif self._tts.state == TtsState.PAUSED:
            self._tts.resume()

    def _tts_start(self) -> None:
        """Extract text blocks and start TTS."""
        if not self._engine or not self._tts_engine:
            return
        blocks = self._extract_tts_blocks()
        if not blocks:
            parent = self.parent()
            if parent and hasattr(parent, "show_toast"):
                parent.show_toast("No text to read on this page")
            return
        # Apply settings
        tts_s = self._state.settings.get("tts", {})
        self._tts.set_settings(tts_s)
        # Check for saved progress
        start_idx = 0
        saved = self._tts_progress.load(self._state.book_id)
        if saved:
            start_idx = min(saved.get("blockIdx", 0), len(blocks) - 1)
        self._tts.play(blocks, start_idx)

    def _tts_stop(self) -> None:
        """Stop TTS and clean up highlights."""
        if self._tts.state != TtsState.IDLE:
            # Save TTS progress before stopping
            if self._state.is_open:
                self._tts_progress.save(
                    self._state.book_id,
                    self._tts.block_index,
                    self._tts.block_count,
                    self._state.book_title,
                    self._state.book_format,
                )
        self._tts.stop()
        if self._engine:
            self._engine.clear_tts_highlights()
        self._tts_transport.hide()
        self._tts_back.hide()
        self._hud.set_tts_active(False)

    def _extract_tts_blocks(self) -> list:
        """Extract text blocks from the current engine."""
        fmt = self._state.book_format
        if fmt == "txt":
            from tts_text_extractor import extract_txt
            return extract_txt(self._engine)
        elif fmt == "pdf":
            from tts_text_extractor import extract_pdf
            return extract_pdf(self._engine)
        elif fmt == "epub":
            # EPUB uses async JS extraction — use synchronous fallback
            from tts_text_extractor import extract_epub_js, parse_epub_result
            from engine_epub import EpubEngine
            if isinstance(self._engine, EpubEngine):
                self._pending_tts_start = True
                js = extract_epub_js()
                self._engine._web.page().runJavaScript(
                    js, 0, self._on_epub_tts_extracted,
                )
            return []  # Will be handled async
        return []

    def _on_epub_tts_extracted(self, result) -> None:
        """Callback from EPUB JS text extraction."""
        if not self._pending_tts_start:
            return
        self._pending_tts_start = False
        if not result or not isinstance(result, str):
            return
        from tts_text_extractor import parse_epub_result
        href = ""
        if self._engine:
            loc = self._engine.get_locator()
            href = loc.href or ""
        blocks = parse_epub_result(result, href)
        if blocks:
            tts_s = self._state.settings.get("tts", {})
            self._tts.set_settings(tts_s)
            start_idx = 0
            saved = self._tts_progress.load(self._state.book_id)
            if saved:
                start_idx = min(saved.get("blockIdx", 0), len(blocks) - 1)
            self._tts.play(blocks, start_idx)

    def _on_tts_state_changed(self, state_str: str) -> None:
        state = TtsState(state_str)
        if state == TtsState.IDLE:
            self._tts_transport.hide()
            self._tts_back.hide()
            self._hud.set_tts_active(False)
            if self._engine:
                self._engine.clear_tts_highlights()
        else:
            self._tts_transport.show()
            self._tts_transport.raise_()
            self._tts_transport.set_playing(state == TtsState.PLAYING)
            self._hud.set_tts_active(True)

    def _on_tts_block_changed(self, block_idx: int, text: str) -> None:
        if self._engine:
            self._engine.highlight_tts_sentence(text)
        # Save progress
        if self._state.is_open:
            self._tts_progress.save(
                self._state.book_id,
                block_idx,
                self._tts.block_count,
                self._state.book_title,
                self._state.book_format,
            )

    def _on_tts_word_boundary(self, text_offset: int, text_length: int) -> None:
        if self._engine:
            self._engine.highlight_tts_word(text_offset, text_length)

    def _on_tts_progress_changed(self, current: int, total: int) -> None:
        self._tts_transport.set_progress(current, total)

    def _on_tts_error(self, msg: str) -> None:
        parent = self.parent()
        if parent and hasattr(parent, "show_toast"):
            parent.show_toast(msg)

    def _on_tts_speed_changed(self, rate: float) -> None:
        self._tts.set_rate(rate)
        # Update settings
        tts_s = self._state.settings.setdefault("tts", {})
        tts_s["rate"] = rate
        self._on_settings_changed(self._state.settings)

    def _toggle_tts_settings(self) -> None:
        if self._tts_settings_visible:
            self._close_tts_settings()
        else:
            tts_s = self._state.settings.get("tts", {})
            self._tts_settings.set_settings(tts_s)
            if self._tts_engine:
                self._tts_settings.load_voices(self._tts_engine)
            self._tts_settings.setGeometry(0, 0, self.width(), self.height())
            self._tts_settings.show()
            self._tts_settings.raise_()
            self._tts_settings_visible = True

    def _close_tts_settings(self) -> None:
        self._tts_settings.hide()
        self._tts_settings_visible = False
        self.setFocus()

    def _on_tts_settings_changed(self, tts_settings: dict) -> None:
        """TTS settings changed from overlay."""
        self._tts.set_settings(tts_settings)
        self._tts_transport.set_rate(tts_settings.get("rate", 1.0))
        # Persist
        self._state.settings["tts"] = tts_settings
        self._on_settings_changed(self._state.settings)

    def _tts_go_back(self) -> None:
        """Navigate back to the TTS playback location."""
        block = self._tts.current_block
        if not block or not self._engine:
            return
        from engine_base import BookLocator
        if block.href:
            self._engine.go_to(BookLocator(href=block.href))
        elif block.page:
            self._engine.go_to(BookLocator(page=block.page))

    # ── Ruler ──

    def _on_ruler_settings(self, settings: dict) -> None:
        self._state.settings["ruler"] = settings
        self._on_settings_changed(self._state.settings)

    # ── Persistence ──

    def _load_settings(self, book_id: str) -> dict:
        """Load per-book settings, falling back to global."""
        if book_id in self._per_book_settings:
            return dict(self._per_book_settings[book_id])
        return dict(self._global_settings)

    def _save_progress_debounced(self) -> None:
        if self._engine and self._state.is_open:
            loc = self._engine.get_locator()
            self._progress.save(self._state.book_id, loc, self._book_meta())

    def _book_meta(self) -> dict:
        return {
            "title": self._state.book_title,
            "path": self._state.book_path,
            "format": self._state.book_format,
        }
