"""HUD overlay for the books reader — top bar, bottom bar, auto-hide."""

from __future__ import annotations

from PySide6.QtCore import QObject, Qt, QTimer, Signal
from PySide6.QtGui import QFont
from PySide6.QtWidgets import (
    QFrame,
    QHBoxLayout,
    QLabel,
    QPushButton,
    QVBoxLayout,
    QWidget,
)


class BooksTopBar(QFrame):
    """Top HUD bar with back button and title."""

    back_clicked = Signal()

    def __init__(self, parent: QWidget | None = None):
        super().__init__(parent)
        self.setObjectName("books_top_bar")
        self.setFixedHeight(60)
        self.setStyleSheet("""
            #books_top_bar {
                background: qlineargradient(
                    x1:0, y1:0, x2:0, y2:1,
                    stop:0 rgba(0,0,0,180), stop:1 rgba(0,0,0,0)
                );
                border: none;
            }
        """)

        layout = QHBoxLayout(self)
        layout.setContentsMargins(12, 8, 12, 8)

        self._back_btn = QPushButton("\u2190")
        self._back_btn.setFixedSize(36, 36)
        self._back_btn.setCursor(Qt.CursorShape.PointingHandCursor)
        self._back_btn.setStyleSheet("""
            QPushButton {
                background: rgba(255,255,255,0.15);
                color: white;
                border: none;
                border-radius: 18px;
                font-size: 18px;
            }
            QPushButton:hover { background: rgba(255,255,255,0.3); }
        """)
        self._back_btn.clicked.connect(self.back_clicked)

        title_col = QVBoxLayout()
        title_col.setSpacing(0)
        self._title = QLabel()
        self._title.setStyleSheet("color: white; font-size: 15px; font-weight: bold;")
        self._subtitle = QLabel()
        self._subtitle.setStyleSheet("color: rgba(255,255,255,0.7); font-size: 12px;")
        title_col.addWidget(self._title)
        title_col.addWidget(self._subtitle)

        layout.addWidget(self._back_btn)
        layout.addLayout(title_col, 1)

    def set_title(self, text: str) -> None:
        self._title.setText(text)

    def set_subtitle(self, text: str) -> None:
        self._subtitle.setText(text)
        self._subtitle.setVisible(bool(text))


class BooksBottomBar(QFrame):
    """Bottom HUD bar with navigation arrows and progress."""

    prev_clicked = Signal()
    next_clicked = Signal()
    audiobook_clicked = Signal()

    def __init__(self, parent: QWidget | None = None):
        super().__init__(parent)
        self.setObjectName("books_bottom_bar")
        self.setFixedHeight(48)
        self.setStyleSheet("""
            #books_bottom_bar {
                background: rgba(0,0,0,160);
                border: none;
            }
        """)

        layout = QHBoxLayout(self)
        layout.setContentsMargins(12, 4, 12, 4)

        btn_style = """
            QPushButton {
                background: transparent;
                color: white;
                border: none;
                font-size: 20px;
                padding: 4px 12px;
            }
            QPushButton:hover { background: rgba(255,255,255,0.15); border-radius: 4px; }
        """

        self._prev_btn = QPushButton("\u276E")
        self._prev_btn.setCursor(Qt.CursorShape.PointingHandCursor)
        self._prev_btn.setStyleSheet(btn_style)
        self._prev_btn.clicked.connect(self.prev_clicked)

        self._chapter_label = QLabel()
        self._chapter_label.setStyleSheet("color: rgba(255,255,255,0.8); font-size: 12px;")
        self._chapter_label.setAlignment(Qt.AlignmentFlag.AlignCenter)

        self._pct_label = QLabel("0%")
        self._pct_label.setStyleSheet("color: white; font-size: 13px; font-weight: bold;")
        self._pct_label.setAlignment(Qt.AlignmentFlag.AlignCenter)

        self._next_btn = QPushButton("\u276F")
        self._next_btn.setCursor(Qt.CursorShape.PointingHandCursor)
        self._next_btn.setStyleSheet(btn_style)
        self._next_btn.clicked.connect(self.next_clicked)

        # Headphones button for paired audiobook
        self._audiobook_btn = QPushButton("\U0001F3A7")
        self._audiobook_btn.setCursor(Qt.CursorShape.PointingHandCursor)
        self._audiobook_btn.setToolTip("Play paired audiobook")
        self._audiobook_btn.setStyleSheet(btn_style)
        self._audiobook_btn.clicked.connect(self.audiobook_clicked)
        self._audiobook_btn.hide()

        layout.addWidget(self._prev_btn)
        layout.addWidget(self._chapter_label, 1)
        layout.addWidget(self._pct_label)
        layout.addWidget(self._audiobook_btn)
        layout.addWidget(self._next_btn)

    def set_chapter(self, text: str) -> None:
        self._chapter_label.setText(text)

    def set_progress(self, fraction: float) -> None:
        pct = int(fraction * 100)
        self._pct_label.setText(f"{pct}%")

    def show_audiobook_button(self, visible: bool) -> None:
        self._audiobook_btn.setVisible(visible)


