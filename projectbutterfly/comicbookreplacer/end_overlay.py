"""
End-of-volume overlay for the comic reader.

Shown when the user navigates past the last page.  Offers three
actions: Next Volume, Replay from Start, and Back (close/file-picker).
"""

from __future__ import annotations

from PySide6.QtCore import Qt, Signal
from PySide6.QtGui import QColor, QFont, QPainter, QPen

from overlay_anim import animate_close, animate_open
from PySide6.QtWidgets import (
    QHBoxLayout,
    QLabel,
    QPushButton,
    QVBoxLayout,
    QWidget,
)


class EndOfVolumeOverlay(QWidget):
    next_volume = Signal()
    replay = Signal()
    go_back = Signal()

    def __init__(self, parent=None):
        super().__init__(parent)
        self.setVisible(False)
        self.setAttribute(Qt.WidgetAttribute.WA_TranslucentBackground, True)
        self.setFocusPolicy(Qt.FocusPolicy.StrongFocus)

        self._book_name = ""
        self._series_name = ""
        self._has_next = False

        # ── card layout ────────────────────────────────────────
        outer = QVBoxLayout(self)
        outer.setContentsMargins(0, 0, 0, 0)
        outer.addStretch(1)

        card_row = QHBoxLayout()
        card_row.setContentsMargins(0, 0, 0, 0)
        card_row.addStretch(1)

        self._card = QWidget(self)
        self._card.setObjectName("endCard")
        self._card.setFixedWidth(460)
        self._card.setStyleSheet(
            """
            QWidget#endCard {
              background: rgba(30, 30, 30, 235);
              border: 1px solid rgba(255, 255, 255, 60);
              border-radius: 14px;
            }
            QLabel#endTitle {
              color: #ffffff;
              font-size: 18px;
              font-weight: 700;
            }
            QLabel#endSub {
              color: #b0b0b0;
              font-size: 13px;
            }
            QPushButton.endBtn {
              color: #ffffff;
              background: rgba(255, 255, 255, 28);
              border: 1px solid rgba(255, 255, 255, 50);
              border-radius: 10px;
              padding: 10px 20px;
              font-size: 14px;
              font-weight: 600;
              min-height: 28px;
            }
            QPushButton.endBtn:hover {
              background: rgba(255, 255, 255, 50);
            }
            QPushButton.endBtn:pressed {
              background: rgba(255, 255, 255, 70);
            }
            QPushButton#nextVolBtn {
              background: rgba(199, 167, 107, 120);
              border: 1px solid rgba(199, 167, 107, 180);
            }
            QPushButton#nextVolBtn:hover {
              background: rgba(199, 167, 107, 170);
            }
            """
        )

        card_layout = QVBoxLayout(self._card)
        card_layout.setContentsMargins(28, 28, 28, 24)
        card_layout.setSpacing(10)

        self._title_label = QLabel("End of volume", self._card)
        self._title_label.setObjectName("endTitle")
        self._title_label.setAlignment(Qt.AlignmentFlag.AlignCenter)
        card_layout.addWidget(self._title_label)

        self._sub_label = QLabel("", self._card)
        self._sub_label.setObjectName("endSub")
        self._sub_label.setAlignment(Qt.AlignmentFlag.AlignCenter)
        self._sub_label.setWordWrap(True)
        card_layout.addWidget(self._sub_label)

        card_layout.addSpacing(8)

        self._next_btn = QPushButton("Next Volume", self._card)
        self._next_btn.setObjectName("nextVolBtn")
        self._next_btn.setProperty("class", "endBtn")
        self._next_btn.clicked.connect(self._on_next)
        card_layout.addWidget(self._next_btn)

        self._replay_btn = QPushButton("Replay from Start", self._card)
        self._replay_btn.setProperty("class", "endBtn")
        self._replay_btn.clicked.connect(self._on_replay)
        card_layout.addWidget(self._replay_btn)

        self._back_btn = QPushButton("Back", self._card)
        self._back_btn.setProperty("class", "endBtn")
        self._back_btn.clicked.connect(self._on_back)
        card_layout.addWidget(self._back_btn)

        card_row.addWidget(self._card)
        card_row.addStretch(1)
        outer.addLayout(card_row)
        outer.addStretch(1)

    # ── public API ──────────────────────────────────────────

    def show_overlay(self, book_name: str, series_name: str, has_next: bool):
        self._book_name = str(book_name or "")
        self._series_name = str(series_name or "")
        self._has_next = bool(has_next)

        sub_parts = []
        if self._series_name:
            sub_parts.append(self._series_name)
        if self._book_name:
            sub_parts.append(self._book_name)
        self._sub_label.setText(" — ".join(sub_parts) if sub_parts else "")

        self._next_btn.setVisible(self._has_next)
        self._next_btn.setEnabled(self._has_next)

        self.setVisible(True)
        self.raise_()
        animate_open(self._card)
        self.setFocus()

    def hide_overlay(self):
        animate_close(self._card, on_done=lambda: self.setVisible(False))

    def is_open(self) -> bool:
        return self.isVisible()

    # ── paint backdrop ──────────────────────────────────────

    def paintEvent(self, event):
        painter = QPainter(self)
        painter.fillRect(self.rect(), QColor(0, 0, 0, 140))
        painter.end()

    # ── keyboard ────────────────────────────────────────────

    def keyPressEvent(self, event):
        key = event.key()
        if key in (Qt.Key.Key_Space, Qt.Key.Key_Return, Qt.Key.Key_Enter):
            if self._has_next:
                self._on_next()
            return
        if key == Qt.Key.Key_Backspace:
            self._on_back()
            return
        if key == Qt.Key.Key_Escape:
            self.hide_overlay()
            return
        if key == Qt.Key.Key_R:
            self._on_replay()
            return
        super().keyPressEvent(event)

    # ── button handlers ─────────────────────────────────────

    def _on_next(self):
        self.hide_overlay()
        self.next_volume.emit()

    def _on_replay(self):
        self.hide_overlay()
        self.replay.emit()

    def _on_back(self):
        self.hide_overlay()
        self.go_back.emit()
