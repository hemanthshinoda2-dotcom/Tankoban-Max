"""Navigation handler for the books reader — click zones and keyboard."""

from __future__ import annotations

from PySide6.QtCore import Qt, Signal, QObject
from PySide6.QtGui import QKeyEvent, QMouseEvent


class BooksNavHandler(QObject):
    """Translates clicks and key presses into navigation signals."""

    prev_requested = Signal()
    next_requested = Signal()
    hud_toggle_requested = Signal()
    close_requested = Signal()
    appearance_toggle_requested = Signal()
    go_start_requested = Signal()
    go_end_requested = Signal()
    sidebar_toggle_requested = Signal()
    toc_toggle_requested = Signal()
    bookmark_toggle_requested = Signal()
    search_toggle_requested = Signal()
    dict_lookup_requested = Signal()
    tts_toggle_requested = Signal()
    tts_settings_requested = Signal()

    def handle_click(self, x_fraction: float) -> None:
        """Handle a click at a horizontal position (0.0 = left edge, 1.0 = right)."""
        if x_fraction < 0.3:
            self.prev_requested.emit()
        elif x_fraction > 0.7:
            self.next_requested.emit()
        else:
            self.hud_toggle_requested.emit()

    def handle_key(self, event: QKeyEvent) -> bool:
        """Handle a key press. Returns True if consumed."""
        key = event.key()

        if key in (Qt.Key.Key_Left, Qt.Key.Key_PageUp, Qt.Key.Key_Backspace):
            self.prev_requested.emit()
            return True
        if key in (Qt.Key.Key_Right, Qt.Key.Key_Space, Qt.Key.Key_PageDown):
            self.next_requested.emit()
            return True
        if key == Qt.Key.Key_Escape:
            self.close_requested.emit()
            return True
        if key == Qt.Key.Key_A:
            self.appearance_toggle_requested.emit()
            return True
        if key == Qt.Key.Key_H:
            self.sidebar_toggle_requested.emit()
            return True
        if key == Qt.Key.Key_O:
            self.toc_toggle_requested.emit()
            return True
        if key == Qt.Key.Key_B:
            self.bookmark_toggle_requested.emit()
            return True
        if key == Qt.Key.Key_F and event.modifiers() & Qt.KeyboardModifier.ControlModifier:
            self.search_toggle_requested.emit()
            return True
        if key == Qt.Key.Key_D:
            self.dict_lookup_requested.emit()
            return True
        if key == Qt.Key.Key_T:
            if event.modifiers() & Qt.KeyboardModifier.ShiftModifier:
                self.tts_settings_requested.emit()
            else:
                self.tts_toggle_requested.emit()
            return True
        if key == Qt.Key.Key_Home:
            self.go_start_requested.emit()
            return True
        if key == Qt.Key.Key_End:
            self.go_end_requested.emit()
            return True

        return False
