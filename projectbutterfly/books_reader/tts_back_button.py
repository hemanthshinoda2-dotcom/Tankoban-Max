"""Floating 'Back to TTS Location' button."""

from __future__ import annotations

from PySide6.QtCore import Qt, QTimer, Signal
from PySide6.QtWidgets import QPushButton, QWidget


class TtsBackToLocationButton(QPushButton):
    """Floating button that appears when user scrolls away from TTS position."""

    go_back = Signal()

    def __init__(self, parent: QWidget | None = None):
        super().__init__("Back to TTS \u2191", parent)
        self.setObjectName("tts_back_btn")
        self.setCursor(Qt.CursorShape.PointingHandCursor)
        self.setFixedSize(160, 36)
        self.setStyleSheet("""
            #tts_back_btn {
                background: rgba(100, 138, 255, 0.85);
                color: white;
                border: none;
                border-radius: 18px;
                font-size: 13px;
                font-weight: bold;
            }
            #tts_back_btn:hover {
                background: rgba(100, 138, 255, 1.0);
            }
        """)
        self.clicked.connect(self._on_click)
        self.hide()

        # Grace period timer to avoid flicker after click
        self._grace_timer = QTimer(self)
        self._grace_timer.setSingleShot(True)
        self._grace_timer.setInterval(2000)

    def _on_click(self) -> None:
        self.hide()
        self._grace_timer.start()
        self.go_back.emit()

    def set_visible_if_needed(self, should_show: bool) -> None:
        """Show or hide based on whether user has scrolled away from TTS position."""
        if self._grace_timer.isActive():
            return  # Still in grace period after click
        self.setVisible(should_show)

    def position_in_parent(self) -> None:
        """Center horizontally at the bottom of the parent widget."""
        p = self.parentWidget()
        if p:
            x = (p.width() - self.width()) // 2
            y = p.height() - self.height() - 70  # Above bottom bar
            self.move(x, y)
