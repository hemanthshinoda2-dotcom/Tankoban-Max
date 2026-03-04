from PySide6.QtCore import QPropertyAnimation, QEasingCurve, QTimer, Qt
from PySide6.QtGui import QColor, QPainter, QFont
from PySide6.QtWidgets import QLabel, QWidget


class ToastWidget(QWidget):
    """Inline toast notification — shows brief text feedback then fades out."""

    def __init__(self, parent=None):
        super().__init__(parent)
        self.setAttribute(Qt.WidgetAttribute.WA_TransparentForMouseEvents, True)
        self.setAttribute(Qt.WidgetAttribute.WA_TranslucentBackground, True)
        self.setFixedHeight(36)
        self._text = ""
        self._opacity = 0.0
        self._timer = QTimer(self)
        self._timer.setSingleShot(True)
        self._timer.timeout.connect(self._fade_out)
        self._fade_anim = None
        self.hide()

    def show_toast(self, text: str, duration_ms: int = 1200):
        self._text = str(text)
        self._opacity = 1.0
        if self._fade_anim is not None:
            self._fade_anim.stop()
            self._fade_anim = None
        self._reposition()
        self.show()
        self.raise_()
        self.update()
        self._timer.start(max(200, duration_ms))

    def _reposition(self):
        parent = self.parentWidget()
        if parent is None:
            return
        pw = parent.width()
        w = min(360, max(120, pw // 3))
        x = (pw - w) // 2
        y = parent.height() - 160
        self.setGeometry(x, max(40, y), w, 36)

    def _fade_out(self):
        self._fade_anim = _OpacityFade(self)
        self._fade_anim.start()

    def set_opacity(self, val: float):
        self._opacity = max(0.0, min(1.0, val))
        self.update()
        if self._opacity <= 0.01:
            self.hide()

    def get_opacity(self):
        return self._opacity

    def paintEvent(self, event):
        if not self._text or self._opacity <= 0.01:
            return
        painter = QPainter(self)
        painter.setRenderHint(QPainter.RenderHint.Antialiasing, True)
        painter.setOpacity(self._opacity)

        bg = QColor(0, 0, 0, 180)
        painter.setPen(Qt.PenStyle.NoPen)
        painter.setBrush(bg)
        painter.drawRoundedRect(self.rect(), 10, 10)

        painter.setPen(QColor(255, 255, 255, 230))
        font = QFont()
        font.setPixelSize(13)
        font.setWeight(QFont.Weight.Medium)
        painter.setFont(font)
        painter.drawText(self.rect(), Qt.AlignmentFlag.AlignCenter, self._text)
        painter.end()


class _OpacityFade:
    """Simple opacity animation helper (no QPropertyAnimation dependency on dynamic props)."""

    def __init__(self, widget: ToastWidget, duration: int = 300):
        self._widget = widget
        self._timer = QTimer()
        self._timer.setInterval(16)
        self._timer.timeout.connect(self._tick)
        self._step = 1.0 / max(1, duration / 16.0)
        self._running = False

    def start(self):
        self._running = True
        self._timer.start()

    def stop(self):
        self._running = False
        self._timer.stop()

    def _tick(self):
        cur = self._widget.get_opacity()
        nxt = cur - self._step
        if nxt <= 0.01:
            self._widget.set_opacity(0.0)
            self.stop()
            return
        self._widget.set_opacity(nxt)
