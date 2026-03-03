from PySide6.QtWidgets import QWidget


class VolumeNavOverlay(QWidget):
    def __init__(self, parent=None):
        super().__init__(parent)
        self.setVisible(False)
        self._books = []
        self._sel = 0

    def open(self, books=None):
        self._books = list(books or [])
        self._sel = 0
        self.setVisible(True)

    def close(self):
        self.setVisible(False)
