"""
TankoWeb Widget — Qt-native Web mode panel.

A pure-Qt widget that sits at stack index 2 in the QStackedWidget.
Provides its own top bar (back button, title, window controls) since
the HTML topbar is hidden when this widget is active.

Slice 1: Empty scaffold — dark panel with top bar only.
"""

from PySide6.QtCore import Qt
from PySide6.QtWidgets import (
    QWidget, QVBoxLayout, QHBoxLayout, QPushButton, QLabel, QSizePolicy,
)

# ---------------------------------------------------------------------------
# Theme constants (reused across all slices)
# ---------------------------------------------------------------------------

BG = "#0a0e14"
SURFACE = "#141820"
ACCENT = "#5ee7ff"
TEXT = "#e8eaed"
TEXT_DIM = "#8b949e"
BORDER = "#1e2530"
SURFACE_RAISED = "#1a2030"


class TankoWebWidget(QWidget):
    """
    Qt-native Web mode panel.

    Parameters
    ----------
    on_back : callable
        Called when the user clicks "← Library" to return to the renderer.
    on_window_action : callable(str)
        Called with "minimize", "maximize", or "close" for frameless window controls.
    """

    def __init__(self, on_back=None, on_window_action=None, parent=None):
        super().__init__(parent)
        self._on_back = on_back
        self._on_window_action = on_window_action

        self.setStyleSheet(f"background-color: {BG};")

        root = QVBoxLayout(self)
        root.setContentsMargins(0, 0, 0, 0)
        root.setSpacing(0)

        # --- Top bar ---
        root.addWidget(self._build_top_bar())

        # --- Content area (empty for Slice 1) ---
        content = QWidget()
        content.setStyleSheet(f"background-color: {BG};")
        content.setSizePolicy(QSizePolicy.Policy.Expanding, QSizePolicy.Policy.Expanding)
        root.addWidget(content)

    # ------------------------------------------------------------------
    # Top bar
    # ------------------------------------------------------------------

    def _build_top_bar(self):
        bar = QWidget()
        bar.setFixedHeight(38)
        bar.setStyleSheet(
            f"background-color: {SURFACE}; border-bottom: 1px solid {BORDER};"
        )

        layout = QHBoxLayout(bar)
        layout.setContentsMargins(8, 0, 8, 0)
        layout.setSpacing(8)

        # Back button
        back_btn = QPushButton("← Library")
        back_btn.setCursor(Qt.CursorShape.PointingHandCursor)
        back_btn.setStyleSheet(self._btn_style())
        back_btn.clicked.connect(self._go_back)
        layout.addWidget(back_btn)

        # Title
        title = QLabel("Web")
        title.setStyleSheet(
            f"color: {TEXT}; font-size: 14px; font-weight: 600; padding: 0 8px;"
        )
        layout.addWidget(title)

        layout.addStretch()

        # Window controls (frameless window — need our own)
        for label, action in [("—", "minimize"), ("☐", "maximize"), ("✕", "close")]:
            btn = QPushButton(label)
            btn.setFixedSize(36, 28)
            btn.setCursor(Qt.CursorShape.PointingHandCursor)
            btn.setStyleSheet(self._window_btn_style(action))
            btn.clicked.connect(lambda checked=False, a=action: self._window_action(a))
            layout.addWidget(btn)

        return bar

    # ------------------------------------------------------------------
    # Actions
    # ------------------------------------------------------------------

    def _go_back(self):
        if self._on_back:
            self._on_back()

    def _window_action(self, action):
        if self._on_window_action:
            self._on_window_action(action)

    # ------------------------------------------------------------------
    # Styles
    # ------------------------------------------------------------------

    @staticmethod
    def _btn_style():
        return (
            f"QPushButton {{"
            f"  color: {ACCENT}; background: transparent; border: none;"
            f"  font-size: 13px; padding: 4px 10px;"
            f"}}"
            f"QPushButton:hover {{ background: {SURFACE_RAISED}; border-radius: 4px; }}"
        )

    @staticmethod
    def _window_btn_style(action=""):
        hover_bg = "#e81123" if action == "close" else SURFACE_RAISED
        return (
            f"QPushButton {{"
            f"  color: {TEXT_DIM}; background: transparent; border: none;"
            f"  font-size: 14px;"
            f"}}"
            f"QPushButton:hover {{ color: {TEXT}; background: {hover_bg}; }}"
        )
