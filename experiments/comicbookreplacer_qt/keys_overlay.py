"""Standalone keyboard shortcuts overlay (K key)."""

from PySide6.QtCore import Qt
from PySide6.QtGui import QColor, QPainter
from PySide6.QtWidgets import QLabel, QScrollArea, QVBoxLayout, QWidget

from overlay_anim import animate_close, animate_open


SHORTCUTS = [
    ("M", "Toggle Manual / Auto Scroll"),
    ("I", "Toggle manga invert (R\u2192L)"),
    ("P", "Toggle page coupling nudge"),
    ("F", "Toggle fullscreen"),
    ("H", "Toggle HUD"),
    ("S", "Open settings"),
    ("K", "Keyboard shortcuts"),
    ("L", "Toggle loupe"),
    ("V", "Speed slider"),
    ("O", "Volume navigator"),
    ("G", "Go to page"),
    ("B", "Toggle bookmark"),
    ("Z", "Instant replay (restart volume)"),
    (",  /  .", "Decrease / Increase scroll speed"),
    ("Space", "Play / Pause (auto modes)"),
    ("\u2190  /  \u2192", "Previous / Next page"),
    ("\u2191  /  \u2193", "Scroll up / down"),
    ("Home / End", "First / Last page"),
    ("Ctrl+M", "Minimize window"),
    ("Ctrl+Q", "Quit application"),
    ("Ctrl+0", "Reset settings to defaults"),
    ("Esc", "Close overlay / Back"),
]


class KeysOverlay(QWidget):
    def __init__(self, parent=None):
        super().__init__(parent)
        self.setVisible(False)
        self.setAttribute(Qt.WidgetAttribute.WA_TranslucentBackground, True)
        self.setFocusPolicy(Qt.FocusPolicy.StrongFocus)

        self._panel = QWidget(self)
        self._panel.setObjectName("keysPanel")
        self._panel.setFixedWidth(420)
        self._panel.setStyleSheet(
            """
            QWidget#keysPanel {
                background: rgba(24, 24, 24, 240);
                border: 1px solid rgba(255, 255, 255, 50);
                border-radius: 14px;
            }
            """
        )

        panel_layout = QVBoxLayout(self._panel)
        panel_layout.setContentsMargins(0, 16, 0, 12)
        panel_layout.setSpacing(0)

        title = QLabel("Keyboard Shortcuts", self._panel)
        title.setStyleSheet(
            "color: #ffffff; font-size: 16px; font-weight: 700; "
            "padding: 0 20px 12px 20px; background: transparent;"
        )
        panel_layout.addWidget(title)

        scroll = QScrollArea(self._panel)
        scroll.setWidgetResizable(True)
        scroll.setStyleSheet("QScrollArea { border: none; background: transparent; }")
        scroll.setHorizontalScrollBarPolicy(Qt.ScrollBarPolicy.ScrollBarAlwaysOff)

        inner = QWidget()
        inner.setStyleSheet("background: transparent;")
        inner_layout = QVBoxLayout(inner)
        inner_layout.setContentsMargins(20, 0, 20, 0)
        inner_layout.setSpacing(0)

        for key, desc in SHORTCUTS:
            row = QLabel(f"<b style='color:#c7a76b'>{key}</b>&nbsp;&nbsp;&nbsp;&nbsp;{desc}")
            row.setStyleSheet(
                "color: rgba(255,255,255,200); font-size: 13px; "
                "padding: 7px 0; border-bottom: 1px solid rgba(255,255,255,8); "
                "background: transparent;"
            )
            row.setTextFormat(Qt.TextFormat.RichText)
            inner_layout.addWidget(row)

        inner_layout.addStretch()
        scroll.setWidget(inner)
        panel_layout.addWidget(scroll, 1)

    def open(self):
        self.setVisible(True)
        self.raise_()
        self._position_panel()
        animate_open(self._panel)
        self.setFocus()

    def close(self):
        animate_close(self._panel, on_done=lambda: self.setVisible(False))

    def is_open(self) -> bool:
        return self.isVisible()

    def paintEvent(self, event):
        painter = QPainter(self)
        painter.fillRect(self.rect(), QColor(0, 0, 0, 100))
        painter.end()

    def resizeEvent(self, event):
        super().resizeEvent(event)
        self._position_panel()

    def _position_panel(self):
        pw = self._panel.width()
        ph = min(self._panel.sizeHint().height(), max(200, self.height() - 40))
        self._panel.setFixedHeight(ph)
        x = (self.width() - pw) // 2
        y = (self.height() - ph) // 2
        self._panel.move(max(0, x), max(0, y))

    def keyPressEvent(self, event):
        if event.key() in (Qt.Key.Key_Escape, Qt.Key.Key_K):
            self.close()
            return
        super().keyPressEvent(event)

    def mousePressEvent(self, event):
        # Click outside panel closes
        if not self._panel.geometry().contains(event.pos()):
            self.close()
            event.accept()
            return
        super().mousePressEvent(event)
