"""
Go-to-page overlay for the comic reader.

Styled overlay dialog replacing QInputDialog. Shows a text input
with page range hint, validates input, and navigates on Enter.
"""

from __future__ import annotations

from PySide6.QtCore import Qt, Signal
from PySide6.QtGui import QColor, QIntValidator, QPainter
from PySide6.QtWidgets import (
    QHBoxLayout,
    QLabel,
    QLineEdit,
    QPushButton,
    QVBoxLayout,
    QWidget,
)


_CARD_SS = """
QWidget#gotoCard {
  background: rgba(24, 24, 24, 240);
  border: 1px solid rgba(255, 255, 255, 50);
  border-radius: 14px;
}
QLabel#gotoTitle {
  color: #ffffff;
  font-size: 16px;
  font-weight: 700;
}
QLabel#gotoHint {
  color: rgba(255, 255, 255, 80);
  font-size: 12px;
}
QLineEdit#gotoInput {
  color: #ffffff;
  background: rgba(255, 255, 255, 14);
  border: 1px solid rgba(255, 255, 255, 40);
  border-radius: 8px;
  padding: 8px 14px;
  font-size: 18px;
  font-weight: 600;
  selection-background-color: rgba(199, 167, 107, 120);
}
QPushButton#gotoGoBtn {
  color: #ffffff;
  background: rgba(199, 167, 107, 120);
  border: 1px solid rgba(199, 167, 107, 180);
  border-radius: 10px;
  padding: 8px 24px;
  font-size: 14px;
  font-weight: 600;
  min-height: 28px;
}
QPushButton#gotoGoBtn:hover {
  background: rgba(199, 167, 107, 170);
}
QPushButton#gotoCancelBtn {
  color: #b8b8b8;
  background: rgba(255, 255, 255, 14);
  border: 1px solid rgba(255, 255, 255, 30);
  border-radius: 10px;
  padding: 8px 20px;
  font-size: 14px;
  min-height: 28px;
}
QPushButton#gotoCancelBtn:hover {
  background: rgba(255, 255, 255, 28);
}
"""


class GotoPageOverlay(QWidget):
    page_selected = Signal(int)  # 0-based page index

    def __init__(self, parent=None):
        super().__init__(parent)
        self.setVisible(False)
        self.setAttribute(Qt.WidgetAttribute.WA_TranslucentBackground, True)
        self.setFocusPolicy(Qt.FocusPolicy.StrongFocus)

        self._total = 1
        self._current = 0

        # ── card ──────────────────────────────────────────────
        self._card = QWidget(self)
        self._card.setObjectName("gotoCard")
        self._card.setFixedWidth(340)
        self._card.setStyleSheet(_CARD_SS)

        card_layout = QVBoxLayout(self._card)
        card_layout.setContentsMargins(24, 24, 24, 20)
        card_layout.setSpacing(12)

        self._title = QLabel("Go to page", self._card)
        self._title.setObjectName("gotoTitle")
        self._title.setAlignment(Qt.AlignmentFlag.AlignCenter)
        card_layout.addWidget(self._title)

        self._hint = QLabel("", self._card)
        self._hint.setObjectName("gotoHint")
        self._hint.setAlignment(Qt.AlignmentFlag.AlignCenter)
        card_layout.addWidget(self._hint)

        self._input = QLineEdit(self._card)
        self._input.setObjectName("gotoInput")
        self._input.setAlignment(Qt.AlignmentFlag.AlignCenter)
        self._input.returnPressed.connect(self._on_go)
        card_layout.addWidget(self._input)

        btn_row = QHBoxLayout()
        btn_row.setSpacing(10)

        self._cancel_btn = QPushButton("Cancel", self._card)
        self._cancel_btn.setObjectName("gotoCancelBtn")
        self._cancel_btn.clicked.connect(self.close)
        btn_row.addWidget(self._cancel_btn)

        self._go_btn = QPushButton("Go", self._card)
        self._go_btn.setObjectName("gotoGoBtn")
        self._go_btn.clicked.connect(self._on_go)
        btn_row.addWidget(self._go_btn)

        card_layout.addLayout(btn_row)

    # ── public API ────────────────────────────────────────────

    def open(self, current_page: int, total_pages: int):
        self._current = int(current_page)
        self._total = max(1, int(total_pages))
        self._hint.setText(f"Page 1 \u2013 {self._total}")
        self._input.setValidator(QIntValidator(1, self._total, self))
        self._input.setText(str(self._current + 1))
        self._input.selectAll()

        self.setVisible(True)
        self.raise_()
        self._position_card()
        self._input.setFocus()

    def close(self):
        self.setVisible(False)

    def is_open(self) -> bool:
        return self.isVisible()

    # ── paint ─────────────────────────────────────────────────

    def paintEvent(self, event):
        painter = QPainter(self)
        painter.fillRect(self.rect(), QColor(0, 0, 0, 100))
        painter.end()

    def resizeEvent(self, event):
        super().resizeEvent(event)
        self._position_card()

    def _position_card(self):
        cw = self._card.width()
        ch = self._card.sizeHint().height()
        x = (self.width() - cw) // 2
        y = (self.height() - ch) // 2
        self._card.move(max(0, x), max(0, y))

    # ── keyboard ──────────────────────────────────────────────

    def keyPressEvent(self, event):
        if event.key() == Qt.Key.Key_Escape:
            self.close()
            return
        super().keyPressEvent(event)

    def mousePressEvent(self, event):
        child = self.childAt(event.position().toPoint())
        if child is None:
            self.close()
            return
        super().mousePressEvent(event)

    # ── action ────────────────────────────────────────────────

    def _on_go(self):
        text = self._input.text().strip()
        if not text:
            return
        try:
            page = int(text)
        except ValueError:
            return
        if page < 1 or page > self._total:
            return
        self.close()
        self.page_selected.emit(page - 1)  # emit 0-based
