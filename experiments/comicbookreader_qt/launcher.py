import argparse
import os
import sys

from PySide6.QtWidgets import QApplication, QFileDialog

from comic_reader_widget import ComicReaderWidget


class ReaderWindow(ComicReaderWidget):
    """Top-level reader window. Prompts a file dialog when no book is open."""

    def __init__(self, parent=None):
        super().__init__(parent)
        self.setWindowTitle("Qt Comic Reader")
        self.book_closed.connect(self._prompt_open)

    def _prompt_open(self):
        """Show a native file dialog to pick an archive."""
        start_dir = ""
        if self.state.book_path:
            start_dir = os.path.dirname(os.path.abspath(self.state.book_path))
        path, _ = QFileDialog.getOpenFileName(
            self,
            "Open Comic Archive",
            start_dir,
            "Comic Archives (*.cbz *.cbr *.zip *.rar);;All Files (*.*)",
        )
        if path:
            self.open_book(os.path.abspath(path))
        else:
            self.close()


def main():
    parser = argparse.ArgumentParser(description="Standalone Qt comic reader.")
    parser.add_argument("path", nargs="?", help="Path to a .cbz/.cbr/.zip/.rar archive")
    args = parser.parse_args()

    app = QApplication(sys.argv)

    window = ReaderWindow()
    window.resize(1200, 800)
    window.show()
    window.activateWindow()
    window.raise_()

    if args.path and os.path.isfile(args.path):
        window.open_book(os.path.abspath(args.path))
    else:
        window._prompt_open()

    return app.exec()


if __name__ == "__main__":
    raise SystemExit(main())
