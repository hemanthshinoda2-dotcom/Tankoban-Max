"""Tabbed sidebar for the books reader — TOC, Bookmarks, Annotations."""

from __future__ import annotations

from PySide6.QtCore import Qt, Signal
from PySide6.QtGui import QColor, QFont
from PySide6.QtWidgets import (
    QApplication,
    QFrame,
    QHBoxLayout,
    QLabel,
    QLineEdit,
    QListWidget,
    QListWidgetItem,
    QPushButton,
    QTabWidget,
    QTreeWidget,
    QTreeWidgetItem,
    QVBoxLayout,
    QWidget,
)

from engine_base import TocItem

SIDEBAR_WIDTH = 300


# ── TOC Panel ────────────────────────────────────────────────────────────


class _TocPanel(QWidget):
    """TOC tree with search filter."""

    navigate = Signal(object)  # TocItem

    def __init__(self, parent=None):
        super().__init__(parent)
        layout = QVBoxLayout(self)
        layout.setContentsMargins(4, 4, 4, 4)
        layout.setSpacing(4)

        self._filter = QLineEdit()
        self._filter.setPlaceholderText("Filter chapters\u2026")
        self._filter.setClearButtonEnabled(True)
        self._filter.setStyleSheet("""
            QLineEdit {
                background: #1e1e2e; color: #e0e0e0; border: 1px solid #555;
                border-radius: 4px; padding: 4px 8px; font-size: 12px;
            }
        """)
        self._filter.textChanged.connect(self._on_filter)
        layout.addWidget(self._filter)

        self._tree = QTreeWidget()
        self._tree.setHeaderHidden(True)
        self._tree.setIndentation(16)
        self._tree.setStyleSheet("""
            QTreeWidget {
                background: transparent; color: #e0e0e0; border: none;
                font-size: 13px;
            }
            QTreeWidget::item { padding: 4px 2px; }
            QTreeWidget::item:selected { background: #4a90d9; color: white; }
            QTreeWidget::item:hover { background: rgba(74,144,217,0.3); }
        """)
        self._tree.itemClicked.connect(self._on_click)
        layout.addWidget(self._tree)

        self._items: list[TocItem] = []
        self._active_href: str = ""

    def set_items(self, items: list[TocItem]) -> None:
        self._items = items
        self._rebuild()

    def set_active_chapter(self, href: str) -> None:
        self._active_href = href.split("#")[0] if href else ""
        self._highlight_active()

    def _rebuild(self) -> None:
        self._tree.clear()
        filter_text = self._filter.text().lower()
        stack: list[QTreeWidgetItem] = []

        for toc in self._items:
            if filter_text and filter_text not in toc.title.lower():
                continue
            item = QTreeWidgetItem([toc.title])
            item.setData(0, Qt.ItemDataRole.UserRole, toc)

            # Nest by level
            while len(stack) > toc.level:
                stack.pop()

            if stack:
                stack[-1].addChild(item)
            else:
                self._tree.addTopLevelItem(item)

            stack.append(item)

        self._tree.expandAll()
        self._highlight_active()

    def _highlight_active(self) -> None:
        if not self._active_href:
            return
        for i in range(self._tree.topLevelItemCount()):
            self._highlight_recursive(self._tree.topLevelItem(i))

    def _highlight_recursive(self, item: QTreeWidgetItem) -> None:
        toc: TocItem | None = item.data(0, Qt.ItemDataRole.UserRole)
        if toc:
            toc_href = toc.href.split("#")[0] if toc.href else ""
            if toc_href == self._active_href:
                font = item.font(0)
                font.setBold(True)
                item.setFont(0, font)
                item.setForeground(0, QColor("#4a90d9"))
                self._tree.scrollToItem(item)
            else:
                font = item.font(0)
                font.setBold(False)
                item.setFont(0, font)
                item.setForeground(0, QColor("#e0e0e0"))
        for c in range(item.childCount()):
            self._highlight_recursive(item.child(c))

    def _on_filter(self, text: str) -> None:
        self._rebuild()

    def _on_click(self, item: QTreeWidgetItem) -> None:
        toc = item.data(0, Qt.ItemDataRole.UserRole)
        if toc:
            self.navigate.emit(toc)


# ── Bookmarks Panel ─────────────────────────────────────────────────────


