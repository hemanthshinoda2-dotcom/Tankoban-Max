"""
Standalone launcher for the Comic Book Replacer reader.

Usage:
    python launcher.py [path_to_cbz]

If no path is given, a native file dialog opens.
"""

import sys
import os

# Add this directory to sys.path so local imports work
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from PySide6.QtWidgets import QApplication, QFileDialog
from PySide6.QtCore import Qt

from reader_widget import ReaderWidget


def main():
    app = QApplication(sys.argv)

    # Dark window background
    app.setStyle("Fusion")

    # Determine file to open
    file_path = None
    for arg in sys.argv[1:]:
        if os.path.isfile(arg) and arg.lower().endswith((".cbz", ".zip")):
            file_path = arg
            break

    if file_path is None:
        file_path, _ = QFileDialog.getOpenFileName(
            None,
            "Open Comic Archive",
            "",
            "Comic Archives (*.cbz *.zip);;All Files (*)",
        )

    if not file_path:
        print("No file selected. Exiting.")
        sys.exit(0)

    # Create reader window
    reader = ReaderWidget()
    reader.setWindowTitle("Comic Book Replacer")
    reader.resize(1200, 900)
    reader.setMinimumSize(640, 480)
    reader.show()

    # Open the comic
    reader.open_volume(file_path)

    sys.exit(app.exec())


if __name__ == "__main__":
    main()
