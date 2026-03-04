from PySide6.QtCore import Qt


class KeyboardRouter:
    def __init__(self, widget):
        self.widget = widget

    def handle_key_press(self, event) -> bool:
        w = self.widget
        key = event.key()

        if key == Qt.Key.Key_M:
            w.toggle_control_mode()
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

        if key == Qt.Key.Key_B:
            w._toggle_bookmark()
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