class _BookmarksPanel(QWidget):
    """Bookmark list with add/delete."""

    navigate = Signal(object)   # bookmark dict
    delete = Signal(str)        # bookmark id

    def __init__(self, parent=None):
        super().__init__(parent)
        layout = QVBoxLayout(self)
        layout.setContentsMargins(4, 4, 4, 4)
        layout.setSpacing(4)

        self._list = QListWidget()
        self._list.setStyleSheet("""
            QListWidget {
                background: transparent; color: #e0e0e0; border: none;
                font-size: 13px;
            }
            QListWidget::item { padding: 6px 4px; }
            QListWidget::item:selected { background: #4a90d9; }
            QListWidget::item:hover { background: rgba(74,144,217,0.3); }
        """)
        self._list.itemClicked.connect(self._on_click)
        layout.addWidget(self._list)

        self._empty = QLabel("Press B to add a bookmark.")
        self._empty.setAlignment(Qt.AlignmentFlag.AlignCenter)
        self._empty.setStyleSheet("color: #888; font-size: 12px; padding: 20px;")
        layout.addWidget(self._empty)

        self._bookmarks: list[dict] = []

    def set_bookmarks(self, bookmarks: list[dict]) -> None:
        self._bookmarks = bookmarks
        self._rebuild()

    def _rebuild(self) -> None:
        self._list.clear()
        self._empty.setVisible(not self._bookmarks)
        self._list.setVisible(bool(self._bookmarks))

        for bm in self._bookmarks:
            snippet = bm.get("snippet", bm.get("label", "Bookmark"))
            item = QListWidgetItem(snippet)
            item.setData(Qt.ItemDataRole.UserRole, bm)
            self._list.addItem(item)

    def _on_click(self, item: QListWidgetItem) -> None:
        bm = item.data(Qt.ItemDataRole.UserRole)
        if bm:
            self.navigate.emit(bm)


# ── Annotations Panel ───────────────────────────────────────────────────


class _AnnotationsPanel(QWidget):
    """Annotation list with filter and export."""

    navigate = Signal(str)     # cfi
    delete = Signal(str)       # annotation id
    export_clicked = Signal()

    def __init__(self, parent=None):
        super().__init__(parent)
        layout = QVBoxLayout(self)
        layout.setContentsMargins(4, 4, 4, 4)
        layout.setSpacing(4)

        # Toolbar: filter + export
        toolbar = QHBoxLayout()
        self._filter_all = QPushButton("All")
        self._filter_highlights = QPushButton("Highlights")
        self._filter_notes = QPushButton("Notes")
        for btn in (self._filter_all, self._filter_highlights, self._filter_notes):
            btn.setFixedHeight(26)
            btn.setCursor(Qt.CursorShape.PointingHandCursor)
            btn.setStyleSheet("""
                QPushButton {
                    background: #3a3a4e; color: #ccc; border: 1px solid #555;
                    border-radius: 4px; padding: 2px 8px; font-size: 11px;
                }
                QPushButton:hover { background: #4a4a5e; }
            """)
            toolbar.addWidget(btn)

        self._filter_all.clicked.connect(lambda: self._set_filter("all"))
        self._filter_highlights.clicked.connect(lambda: self._set_filter("highlights"))
        self._filter_notes.clicked.connect(lambda: self._set_filter("notes"))

        toolbar.addStretch()
        export_btn = QPushButton("Export")
        export_btn.setFixedHeight(26)
        export_btn.setCursor(Qt.CursorShape.PointingHandCursor)
        export_btn.setStyleSheet("""
            QPushButton {
                background: #3a3a4e; color: #ccc; border: 1px solid #555;
                border-radius: 4px; padding: 2px 8px; font-size: 11px;
            }
            QPushButton:hover { background: #4a4a5e; }
        """)
        export_btn.clicked.connect(self.export_clicked)
        toolbar.addWidget(export_btn)
        layout.addLayout(toolbar)

        self._list = QListWidget()
        self._list.setStyleSheet("""
            QListWidget {
                background: transparent; color: #e0e0e0; border: none;
                font-size: 12px;
            }
            QListWidget::item { padding: 6px 4px; }
            QListWidget::item:selected { background: #4a90d9; }
            QListWidget::item:hover { background: rgba(74,144,217,0.3); }
        """)
        self._list.itemClicked.connect(self._on_click)
        layout.addWidget(self._list)

        self._empty = QLabel("Annotations require EPUB format.")
        self._empty.setAlignment(Qt.AlignmentFlag.AlignCenter)
        self._empty.setStyleSheet("color: #888; font-size: 12px; padding: 20px;")
        layout.addWidget(self._empty)

        self._annotations: list[dict] = []
        self._current_filter = "all"
        self._is_epub = False

    def set_epub_mode(self, is_epub: bool) -> None:
        self._is_epub = is_epub
        if not is_epub:
            self._empty.setText("Annotations require EPUB format.")

    def set_annotations(self, annotations: list[dict]) -> None:
        self._annotations = annotations
        self._rebuild()

    def _set_filter(self, mode: str) -> None:
        self._current_filter = mode
        self._rebuild()

    def _rebuild(self) -> None:
        self._list.clear()
        filtered = self._annotations
        if self._current_filter == "highlights":
            filtered = [a for a in filtered if not a.get("note")]
        elif self._current_filter == "notes":
            filtered = [a for a in filtered if a.get("note")]

        show_empty = not filtered
        if not self._is_epub and not self._annotations:
            show_empty = True
        self._empty.setVisible(show_empty)
        if show_empty and self._is_epub:
            self._empty.setText("No annotations yet. Select text to highlight.")
        self._list.setVisible(not show_empty)

        for a in filtered:
            text_preview = (a.get("text", "")[:80] + "\u2026") if len(a.get("text", "")) > 80 else a.get("text", "")
            note_preview = ""
            if a.get("note"):
                note_preview = f" \u2014 {a['note'][:60]}"
            color_dot = a.get("color", "#FEF3BD")
            display = f"\u25cf {text_preview}{note_preview}"

            item = QListWidgetItem(display)
            item.setData(Qt.ItemDataRole.UserRole, a)
            item.setForeground(QColor(color_dot))
            self._list.addItem(item)

    def _on_click(self, item: QListWidgetItem) -> None:
        a = item.data(Qt.ItemDataRole.UserRole)
        if a:
            self.navigate.emit(a.get("cfi", ""))


