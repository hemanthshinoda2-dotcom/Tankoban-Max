"""
Chrome-style tab bar widget.

Renders a horizontal strip of tabs with:
  - Rounded-top tab shapes
  - Active tab highlighted (matches toolbar color)
  - Close button per tab
  - New-tab (+) button
  - Overflow scroll when too many tabs
"""

from __future__ import annotations

from PySide6.QtCore import Qt, Signal, QSize, QPoint, QMimeData
from PySide6.QtGui import QIcon, QPainter, QColor, QFont, QFontMetrics, QPen, QDrag
from PySide6.QtWidgets import (
    QWidget, QHBoxLayout, QPushButton, QScrollArea, QSizePolicy, QMenu,
)

from . import theme


class TabButton(QWidget):
    """Individual tab button in the tab bar."""

    clicked = Signal(str)        # tab_id
    close_clicked = Signal(str)  # tab_id
    drag_started = Signal(str)   # tab_id

    DRAG_THRESHOLD = 8  # px before drag starts

    def __init__(self, tab_id: str, title: str = "New Tab", pinned: bool = False, parent=None):
        super().__init__(parent)
        self.tab_id = tab_id
        self._title = title
        self._icon: QIcon | None = None
        self._active = False
        self._loading = False
        self._hovered = False
        self._close_hovered = False
        self._pinned = pinned
        self._drag_start_pos: QPoint | None = None

        self.setFixedHeight(theme.TAB_HEIGHT)
        self.setMinimumWidth(theme.TAB_PIN_WIDTH if pinned else theme.TAB_MIN_WIDTH)
        self.setMaximumWidth(theme.TAB_PIN_WIDTH if pinned else theme.TAB_MAX_WIDTH)
        self.setSizePolicy(QSizePolicy.Policy.Preferred, QSizePolicy.Policy.Fixed)
        self.setMouseTracking(True)
        self.setCursor(Qt.CursorShape.PointingHandCursor)
        self.setAcceptDrops(True)

    @property
    def active(self) -> bool:
        return self._active

    @active.setter
    def active(self, val: bool):
        if self._active != val:
            self._active = val
            self.update()

    @property
    def pinned(self) -> bool:
        return self._pinned

    @pinned.setter
    def pinned(self, val: bool):
        self._pinned = val
        self.setMinimumWidth(theme.TAB_PIN_WIDTH if val else theme.TAB_MIN_WIDTH)
        self.setMaximumWidth(theme.TAB_PIN_WIDTH if val else theme.TAB_MAX_WIDTH)
        self.update()

    def set_title(self, title: str):
        self._title = title or "New Tab"
        self.update()

    def set_icon(self, icon: QIcon | None):
        self._icon = icon
        self.update()

    def set_loading(self, loading: bool):
        self._loading = loading
        self.update()

    def sizeHint(self) -> QSize:
        return QSize(180, theme.TAB_HEIGHT)

    # -- Paint --

    def paintEvent(self, event):
        p = QPainter(self)
        p.setRenderHint(QPainter.RenderHint.Antialiasing)
        w, h = self.width(), self.height()

        # Background
        if self._active:
            bg = QColor(theme.BG_TAB_ACTIVE)
        elif self._hovered:
            bg = QColor(theme.BG_TAB_HOVER)
        else:
            bg = QColor(theme.BG_TAB_INACTIVE)

        # Draw rounded-top rectangle
        radius = 8
        p.setPen(Qt.PenStyle.NoPen)
        p.setBrush(bg)
        p.drawRoundedRect(0, 0, w, h + radius, radius, radius)
        # Fill bottom corners to make them square (tab sits flush on toolbar)
        p.drawRect(0, h - radius, w, radius)

        # Loading indicator (thin line at bottom)
        if self._loading:
            p.setPen(QPen(QColor(theme.LOADING_COLOR), 2))
            p.drawLine(4, h - 1, w - 4, h - 1)

        # Favicon
        if self._pinned:
            # Pinned: center icon only
            icon_size = 16
            ix = (w - icon_size) // 2
            iy = (h - icon_size) // 2
            if self._icon and not self._icon.isNull():
                self._icon.paint(p, ix, iy, icon_size, icon_size)
            else:
                # Draw a small dot as placeholder
                p.setPen(Qt.PenStyle.NoPen)
                p.setBrush(QColor(theme.TEXT_SECONDARY))
                p.drawEllipse(ix + 4, iy + 4, 8, 8)
            p.end()
            return

        x_offset = 10
        if self._icon and not self._icon.isNull():
            icon_size = 16
            y_icon = (h - icon_size) // 2
            self._icon.paint(p, x_offset, y_icon, icon_size, icon_size)
            x_offset += icon_size + 6
        else:
            x_offset += 4

        # Title text
        close_zone = 28  # Space reserved for close button
        avail_w = w - x_offset - close_zone
        if avail_w > 10:
            font = QFont("Segoe UI", 9)
            p.setFont(font)
            p.setPen(QColor(theme.TEXT_PRIMARY if self._active else theme.TEXT_SECONDARY))
            fm = QFontMetrics(font)
            elided = fm.elidedText(self._title, Qt.TextElideMode.ElideRight, avail_w)
            text_y = (h + fm.ascent() - fm.descent()) // 2
            p.drawText(x_offset, text_y, elided)

        # Close button (x)
        close_size = theme.TAB_CLOSE_SIZE
        cx = w - close_size - 8
        cy = (h - close_size) // 2

        if self._close_hovered:
            p.setPen(Qt.PenStyle.NoPen)
            p.setBrush(QColor(theme.CLOSE_HOVER))
            p.drawRoundedRect(cx - 2, cy - 2, close_size + 4, close_size + 4, 4, 4)

        p.setPen(QPen(QColor(theme.TEXT_SECONDARY if not self._close_hovered else "#ffffff"), 1.5))
        margin = 4
        p.drawLine(cx + margin, cy + margin, cx + close_size - margin, cy + close_size - margin)
        p.drawLine(cx + close_size - margin, cy + margin, cx + margin, cy + close_size - margin)

        p.end()

    # -- Mouse events --

    def _close_rect(self):
        close_size = theme.TAB_CLOSE_SIZE + 4
        return (
            self.width() - close_size - 6,
            (self.height() - close_size) // 2,
            close_size,
            close_size,
        )

    def _in_close(self, pos) -> bool:
        cx, cy, cw, ch = self._close_rect()
        return cx <= pos.x() <= cx + cw and cy <= pos.y() <= cy + ch

    def mousePressEvent(self, event):
        if event.button() == Qt.MouseButton.LeftButton:
            if not self._pinned and self._in_close(event.pos()):
                self.close_clicked.emit(self.tab_id)
            else:
                self._drag_start_pos = event.pos()
                self.clicked.emit(self.tab_id)
        elif event.button() == Qt.MouseButton.MiddleButton:
            if not self._pinned:
                self.close_clicked.emit(self.tab_id)
        elif event.button() == Qt.MouseButton.RightButton:
            self._show_tab_context_menu(event.globalPos())

    def _show_tab_context_menu(self, global_pos):
        """Show right-click context menu on the tab."""
        menu = QMenu(self)
        menu.setStyleSheet(f"""
            QMenu {{
                background: {theme.BG_POPUP};
                color: {theme.TEXT_PRIMARY};
                border: 1px solid {theme.BORDER_COLOR};
                border-radius: 8px;
                padding: 4px 0;
                font-size: 13px;
                font-family: 'Segoe UI', sans-serif;
            }}
            QMenu::item {{ padding: 6px 32px 6px 12px; }}
            QMenu::item:selected {{ background: rgba(199,167,107,0.12); }}
            QMenu::separator {{ height: 1px; background: {theme.BORDER_COLOR}; margin: 4px 8px; }}
        """)

        if self._pinned:
            menu.addAction("Unpin tab", lambda: self._emit_pin(False))
        else:
            menu.addAction("Pin tab", lambda: self._emit_pin(True))

        menu.addSeparator()

        if not self._pinned:
            menu.addAction("Close tab", lambda: self.close_clicked.emit(self.tab_id))

        menu.exec(global_pos)

    def _emit_pin(self, pin: bool):
        parent = self.parent()
        while parent and not isinstance(parent, TabBar):
            parent = parent.parent()
        if parent:
            parent.tab_pin_requested.emit(self.tab_id, pin)

    def mouseMoveEvent(self, event):
        # Drag detection
        if self._drag_start_pos and event.buttons() & Qt.MouseButton.LeftButton:
            delta = event.pos() - self._drag_start_pos
            if delta.manhattanLength() >= self.DRAG_THRESHOLD:
                self._start_drag()
                return

        if not self._pinned:
            was_close = self._close_hovered
            self._close_hovered = self._in_close(event.pos())
            if was_close != self._close_hovered:
                self.update()

    def mouseReleaseEvent(self, event):
        self._drag_start_pos = None

    def _start_drag(self):
        """Initiate a tab drag operation."""
        self._drag_start_pos = None
        drag = QDrag(self)
        mime = QMimeData()
        mime.setData("application/x-tanko-tab-id", self.tab_id.encode())
        drag.setMimeData(mime)
        drag.exec(Qt.DropAction.MoveAction)

    def dragEnterEvent(self, event):
        if event.mimeData().hasFormat("application/x-tanko-tab-id"):
            event.acceptProposedAction()

    def dragMoveEvent(self, event):
        if event.mimeData().hasFormat("application/x-tanko-tab-id"):
            event.acceptProposedAction()

    def dropEvent(self, event):
        source_id = event.mimeData().data("application/x-tanko-tab-id").data().decode()
        if source_id != self.tab_id:
            # Emit to TabBar which handles reorder
            parent = self.parent()
            while parent and not isinstance(parent, TabBar):
                parent = parent.parent()
            if parent:
                parent.tab_reorder_requested.emit(source_id, self.tab_id)
        event.acceptProposedAction()

    def enterEvent(self, event):
        self._hovered = True
        self.update()

    def leaveEvent(self, event):
        self._hovered = False
        self._close_hovered = False
        self._drag_start_pos = None
        self.update()


