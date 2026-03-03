import argparse
import os
import sys

from PySide6.QtWidgets import QApplication, QFileDialog

from comic_reader_widget import ComicReaderWidget


def _pick_book_path():
    file_path, _ = QFileDialog.getOpenFileName(
        None,
        "Open Comic Archive",
        "",
        "Comic Archives (*.cbz *.cbr *.zip *.rar);;All Files (*.*)",
    )
    return file_path


def main():
    parser = argparse.ArgumentParser(description="Standalone Qt comic reader launcher.")
    parser.add_argument("path", nargs="?", help="Optional path to a .cbz/.cbr/.zip/.rar archive")
    args = parser.parse_args()

    app = QApplication(sys.argv)

    widget = ComicReaderWidget()
    widget.resize(1200, 800)
    widget.show()
    widget.activateWindow()
    widget.raise_()

    open_path = args.path
    if open_path:
        open_path = os.path.abspath(open_path)
    else:
        open_path = _pick_book_path()

    if open_path:
        widget.open_book(open_path)

    return app.exec()


if __name__ == "__main__":
    raise SystemExit(main())
