"""In-reader search overlay for the books reader."""

from __future__ import annotations

from PySide6.QtCore import Qt, Signal, QTimer
from PySide6.QtWidgets import (
    QFrame,
    QHBoxLayout,
    QLabel,
    QLineEdit,
    QListWidget,
    QListWidgetItem,
    QPushButton,
    QVBoxLayout,
    QWidget,
)


class BooksSearchOverlay(QFrame):
    """Top-anchored search bar with results list."""

    close_requested = Signal()
    search_requested = Signal(str, bool, bool)  # (query, match_case, whole_words)
    navigate_to = Signal(int)                    # result index
    prev_result = Signal()
    next_result = Signal()

    def __init__(self, parent: QWidget | None = None):
        super().__init__(parent)
        self.setObjectName("books_search")
        self.setFixedHeight(280)
        self.setStyleSheet("""
            #books_search {
                background: #22223a;
                border-bottom: 1px solid #444;
                border-radius: 0;
            }
            QLabel { color: #e0e0e0; font-size: 12px; }
        """)

        layout = QVBoxLayout(self)
        layout.setContentsMargins(12, 8, 12, 8)
        layout.setSpacing(6)

        # Search input row
        input_row = QHBoxLayout()

        self._query = QLineEdit()
        self._query.setPlaceholderText("Search\u2026")
        self._query.setStyleSheet("""
            QLineEdit {
                background: #1e1e2e; color: #e0e0e0; border: 1px solid #555;
                border-radius: 4px; padding: 6px 8px; font-size: 13px;
            }
        """)
        self._query.returnPressed.connect(self._do_search)
        input_row.addWidget(self._query, 1)

        # Match case toggle
        self._case_btn = QPushButton("Aa")
        self._case_btn.setCheckable(True)
        self._case_btn.setFixedSize(32, 32)
        self._case_btn.setCursor(Qt.CursorShape.PointingHandCursor)
        self._case_btn.setToolTip("Match case")
        self._case_btn.setStyleSheet(self._toggle_style(False))
        self._case_btn.toggled.connect(lambda c: self._case_btn.setStyleSheet(self._toggle_style(c)))
        input_row.addWidget(self._case_btn)

        # Whole word toggle
        self._word_btn = QPushButton("W")
        self._word_btn.setCheckable(True)
        self._word_btn.setFixedSize(32, 32)
        self._word_btn.setCursor(Qt.CursorShape.PointingHandCursor)
        self._word_btn.setToolTip("Whole words")
        self._word_btn.setStyleSheet(self._toggle_style(False))
        self._word_btn.toggled.connect(lambda c: self._word_btn.setStyleSheet(self._toggle_style(c)))
        input_row.addWidget(self._word_btn)

        # Close button
        close_btn = QPushButton("\u2715")
        close_btn.setFixedSize(32, 32)
        close_btn.setCursor(Qt.CursorShape.PointingHandCursor)
        close_btn.setStyleSheet("""
            QPushButton {
                background: transparent; color: #aaa; border: none; font-size: 16px;
            }
            QPushButton:hover { color: white; }
        """)
        close_btn.clicked.connect(self.close_requested)
        input_row.addWidget(close_btn)

        layout.addLayout(input_row)

        # Navigation row
        nav_row = QHBoxLayout()
        self._prev_btn = QPushButton("\u25c0")
        self._prev_btn.setFixedSize(32, 28)
        self._prev_btn.setCursor(Qt.CursorShape.PointingHandCursor)
        self._prev_btn.setStyleSheet(self._nav_btn_style())
        self._prev_btn.clicked.connect(self.prev_result)

        self._count_label = QLabel("0 results")
        self._count_label.setAlignment(Qt.AlignmentFlag.AlignCenter)

        self._next_btn = QPushButton("\u25b6")
        self._next_btn.setFixedSize(32, 28)
        self._next_btn.setCursor(Qt.CursorShape.PointingHandCursor)
        self._next_btn.setStyleSheet(self._nav_btn_style())
        self._next_btn.clicked.connect(self.next_result)

        nav_row.addWidget(self._prev_btn)
        nav_row.addWidget(self._count_label, 1)
        nav_row.addWidget(self._next_btn)
        layout.addLayout(nav_row)

        # Results list
        self._results = QListWidget()
        self._results.setStyleSheet("""
            QListWidget {
                background: transparent; color: #e0e0e0; border: none;
                font-size: 12px;
            }
            QListWidget::item { padding: 4px; }
            QListWidget::item:selected { background: #4a90d9; }
            QListWidget::item:hover { background: rgba(74,144,217,0.3); }
        """)
        self._results.itemClicked.connect(self._on_result_click)
        layout.addWidget(self._results)

        self._result_data: list[dict] = []
        self._active_index = -1

        # Debounce timer for auto-search
        self._debounce = QTimer(self)
        self._debounce.setSingleShot(True)
        self._debounce.setInterval(300)
        self._debounce.timeout.connect(self._do_search)
        self._query.textChanged.connect(self._on_text_changed)

    def show_search(self) -> None:
        self.show()
        self.raise_()
        self._query.setFocus()
        self._query.selectAll()

    def hide_search(self) -> None:
        self.hide()
        self._results.clear()
        self._result_data.clear()
        self._count_label.setText("0 results")

    def set_results(self, results: list[dict], total: int) -> None:
        self._result_data = results
        self._results.clear()
        self._active_index = 0 if results else -1

        for r in results:
            excerpt = r.get("excerpt", "")
            chapter = r.get("chapter", "")
            page = r.get("page")
            prefix = f"p.{page} " if page else (f"{chapter} " if chapter else "")
            item = QListWidgetItem(f"{prefix}{excerpt}")
            item.setData(Qt.ItemDataRole.UserRole, r)
            self._results.addItem(item)

        self._count_label.setText(f"{total} result{'s' if total != 1 else ''}")
        if self._active_index >= 0 and self._results.count() > 0:
            self._results.setCurrentRow(0)

    def set_active_index(self, index: int) -> None:
        self._active_index = index
        total = len(self._result_data)
        if total > 0:
            self._count_label.setText(f"{index + 1} / {total}")
            self._results.setCurrentRow(min(index, self._results.count() - 1))

    def keyPressEvent(self, event) -> None:
        if event.key() == Qt.Key.Key_Escape:
            self.close_requested.emit()
        elif event.key() == Qt.Key.Key_Return:
            self._do_search()
        else:
            super().keyPressEvent(event)

    def _on_text_changed(self, text: str) -> None:
        if len(text) >= 2:
            self._debounce.start()
        else:
            self._results.clear()
            self._result_data.clear()
            self._count_label.setText("0 results")

    def _do_search(self) -> None:
        query = self._query.text().strip()
        if query:
            self.search_requested.emit(
                query,
                self._case_btn.isChecked(),
                self._word_btn.isChecked(),
            )

    def _on_result_click(self, item: QListWidgetItem) -> None:
        idx = self._results.row(item)
        self._active_index = idx
        self.navigate_to.emit(idx)

    @staticmethod
    def _toggle_style(checked: bool) -> str:
        bg = "#4a90d9" if checked else "#3a3a4e"
        fg = "white" if checked else "#ccc"
        return f"""
            QPushButton {{
                background: {bg}; color: {fg}; border: 1px solid #555;
                border-radius: 4px; font-size: 12px; font-weight: bold;
            }}
            QPushButton:hover {{ background: {'#5aa0e9' if checked else '#4a4a5e'}; }}
        """

    @staticmethod
    def _nav_btn_style() -> str:
        return """
            QPushButton {
                background: #3a3a4e; color: #ccc; border: 1px solid #555;
                border-radius: 4px; font-size: 12px;
            }
            QPushButton:hover { background: #4a4a5e; }
        """