class TabBar(QWidget):
    """
    Horizontal tab bar with scroll area for overflow.

    Layout: [tabs...] [+] [stretch] [—] [□] [✕]

    Signals:
        tab_clicked(tab_id)
        tab_close_clicked(tab_id)
        new_tab_clicked()
        minimize_clicked()
        maximize_clicked()
        close_clicked()
    """

    tab_clicked = Signal(str)
    tab_close_clicked = Signal(str)
    new_tab_clicked = Signal()
    tab_reorder_requested = Signal(str, str)  # (source_tab_id, target_tab_id)
    tab_pin_requested = Signal(str, bool)     # (tab_id, pin)
    minimize_clicked = Signal()
    maximize_clicked = Signal()
    close_clicked = Signal()

    def __init__(self, parent=None):
        super().__init__(parent)
        self.setObjectName("tabBar")
        self.setFixedHeight(theme.TAB_HEIGHT)
        self.setStyleSheet(theme.TAB_BAR_STYLE)

        self._buttons: dict[str, TabButton] = {}

        # Layout: [scroll area with tabs + button] [stretch] [window controls]
        outer = QHBoxLayout(self)
        outer.setContentsMargins(8, 0, 4, 0)
        outer.setSpacing(0)

        # Scroll area for tabs
        self._scroll = QScrollArea()
        self._scroll.setWidgetResizable(True)
        self._scroll.setHorizontalScrollBarPolicy(Qt.ScrollBarPolicy.ScrollBarAlwaysOff)
        self._scroll.setVerticalScrollBarPolicy(Qt.ScrollBarPolicy.ScrollBarAlwaysOff)
        self._scroll.setFrameShape(self._scroll.Shape.NoFrame)
        self._scroll.setStyleSheet("background: transparent;")
        self._scroll.setFixedHeight(theme.TAB_HEIGHT)

        self._tab_container = QWidget()
        self._tab_container.setStyleSheet("background: transparent;")
        self._tab_layout = QHBoxLayout(self._tab_container)
        self._tab_layout.setContentsMargins(0, 0, 0, 0)
        self._tab_layout.setSpacing(1)
        self._tab_layout.addStretch()

        self._scroll.setWidget(self._tab_container)
        outer.addWidget(self._scroll, 1)

        # New tab button — sits right after the tab scroll area
        self._new_btn = QPushButton("+")
        self._new_btn.setFixedSize(28, 28)
        self._new_btn.setStyleSheet(f"""
            QPushButton {{
                background: transparent;
                color: {theme.TEXT_SECONDARY};
                border: none;
                border-radius: 14px;
                font-size: 18px;
                font-weight: bold;
                font-family: 'Segoe UI', sans-serif;
            }}
            QPushButton:hover {{
                background: rgba(199,167,107,0.10);
                color: {theme.TEXT_PRIMARY};
            }}
        """)
        self._new_btn.setCursor(Qt.CursorShape.PointingHandCursor)
        self._new_btn.clicked.connect(self.new_tab_clicked.emit)
        outer.addWidget(self._new_btn)

        # Stretch pushes window controls to the far right
        outer.addStretch()

        # Window controls — Tankoban gradient style
        outer.addSpacing(8)

        self._min_btn = self._window_button("\u2014", "Minimize")  # —
        self._min_btn.clicked.connect(self.minimize_clicked.emit)
        outer.addWidget(self._min_btn)

        outer.addSpacing(2)

        self._max_btn = self._window_button("\u25a2", "Maximize")  # ▢
        self._max_btn.clicked.connect(self.maximize_clicked.emit)
        outer.addWidget(self._max_btn)

        outer.addSpacing(2)

        self._close_btn = QPushButton("\u2715")  # ✕
        self._close_btn.setToolTip("Close")
        self._close_btn.setFixedSize(28, 28)
        self._close_btn.setCursor(Qt.CursorShape.PointingHandCursor)
        self._close_btn.setStyleSheet(theme.WINDOW_CLOSE_BTN_STYLE)
        self._close_btn.clicked.connect(self.close_clicked.emit)
        outer.addWidget(self._close_btn)

    def _window_button(self, text: str, tooltip: str) -> QPushButton:
        btn = QPushButton(text)
        btn.setToolTip(tooltip)
        btn.setFixedSize(28, 28)
        btn.setCursor(Qt.CursorShape.PointingHandCursor)
        btn.setStyleSheet(theme.WINDOW_BTN_STYLE)
        return btn

    def add_tab(self, tab_id: str, title: str, index: int = -1, pinned: bool = False):
        """Add a tab button at the given index."""
        btn = TabButton(tab_id, title, pinned=pinned)
        btn.clicked.connect(self.tab_clicked.emit)
        btn.close_clicked.connect(self.tab_close_clicked.emit)

        self._buttons[tab_id] = btn

        # Insert before the stretch
        count = self._tab_layout.count()
        insert_at = min(index, count - 1) if index >= 0 else count - 1
        self._tab_layout.insertWidget(insert_at, btn)

        self._recalc_tab_widths()

    def remove_tab(self, tab_id: str):
        """Remove a tab button."""
        btn = self._buttons.pop(tab_id, None)
        if btn:
            self._tab_layout.removeWidget(btn)
            btn.deleteLater()
            self._recalc_tab_widths()

    def set_active(self, tab_id: str):
        """Highlight the active tab."""
        for tid, btn in self._buttons.items():
            btn.active = (tid == tab_id)

    def update_title(self, tab_id: str, title: str):
        btn = self._buttons.get(tab_id)
        if btn:
            btn.set_title(title)

    def update_icon(self, tab_id: str, icon: QIcon):
        btn = self._buttons.get(tab_id)
        if btn:
            btn.set_icon(icon)

    def update_loading(self, tab_id: str, loading: bool):
        btn = self._buttons.get(tab_id)
        if btn:
            btn.set_loading(loading)

    def _recalc_tab_widths(self):
        """Distribute tab widths evenly within min/max constraints."""
        if not self._buttons:
            return

        pinned = [b for b in self._buttons.values() if b.pinned]
        unpinned = [b for b in self._buttons.values() if not b.pinned]

        # Pinned tabs get fixed width
        pinned_total = len(pinned) * theme.TAB_PIN_WIDTH
        for btn in pinned:
            btn.setFixedWidth(theme.TAB_PIN_WIDTH)

        # Unpinned share remaining space
        if unpinned:
            avail = self._scroll.width() - 8 - pinned_total
            per_tab = max(theme.TAB_MIN_WIDTH, min(theme.TAB_MAX_WIDTH, avail // len(unpinned)))
            for btn in unpinned:
                btn.setFixedWidth(per_tab)

    def resizeEvent(self, event):
        super().resizeEvent(event)
        self._recalc_tab_widths()

    def ensure_visible(self, tab_id: str):
        """Scroll to make a tab visible."""
        btn = self._buttons.get(tab_id)
        if btn:
            self._scroll.ensureWidgetVisible(btn, 50, 0)

    def reorder_tab(self, source_id: str, target_id: str):
        """Move source tab to the position of target tab in the layout."""
        src_btn = self._buttons.get(source_id)
        tgt_btn = self._buttons.get(target_id)
        if not src_btn or not tgt_btn:
            return

        # Find target index in layout
        tgt_idx = self._tab_layout.indexOf(tgt_btn)
        if tgt_idx < 0:
            return

        # Remove source and re-insert at target position
        self._tab_layout.removeWidget(src_btn)
        self._tab_layout.insertWidget(tgt_idx, src_btn)

    def set_pinned(self, tab_id: str, pinned: bool):
        """Update a tab's pinned visual state."""
        btn = self._buttons.get(tab_id)
        if btn:
            btn.pinned = pinned
            self._recalc_tab_widths()