# ── Sidebar Container ───────────────────────────────────────────────────


class BooksSidebar(QFrame):
    """Left-docked tabbed sidebar for the books reader."""

    toc_navigate = Signal(object)       # TocItem
    bookmark_navigate = Signal(object)  # bookmark dict
    annotation_navigate = Signal(str)   # cfi string
    bookmark_delete = Signal(str)       # bookmark id
    annotation_delete = Signal(str)     # annotation id
    export_annotations = Signal()
    close_requested = Signal()

    def __init__(self, parent: QWidget | None = None):
        super().__init__(parent)
        self.setObjectName("books_sidebar")
        self.setFixedWidth(SIDEBAR_WIDTH)
        self.setStyleSheet("""
            #books_sidebar {
                background: #22223a;
                border-right: 1px solid #444;
            }
        """)

        layout = QVBoxLayout(self)
        layout.setContentsMargins(0, 0, 0, 0)
        layout.setSpacing(0)

        # Close button
        header = QHBoxLayout()
        header.setContentsMargins(8, 6, 8, 6)
        header.addStretch()
        close_btn = QPushButton("\u2715")
        close_btn.setFixedSize(28, 28)
        close_btn.setCursor(Qt.CursorShape.PointingHandCursor)
        close_btn.setStyleSheet("""
            QPushButton {
                background: transparent; color: #aaa; border: none;
                font-size: 16px;
            }
            QPushButton:hover { color: white; background: rgba(255,255,255,0.1); border-radius: 14px; }
        """)
        close_btn.clicked.connect(self.close_requested)
        header.addWidget(close_btn)
        layout.addLayout(header)

        # Tabs
        self._tabs = QTabWidget()
        self._tabs.setStyleSheet("""
            QTabWidget::pane { border: none; }
            QTabBar::tab {
                background: #2a2a3e; color: #aaa; padding: 6px 12px;
                border: none; font-size: 12px;
            }
            QTabBar::tab:selected { background: #3a3a4e; color: white; }
            QTabBar::tab:hover { background: #3a3a4e; }
        """)

        self._toc_panel = _TocPanel()
        self._bookmarks_panel = _BookmarksPanel()
        self._annotations_panel = _AnnotationsPanel()

        self._tabs.addTab(self._toc_panel, "TOC")
        self._tabs.addTab(self._bookmarks_panel, "Bookmarks")
        self._tabs.addTab(self._annotations_panel, "Annotations")
        layout.addWidget(self._tabs)

        # Wire signals
        self._toc_panel.navigate.connect(self.toc_navigate)
        self._bookmarks_panel.navigate.connect(self.bookmark_navigate)
        self._bookmarks_panel.delete.connect(self.bookmark_delete)
        self._annotations_panel.navigate.connect(self.annotation_navigate)
        self._annotations_panel.delete.connect(self.annotation_delete)
        self._annotations_panel.export_clicked.connect(self.export_annotations)

    def toggle(self, force_open: bool | None = None) -> None:
        if force_open is True:
            self.show()
        elif force_open is False:
            self.hide()
        elif self.isVisible():
            self.hide()
        else:
            self.show()

    def switch_tab(self, tab_name: str) -> None:
        idx = {"toc": 0, "bookmarks": 1, "annotations": 2}.get(tab_name, 0)
        self._tabs.setCurrentIndex(idx)

    def set_toc_items(self, items: list[TocItem]) -> None:
        self._toc_panel.set_items(items)

    def set_active_chapter(self, href: str) -> None:
        self._toc_panel.set_active_chapter(href)

    def set_bookmarks(self, bookmarks: list[dict]) -> None:
        self._bookmarks_panel.set_bookmarks(bookmarks)

    def set_annotations(self, annotations: list[dict]) -> None:
        self._annotations_panel.set_annotations(annotations)

    def set_epub_mode(self, is_epub: bool) -> None:
        self._annotations_panel.set_epub_mode(is_epub)
