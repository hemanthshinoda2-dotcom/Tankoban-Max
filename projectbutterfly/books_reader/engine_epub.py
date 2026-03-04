"""EPUB engine — ebooklib + QWebEngineView for HTML rendering."""

from __future__ import annotations

import os
import shutil
import tempfile
import zipfile
from typing import Optional
from urllib.parse import quote as url_quote

from PySide6.QtCore import Qt, QUrl, QTimer, Signal, Slot
from PySide6.QtWebEngineCore import QWebEnginePage
from PySide6.QtWebEngineWidgets import QWebEngineView
from PySide6.QtWebChannel import QWebChannel
from PySide6.QtWidgets import QWidget

import ebooklib
from ebooklib import epub

from engine_base import BookEngine, BookLocator, TocItem
from books_state import THEME_COLORS


class _JsBridge(QObject):
    """Bridge object exposed to JavaScript via QWebChannel."""
    text_selected = Signal(str, str)  # (selected_text, chapter_href)

    @Slot(str, str)
    def onTextSelected(self, text: str, href: str) -> None:
        self.text_selected.emit(text, href)


class EpubEngine(BookEngine):
    """EPUB engine: ebooklib parses, QWebEngineView renders HTML chapters."""

    # Extra signal for annotation integration
    text_selected = Signal(str, str)  # (selected_text, chapter_href)

    def __init__(self, parent: QWidget | None = None):
        super().__init__(parent)
        self._web = QWebEngineView()
        self._web.loadFinished.connect(self._on_load_finished)

        # JS bridge for text selection
        self._bridge = _JsBridge(self)
        self._bridge.text_selected.connect(self.text_selected)
        self._channel = QWebChannel(self)
        self._channel.registerObject("tankoban", self._bridge)
        self._web.page().setWebChannel(self._channel)

        self._book: epub.EpubBook | None = None
        self._spine_items: list[str] = []  # ordered list of spine hrefs
        self._spine_index: int = 0
        self._temp_dir: str = ""
        self._path: str = ""
        self._settings: dict = {}
        self._pending_scroll_frac: float | None = None
        self._pending_scroll_bottom: bool = False
        self._suppress_location = False
        self._annotation_data: list[dict] = []  # annotations for current chapter

    def widget(self) -> QWidget:
        return self._web

    def open(self, path: str, locator: Optional[BookLocator] = None) -> None:
        self._path = path
        try:
            self._book = epub.read_epub(path, options={"ignore_ncx": True})
        except Exception as exc:
            self.engine_error.emit(f"Failed to open EPUB: {exc}")
            return

        # Extract EPUB zip to temp dir for file:// serving
        self._temp_dir = tempfile.mkdtemp(prefix="tankoban_epub_")
        try:
            with zipfile.ZipFile(path, "r") as zf:
                zf.extractall(self._temp_dir)
        except Exception as exc:
            self.engine_error.emit(f"Failed to extract EPUB: {exc}")
            return

        # Build spine order
        self._spine_items = []
        spine_ids = [item_id for item_id, _ in self._book.spine]
        for spine_id in spine_ids:
            item = self._book.get_item_with_id(spine_id)
            if item and item.get_type() == ebooklib.ITEM_DOCUMENT:
                self._spine_items.append(item.get_name())

        if not self._spine_items:
            self.engine_error.emit("EPUB has no readable spine items.")
            return

        # Determine starting position
        self._spine_index = 0
        self._pending_scroll_frac = None
        if locator:
            if locator.href and locator.href in self._spine_items:
                self._spine_index = self._spine_items.index(locator.href)
            elif locator.fraction is not None and locator.fraction > 0:
                idx = int(locator.fraction * len(self._spine_items))
                self._spine_index = max(0, min(idx, len(self._spine_items) - 1))

        self._load_spine_item(self._spine_index)
        self.content_ready.emit()

    def close(self) -> None:
        self._web.setUrl(QUrl("about:blank"))
        self._book = None
        self._spine_items.clear()
        self._spine_index = 0
        self._path = ""
        if self._temp_dir and os.path.isdir(self._temp_dir):
            try:
                shutil.rmtree(self._temp_dir)
            except OSError:
                pass
            self._temp_dir = ""

    def next_page(self) -> None:
        self._web.page().runJavaScript(
            self._js_scroll_page(forward=True),
            0,
            self._on_next_scroll_result,
        )

    def prev_page(self) -> None:
        self._web.page().runJavaScript(
            self._js_scroll_page(forward=False),
            0,
            self._on_prev_scroll_result,
        )

    def go_to(self, locator: BookLocator) -> None:
        if locator.href and locator.href in self._spine_items:
            idx = self._spine_items.index(locator.href)
            if idx != self._spine_index:
                self._spine_index = idx
                self._load_spine_item(idx)
                return
        if locator.fraction is not None:
            idx = int(locator.fraction * len(self._spine_items))
            idx = max(0, min(idx, len(self._spine_items) - 1))
            if idx != self._spine_index:
                self._spine_index = idx
                self._load_spine_item(idx)

    def get_locator(self) -> BookLocator:
        n = len(self._spine_items)
        frac = self._spine_index / n if n > 0 else 0.0
        href = self._spine_items[self._spine_index] if self._spine_items else None
        return BookLocator(
            fraction=frac,
            href=href,
            chapter_label=self._chapter_label_for(self._spine_index),
        )

    def get_toc(self) -> list[TocItem]:
        if not self._book:
            return []
        result = []
        self._walk_toc(self._book.toc, result, level=0)
        return result

    def apply_settings(self, settings: dict) -> None:
        self._settings = settings
        # Re-inject CSS if a chapter is loaded
        if self._spine_items and self._temp_dir:
            self._inject_live_css()

    # --- internals ---

    def _load_spine_item(self, idx: int) -> None:
        href = self._spine_items[idx]
        html_path = self._find_content_file(href)
        if not html_path:
            self.engine_error.emit(f"Spine item not found: {href}")
            return

        self._inject_css_file(html_path)
        file_url = QUrl.fromLocalFile(html_path)
        self._suppress_location = True
        self._web.setUrl(file_url)

    def _find_content_file(self, href: str) -> str | None:
        """Find the absolute path for a spine href inside the extracted EPUB."""
        # Try direct path
        direct = os.path.join(self._temp_dir, href)
        if os.path.isfile(direct):
            return direct
        # Try inside OEBPS/ or similar container dirs
        for root, _, files in os.walk(self._temp_dir):
            for f in files:
                full = os.path.join(root, f)
                rel = os.path.relpath(full, self._temp_dir).replace("\\", "/")
                if rel == href or rel.endswith("/" + href):
                    return full
        return None

    def _inject_css_file(self, html_path: str) -> None:
        """Insert a <style> block into the HTML file before </head>."""
        try:
            with open(html_path, encoding="utf-8", errors="replace") as f:
                html = f.read()
        except OSError:
            return

        css = self._build_css()
        style_tag = f"\n<style id=\"tankoban-injected\">\n{css}\n</style>\n"

        # Remove any previous injection
        import re
        html = re.sub(
            r'<style id="tankoban-injected">.*?</style>',
            "",
            html,
            flags=re.DOTALL,
        )

        # Insert before </head> or at start of <body>
        if "</head>" in html:
            html = html.replace("</head>", style_tag + "</head>")
        elif "<body" in html:
            html = html.replace("<body", style_tag + "<body", 1)
        else:
            html = style_tag + html

        try:
            with open(html_path, "w", encoding="utf-8") as f:
                f.write(html)
        except OSError:
            pass

    def _inject_live_css(self) -> None:
        """Inject CSS via JavaScript into the current page."""
        css = self._build_css().replace("\\", "\\\\").replace("`", "\\`")
        js = f"""
        (function() {{
            var el = document.getElementById('tankoban-injected');
            if (!el) {{
                el = document.createElement('style');
                el.id = 'tankoban-injected';
                (document.head || document.documentElement).appendChild(el);
            }}
            el.textContent = `{css}`;
        }})();
        """
        self._web.page().runJavaScript(js)

    def _build_css(self) -> str:
        theme = self._settings.get("theme", "light")
        colors = THEME_COLORS.get(theme, THEME_COLORS["light"])
        font_size = self._settings.get("fontSize", 100)
        font_family = self._settings.get("fontFamily", "serif")
        line_height = self._settings.get("lineHeight", 1.5)
        margin = self._settings.get("margin", 1.0)
        margin_pct = int(margin * 10)  # 0-40%

        return f"""
            html, body {{
                background-color: {colors['bg']} !important;
                color: {colors['fg']} !important;
                font-family: {font_family} !important;
                font-size: {font_size}% !important;
                line-height: {line_height} !important;
                margin: 0 !important;
                padding: {margin_pct}% !important;
            }}
            a {{ color: {colors['fg']} !important; }}
            img {{ max-width: 100% !important; height: auto !important; }}
        """

    @staticmethod
    def _js_scroll_page(forward: bool) -> str:
        direction = 1 if forward else -1
        return f"""
        (function() {{
            var step = window.innerHeight * 0.9;
            var before = window.scrollY;
            window.scrollBy(0, {direction} * step);
            var after = window.scrollY;
            var atEnd = (after === before);
            var maxY = document.documentElement.scrollHeight - window.innerHeight;
            if ({direction} > 0) return atEnd || (after >= maxY - 2);
            else return atEnd || (after <= 2);
        }})();
        """

    def _on_next_scroll_result(self, at_end) -> None:
        if at_end and self._spine_index < len(self._spine_items) - 1:
            self._spine_index += 1
            self._pending_scroll_frac = None
            self._load_spine_item(self._spine_index)
        else:
            self._emit_location()

    def _on_prev_scroll_result(self, at_start) -> None:
        if at_start and self._spine_index > 0:
            self._spine_index -= 1
            self._pending_scroll_bottom = True
            self._load_spine_item(self._spine_index)
        else:
            self._emit_location()

    @Slot(bool)
    def _on_load_finished(self, ok: bool) -> None:
        self._suppress_location = False
        if not ok:
            return
        # Inject live CSS after load
        self._inject_live_css()
        # Inject annotation bridge JS
        self._inject_bridge_js()
        # Re-apply annotations for this chapter
        self._apply_chapter_annotations()

        if self._pending_scroll_bottom:
            self._pending_scroll_bottom = False
            self._web.page().runJavaScript(
                "window.scrollTo(0, document.documentElement.scrollHeight);"
            )
        self._emit_location()

    def _emit_location(self) -> None:
        if not self._suppress_location:
            self.location_changed.emit(self.get_locator())

    def _chapter_label_for(self, idx: int) -> str | None:
        """Try to find a TOC title for the current spine item."""
        if not self._book or idx >= len(self._spine_items):
            return None
        href = self._spine_items[idx]
        toc = self.get_toc()
        for item in toc:
            toc_href = item.href.split("#")[0] if "#" in item.href else item.href
            if toc_href == href:
                return item.title
        return None

    # --- search ---

    def search_text(self, query: str, match_case: bool = False,
                    whole_words: bool = False) -> list[dict]:
        """Search current chapter via findText. Returns empty list (results come async)."""
        if not query:
            self.clear_search()
            return []
        flags = QWebEnginePage.FindFlags(0)
        if match_case:
            flags |= QWebEnginePage.FindFlag.FindCaseSensitively
        self._web.page().findText(query, flags)
        return []

    def clear_search(self) -> None:
        self._web.page().findText("")

    def get_selected_text(self) -> str:
        """Return selected text (async — triggers JS callback)."""
        self._web.page().runJavaScript(
            "window.getSelection().toString();",
            0,
            self._on_selection_result,
        )
        return ""

    def _on_selection_result(self, text) -> None:
        if text and isinstance(text, str) and text.strip():
            href = self._spine_items[self._spine_index] if self._spine_items else ""
            self.text_selected.emit(text.strip(), href)

    # --- annotations ---

    def set_chapter_annotations(self, annotations: list[dict]) -> None:
        """Set annotations to render for the current chapter."""
        self._annotation_data = annotations
        self._apply_chapter_annotations()

    def _inject_bridge_js(self) -> None:
        """Inject QWebChannel bridge and selection listener into the page."""
        js = """
        (function() {
            if (window._tankoBridgeReady) return;
            var script = document.createElement('script');
            script.src = 'qrc:///qtwebchannel/qwebchannel.js';
            script.onload = function() {
                new QWebChannel(qt.webChannelTransport, function(channel) {
                    window._tankoban = channel.objects.tankoban;
                    document.addEventListener('mouseup', function() {
                        var sel = window.getSelection();
                        if (sel && sel.toString().trim().length > 0) {
                            window._tankoban.onTextSelected(
                                sel.toString().trim(),
                                document.location.pathname.split('/').pop() || ''
                            );
                        }
                    });
                    window._tankoBridgeReady = true;
                });
            };
            document.head.appendChild(script);
        })();
        """
        self._web.page().runJavaScript(js)

    def _apply_chapter_annotations(self) -> None:
        """Inject highlight marks for stored annotations in the current chapter."""
        if not self._annotation_data:
            return
        for annot in self._annotation_data:
            text = annot.get("text", "").replace("\\", "\\\\").replace("'", "\\'").replace("\n", " ")
            color = annot.get("color", "#FEF3BD")
            style = annot.get("style", "highlight")
            if not text:
                continue
            css_prop = self._annot_css(color, style)
            js = f"""
            (function() {{
                var body = document.body;
                if (!body) return;
                var walker = document.createTreeWalker(body, NodeFilter.SHOW_TEXT);
                var node;
                var searchText = '{text}';
                while (node = walker.nextNode()) {{
                    var idx = node.textContent.indexOf(searchText);
                    if (idx >= 0) {{
                        var range = document.createRange();
                        range.setStart(node, idx);
                        range.setEnd(node, idx + searchText.length);
                        var mark = document.createElement('mark');
                        mark.setAttribute('data-tankoban-annot', 'true');
                        mark.style.cssText = '{css_prop}';
                        range.surroundContents(mark);
                        break;
                    }}
                }}
            }})();
            """
            self._web.page().runJavaScript(js)

    @staticmethod
    def _annot_css(color: str, style: str) -> str:
        if style == "underline":
            return f"background: transparent; text-decoration: underline; text-decoration-color: {color};"
        if style == "strikethrough":
            return f"background: transparent; text-decoration: line-through; text-decoration-color: {color};"
        if style == "outline":
            return f"background: transparent; outline: 1px solid {color}; outline-offset: 1px;"
        # Default: highlight
        return f"background: {color}; color: inherit;"

    # --- TTS highlighting ---

    def highlight_tts_sentence(self, text: str) -> None:
        """Highlight a sentence in the EPUB DOM via JS."""
        self.clear_tts_highlights()
        escaped = text.replace("\\", "\\\\").replace("'", "\\'").replace("\n", " ")
        js = f"""
        (function() {{
            var body = document.body;
            if (!body) return;
            var walker = document.createTreeWalker(body, NodeFilter.SHOW_TEXT);
            var node;
            var searchText = '{escaped}';
            while (node = walker.nextNode()) {{
                var idx = node.textContent.indexOf(searchText);
                if (idx >= 0) {{
                    var range = document.createRange();
                    range.setStart(node, idx);
                    range.setEnd(node, idx + searchText.length);
                    var mark = document.createElement('mark');
                    mark.setAttribute('data-tts-sentence', 'true');
                    mark.style.cssText = 'background: rgba(100,160,255,0.25); color: inherit;';
                    range.surroundContents(mark);
                    mark.scrollIntoView({{block: 'center', behavior: 'smooth'}});
                    break;
                }}
            }}
        }})();
        """
        self._web.page().runJavaScript(js)

    def highlight_tts_word(self, offset: int, length: int) -> None:
        """Highlight a word within the current TTS sentence mark."""
        js = f"""
        (function() {{
            var prev = document.querySelector('mark[data-tts-word]');
            if (prev) {{
                var p = prev.parentNode;
                p.replaceChild(document.createTextNode(prev.textContent), prev);
                p.normalize();
            }}
            var sentence = document.querySelector('mark[data-tts-sentence]');
            if (!sentence) return;
            var text = sentence.textContent;
            if ({offset} >= text.length) return;
            var wordText = text.substring({offset}, {offset} + {length});
            var before = text.substring(0, {offset});
            var after = text.substring({offset} + {length});
            sentence.textContent = '';
            if (before) sentence.appendChild(document.createTextNode(before));
            var wordMark = document.createElement('mark');
            wordMark.setAttribute('data-tts-word', 'true');
            wordMark.style.cssText = 'background: rgba(100,160,255,0.5); color: inherit;';
            wordMark.textContent = wordText;
            sentence.appendChild(wordMark);
            if (after) sentence.appendChild(document.createTextNode(after));
        }})();
        """
        self._web.page().runJavaScript(js)

    def clear_tts_highlights(self) -> None:
        """Remove all TTS highlight marks from the DOM."""
        js = """
        (function() {
            var marks = document.querySelectorAll('mark[data-tts-sentence], mark[data-tts-word]');
            marks.forEach(function(mark) {
                var parent = mark.parentNode;
                parent.replaceChild(document.createTextNode(mark.textContent), mark);
                parent.normalize();
            });
        })();
        """
        self._web.page().runJavaScript(js)

    def _walk_toc(self, toc_list, result: list[TocItem], level: int) -> None:
        for item in toc_list:
            if isinstance(item, tuple):
                # (section, children)
                section, children = item
                result.append(TocItem(
                    title=section.title,
                    href=section.href or "",
                    level=level,
                ))
                self._walk_toc(children, result, level + 1)
            elif isinstance(item, epub.Link):
                result.append(TocItem(
                    title=item.title,
                    href=item.href or "",
                    level=level,
                ))
