"""Annotation management and popup for the books reader."""

from __future__ import annotations

import hashlib
import time
import uuid

from PySide6.QtCore import QObject, Qt, Signal
from PySide6.QtGui import QColor
from PySide6.QtWidgets import (
    QFrame,
    QHBoxLayout,
    QLabel,
    QPushButton,
    QTextEdit,
    QVBoxLayout,
    QWidget,
)

import storage

ANNOT_COLORS = [
    {"id": "yellow", "hex": "#FEF3BD"},
    {"id": "pink",   "hex": "#EB9694"},
    {"id": "orange", "hex": "#FAD0C3"},
    {"id": "green",  "hex": "#C1EAC5"},
    {"id": "blue",   "hex": "#BED3F3"},
    {"id": "purple", "hex": "#D4C4FB"},
]

ANNOT_STYLES = ["highlight", "underline", "strikethrough", "outline"]


def make_pseudo_cfi(href: str, text: str) -> str:
    """Generate a pseudo-CFI from chapter href + text hash."""
    h = hashlib.md5(text.encode("utf-8", errors="replace")).hexdigest()[:12]
    return f"{href}#annot_{h}"


# ── Annotation Manager ──────────────────────────────────────────────────


class BooksAnnotationManager(QObject):
    """CRUD for per-book annotations, persisted to books_annotations.json."""

    annotations_changed = Signal(str, list)  # (book_id, [annotation_dicts])

    def __init__(self, parent=None):
        super().__init__(parent)
        self._cache: dict | None = None

    def _data(self) -> dict:
        if self._cache is None:
            self._cache = storage.read_json(
                storage.data_path("books_annotations.json"), {}
            )
        return self._cache

    def _persist(self) -> None:
        storage.write_json_debounced(
            storage.data_path("books_annotations.json"), self._data()
        )

    def load(self, book_id: str) -> list[dict]:
        return list(self._data().get(book_id, []))

    def load_for_chapter(self, book_id: str, href: str) -> list[dict]:
        """Return annotations whose cfi starts with the given href."""
        return [
            a for a in self.load(book_id)
            if a.get("cfi", "").startswith(href)
        ]

    def save(self, book_id: str, annotation: dict) -> None:
        annots = self._data().setdefault(book_id, [])
        # Update existing or append new
        for i, a in enumerate(annots):
            if a.get("id") == annotation.get("id"):
                annots[i] = annotation
                self._persist()
                self.annotations_changed.emit(book_id, list(annots))
                return
        annots.append(annotation)
        self._persist()
        self.annotations_changed.emit(book_id, list(annots))

    def delete(self, book_id: str, annotation_id: str) -> None:
        annots = self._data().get(book_id, [])
        self._data()[book_id] = [a for a in annots if a.get("id") != annotation_id]
        self._persist()
        self.annotations_changed.emit(book_id, list(self._data()[book_id]))

    def export_markdown(self, book_id: str, book_title: str) -> str:
        annots = self.load(book_id)
        if not annots:
            return ""
        lines = [f"# {book_title}\n"]
        for i, a in enumerate(annots, 1):
            chapter = a.get("chapterLabel", f"Highlight {i}")
            lines.append(f"## {chapter}")
            ts = a.get("createdAt", 0)
            if ts:
                from datetime import datetime
                dt = datetime.fromtimestamp(ts / 1000)
                lines.append(f"*{dt.strftime('%Y-%m-%d %H:%M')}*\n")
            text = a.get("text", "")
            if text:
                for tl in text.split("\n"):
                    lines.append(f"> {tl}")
                lines.append("")
            note = a.get("note", "")
            if note:
                lines.append(note)
                lines.append("")
            lines.append("---\n")
        return "\n".join(lines)

    @staticmethod
    def make_annotation(book_id: str, cfi: str, text: str,
                        chapter_label: str = "",
                        color: str = "#FEF3BD",
                        style: str = "highlight",
                        note: str = "") -> dict:
        now = int(time.time() * 1000)
        return {
            "id": str(uuid.uuid4()),
            "bookId": book_id,
            "cfi": cfi,
            "text": text,
            "note": note,
            "color": color,
            "style": style,
            "chapterLabel": chapter_label,
            "createdAt": now,
            "updatedAt": now,
        }


