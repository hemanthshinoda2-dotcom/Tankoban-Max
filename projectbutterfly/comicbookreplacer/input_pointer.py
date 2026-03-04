class PointerRouter:
    def __init__(self, widget):
        self.widget = widget

    def handle_wheel(self, event) -> bool:
        return self.widget.handle_pointer_wheel(event)

    def handle_mouse_press(self, event) -> bool:
        return self.widget.handle_pointer_press(event)

    def handle_mouse_move(self, event) -> bool:
        return self.widget.handle_pointer_move(event)

    def handle_mouse_release(self, event) -> bool:
        return self.widget.handle_pointer_release(event)
