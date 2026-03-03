from PySide6.QtWidgets import QWidget


class MegaSettingsOverlay(QWidget):
    def __init__(self, parent=None):
        super().__init__(parent)
        self.setVisible(False)

    def open(self):
        self.setVisible(True)

    def close(self):
        self.setVisible(False)
