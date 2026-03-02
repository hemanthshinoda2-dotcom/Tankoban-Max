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

from PySide6.QtCore import Qt, Signal, QSize
from PySide6.QtGui import QIcon, QPainter, QColor, QFont, QFontMetrics, QPen
from PySide6.QtWidgets import (
    QWidget, QHBoxLayout, QPushButton, QScrollArea, QSizePolicy,
)

from . import theme


class TabButton(QWidget):
    """Individual tab button in the tab bar."""

    clicked = Signal(str)        # tab_id
    close_clicked = Signal(str)  # tab_id

    def __init__(self, tab_id: str, title: str = "New Tab", parent=None):
        super().__init__(parent)
        self.tab_id = tab_id
        self._title = title
        self._icon: QIcon | None = None
        self._active = False
        self._loading = False
        self._hovered = False
        self._close_hovered = False

        self.setFixedHeight(theme.TAB_HEIGHT)
        self.setMinimumWidth(theme.TAB_MIN_WIDTH)
        self.setMaximumWidth(theme.TAB_MAX_WIDTH)
        self.setSizePolicy(QSizePolicy.Policy.Preferred, QSizePolicy.Policy.Fixed)
        self.setMouseTracking(True)
        self.setCursor(Qt.CursorShape.PointingHandCursor)

    @property
    def active(self) -> bool:
        return self._active

    @active.setter
    def active(self, val: bool):
        if self._active != val:
            self._active = val
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
            if self._in_close(event.pos()):
                self.close_clicked.emit(self.tab_id)
            else:
                self.clicked.emit(self.tab_id)
        elif event.button() == Qt.MouseButton.MiddleButton:
            self.close_clicked.emit(self.tab_id)

    def mouseMoveEvent(self, event):
        was_close = self._close_hovered
        self._close_hovered = self._in_close(event.pos())
        if was_close != self._close_hovered:
            self.update()

    def enterEvent(self, event):
        self._hovered = True
        self.update()

    def leaveEvent(self, event):
        self._hovered = False
        self._close_hovered = False
        self.update()


class TabBar(QWidget):
    """
    Horizontal tab bar with scroll area for overflow.

    Signals:
        tab_clicked(tab_id)
        tab_close_clicked(tab_id)
        new_tab_clicked()
    """

    tab_clicked = Signal(str)
    tab_close_clicked = Signal(str)
    new_tab_clicked = Signal()

    def __init__(self, parent=None):
        super().__init__(parent)
        self.setObjectName("tabBar")
        self.setFixedHeight(theme.TAB_HEIGHT)
        self.setStyleSheet(theme.TAB_BAR_STYLE)

        self._buttons: dict[str, TabButton] = {}

        # Layout: [scroll area with tabs] [+ button]
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

        # New tab button
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
                background: rgba(255,255,255,0.08);
                color: {theme.TEXT_PRIMARY};
            }}
        """)
        self._new_btn.setCursor(Qt.CursorShape.PointingHandCursor)
        self._new_btn.clicked.connect(self.new_tab_clicked.emit)
        outer.addWidget(self._new_btn)

    def add_tab(self, tab_id: str, title: str, index: int = -1):
        """Add a tab button at the given index."""
        btn = TabButton(tab_id, title)
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
        n = len(self._buttons)
        if n == 0:
            return
        avail = self._scroll.width() - 8
        per_tab = max(theme.TAB_MIN_WIDTH, min(theme.TAB_MAX_WIDTH, avail // n))
        for btn in self._buttons.values():
            btn.setFixedWidth(per_tab)

    def resizeEvent(self, event):
        super().resizeEvent(event)
        self._recalc_tab_widths()

    def ensure_visible(self, tab_id: str):
        """Scroll to make a tab visible."""
        btn = self._buttons.get(tab_id)
        if btn:
            self._scroll.ensureWidgetVisible(btn, 50, 0)
