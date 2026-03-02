"""
Find-in-page bar (Ctrl+F).

Floating bar at the top-right of the viewport with:
  - Search input
  - Match count label (e.g., "3 of 12")
  - Previous / Next buttons
  - Close button
"""

from __future__ import annotations

from PySide6.QtCore import Qt, Signal
from PySide6.QtWidgets import QWidget, QHBoxLayout, QLineEdit, QPushButton, QLabel
from PySide6.QtWebEngineCore import QWebEnginePage

from . import theme


class FindBar(QWidget):
    """
    Find-in-page bar.

    Call show_bar() / hide_bar() to toggle.
    Wire set_page() to the active tab's QWebEnginePage.
    """

    closed = Signal()

    def __init__(self, parent=None):
        super().__init__(parent)
        self.setObjectName("findBar")
        self.setFixedHeight(theme.FIND_BAR_HEIGHT)
        self.setStyleSheet(theme.FIND_BAR_STYLE)
        self.setVisible(False)

        self._page: QWebEnginePage | None = None
        self._match_count = 0
        self._match_index = 0

        layout = QHBoxLayout(self)
        layout.setContentsMargins(8, 2, 8, 2)
        layout.setSpacing(4)

        # Search input
        self._input = QLineEdit()
        self._input.setPlaceholderText("Find in page")
        self._input.setFixedWidth(220)
        self._input.setFixedHeight(28)
        self._input.textChanged.connect(self._on_text_changed)
        self._input.returnPressed.connect(self._find_next)
        layout.addWidget(self._input)

        # Match count
        self._count_label = QLabel()
        self._count_label.setFixedWidth(60)
        layout.addWidget(self._count_label)

        # Previous
        prev_btn = QPushButton("\u2191")  # ↑
        prev_btn.setFixedSize(28, 28)
        prev_btn.setToolTip("Previous match")
        prev_btn.clicked.connect(self._find_prev)
        layout.addWidget(prev_btn)

        # Next
        next_btn = QPushButton("\u2193")  # ↓
        next_btn.setFixedSize(28, 28)
        next_btn.setToolTip("Next match")
        next_btn.clicked.connect(self._find_next)
        layout.addWidget(next_btn)

        # Close
        close_btn = QPushButton("\u2715")  # ✕
        close_btn.setFixedSize(28, 28)
        close_btn.setToolTip("Close")
        close_btn.clicked.connect(self.hide_bar)
        layout.addWidget(close_btn)

        layout.addStretch()

    def set_page(self, page: QWebEnginePage | None):
        self._page = page

    def show_bar(self):
        self.setVisible(True)
        self._input.setFocus()
        self._input.selectAll()

    def hide_bar(self):
        self.setVisible(False)
        self._clear_highlight()
        self._count_label.setText("")
        self.closed.emit()

    def _on_text_changed(self, text: str):
        if not self._page:
            return
        if text:
            self._page.findText(text, QWebEnginePage.FindFlag(0), self._on_find_result)
        else:
            self._clear_highlight()
            self._count_label.setText("")

    def _find_next(self):
        text = self._input.text()
        if text and self._page:
            self._page.findText(text, QWebEnginePage.FindFlag(0), self._on_find_result)

    def _find_prev(self):
        text = self._input.text()
        if text and self._page:
            self._page.findText(
                text, QWebEnginePage.FindFlag.FindBackward, self._on_find_result
            )

    def _clear_highlight(self):
        if self._page:
            self._page.findText("")

    def _on_find_result(self, result):
        """Callback from findText — result is a QWebEngineFindTextResult."""
        try:
            active = result.activeMatch()
            total = result.numberOfMatches()
            if total > 0:
                self._count_label.setText(f"{active} of {total}")
            elif self._input.text():
                self._count_label.setText("No matches")
            else:
                self._count_label.setText("")
        except Exception:
            pass
