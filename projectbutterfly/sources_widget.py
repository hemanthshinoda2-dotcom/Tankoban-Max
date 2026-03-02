"""
Project Butterfly — Sources Widget

Embeds qBittorrent's Web UI directly inside the app.
Detects the user's running qBittorrent instance and loads its Web UI
in a QWebEngineView. No custom HTML, no bridge wiring needed.
"""

import threading

from PySide6.QtCore import Qt, QUrl, Signal
from PySide6.QtWidgets import QWidget, QVBoxLayout, QLabel
from PySide6.QtWebEngineWidgets import QWebEngineView
from PySide6.QtWebEngineCore import QWebEngineSettings

import torrent_service


class SourcesWidget(QWidget):
    """
    Sources mode panel — embeds qBittorrent Web UI.

    On creation, detects qBittorrent on common ports (8080, 8081, 9090).
    If found, loads the Web UI. If not, shows a placeholder message.
    """

    qbit_detected = Signal(int)
    qbit_not_found = Signal()

    def __init__(self, parent=None):
        super().__init__(parent)

        layout = QVBoxLayout(self)
        layout.setContentsMargins(0, 0, 0, 0)
        layout.setSpacing(0)

        # Placeholder label (shown while detecting / if not found)
        self._placeholder = QLabel()
        self._placeholder.setAlignment(Qt.AlignmentFlag.AlignCenter)
        self._placeholder.setStyleSheet("""
            QLabel {
                color: rgba(255,255,255,0.5);
                font-size: 15px;
                font-family: 'Segoe UI', sans-serif;
                padding: 40px;
                background: transparent;
            }
        """)
        self._placeholder.setText("Detecting qBittorrent...")
        layout.addWidget(self._placeholder)

        # Web view (hidden until qBit is found)
        self._view = QWebEngineView()
        self._view.setVisible(False)

        s = self._view.settings()
        s.setAttribute(QWebEngineSettings.WebAttribute.JavascriptEnabled, True)
        s.setAttribute(QWebEngineSettings.WebAttribute.LocalStorageEnabled, True)

        layout.addWidget(self._view)

        # Signals
        self.qbit_detected.connect(self._on_qbit_found)
        self.qbit_not_found.connect(self._on_qbit_missing)

        # Detect in background
        self._qbit_port = None
        self._detect()

    def _detect(self):
        """Detect qBittorrent WebUI in a background thread."""
        def _worker():
            port = torrent_service._detect_running_qbit()
            if port:
                self.qbit_detected.emit(port)
            else:
                self.qbit_not_found.emit()

        threading.Thread(target=_worker, daemon=True).start()

    def _on_qbit_found(self, port: int):
        """qBittorrent detected — load its Web UI."""
        self._qbit_port = port
        self._placeholder.setVisible(False)
        self._view.setVisible(True)
        self._view.load(QUrl(f"http://127.0.0.1:{port}"))
        print(f"[sources] qBittorrent Web UI loaded at port {port}")

    def _on_qbit_missing(self):
        """qBittorrent not found — show instructions."""
        self._placeholder.setText(
            "qBittorrent not detected.\n\n"
            "Start qBittorrent with Web UI enabled:\n"
            "Options \u2192 Web UI \u2192 Enable Web User Interface\n\n"
            "Default port: 8080"
        )
        print("[sources] qBittorrent not detected")

    def retry_detect(self):
        """Re-scan for qBittorrent (called if user starts it later)."""
        self._placeholder.setText("Detecting qBittorrent...")
        self._placeholder.setVisible(True)
        self._view.setVisible(False)
        self._detect()
