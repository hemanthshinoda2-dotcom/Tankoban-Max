"""
Chrome-style permission prompt bar.

Shows an inline bar below the nav bar when a site requests a permission
(camera, microphone, geolocation, etc.). The user can Allow or Block.
"""

from __future__ import annotations

from PySide6.QtCore import Qt, Signal
from PySide6.QtGui import QFont
from PySide6.QtWidgets import (
    QWidget, QHBoxLayout, QLabel, QPushButton, QCheckBox,
)
from PySide6.QtWebEngineCore import QWebEnginePage

from . import theme

# Human-readable names for permissions
_PERMISSION_NAMES = {
    QWebEnginePage.Feature.Geolocation: "your location",
    QWebEnginePage.Feature.MediaAudioCapture: "your microphone",
    QWebEnginePage.Feature.MediaVideoCapture: "your camera",
    QWebEnginePage.Feature.MediaAudioVideoCapture: "your camera and microphone",
    QWebEnginePage.Feature.DesktopVideoCapture: "to share your screen",
    QWebEnginePage.Feature.DesktopAudioVideoCapture: "to share your screen and audio",
    QWebEnginePage.Feature.Notifications: "to send notifications",
}

_PERMISSION_ICONS = {
    QWebEnginePage.Feature.Geolocation: "\U0001f4cd",  # 📍
    QWebEnginePage.Feature.MediaAudioCapture: "\U0001f3a4",  # 🎤
    QWebEnginePage.Feature.MediaVideoCapture: "\U0001f4f7",  # 📷
    QWebEnginePage.Feature.MediaAudioVideoCapture: "\U0001f4f7",  # 📷
    QWebEnginePage.Feature.DesktopVideoCapture: "\U0001f5b5",  # 🖵
    QWebEnginePage.Feature.DesktopAudioVideoCapture: "\U0001f5b5",  # 🖵
    QWebEnginePage.Feature.Notifications: "\U0001f514",  # 🔔
}


class PermissionBar(QWidget):
    """
    Inline bar that appears when a site requests a permission.

    Signals:
        permission_decided(QUrl, Feature, bool, bool):
            origin, feature, granted, remember
    """

    permission_decided = Signal(object, object, bool, bool)  # origin, feature, granted, remember

    def __init__(self, parent=None):
        super().__init__(parent)
        self.setFixedHeight(36)
        self.setStyleSheet(f"""
            QWidget {{
                background: {theme.BG_TOOLBAR};
                border-bottom: 1px solid {theme.BORDER_COLOR};
            }}
        """)
        self.setVisible(False)

        self._origin = None
        self._feature = None

        layout = QHBoxLayout(self)
        layout.setContentsMargins(12, 4, 12, 4)
        layout.setSpacing(8)

        self._icon_label = QLabel()
        self._icon_label.setFont(QFont("Segoe UI", 14))
        layout.addWidget(self._icon_label)

        self._text_label = QLabel()
        self._text_label.setStyleSheet(f"color: {theme.TEXT_PRIMARY}; font-size: 13px; font-family: 'Segoe UI';")
        layout.addWidget(self._text_label, 1)

        self._remember_chk = QCheckBox("Remember this decision")
        self._remember_chk.setChecked(True)
        self._remember_chk.setStyleSheet(f"""
            QCheckBox {{
                color: {theme.TEXT_SECONDARY};
                font-size: 12px;
                font-family: 'Segoe UI';
            }}
            QCheckBox::indicator {{
                width: 14px;
                height: 14px;
                border: 1px solid {theme.BORDER_COLOR};
                border-radius: 3px;
                background: rgba(255,255,255,0.03);
            }}
            QCheckBox::indicator:checked {{
                background: {theme.ACCENT};
                border-color: {theme.ACCENT};
            }}
        """)
        layout.addWidget(self._remember_chk)

        self._allow_btn = QPushButton("Allow")
        self._allow_btn.setStyleSheet(f"""
            QPushButton {{
                background: {theme.ACCENT};
                color: #202124;
                border: none;
                border-radius: 4px;
                padding: 4px 16px;
                font-size: 12px;
                font-weight: 600;
                font-family: 'Segoe UI';
            }}
            QPushButton:hover {{ background: {theme.ACCENT_HOVER}; }}
        """)
        self._allow_btn.setCursor(Qt.CursorShape.PointingHandCursor)
        self._allow_btn.clicked.connect(lambda: self._decide(True))
        layout.addWidget(self._allow_btn)

        self._block_btn = QPushButton("Block")
        self._block_btn.setStyleSheet(f"""
            QPushButton {{
                background: transparent;
                color: {theme.TEXT_PRIMARY};
                border: 1px solid {theme.BORDER_COLOR};
                border-radius: 4px;
                padding: 4px 16px;
                font-size: 12px;
                font-family: 'Segoe UI';
            }}
            QPushButton:hover {{ background: rgba(255,255,255,0.08); }}
        """)
        self._block_btn.setCursor(Qt.CursorShape.PointingHandCursor)
        self._block_btn.clicked.connect(lambda: self._decide(False))
        layout.addWidget(self._block_btn)

        self._close_btn = QPushButton("\u2715")
        self._close_btn.setFixedSize(24, 24)
        self._close_btn.setStyleSheet(f"""
            QPushButton {{
                background: transparent;
                color: {theme.TEXT_SECONDARY};
                border: none;
                border-radius: 12px;
                font-size: 12px;
            }}
            QPushButton:hover {{ background: rgba(255,255,255,0.08); color: {theme.TEXT_PRIMARY}; }}
        """)
        self._close_btn.setCursor(Qt.CursorShape.PointingHandCursor)
        self._close_btn.clicked.connect(lambda: self._decide(False))
        layout.addWidget(self._close_btn)

    def show_permission(self, origin, feature):
        """Show the permission bar for a given origin and feature."""
        self._origin = origin
        self._feature = feature
        self._remember_chk.setChecked(True)

        host = origin.host() if hasattr(origin, 'host') else str(origin)
        perm_name = _PERMISSION_NAMES.get(feature, "a permission")
        icon = _PERMISSION_ICONS.get(feature, "\u26a0")

        self._icon_label.setText(icon)
        self._text_label.setText(f"{host} wants to use {perm_name}")
        self.setVisible(True)

    def _decide(self, granted: bool):
        if self._origin and self._feature is not None:
            self.permission_decided.emit(
                self._origin,
                self._feature,
                granted,
                bool(self._remember_chk.isChecked()),
            )
        self._origin = None
        self._feature = None
        self.setVisible(False)
