from PySide6.QtCore import Qt
from PySide6.QtWidgets import QApplication


class KeyboardRouter:
    def __init__(self, widget):
        self.widget = widget

    def handle_key_press(self, event) -> bool:
        w = self.widget
        key = event.key()
        mods = event.modifiers()

        # ── Ctrl modifier shortcuts ──────────────────────────────
        if mods & Qt.KeyboardModifier.ControlModifier:
            if key == Qt.Key.Key_M:
                win = w.window()
                if win:
                    win.showMinimized()
                return True
            if key == Qt.Key.Key_Q:
                QApplication.quit()
                return True
            if key == Qt.Key.Key_R:
                w.force_scan_requested.emit() if hasattr(w, "force_scan_requested") else None
                return True
            if key == Qt.Key.Key_0:
                w.reset_to_defaults()
                return True

        # ── Unmodified key shortcuts ─────────────────────────────
        if key == Qt.Key.Key_M:
            w.toggle_manual_auto()
            return True
        if key == Qt.Key.Key_I:
            w.toggle_manga_invert()
            return True
        if key == Qt.Key.Key_P:
            w.toggle_two_page_coupling_nudge()
            return True
        if key == Qt.Key.Key_F:
            w.toggle_fullscreen_window()
            return True
        if key == Qt.Key.Key_H:
            w.toggle_hud_visibility()
            return True
        if key == Qt.Key.Key_L:
            w.toggle_loupe()
            return True
        if key == Qt.Key.Key_S:
            w._open_mega_settings()
            return True
        if key == Qt.Key.Key_O:
            w._open_volume_nav()
            return True
        if key == Qt.Key.Key_G:
            w._open_goto_page_dialog()
            return True
        if key == Qt.Key.Key_K:
            w._open_keys_overlay()
            return True
        if key == Qt.Key.Key_Z:
            w.instant_replay()
            return True

        if key == Qt.Key.Key_B:
            w._toggle_bookmark()
            return True
        if key == Qt.Key.Key_V:
            w._open_speed_slider()
            return True
        if key == Qt.Key.Key_Comma:
            w._adjust_auto_scroll_speed(-1)
            return True
        if key == Qt.Key.Key_Period:
            w._adjust_auto_scroll_speed(1)
            return True

        if key in (Qt.Key.Key_Space, Qt.Key.Key_Return, Qt.Key.Key_Enter):
            if w.is_mangaplus_mode() and w.get_mangaplus_zoom_pct() > 100:
                if event.modifiers() & Qt.KeyboardModifier.ShiftModifier:
                    w.prev_two_page()
                else:
                    w.next_two_page()
                return True
            if w.get_control_mode() == "auto":
                w.toggle_auto_scroll_pause()
                return True

        if key in (Qt.Key.Key_Left, Qt.Key.Key_PageUp):
            w.on_nav_left()
            return True
        if key in (Qt.Key.Key_Right, Qt.Key.Key_PageDown):
            w.on_nav_right()
            return True
        if key == Qt.Key.Key_Up:
            w.on_nav_up()
            return True
        if key == Qt.Key.Key_Down:
            w.on_nav_down()
            return True
        if key == Qt.Key.Key_Home:
            w.go_to_page(0, keep_scroll=False)
            return True
        if key == Qt.Key.Key_End:
            if w.state.pages:
                w.go_to_page(len(w.state.pages) - 1, keep_scroll=False)
                return True
        return False
