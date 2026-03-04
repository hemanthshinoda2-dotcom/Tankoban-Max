"""Dictionary lookup popup for the books reader — Wiktionary REST API."""

from __future__ import annotations

import json
from collections import OrderedDict
from urllib.parse import quote as url_quote

from PySide6.QtCore import Qt, Signal, Slot, QUrl
from PySide6.QtNetwork import QNetworkAccessManager, QNetworkRequest, QNetworkReply
from PySide6.QtWidgets import (
    QFrame,
    QHBoxLayout,
    QLabel,
    QPushButton,
    QScrollArea,
    QVBoxLayout,
    QWidget,
)


class DictLookupWorker:
    """Async Wiktionary lookup with LRU cache."""

    def __init__(self, nam: QNetworkAccessManager):
        self._nam = nam
        self._cache: OrderedDict[str, list] = OrderedDict()
        self._max_cache = 50
        self._pending_reply: QNetworkReply | None = None
        self._pending_word: str = ""
        self._on_result = None
        self._on_error = None

    def lookup(self, word: str, on_result, on_error) -> None:
        self._on_result = on_result
        self._on_error = on_error
        word = word.strip().strip(".,;:!?\"'()[]{}").lower()
        if not word or len(word) > 120:
            on_error(word, "Invalid word")
            return

        # Check cache
        if word in self._cache:
            self._cache.move_to_end(word)
            on_result(word, self._cache[word])
            return

        # Cancel previous request
        if self._pending_reply and self._pending_reply.isRunning():
            self._pending_reply.abort()

        self._pending_word = word
        url = QUrl(f"https://en.wiktionary.org/api/rest_v1/page/definition/{url_quote(word)}")
        request = QNetworkRequest(url)
        request.setHeader(QNetworkRequest.KnownHeaders.UserAgentHeader, "TankobanQT/1.0")
        self._pending_reply = self._nam.get(request)
        self._pending_reply.finished.connect(self._on_finished)

    def _on_finished(self) -> None:
        reply = self._pending_reply
        if not reply:
            return
        self._pending_reply = None

        word = self._pending_word
        if reply.error() != QNetworkReply.NetworkError.NoError:
            if self._on_error:
                self._on_error(word, "No definition found.")
            reply.deleteLater()
            return

        try:
            data = json.loads(bytes(reply.readAll()).decode("utf-8"))
        except (json.JSONDecodeError, UnicodeDecodeError):
            if self._on_error:
                self._on_error(word, "Failed to parse response.")
            reply.deleteLater()
            return

        reply.deleteLater()

        # Parse Wiktionary response
        definitions = self._parse_response(data)
        if not definitions:
            if self._on_error:
                self._on_error(word, "No definition found.")
            return

        # Cache
        self._cache[word] = definitions
        if len(self._cache) > self._max_cache:
            self._cache.popitem(last=False)

        if self._on_result:
            self._on_result(word, definitions)

    @staticmethod
    def _parse_response(data: dict) -> list[dict]:
        """Parse Wiktionary REST API response into structured definitions."""
        results = []
        # data is { "en": [...], "fr": [...], ... }
        for lang_code, entries in data.items():
            if not isinstance(entries, list):
                continue
            for entry in entries:
                if not isinstance(entry, dict):
                    continue
                language = entry.get("language", lang_code)
                part = entry.get("partOfSpeech", "")
                defs = []
                for d in entry.get("definitions", []):
                    if not isinstance(d, dict):
                        continue
                    definition = d.get("definition", "")
                    # Strip HTML tags
                    import re
                    definition = re.sub(r"<[^>]+>", "", definition)
                    examples = []
                    for ex in d.get("examples", []):
                        if isinstance(ex, str):
                            examples.append(re.sub(r"<[^>]+>", "", ex))
                    defs.append({"definition": definition, "examples": examples})
                if defs:
                    results.append({
                        "language": language,
                        "partOfSpeech": part,
                        "definitions": defs,
                    })
        return results