class TtsTransportBar(QFrame):
    """Floating transport bar shown during TTS playback."""

    play_pause = Signal()
    skip_back = Signal()
    skip_forward = Signal()
    speed_changed = Signal(float)
    stop = Signal()

    def __init__(self, parent: QWidget | None = None):
        super().__init__(parent)
        self.setObjectName("tts_transport_bar")
        self.setFixedHeight(48)
        self.setStyleSheet("""
            #tts_transport_bar {
                background: rgba(0,0,0,200);
                border-radius: 8px;
                border: none;
            }
        """)

        layout = QHBoxLayout(self)
        layout.setContentsMargins(8, 4, 8, 4)
        layout.setSpacing(4)

        btn_style = """
            QPushButton {
                background: transparent;
                color: white;
                border: none;
                font-size: 16px;
                padding: 4px 8px;
                min-width: 28px;
            }
            QPushButton:hover { background: rgba(255,255,255,0.15); border-radius: 4px; }
        """

        self._play_btn = QPushButton("\u25B6")
        self._play_btn.setCursor(Qt.CursorShape.PointingHandCursor)
        self._play_btn.setStyleSheet(btn_style)
        self._play_btn.clicked.connect(self.play_pause)

        self._prev_btn = QPushButton("\u23EE")
        self._prev_btn.setCursor(Qt.CursorShape.PointingHandCursor)
        self._prev_btn.setStyleSheet(btn_style)
        self._prev_btn.clicked.connect(self.skip_back)

        self._progress_label = QLabel("0 / 0")
        self._progress_label.setStyleSheet("color: rgba(255,255,255,0.8); font-size: 12px;")
        self._progress_label.setAlignment(Qt.AlignmentFlag.AlignCenter)
        self._progress_label.setMinimumWidth(60)

        self._next_btn = QPushButton("\u23ED")
        self._next_btn.setCursor(Qt.CursorShape.PointingHandCursor)
        self._next_btn.setStyleSheet(btn_style)
        self._next_btn.clicked.connect(self.skip_forward)

        self._speed_btn = QPushButton("1.0\u00D7")
        self._speed_btn.setCursor(Qt.CursorShape.PointingHandCursor)
        self._speed_btn.setStyleSheet(btn_style)
        self._speed_btn.clicked.connect(self._cycle_speed)

        self._stop_btn = QPushButton("\u2715")
        self._stop_btn.setCursor(Qt.CursorShape.PointingHandCursor)
        self._stop_btn.setStyleSheet(btn_style)
        self._stop_btn.clicked.connect(self.stop)

        layout.addWidget(self._play_btn)
        layout.addWidget(self._prev_btn)
        layout.addWidget(self._progress_label, 1)
        layout.addWidget(self._next_btn)
        layout.addWidget(self._speed_btn)
        layout.addWidget(self._stop_btn)

        self._rate = 1.0
        self._speed_steps = [0.7, 0.9, 1.0, 1.2, 1.4, 1.8]
        self._speed_idx = 2  # 1.0x

    def set_playing(self, playing: bool) -> None:
        self._play_btn.setText("\u23F8" if playing else "\u25B6")

    def set_progress(self, current: int, total: int) -> None:
        self._progress_label.setText(f"{current + 1} / {total}")

    def set_rate(self, rate: float) -> None:
        self._rate = rate
        self._speed_btn.setText(f"{rate:.1f}\u00D7")
        # Find closest index
        diffs = [abs(s - rate) for s in self._speed_steps]
        self._speed_idx = diffs.index(min(diffs))

    def _cycle_speed(self) -> None:
        self._speed_idx = (self._speed_idx + 1) % len(self._speed_steps)
        self._rate = self._speed_steps[self._speed_idx]
        self._speed_btn.setText(f"{self._rate:.1f}\u00D7")
        self.speed_changed.emit(self._rate)


class BooksHudController(QObject):
    """Manages show/hide of the top and bottom HUD bars."""

    def __init__(self, top_bar: BooksTopBar, bottom_bar: BooksBottomBar, parent=None):
        super().__init__(parent)
        self._top = top_bar
        self._bottom = bottom_bar
        self._visible = False
        self._tts_active = False

        self._hide_timer = QTimer(self)
        self._hide_timer.setSingleShot(True)
        self._hide_timer.setInterval(3000)
        self._hide_timer.timeout.connect(self.hide)

        self.hide()

    def toggle(self) -> None:
        if self._visible:
            self.hide()
        else:
            self.show()

    def show(self) -> None:
        self._visible = True
        self._top.show()
        self._bottom.show()
        if not self._tts_active:
            self._hide_timer.start()

    def hide(self) -> None:
        if self._tts_active:
            # During TTS, only hide top bar; bottom stays visible
            self._top.hide()
            return
        self._visible = False
        self._top.hide()
        self._bottom.hide()
        self._hide_timer.stop()

    @property
    def is_visible(self) -> bool:
        return self._visible

    def set_tts_active(self, active: bool) -> None:
        """When TTS is active, keep bottom bar visible and disable auto-hide."""
        self._tts_active = active
        if active:
            self._hide_timer.stop()
            self._bottom.show()
        else:
            self._visible = False
            self._bottom.hide()

    def reset_timer(self) -> None:
        if self._visible and not self._tts_active:
            self._hide_timer.start()

    def update_info(self, title: str, chapter_label: str, fraction: float) -> None:
        self._top.set_title(title)
        self._top.set_subtitle(chapter_label)
        self._bottom.set_chapter(chapter_label)
        self._bottom.set_progress(fraction)
