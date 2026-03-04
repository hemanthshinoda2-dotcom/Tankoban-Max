"""
Click zone flash feedback — brief colour pulse on left/right halves
when the user taps to navigate in two-page flip modes.
White flash = normal navigation, red flash = blocked/busy.
"""

from PySide6.QtCore import QPropertyAnimation, QRect, Qt, QEasingCurve, Property
from PySide6.QtGui import QColor, QPainter
from PySide6.QtWidgets import QWidget


class ClickFlash(QWidget):
    """Ephemeral translucent rectangle that fades out over ~90ms."""

    def __init__(self, parent=None):
        super().__init__(parent)
        self.setAttribute(Qt.WidgetAttribute.WA_TransparentForMouseEvents, True)
        self.setAttribute(Qt.WidgetAttribute.WA_NoSystemBackground, True)
        self.setAutoFillBackground(False)
        self._opacity = 0.0
        self._color = QColor(255, 255, 255)  # green
        self._anim = QPropertyAnimation(self, b"flash_opacity")
        self._anim.setDuration(90)
        self._anim.setEasingCurve(QEasingCurve.Type.OutQuad)
        self._anim.finished.connect(self._on_done)
        self.hide()

    def _get_opacity(self):
        return self._opacity

    def _set_opacity(self, v):
        self._opacity = float(v)
        self.update()

    flash_opacity = Property(float, _get_opacity, _set_opacity)

    def flash(self, rect: QRect, blocked: bool = False):
        self._color = QColor(220, 60, 60) if blocked else QColor(255, 255, 255)
        self.setGeometry(rect)
        self._anim.stop()
        self._opacity = 0.32 if blocked else 0.22
        self._anim.setStartValue(self._opacity)
        self._anim.setEndValue(0.0)
        self.show()
        self.raise_()
        self._anim.start()

    def _on_done(self):
        self.hide()

    def paintEvent(self, event):
        if self._opacity <= 0.001:
            return
        p = QPainter(self)
        c = QColor(self._color)
        c.setAlphaF(self._opacity)
        p.fillRect(self.rect(), c)
        p.end()
