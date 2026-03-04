"""
Speed slider overlay for the comic reader.

Shows a vertical slider with levels 1-10 for auto-scroll speed.
Matches the overlay pattern of GotoPageOverlay.
"""

from __future__ import annotations

from PySide6.QtCore import Qt, Signal
from PySide6.QtGui import QColor, QPainter

from overlay_anim import animate_close, animate_open
from PySide6.QtWidgets import (
    QHBoxLayout,
    QLabel,
    QPushButton,
    QSlider,
    QVBoxLayout,
    QWidget,
)


_CARD_SS = """
QWidget#speedCard {
  background: rgba(24, 24, 24, 240);
  border: 1px solid rgba(255, 255, 255, 50);
  border-radius: 14px;
}
QLabel#speedTitle {
  color: #ffffff;
  font-size: 16px;
  font-weight: 700;
}
QLabel#speedValue {
  color: #ffffff;
  font-size: 28px;
  font-weight: 700;
}
QLabel#speedHint {
  color: rgba(255, 255, 255, 80);
  font-size: 12px;
}
QSlider::groove:vertical {
  background: rgba(255, 255, 255, 30);
  width: 6px;
  border-radius: 3px;
}
QSlider::handle:vertical {
  background: #ffffff;
  height: 16px;
  width: 16px;
  margin: 0 -5px;
  border-radius: 8px;
}
QSlider::sub-page:vertical {
  background: rgba(255, 255, 255, 30);
  border-radius: 3px;
}
QSlider::add-page:vertical {
  background: rgba(199, 167, 107, 160);
  border-radius: 3px;
}
QPushButton#speedCloseBtn {
  color: #b8b8b8;
  background: rgba(255, 255, 255, 14);
  border: 1px solid rgba(255, 255, 255, 30);
  border-radius: 10px;
  padding: 6px 20px;
  font-size: 13px;
  min-height: 24px;
}
QPushButton#speedCloseBtn:hover {
  background: rgba(255, 255, 255, 28);
}
"""


class SpeedSliderOverlay(QWidget):
    speed_changed = Signal(int)  # 1-10

    def __init__(self, parent=None):
        super().__init__(parent)
        self.setVisible(False)
        self.setAttribute(Qt.WidgetAttribute.WA_TranslucentBackground, True)
        self.setFocusPolicy(Qt.FocusPolicy.StrongFocus)

        self._card = QWidget(self)
        self._card.setObjectName("speedCard")
        self._card.setFixedWidth(200)
        self._card.setStyleSheet(_CARD_SS)

        card_layout = QVBoxLayout(self._card)
        card_layout.setContentsMargins(24, 24, 24, 20)
        card_layout.setSpacing(12)
        card_layout.setAlignment(Qt.AlignmentFlag.AlignHCenter)

        self._title = QLabel("Scroll Speed", self._card)
        self._title.setObjectName("speedTitle")
        self._title.setAlignment(Qt.AlignmentFlag.AlignCenter)
        card_layout.addWidget(self._title)

        self._value_label = QLabel("5", self._card)
        self._value_label.setObjectName("speedValue")
        self._value_label.setAlignment(Qt.AlignmentFlag.AlignCenter)
        card_layout.addWidget(self._value_label)

        self._slider = QSlider(Qt.Orientation.Vertical, self._card)
        self._slider.setRange(1, 10)
        self._slider.setValue(5)
        self._slider.setTickPosition(QSlider.TickPosition.TicksBothSides)
        self._slider.setTickInterval(1)
        self._slider.setFixedHeight(200)
        self._slider.setInvertedAppearance(True)
        self._slider.valueChanged.connect(self._on_value_changed)
        card_layout.addWidget(self._slider, 0, Qt.AlignmentFlag.AlignHCenter)

        # Tick labels row
        tick_row = QHBoxLayout()
        tick_row.setContentsMargins(0, 0, 0, 0)
        slow_label = QLabel("Slow", self._card)
        slow_label.setStyleSheet("color: rgba(255,255,255,60); font-size: 11px;")
        fast_label = QLabel("Fast", self._card)
        fast_label.setStyleSheet("color: rgba(255,255,255,60); font-size: 11px;")
        fast_label.setAlignment(Qt.AlignmentFlag.AlignRight)
        tick_row.addWidget(slow_label)
        tick_row.addStretch()
        tick_row.addWidget(fast_label)
        card_layout.addLayout(tick_row)

        hint = QLabel(", / . to adjust", self._card)
        hint.setObjectName("speedHint")
        hint.setAlignment(Qt.AlignmentFlag.AlignCenter)
        card_layout.addWidget(hint)

        close_btn = QPushButton("Close", self._card)
        close_btn.setObjectName("speedCloseBtn")
        close_btn.clicked.connect(self.close)
        card_layout.addWidget(close_btn)

    def open(self, current_level: int):
        level = max(1, min(10, int(current_level)))
        self._slider.blockSignals(True)
        self._slider.setValue(level)
        self._slider.blockSignals(False)
        self._value_label.setText(str(level))
        self.setVisible(True)
        self.raise_()
        self._position_card()
        animate_open(self._card)
        self._slider.setFocus()

    def close(self):
        animate_close(self._card, on_done=lambda: self.setVisible(False))

    def is_open(self) -> bool:
        return self.isVisible()

    def _on_value_changed(self, value: int):
        self._value_label.setText(str(value))
        self.speed_changed.emit(value)

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

    def keyPressEvent(self, event):
        key = event.key()
        if key == Qt.Key.Key_Escape:
            self.close()
            return
        if key == Qt.Key.Key_Up:
            self._slider.setValue(min(10, self._slider.value() + 1))
            return
        if key == Qt.Key.Key_Down:
            self._slider.setValue(max(1, self._slider.value() - 1))
            return
        super().keyPressEvent(event)

    def mousePressEvent(self, event):
        child = self.childAt(event.position().toPoint())
        if child is None:
            self.close()
            return
        super().mousePressEvent(event)
