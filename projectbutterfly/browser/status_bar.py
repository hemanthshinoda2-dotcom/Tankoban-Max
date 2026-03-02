"""
Chrome-style status bar — shows link URL on hover at the bottom-left.

Appears as a floating overlay when hovering over links, disappears when not.
"""

from __future__ import annotations

from PySide6.QtCore import Qt, QTimer
from PySide6.QtGui import QFont, QFontMetrics, QColor, QPainter, QPen
from PySide6.QtWidgets import QWidget

from . import theme


class StatusBar(QWidget):
    """
    Floating status bar that shows the link URL when hovering over a link.
    Positioned at the bottom-left of its parent, overlaying the viewport.
    """

    def __init__(self, parent=None):
        super().__init__(parent)
        self._text = ""
        self._visible_text = ""
        self.setFixedHeight(22)
        self.setVisible(False)
        self.setAttribute(Qt.WidgetAttribute.WA_TransparentForMouseEvents)

        self._hide_timer = QTimer(self)
        self._hide_timer.setSingleShot(True)
        self._hide_timer.setInterval(300)
        self._hide_timer.timeout.connect(self._do_hide)

    def show_url(self, url: str):
        """Show a URL in the status bar."""
        if not url:
            # Start delayed hide
            self._hide_timer.start()
            return

        self._hide_timer.stop()
        # Simplify URL for display
        display = url.replace("https://", "").replace("http://", "")
        if len(display) > 80:
            display = display[:77] + "..."
        self._visible_text = display
        self._text = url

        # Resize to fit text
        fm = QFontMetrics(QFont("Segoe UI", 9))
        text_w = fm.horizontalAdvance(display) + 24
        max_w = self.parent().width() * 2 // 3 if self.parent() else 400
        self.setFixedWidth(min(text_w, max_w))

        # Position at bottom-left of parent
        if self.parent():
            self.move(0, self.parent().height() - self.height())

        self.setVisible(True)
        self.update()

    def _do_hide(self):
        self._text = ""
        self._visible_text = ""
        self.setVisible(False)

    def paintEvent(self, event):
        p = QPainter(self)
        p.setRenderHint(QPainter.RenderHint.Antialiasing)
        w, h = self.width(), self.height()

        # Background with rounded top-right corner
        p.setPen(QPen(QColor(theme.BORDER_COLOR), 1))
        p.setBrush(QColor(theme.BG_TOOLBAR))
        p.drawRoundedRect(0, 0, w, h, 0, 0)
        # Round top-right corner only
        p.setPen(Qt.PenStyle.NoPen)
        p.setBrush(QColor(theme.BG_TOOLBAR))
        p.drawRect(0, 0, w - 4, h)
        p.drawRoundedRect(w - 8, 0, 8, h, 4, 4)

        # Border on top and right
        p.setPen(QPen(QColor(theme.BORDER_COLOR), 1))
        p.drawLine(0, 0, w - 4, 0)
        p.drawLine(w - 1, 4, w - 1, h)

        # Text
        font = QFont("Segoe UI", 9)
        p.setFont(font)
        p.setPen(QColor(theme.TEXT_SECONDARY))
        fm = QFontMetrics(font)
        elided = fm.elidedText(self._visible_text, Qt.TextElideMode.ElideRight, w - 16)
        p.drawText(8, (h + fm.ascent() - fm.descent()) // 2, elided)

        p.end()