# ── Annotation Popup ────────────────────────────────────────────────────


class BooksAnnotationPopup(QFrame):
    """Floating popup for creating/editing an annotation."""

    save_requested = Signal(dict)     # annotation dict
    delete_requested = Signal(str)    # annotation id
    close_requested = Signal()

    def __init__(self, parent: QWidget | None = None):
        super().__init__(parent)
        self.setObjectName("annot_popup")
        self.setFixedWidth(320)
        self.setStyleSheet("""
            #annot_popup {
                background: #2a2a3e;
                border: 1px solid #444;
                border-radius: 10px;
                padding: 12px;
            }
            QLabel { color: #e0e0e0; font-size: 13px; }
        """)

        layout = QVBoxLayout(self)
        layout.setSpacing(10)

        # Color swatches
        color_row = QHBoxLayout()
        self._color_btns: list[QPushButton] = []
        for c in ANNOT_COLORS:
            btn = QPushButton()
            btn.setFixedSize(32, 32)
            btn.setCursor(Qt.CursorShape.PointingHandCursor)
            btn.setProperty("color_hex", c["hex"])
            btn.clicked.connect(lambda _, h=c["hex"]: self._select_color(h))
            color_row.addWidget(btn)
            self._color_btns.append(btn)
        layout.addLayout(color_row)

        # Style buttons
        style_row = QHBoxLayout()
        self._style_btns: list[QPushButton] = []
        for s in ANNOT_STYLES:
            btn = QPushButton(s.capitalize())
            btn.setFixedHeight(28)
            btn.setCursor(Qt.CursorShape.PointingHandCursor)
            btn.setStyleSheet("""
                QPushButton {
                    background: #3a3a4e; color: #ccc; border: 1px solid #555;
                    border-radius: 4px; padding: 2px 8px; font-size: 11px;
                }
                QPushButton:hover { background: #4a4a5e; }
            """)
            btn.clicked.connect(lambda _, st=s: self._select_style(st))
            style_row.addWidget(btn)
            self._style_btns.append(btn)
        layout.addLayout(style_row)

        # Note field
        layout.addWidget(QLabel("Note:"))
        self._note_edit = QTextEdit()
        self._note_edit.setFixedHeight(80)
        self._note_edit.setStyleSheet("""
            QTextEdit {
                background: #1e1e2e; color: #e0e0e0; border: 1px solid #555;
                border-radius: 4px; padding: 4px; font-size: 13px;
            }
        """)
        layout.addWidget(self._note_edit)

        # Buttons
        btn_row = QHBoxLayout()
        self._save_btn = QPushButton("Save")
        self._save_btn.setStyleSheet("""
            QPushButton {
                background: #4a90d9; color: white; border: none;
                border-radius: 4px; padding: 6px 16px; font-size: 13px;
            }
            QPushButton:hover { background: #5aa0e9; }
        """)
        self._save_btn.clicked.connect(self._on_save)

        self._delete_btn = QPushButton("Delete")
        self._delete_btn.setStyleSheet("""
            QPushButton {
                background: #d94a4a; color: white; border: none;
                border-radius: 4px; padding: 6px 16px; font-size: 13px;
            }
            QPushButton:hover { background: #e95a5a; }
        """)
        self._delete_btn.clicked.connect(self._on_delete)
        self._delete_btn.hide()

        close_btn = QPushButton("Close")
        close_btn.setStyleSheet("""
            QPushButton {
                background: #3a3a4e; color: #ccc; border: 1px solid #555;
                border-radius: 4px; padding: 6px 16px; font-size: 13px;
            }
            QPushButton:hover { background: #4a4a5e; }
        """)
        close_btn.clicked.connect(self.close_requested)

        btn_row.addWidget(self._save_btn)
        btn_row.addWidget(self._delete_btn)
        btn_row.addStretch()
        btn_row.addWidget(close_btn)
        layout.addLayout(btn_row)

        # State
        self._current_color = ANNOT_COLORS[0]["hex"]
        self._current_style = "highlight"
        self._editing_id: str | None = None
        self._book_id = ""
        self._cfi = ""
        self._text = ""
        self._chapter_label = ""
        self._update_color_btns()

    def show_for_new(self, book_id: str, cfi: str, text: str,
                     chapter_label: str, position: tuple[int, int] | None = None):
        """Show popup for creating a new annotation."""
        self._editing_id = None
        self._book_id = book_id
        self._cfi = cfi
        self._text = text
        self._chapter_label = chapter_label
        self._current_color = ANNOT_COLORS[0]["hex"]
        self._current_style = "highlight"
        self._note_edit.clear()
        self._delete_btn.hide()
        self._update_color_btns()
        self._update_style_btns()
        if position:
            self.move(position[0], position[1])
        self.show()
        self.raise_()

    def show_for_edit(self, annotation: dict,
                      position: tuple[int, int] | None = None):
        """Show popup for editing an existing annotation."""
        self._editing_id = annotation.get("id")
        self._book_id = annotation.get("bookId", "")
        self._cfi = annotation.get("cfi", "")
        self._text = annotation.get("text", "")
        self._chapter_label = annotation.get("chapterLabel", "")
        self._current_color = annotation.get("color", ANNOT_COLORS[0]["hex"])
        self._current_style = annotation.get("style", "highlight")
        self._note_edit.setPlainText(annotation.get("note", ""))
        self._delete_btn.show()
        self._update_color_btns()
        self._update_style_btns()
        if position:
            self.move(position[0], position[1])
        self.show()
        self.raise_()

    def keyPressEvent(self, event):
        if event.key() == Qt.Key.Key_Escape:
            self.close_requested.emit()
        else:
            super().keyPressEvent(event)

    def _select_color(self, hex_color: str):
        self._current_color = hex_color
        self._update_color_btns()

    def _select_style(self, style: str):
        self._current_style = style
        self._update_style_btns()

    def _update_color_btns(self):
        for btn in self._color_btns:
            h = btn.property("color_hex")
            border = "2px solid #4a90d9" if h == self._current_color else "2px solid transparent"
            btn.setStyleSheet(f"""
                QPushButton {{
                    background: {h}; border: {border}; border-radius: 16px;
                }}
                QPushButton:hover {{ border: 2px solid #4a90d9; }}
            """)

    def _update_style_btns(self):
        for btn in self._style_btns:
            active = btn.text().lower() == self._current_style
            bg = "#4a90d9" if active else "#3a3a4e"
            btn.setStyleSheet(f"""
                QPushButton {{
                    background: {bg}; color: {'white' if active else '#ccc'};
                    border: 1px solid #555; border-radius: 4px;
                    padding: 2px 8px; font-size: 11px;
                }}
                QPushButton:hover {{ background: {'#5aa0e9' if active else '#4a4a5e'}; }}
            """)

    def _on_save(self):
        now = int(time.time() * 1000)
        annot = {
            "id": self._editing_id or str(uuid.uuid4()),
            "bookId": self._book_id,
            "cfi": self._cfi,
            "text": self._text,
            "note": self._note_edit.toPlainText().strip(),
            "color": self._current_color,
            "style": self._current_style,
            "chapterLabel": self._chapter_label,
            "createdAt": now if not self._editing_id else now,
            "updatedAt": now,
        }
        self.save_requested.emit(annot)

    def _on_delete(self):
        if self._editing_id:
            self.delete_requested.emit(self._editing_id)