class BooksDictPopup(QFrame):
    """Floating dictionary popup widget."""

    close_requested = Signal()

    def __init__(self, parent: QWidget | None = None):
        super().__init__(parent)
        self.setObjectName("dict_popup")
        self.setFixedSize(360, 400)
        self.setStyleSheet("""
            #dict_popup {
                background: #2a2a3e;
                border: 1px solid #444;
                border-radius: 10px;
            }
            QLabel { color: #e0e0e0; }
        """)

        layout = QVBoxLayout(self)
        layout.setContentsMargins(12, 10, 12, 10)
        layout.setSpacing(6)

        # Header
        header = QHBoxLayout()
        self._back_btn = QPushButton("\u2190")
        self._back_btn.setFixedSize(28, 28)
        self._back_btn.setCursor(Qt.CursorShape.PointingHandCursor)
        self._back_btn.setStyleSheet("""
            QPushButton {
                background: transparent; color: #aaa; border: none; font-size: 16px;
            }
            QPushButton:hover { color: white; }
        """)
        self._back_btn.clicked.connect(self._go_back)
        self._back_btn.hide()

        self._word_label = QLabel("Dictionary")
        self._word_label.setStyleSheet("font-size: 16px; font-weight: bold; color: white;")

        close_btn = QPushButton("\u2715")
        close_btn.setFixedSize(28, 28)
        close_btn.setCursor(Qt.CursorShape.PointingHandCursor)
        close_btn.setStyleSheet("""
            QPushButton {
                background: transparent; color: #aaa; border: none; font-size: 16px;
            }
            QPushButton:hover { color: white; }
        """)
        close_btn.clicked.connect(self.close_requested)

        header.addWidget(self._back_btn)
        header.addWidget(self._word_label, 1)
        header.addWidget(close_btn)
        layout.addLayout(header)

        # Scrollable body
        self._scroll = QScrollArea()
        self._scroll.setWidgetResizable(True)
        self._scroll.setFrameShape(QFrame.Shape.NoFrame)
        self._scroll.setStyleSheet("background: transparent;")
        self._body = QWidget()
        self._body_layout = QVBoxLayout(self._body)
        self._body_layout.setContentsMargins(0, 0, 0, 0)
        self._body_layout.setSpacing(8)
        self._scroll.setWidget(self._body)
        layout.addWidget(self._scroll)

        # State
        self._nam = QNetworkAccessManager(self)
        self._worker = DictLookupWorker(self._nam)
        self._history: list[str] = []

    def lookup(self, word: str) -> None:
        word = word.strip()
        if not word:
            return
        self._word_label.setText(word)
        self._clear_body()
        loading = QLabel("Looking up\u2026")
        loading.setStyleSheet("color: #888; font-size: 13px; padding: 20px;")
        loading.setAlignment(Qt.AlignmentFlag.AlignCenter)
        self._body_layout.addWidget(loading)

        self._worker.lookup(word, self._on_result, self._on_error)

    def show_near(self, x: int, y: int) -> None:
        self.move(x, y)
        self.show()
        self.raise_()

    def keyPressEvent(self, event) -> None:
        if event.key() == Qt.Key.Key_Escape:
            self.close_requested.emit()
        else:
            super().keyPressEvent(event)

    def _on_result(self, word: str, definitions: list[dict]) -> None:
        self._word_label.setText(word)
        self._clear_body()
        self._back_btn.setVisible(len(self._history) > 0)

        if not definitions:
            self._show_error("No definition found.")
            return

        for entry in definitions:
            lang = entry.get("language", "")
            pos = entry.get("partOfSpeech", "")

            if lang:
                lang_label = QLabel(lang)
                lang_label.setStyleSheet("font-size: 14px; font-weight: bold; color: #4a90d9; margin-top: 4px;")
                self._body_layout.addWidget(lang_label)

            if pos:
                pos_label = QLabel(pos)
                pos_label.setStyleSheet("font-size: 13px; font-style: italic; color: #aaa;")
                self._body_layout.addWidget(pos_label)

            for i, d in enumerate(entry.get("definitions", []), 1):
                defn = d.get("definition", "")
                def_label = QLabel(f"{i}. {defn}")
                def_label.setWordWrap(True)
                def_label.setStyleSheet("font-size: 13px; color: #e0e0e0; padding-left: 8px;")
                self._body_layout.addWidget(def_label)

                for ex in d.get("examples", []):
                    ex_label = QLabel(f"  \u201c{ex}\u201d")
                    ex_label.setWordWrap(True)
                    ex_label.setStyleSheet("font-size: 12px; color: #999; font-style: italic; padding-left: 16px;")
                    self._body_layout.addWidget(ex_label)

        self._body_layout.addStretch()

    def _on_error(self, word: str, message: str) -> None:
        self._word_label.setText(word)
        self._clear_body()
        self._show_error(message)

    def _show_error(self, message: str) -> None:
        lbl = QLabel(message)
        lbl.setAlignment(Qt.AlignmentFlag.AlignCenter)
        lbl.setStyleSheet("color: #888; font-size: 13px; padding: 20px;")
        self._body_layout.addWidget(lbl)

    def _clear_body(self) -> None:
        while self._body_layout.count():
            item = self._body_layout.takeAt(0)
            w = item.widget()
            if w:
                w.deleteLater()

    def _go_back(self) -> None:
        if self._history:
            word = self._history.pop()
            self.lookup(word)
