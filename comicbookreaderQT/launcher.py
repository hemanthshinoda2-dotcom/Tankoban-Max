import argparse
import os
import sys

from PySide6.QtWidgets import QApplication, QStackedWidget

from comic_reader_widget import ComicReaderWidget
from path_picker import PathPickerWidget


class ReaderApp(QStackedWidget):
    """Stacked widget: page 0 = path picker, page 1 = comic reader."""

    def __init__(self, comic_root: str = ""):
        super().__init__()
        self.setWindowTitle("Qt Comic Reader")
        self.setStyleSheet("background: #111111;")

        self.picker = PathPickerWidget(self)
        self.reader = ComicReaderWidget(self)

        self.addWidget(self.picker)   # index 0
        self.addWidget(self.reader)   # index 1

        self.picker.file_selected.connect(self._on_file_selected)
        self.reader.book_closed.connect(self._on_book_closed)

        if comic_root and os.path.isdir(comic_root):
            self.picker.set_comic_root(comic_root)

    def _on_file_selected(self, path: str):
        self.setCurrentIndex(1)
        self.reader.open_book(path)
        self.reader.setFocus()

    def _on_book_closed(self):
        self.setCurrentIndex(0)
        self.picker.setFocus()

    def open_file_directly(self, path: str):
        """Open a file without showing the picker first."""
        self.picker.add_recent(path)
        self._on_file_selected(path)


def main():
    parser = argparse.ArgumentParser(description="Standalone Qt comic reader launcher.")
    parser.add_argument("path", nargs="?", help="Optional path to a .cbz/.cbr/.zip/.rar archive")
    parser.add_argument("--root", default="", help="Comics root folder to open in the picker")
    args = parser.parse_args()

    app = QApplication(sys.argv)

    window = ReaderApp(comic_root=args.root)
    window.resize(1200, 800)
    window.show()
    window.activateWindow()
    window.raise_()

    if args.path:
        window.open_file_directly(os.path.abspath(args.path))

    return app.exec()


if __name__ == "__main__":
    raise SystemExit(main())
