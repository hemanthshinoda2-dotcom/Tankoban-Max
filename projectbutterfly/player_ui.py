"""
Butterfly Embedded Video Player UI — Qt overlay widgets.

Ported from player_qt/run_player.py (PySide6 → PySide6, same process).
All controls are native Qt widgets rendered as a transparent overlay on top
of the mpv render surface inside the QStackedWidget.

Architecture (matches run_player.py — NO full-covering overlay widget):
    MpvContainer (QWidget — handles mouse/keyboard, owns all controls)
    ├── render_host (QWidget — native HWND, mpv renders here via wid)
    ├── TopStrip (title + minimize/fullscreen/close, raised above render_host)
    ├── BottomHUD (transport, scrubber, chips, raised above render_host)
    ├── VolumeHUD (floating volume indicator)
    ├── CenterFlash (play/pause/seek icon flash)
    ├── ToastHUD (stacking notifications)
    ├── TracksDrawer (audio/subtitle selection + delays)
    └── PlaylistDrawer (episode list)
"""

import os
import json
import time

from PySide6.QtCore import (
    Qt, Signal, QTimer, QPoint, QRect, QPropertyAnimation,
    QEasingCurve, QEvent, QSize,
)
from PySide6.QtWidgets import (
    QWidget, QVBoxLayout, QHBoxLayout, QLabel, QPushButton,
    QSlider, QSizePolicy, QGraphicsOpacityEffect, QStyle,
    QStyleOptionSlider, QFrame, QListWidget, QListWidgetItem,
    QScrollArea, QDoubleSpinBox, QInputDialog, QApplication,
)
from PySide6.QtGui import QPainter, QPen, QColor, QCursor


# ════════════════════════════════════════════════════════════════════════
# Helpers
# ════════════════════════════════════════════════════════════════════════

def _fmt_time(seconds):
    if seconds is None:
        return "--:--"
    try:
        s = int(max(0, seconds))
    except Exception:
        return "--:--"
    h = s // 3600
    m = (s % 3600) // 60
    sec = s % 60
    if h > 0:
        return f"{h:d}:{m:02d}:{sec:02d}"
    return f"{m:d}:{sec:02d}"


# ════════════════════════════════════════════════════════════════════════
# SeekSlider
# ════════════════════════════════════════════════════════════════════════

class SeekSlider(QSlider):
    """Scrubber with hover time bubble and chapter tick marks."""

    seek_fraction_requested = Signal(float)

    def __init__(self, orientation, parent=None):
        super().__init__(orientation, parent)
        self._duration = None
        self._chapters = []
        self._dragging = False

        self._bubble = QLabel(self)
        self._bubble.setStyleSheet("""
            QLabel {
                background: rgba(12, 12, 12, 0.78);
                color: white;
                border: 1px solid rgba(255, 255, 255, 0.12);
                border-radius: 10px;
                padding: 4px 8px;
                font-size: 11px;
            }
        """)
        self._bubble.hide()
        self.setMouseTracking(True)

    def set_duration(self, dur):
        try:
            self._duration = float(dur) if dur is not None else None
        except Exception:
            self._duration = None

    def set_chapters(self, chapters):
        try:
            self._chapters = [float(t) for t in (chapters or []) if float(t) >= 0]
        except Exception:
            self._chapters = []
        self.update()

    def _groove_rect(self):
        opt = QStyleOptionSlider()
        self.initStyleOption(opt)
        return self.style().subControlRect(QStyle.CC_Slider, opt, QStyle.SC_SliderGroove, self)

    def _value_for_x(self, x):
        lo, hi = self.minimum(), self.maximum()
        groove = self._groove_rect()
        if hi <= lo:
            return lo
        if groove.width() <= 1:
            return QStyle.sliderValueFromPosition(lo, hi, x, max(1, self.width()))
        gx = max(0, min(groove.width(), int(x - groove.left())))
        return QStyle.sliderValueFromPosition(lo, hi, gx, groove.width())

    def _fraction_for_value(self, val):
        try:
            lo, hi = self.minimum(), self.maximum()
            if hi <= lo:
                return 0.0
            return max(0.0, min(1.0, (float(val) - lo) / (hi - lo)))
        except Exception:
            return 0.0

    def _show_bubble(self, x):
        try:
            if not self._duration or self._duration <= 0:
                self._bubble.hide()
                return
            val = self._value_for_x(x)
            frac = self._fraction_for_value(val)
            t = frac * self._duration
            self._bubble.setText(_fmt_time(t))
            self._bubble.adjustSize()
            bx = max(0, min(self.width() - self._bubble.width(), int(x - self._bubble.width() / 2)))
            by = -self._bubble.height() - 10
            self._bubble.move(bx, by)
            self._bubble.show()
        except Exception:
            self._bubble.hide()

    def _seek_from_x(self, x):
        val = self._value_for_x(x)
        self.setValue(val)
        try:
            self.seek_fraction_requested.emit(self._fraction_for_value(val))
        except Exception:
            pass

    def paintEvent(self, event):
        super().paintEvent(event)
        try:
            if not self._duration or self._duration <= 0 or not self._chapters:
                return
            groove = self._groove_rect()
            if groove.width() <= 2:
                return
            p = QPainter(self)
            p.setRenderHint(QPainter.RenderHint.Antialiasing, False)
            p.setPen(QPen(QColor(255, 255, 255, 140), 1))
            y0 = groove.center().y()
            for t in self._chapters:
                frac = t / self._duration
                if frac <= 0.0 or frac >= 1.0:
                    continue
                x = int(groove.left() + frac * groove.width())
                p.drawLine(x, y0 - 4, x, y0 + 4)
            p.end()
        except Exception:
            pass

    def mousePressEvent(self, event):
        if event.button() == Qt.MouseButton.LeftButton:
            self._dragging = True
            self.setSliderDown(True)
            x = event.position().toPoint().x()
            self._seek_from_x(x)
            self._show_bubble(x)
            event.accept()
            return
        super().mousePressEvent(event)

    def mouseMoveEvent(self, event):
        x = event.position().toPoint().x()
        if self._dragging and (event.buttons() & Qt.MouseButton.LeftButton):
            self._seek_from_x(x)
            self._show_bubble(x)
            event.accept()
            return
        self._show_bubble(x)
        super().mouseMoveEvent(event)

    def mouseReleaseEvent(self, event):
        if event.button() == Qt.MouseButton.LeftButton and self._dragging:
            self._dragging = False
            self.setSliderDown(False)
            self._seek_from_x(event.position().toPoint().x())
            event.accept()
            return
        super().mouseReleaseEvent(event)

    def leaveEvent(self, event):
        if not self._dragging:
            self._bubble.hide()
        super().leaveEvent(event)


# ════════════════════════════════════════════════════════════════════════
# ChipButton
# ════════════════════════════════════════════════════════════════════════

class ChipButton(QPushButton):
    """Lightweight chip-style button for the HUD bar."""

    def __init__(self, text, parent=None):
        super().__init__(text, parent)
        self.setStyleSheet("""
            QPushButton {
                background: qlineargradient(x1:0, y1:0, x2:0, y2:1,
                    stop:0 rgba(70, 70, 70, 0.95),
                    stop:0.45 rgba(48, 48, 48, 0.98),
                    stop:1 rgba(28, 28, 28, 0.98));
                border: 1px solid rgba(0, 0, 0, 0.75);
                border-top-color: rgba(120, 120, 120, 0.7);
                border-bottom-color: rgba(0, 0, 0, 0.85);
                border-radius: 3px;
                padding: 4px 10px;
                color: rgba(245, 245, 245, 0.98);
                font-size: 12px;
                font-weight: 600;
            }
            QPushButton:hover {
                background: qlineargradient(x1:0, y1:0, x2:0, y2:1,
                    stop:0 rgba(92, 92, 92, 0.98),
                    stop:0.5 rgba(58, 58, 58, 0.98),
                    stop:1 rgba(32, 32, 32, 0.98));
            }
            QPushButton:pressed {
                background: qlineargradient(x1:0, y1:0, x2:0, y2:1,
                    stop:0 rgba(24, 24, 24, 0.98),
                    stop:0.6 rgba(46, 46, 46, 0.98),
                    stop:1 rgba(72, 72, 72, 0.98));
            }
        """)
        self.setCursor(Qt.CursorShape.PointingHandCursor)


# ════════════════════════════════════════════════════════════════════════
# VolumeHUD
# ════════════════════════════════════════════════════════════════════════

class VolumeHUD(QWidget):
    """Animated volume indicator overlay."""

    def __init__(self, parent):
        super().__init__(parent)
        self.setAttribute(Qt.WidgetAttribute.WA_TransparentForMouseEvents, True)
        self.setAttribute(Qt.WidgetAttribute.WA_TranslucentBackground, True)

        layout = QHBoxLayout(self)
        layout.setContentsMargins(14, 10, 14, 10)
        layout.setSpacing(10)

        self.symbol_label = QLabel("\u25d5")
        self.symbol_label.setStyleSheet(
            "font-size: 18px; color: rgba(255,255,255,0.95);"
        )
        layout.addWidget(self.symbol_label)

        self.bar_container = QWidget()
        self.bar_container.setFixedSize(140, 10)
        self.bar_container.setStyleSheet(
            "background: rgba(0,0,0,0.35); border: 1px solid rgba(255,255,255,0.35);"
        )
        self.bar = QWidget(self.bar_container)
        self.bar.setStyleSheet("background: rgba(255,255,255,0.9);")
        layout.addWidget(self.bar_container)

        self.percent_label = QLabel("100%")
        self.percent_label.setStyleSheet(
            "font-size: 13px; font-weight: bold; color: rgba(255,255,255,0.95);"
        )
        layout.addWidget(self.percent_label)

        self.setStyleSheet("""
            QWidget {
                background: rgba(0, 0, 0, 0.68);
                border-radius: 4px;
                border: 2px solid rgba(255, 255, 255, 0.35);
            }
        """)

        self.opacity_effect = QGraphicsOpacityEffect(self)
        self.setGraphicsEffect(self.opacity_effect)
        self.opacity_effect.setOpacity(0.0)

        self.fade_anim = QPropertyAnimation(self.opacity_effect, b"opacity")
        self.fade_anim.setEasingCurve(QEasingCurve.Type.InOutQuad)

        self.hide_timer = QTimer(self)
        self.hide_timer.setSingleShot(True)
        self.hide_timer.timeout.connect(self._fade_out)
        self.hide()

    def show_volume(self, volume):
        volume = max(0, min(100, volume))
        self.percent_label.setText(f"{volume}%")
        self.bar.setGeometry(0, 0, int(140 * volume / 100), 10)

        if volume == 0:
            self.symbol_label.setText("\u2298")
        elif volume < 33:
            self.symbol_label.setText("\u25d4")
        elif volume < 66:
            self.symbol_label.setText("\u25d1")
        else:
            self.symbol_label.setText("\u25d5")

        parent = self.parent()
        if parent:
            self.adjustSize()
            self.move((parent.width() - self.width()) // 2, parent.height() // 3)

        self.show()
        self.raise_()
        self.fade_anim.stop()
        self.fade_anim.setDuration(150)
        self.fade_anim.setStartValue(self.opacity_effect.opacity())
        self.fade_anim.setEndValue(1.0)
        self.fade_anim.start()
        self.hide_timer.stop()
        self.hide_timer.start(1000)

    def _fade_out(self):
        self.fade_anim.stop()
        self.fade_anim.setDuration(200)
        self.fade_anim.setStartValue(self.opacity_effect.opacity())
        self.fade_anim.setEndValue(0.0)
        self.fade_anim.finished.connect(self.hide)
        self.fade_anim.start()


# ════════════════════════════════════════════════════════════════════════
# CenterFlash
# ════════════════════════════════════════════════════════════════════════

class CenterFlash(QWidget):
    """Large icon flash in the center (play/pause/seek feedback)."""

    def __init__(self, parent):
        super().__init__(parent)
        self.setAttribute(Qt.WidgetAttribute.WA_TransparentForMouseEvents, True)
        self.setAttribute(Qt.WidgetAttribute.WA_TranslucentBackground, True)

        self.label = QLabel("\u25b6", self)
        self.label.setStyleSheet("""
            font-size: 80px; color: white;
            background: rgba(0, 0, 0, 0.6);
            border-radius: 50px; padding: 20px;
        """)
        self.label.adjustSize()

        self.opacity_effect = QGraphicsOpacityEffect(self)
        self.setGraphicsEffect(self.opacity_effect)
        self.opacity_effect.setOpacity(0.0)

        self.fade_anim = QPropertyAnimation(self.opacity_effect, b"opacity")
        self.fade_anim.setEasingCurve(QEasingCurve.Type.InOutQuad)
        self.hide()

    def flash(self, icon):
        try:
            self.label.setText(icon)
            self.label.adjustSize()
            parent = self.parent()
            if parent:
                self.resize(self.label.size())
                self.move(
                    (parent.width() - self.width()) // 2,
                    (parent.height() - self.height()) // 2,
                )
            self.show()
            self.raise_()
            self.fade_anim.stop()
            self.fade_anim.setDuration(300)
            self.fade_anim.setStartValue(0.0)
            self.fade_anim.setEndValue(1.0)
            self.fade_anim.start()
            QTimer.singleShot(500, self._fade_out)
        except Exception:
            pass

    def _fade_out(self):
        try:
            self.fade_anim.stop()
            self.fade_anim.setDuration(300)
            self.fade_anim.setStartValue(self.opacity_effect.opacity())
            self.fade_anim.setEndValue(0.0)
            self.fade_anim.finished.connect(self.hide)
            self.fade_anim.start()
        except Exception:
            pass


# ════════════════════════════════════════════════════════════════════════
# ToastHUD
# ════════════════════════════════════════════════════════════════════════

class ToastHUD(QWidget):
    """Stacking toast notification overlay."""

    def __init__(self, parent):
        super().__init__(parent)
        self.setAttribute(Qt.WidgetAttribute.WA_TransparentForMouseEvents, True)
        self.setAttribute(Qt.WidgetAttribute.WA_TranslucentBackground, True)
        self._toasts = []
        self.hide()

    def show_toast(self, text, duration_ms=2000):
        try:
            lbl = QLabel(text, self.parent())
            lbl.setStyleSheet("""
                background: rgba(10, 10, 10, 0.82);
                color: rgba(255, 255, 255, 0.95);
                border: 1px solid rgba(255, 255, 255, 0.12);
                border-radius: 8px;
                padding: 8px 16px;
                font-size: 12px;
            """)
            lbl.adjustSize()

            parent = self.parent()
            if parent:
                x = parent.width() - lbl.width() - 20
                y = 60 + len(self._toasts) * 40
                lbl.move(x, y)

            lbl.show()
            lbl.raise_()
            self._toasts.append(lbl)

            def _remove():
                try:
                    if lbl in self._toasts:
                        self._toasts.remove(lbl)
                    lbl.deleteLater()
                except Exception:
                    pass

            QTimer.singleShot(duration_ms, _remove)
        except Exception:
            pass


# ════════════════════════════════════════════════════════════════════════
# TopStrip
# ════════════════════════════════════════════════════════════════════════

class TopStrip(QWidget):
    """Title bar overlay: title + minimize/fullscreen/close."""

    minimize_clicked = Signal()
    fullscreen_clicked = Signal()
    close_clicked = Signal()

    def __init__(self, parent=None):
        super().__init__(parent)
        self.setMouseTracking(True)
        layout = QHBoxLayout(self)
        layout.setContentsMargins(12, 6, 12, 6)
        layout.setSpacing(8)

        self.title_label = QLabel("")
        self.title_label.setStyleSheet(
            "color: rgba(255,255,255,0.92); font-size: 12px; font-weight: 500;"
        )
        self.title_label.setSizePolicy(QSizePolicy.Policy.Expanding, QSizePolicy.Policy.Preferred)
        layout.addWidget(self.title_label)

        layout.addStretch()

        self.minimize_btn = self._make_btn("\u2014", "Minimize")
        self.minimize_btn.clicked.connect(self.minimize_clicked)
        layout.addWidget(self.minimize_btn)

        self.fullscreen_btn = self._make_btn("\u25a2", "Fullscreen")
        self.fullscreen_btn.clicked.connect(self.fullscreen_clicked)
        layout.addWidget(self.fullscreen_btn)

        self.close_btn = self._make_btn("\u2715", "Close")
        self.close_btn.clicked.connect(self.close_clicked)
        layout.addWidget(self.close_btn)

        self.setStyleSheet(
            "background: rgba(12, 12, 12, 0.45);"
            "border-bottom: 1px solid rgba(255, 255, 255, 0.08);"
        )

    def _make_btn(self, label, tooltip):
        btn = QPushButton(label)
        btn.setToolTip(tooltip)
        btn.setCursor(Qt.CursorShape.PointingHandCursor)
        btn.setStyleSheet("""
            QPushButton {
                background: qlineargradient(x1:0, y1:0, x2:0, y2:1,
                    stop:0 rgba(78,78,78,0.98), stop:0.5 rgba(50,50,50,0.98),
                    stop:1 rgba(28,28,28,0.98));
                border: 1px solid rgba(0,0,0,0.75);
                border-top-color: rgba(130,130,130,0.65);
                border-radius: 3px; padding: 2px 6px;
                color: rgba(245,245,245,0.96); font-size: 11px;
                font-weight: 600; min-width: 22px;
            }
            QPushButton:hover {
                background: qlineargradient(x1:0, y1:0, x2:0, y2:1,
                    stop:0 rgba(98,98,98,0.98), stop:0.5 rgba(62,62,62,0.98),
                    stop:1 rgba(34,34,34,0.98));
            }
        """)
        return btn

    def set_title(self, title):
        self.title_label.setText(title)


# ════════════════════════════════════════════════════════════════════════
# BottomHUD
# ════════════════════════════════════════════════════════════════════════

class BottomHUD(QWidget):
    """PotPlayer-style bottom HUD with transport, scrubber, and chip buttons."""

    # Transport
    prev_clicked = Signal()
    play_pause_clicked = Signal()
    next_clicked = Signal()
    seek_requested = Signal(float)       # fraction 0-1
    seek_step_requested = Signal(float)  # relative seconds

    # Actions
    back_clicked = Signal()
    tracks_clicked = Signal()
    speed_clicked = Signal()
    playlist_clicked = Signal()
    audio_track_clicked = Signal()
    subtitle_track_clicked = Signal()
    aspect_clicked = Signal()
    fullscreen_clicked = Signal()

    def __init__(self, parent=None):
        super().__init__(parent)
        self.setMouseTracking(True)
        self._chapters = []

        root = QVBoxLayout(self)
        root.setContentsMargins(10, 6, 10, 6)
        root.setSpacing(4)

        # ─── Seekbar strip ───
        seek_row = QHBoxLayout()
        seek_row.setContentsMargins(0, 0, 0, 0)
        seek_row.setSpacing(6)

        self.time_label = QLabel("0:00")
        self.time_label.setStyleSheet("color: white; font-size: 11px;")
        seek_row.addWidget(self.time_label)

        self.seek_back_btn = ChipButton("-10s")
        self.seek_back_btn.setMinimumWidth(46)
        self.seek_back_btn.clicked.connect(lambda: self.seek_step_requested.emit(-10.0))
        seek_row.addWidget(self.seek_back_btn)

        self.scrub = SeekSlider(Qt.Orientation.Horizontal)
        self.scrub.setRange(0, 1000)
        self.scrub.setValue(0)
        self.scrub.setStyleSheet("""
            QSlider::groove:horizontal {
                height: 5px;
                background: qlineargradient(x1:0, y1:0, x2:0, y2:1,
                    stop:0 rgba(80,80,80,0.9), stop:1 rgba(30,30,30,0.95));
                border: 1px solid rgba(0,0,0,0.7); border-radius: 2px;
            }
            QSlider::sub-page:horizontal {
                background: qlineargradient(x1:0, y1:0, x2:0, y2:1,
                    stop:0 rgba(210,210,210,0.95), stop:1 rgba(140,140,140,0.95));
                border-radius: 2px;
            }
            QSlider::add-page:horizontal {
                background: rgba(20,20,20,0.9); border-radius: 2px;
            }
            QSlider::handle:horizontal {
                background: qlineargradient(x1:0, y1:0, x2:0, y2:1,
                    stop:0 rgba(230,230,230,0.98), stop:1 rgba(150,150,150,0.98));
                width: 12px; margin: -5px 0;
                border: 1px solid rgba(0,0,0,0.7); border-radius: 2px;
            }
        """)
        self.scrub.seek_fraction_requested.connect(self.seek_requested)
        seek_row.addWidget(self.scrub, stretch=1)

        self.seek_fwd_btn = ChipButton("+10s")
        self.seek_fwd_btn.setMinimumWidth(46)
        self.seek_fwd_btn.clicked.connect(lambda: self.seek_step_requested.emit(10.0))
        seek_row.addWidget(self.seek_fwd_btn)

        self.duration_label = QLabel("0:00")
        self.duration_label.setStyleSheet("color: white; font-size: 11px;")
        seek_row.addWidget(self.duration_label)

        root.addLayout(seek_row)

        # ─── Main row ───
        main_row = QHBoxLayout()
        main_row.setContentsMargins(0, 0, 0, 0)
        main_row.setSpacing(8)

        _transport_ss = """
            QPushButton {
                background: qlineargradient(x1:0, y1:0, x2:0, y2:1,
                    stop:0 rgba(80,80,80,0.95), stop:0.5 rgba(52,52,52,0.98),
                    stop:1 rgba(30,30,30,0.98));
                border: 1px solid rgba(0,0,0,0.8);
                border-top-color: rgba(130,130,130,0.7);
                border-radius: 3px; padding: 2px 8px;
                color: rgba(245,245,245,0.95); font-size: 18px;
            }
            QPushButton:hover {
                background: qlineargradient(x1:0, y1:0, x2:0, y2:1,
                    stop:0 rgba(100,100,100,0.98), stop:0.5 rgba(62,62,62,0.98),
                    stop:1 rgba(36,36,36,0.98));
            }
        """

        self.back_btn = QPushButton("\u2190")
        self.back_btn.setStyleSheet(_transport_ss.replace("font-size: 18px", "font-size: 14px"))
        self.back_btn.setCursor(Qt.CursorShape.PointingHandCursor)
        self.back_btn.clicked.connect(self.back_clicked)
        main_row.addWidget(self.back_btn)

        self.prev_btn = QPushButton("\u23ee\ufe0e")
        self.prev_btn.setStyleSheet(_transport_ss)
        self.prev_btn.setCursor(Qt.CursorShape.PointingHandCursor)
        self.prev_btn.clicked.connect(self.prev_clicked)
        main_row.addWidget(self.prev_btn)

        self.play_pause_btn = QPushButton("\u25b6")
        self.play_pause_btn.setStyleSheet("""
            QPushButton {
                background: qlineargradient(x1:0, y1:0, x2:0, y2:1,
                    stop:0 rgba(96,96,96,0.98), stop:0.5 rgba(66,66,66,0.98),
                    stop:1 rgba(36,36,36,0.98));
                border: 1px solid rgba(0,0,0,0.85);
                border-top-color: rgba(150,150,150,0.7);
                border-radius: 3px; padding: 2px 10px;
                color: rgba(255,255,255,0.98); font-size: 20px;
            }
            QPushButton:hover {
                background: qlineargradient(x1:0, y1:0, x2:0, y2:1,
                    stop:0 rgba(120,120,120,0.98), stop:0.5 rgba(78,78,78,0.98),
                    stop:1 rgba(40,40,40,0.98));
            }
        """)
        self.play_pause_btn.setCursor(Qt.CursorShape.PointingHandCursor)
        self.play_pause_btn.clicked.connect(self.play_pause_clicked)
        main_row.addWidget(self.play_pause_btn)

        self.next_btn = QPushButton("\u23ed\ufe0e")
        self.next_btn.setStyleSheet(_transport_ss)
        self.next_btn.setCursor(Qt.CursorShape.PointingHandCursor)
        self.next_btn.clicked.connect(self.next_clicked)
        main_row.addWidget(self.next_btn)

        self.title_label = QLabel("")
        self.title_label.setStyleSheet("color: rgba(255,255,255,0.90); font-size: 12px; font-weight: 500;")
        self.title_label.setSizePolicy(QSizePolicy.Policy.Expanding, QSizePolicy.Policy.Preferred)
        main_row.addWidget(self.title_label)

        # Right-side chips
        right = QHBoxLayout()
        right.setSpacing(6)

        self.tracks_btn = ChipButton("\u266b")
        self.tracks_btn.setToolTip("Tracks")
        self.tracks_btn.clicked.connect(self.tracks_clicked)
        right.addWidget(self.tracks_btn)

        self.speed_btn = ChipButton("1.0\u00d7")
        self.speed_btn.setToolTip("Speed")
        self.speed_btn.clicked.connect(self.speed_clicked)
        right.addWidget(self.speed_btn)

        self.audio_btn = ChipButton("\u266a")
        self.audio_btn.setToolTip("Audio Track")
        self.audio_btn.clicked.connect(self.audio_track_clicked)
        right.addWidget(self.audio_btn)

        self.aspect_btn = ChipButton("\u25ad")
        self.aspect_btn.setToolTip("Aspect")
        self.aspect_btn.clicked.connect(self.aspect_clicked)
        right.addWidget(self.aspect_btn)

        self.playlist_btn = ChipButton("\u2630")
        self.playlist_btn.setToolTip("Playlist")
        self.playlist_btn.clicked.connect(self.playlist_clicked)
        right.addWidget(self.playlist_btn)

        self.subtitle_btn = ChipButton("CC")
        self.subtitle_btn.setToolTip("Subtitle Track")
        self.subtitle_btn.clicked.connect(self.subtitle_track_clicked)
        right.addWidget(self.subtitle_btn)

        self.fullscreen_btn = ChipButton("\u2922")
        self.fullscreen_btn.setToolTip("Fullscreen")
        self.fullscreen_btn.clicked.connect(self.fullscreen_clicked)
        right.addWidget(self.fullscreen_btn)

        main_row.addLayout(right)
        root.addLayout(main_row)

        self.setStyleSheet(
            "background: rgba(10, 10, 10, 0.35);"
            "border-top: 1px solid rgba(255, 255, 255, 0.06);"
        )

    def set_title(self, title):
        self.title_label.setText(title)

    def set_speed_label(self, speed):
        self.speed_btn.setText(f"{speed:.1f}\u00d7")

    def set_chapters(self, chapters):
        self._chapters = list(chapters or [])
        try:
            self.scrub.set_chapters(self._chapters)
        except Exception:
            pass

    def update_scrubber(self, pos, dur):
        try:
            if self.scrub.isSliderDown():
                return
            if dur and dur > 0 and pos is not None:
                frac = max(0.0, min(1.0, pos / dur))
                self.scrub.set_duration(dur)
                self.scrub.set_chapters(self._chapters)
                self.scrub.blockSignals(True)
                self.scrub.setValue(int(frac * 1000))
                self.scrub.blockSignals(False)
        except Exception:
            pass

    def update_time_labels(self, pos, dur):
        try:
            self.time_label.setText(_fmt_time(pos))
            self.duration_label.setText(_fmt_time(dur))
        except Exception:
            pass

    def set_play_pause_icon(self, is_playing):
        self.play_pause_btn.setText("\u23f8" if is_playing else "\u25b6")


# ════════════════════════════════════════════════════════════════════════
# TracksDrawer
# ════════════════════════════════════════════════════════════════════════

class TracksDrawer(QFrame):
    """Slide-out tracks panel: audio/subtitle selection, delays, aspect ratio."""

    audio_selected = Signal(int)
    subtitle_selected = Signal(int)
    audio_delay_changed = Signal(float)
    subtitle_delay_changed = Signal(float)
    aspect_changed = Signal(str)

    def __init__(self, parent=None):
        super().__init__(parent)
        self.setObjectName("TracksDrawer")
        self.setStyleSheet("""
            QFrame#TracksDrawer {
                background: rgba(16, 16, 16, 0.94);
                border-left: 1px solid rgba(255, 255, 255, 0.10);
            }
            QLabel { color: rgba(255,255,255,0.90); font-size: 12px; }
            QListWidget {
                background: transparent; border: none;
                color: rgba(255,255,255,0.90);
            }
            QListWidget::item { padding: 6px 8px; border-radius: 6px; }
            QListWidget::item:selected { background: rgba(255,255,255,0.12); }
        """)
        self.setFixedWidth(340)

        scroll = QScrollArea(self)
        scroll.setWidgetResizable(True)
        scroll.setStyleSheet("background: transparent; border: none;")

        container = QWidget()
        lay = QVBoxLayout(container)
        lay.setContentsMargins(12, 12, 12, 12)
        lay.setSpacing(12)

        # Audio section
        lay.addWidget(QLabel("Audio Track"))
        self.audio_list = QListWidget()
        self.audio_list.setMaximumHeight(120)
        self.audio_list.itemClicked.connect(lambda item: self._on_track_click(item, "audio"))
        lay.addWidget(self.audio_list)

        ad_row = QHBoxLayout()
        ad_row.addWidget(QLabel("Audio Delay (s):"))
        self.audio_delay_spin = QDoubleSpinBox()
        self.audio_delay_spin.setRange(-10.0, 10.0)
        self.audio_delay_spin.setSingleStep(0.1)
        self.audio_delay_spin.valueChanged.connect(self.audio_delay_changed.emit)
        ad_row.addWidget(self.audio_delay_spin)
        ad_row.addStretch()
        lay.addLayout(ad_row)

        # Subtitle section
        lay.addWidget(QLabel("Subtitle Track"))
        self.subtitle_list = QListWidget()
        self.subtitle_list.setMaximumHeight(120)
        self.subtitle_list.itemClicked.connect(lambda item: self._on_track_click(item, "subtitle"))
        lay.addWidget(self.subtitle_list)

        sd_row = QHBoxLayout()
        sd_row.addWidget(QLabel("Subtitle Delay (s):"))
        self.subtitle_delay_spin = QDoubleSpinBox()
        self.subtitle_delay_spin.setRange(-10.0, 10.0)
        self.subtitle_delay_spin.setSingleStep(0.1)
        self.subtitle_delay_spin.valueChanged.connect(self.subtitle_delay_changed.emit)
        sd_row.addWidget(self.subtitle_delay_spin)
        sd_row.addStretch()
        lay.addLayout(sd_row)

        # Aspect ratio section
        lay.addWidget(QLabel("Aspect Ratio"))
        aspect_row = QHBoxLayout()
        aspect_row.setSpacing(4)
        for label, value in [("Default", ""), ("16:9", "16:9"), ("4:3", "4:3"),
                             ("21:9", "21:9"), ("2.35:1", "2.35:1"), ("1:1", "1:1")]:
            btn = ChipButton(label)
            btn.clicked.connect(lambda checked=False, v=value: self.aspect_changed.emit(v))
            aspect_row.addWidget(btn)
        lay.addLayout(aspect_row)

        lay.addStretch()
        scroll.setWidget(container)

        frame_lay = QVBoxLayout(self)
        frame_lay.setContentsMargins(0, 0, 0, 0)
        frame_lay.addWidget(scroll)

        self.hide()

    def _on_track_click(self, item, kind):
        try:
            tid = int(item.data(Qt.ItemDataRole.UserRole))
            if kind == "audio":
                self.audio_selected.emit(tid)
            else:
                self.subtitle_selected.emit(tid)
        except Exception:
            pass

    def populate(self, track_list, current_aid=None, current_sid=None):
        """Populate audio/subtitle lists from mpv track_list."""
        self.audio_list.clear()
        self.subtitle_list.clear()

        # Add "Off" option for subtitles
        off_item = QListWidgetItem("Off")
        off_item.setData(Qt.ItemDataRole.UserRole, 0)
        self.subtitle_list.addItem(off_item)

        if not track_list:
            return

        for t in track_list:
            try:
                tid = int(t.get("id", 0))
                ttype = str(t.get("type", ""))
                lang = str(t.get("lang", "") or "")
                title = str(t.get("title", "") or "")
                codec = str(t.get("codec", "") or "")
                label = f"#{tid}"
                if title:
                    label += f" {title}"
                if lang:
                    label += f" [{lang}]"
                if codec:
                    label += f" ({codec})"

                item = QListWidgetItem(label)
                item.setData(Qt.ItemDataRole.UserRole, tid)

                if ttype == "audio":
                    self.audio_list.addItem(item)
                    if current_aid is not None and tid == current_aid:
                        self.audio_list.setCurrentItem(item)
                elif ttype == "sub":
                    self.subtitle_list.addItem(item)
                    if current_sid is not None and tid == current_sid:
                        self.subtitle_list.setCurrentItem(item)
            except Exception:
                continue

    def toggle(self):
        if self.isVisible():
            self.hide()
        else:
            self.show()
            self.raise_()

    def is_open(self):
        return self.isVisible()


# ════════════════════════════════════════════════════════════════════════
# PlaylistDrawer
# ════════════════════════════════════════════════════════════════════════

class PlaylistDrawer(QFrame):
    """Slide-out episode list panel."""

    episode_clicked = Signal(int)
    auto_advance_toggled = Signal(bool)

    def __init__(self, parent=None):
        super().__init__(parent)
        self.setObjectName("PlaylistDrawer")
        self.setStyleSheet("""
            QFrame#PlaylistDrawer {
                background: rgba(16, 16, 16, 0.94);
                border-left: 1px solid rgba(255, 255, 255, 0.10);
            }
            QLabel { color: rgba(255,255,255,0.90); font-size: 12px; }
            QListWidget {
                background: transparent; border: none;
                color: rgba(255,255,255,0.90);
            }
            QListWidget::item { padding: 8px 10px; border-radius: 6px; }
            QListWidget::item:selected { background: rgba(255,255,255,0.15); }
        """)
        self.setFixedWidth(320)

        lay = QVBoxLayout(self)
        lay.setContentsMargins(12, 12, 12, 12)
        lay.setSpacing(8)

        header = QHBoxLayout()
        header.addWidget(QLabel("Playlist"))
        header.addStretch()

        self.auto_advance_btn = ChipButton("Auto \u25b6")
        self.auto_advance_btn.setCheckable(True)
        self.auto_advance_btn.setChecked(True)
        self.auto_advance_btn.clicked.connect(
            lambda checked: self.auto_advance_toggled.emit(checked)
        )
        header.addWidget(self.auto_advance_btn)
        lay.addLayout(header)

        self.episode_list = QListWidget()
        self.episode_list.setVerticalScrollMode(QListWidget.ScrollMode.ScrollPerPixel)
        self.episode_list.itemClicked.connect(self._on_item_click)
        lay.addWidget(self.episode_list)

        self.hide()

    def _on_item_click(self, item):
        try:
            idx = int(item.data(Qt.ItemDataRole.UserRole))
            self.episode_clicked.emit(idx)
        except Exception:
            pass

    def populate(self, items, current_index, auto_advance):
        """items: list of {name, path, current}"""
        self.episode_list.clear()
        self.auto_advance_btn.setChecked(auto_advance)
        for i, ep in enumerate(items):
            name = ep.get("name", os.path.basename(ep.get("path", "")))
            item = QListWidgetItem(name)
            item.setData(Qt.ItemDataRole.UserRole, i)
            self.episode_list.addItem(item)
            if i == current_index:
                self.episode_list.setCurrentItem(item)

    def toggle(self):
        if self.isVisible():
            self.hide()
        else:
            self.show()
            self.raise_()

    def is_open(self):
        return self.isVisible()


# ════════════════════════════════════════════════════════════════════════
# MpvContainer — top-level widget that goes in the QStackedWidget
# ════════════════════════════════════════════════════════════════════════

class MpvContainer(QWidget):
    """Hosts the mpv render surface + player controls as direct siblings.

    Goes into app.py's QStackedWidget at index 1.

    Architecture (matches run_player.py):
        mpv renders into render_host's native HWND via wid.
        Controls (TopStrip, BottomHUD, drawers, etc.) are direct children of
        MpvContainer, positioned absolutely and raised above render_host.
        There is NO full-covering overlay widget — that would create an HWND
        on Windows that occludes the mpv render surface (audio-only bug).

    Mouse behavior (exact match with run_player.py MpvRenderHost):
        - Left click: dismiss open overlays (if any), keep focus.  Does NOT
          toggle play/pause (prevents double-click causing accidental toggle).
        - Double-click: toggle fullscreen.
        - Right-click: show context menu.
        - Wheel: volume adjust.
        - Mouse move: show cursor; HUD reveals only in bottom activation zone
          (bottom ~110px), not on any mouse movement.

    Cursor auto-hide (matches run_player.py):
        - Separate from HUD auto-hide.
        - Cursor hides after 2s idle in fullscreen only.
        - Cursor always visible when controls or overlays are open.
    """

    # Signals to app.py
    request_fullscreen = Signal()
    request_minimize = Signal()
    request_back = Signal()

    _BOTTOM_ZONE_HEIGHT = 110  # px — matches run_player.py BOTTOM_ZONE_HEIGHT
    _CONTROLS_AUTOHIDE_MS = 3000  # matches run_player.py
    _CURSOR_AUTOHIDE_MS = 2000  # matches run_player.py

    def __init__(self, player_bridge, parent=None):
        super().__init__(parent)
        self._bridge = player_bridge
        self._controls_visible = False
        self._was_in_bottom_zone = False
        self._last_state = {}
        self.setStyleSheet("background: black;")
        self.setMouseTracking(True)
        self.setFocusPolicy(Qt.FocusPolicy.StrongFocus)

        # ── Render surface ──────────────────────────────────────────────
        # mpv renders here via wid.  Must be a native window so mpv can
        # attach to its HWND.
        self.render_host = QWidget(self)
        self.render_host.setStyleSheet("background: black;")
        self.render_host.setAttribute(Qt.WidgetAttribute.WA_NativeWindow, True)
        self.render_host.setMouseTracking(True)
        # Forward mouse events from render_host to MpvContainer
        self.render_host.installEventFilter(self)

        # ── Control widgets (direct children, positioned absolutely) ────
        self.top_strip = TopStrip(self)
        self.bottom_hud = BottomHUD(self)
        self.volume_hud = VolumeHUD(self)
        self.center_flash = CenterFlash(self)
        self.toast = ToastHUD(self)
        self.tracks_drawer = TracksDrawer(self)
        self.playlist_drawer = PlaylistDrawer(self)

        # Start with controls hidden (they reveal on bottom-zone mouse entry)
        self.top_strip.hide()
        self.bottom_hud.hide()

        # Wire top strip
        self.top_strip.minimize_clicked.connect(self.request_minimize)
        self.top_strip.fullscreen_clicked.connect(self.request_fullscreen)
        self.top_strip.close_clicked.connect(self._on_back)

        # Wire bottom HUD
        self.bottom_hud.play_pause_clicked.connect(self._toggle_play_pause)
        self.bottom_hud.prev_clicked.connect(self._prev_episode)
        self.bottom_hud.next_clicked.connect(self._next_episode)
        self.bottom_hud.seek_requested.connect(self._on_seek_fraction)
        self.bottom_hud.seek_step_requested.connect(self._seek_relative)
        self.bottom_hud.back_clicked.connect(self._on_back)
        self.bottom_hud.tracks_clicked.connect(self._toggle_tracks)
        self.bottom_hud.speed_clicked.connect(self._show_speed_menu)
        self.bottom_hud.playlist_clicked.connect(self._toggle_playlist)
        self.bottom_hud.audio_track_clicked.connect(lambda: self._bridge.cycle_audio_track())
        self.bottom_hud.subtitle_track_clicked.connect(lambda: self._bridge.cycle_subtitle_track())
        self.bottom_hud.aspect_clicked.connect(self._cycle_aspect)
        self.bottom_hud.fullscreen_clicked.connect(self.request_fullscreen)

        # Wire tracks drawer
        self.tracks_drawer.audio_selected.connect(self._on_audio_selected)
        self.tracks_drawer.subtitle_selected.connect(self._on_subtitle_selected)
        self.tracks_drawer.audio_delay_changed.connect(self._bridge.set_audio_delay)
        self.tracks_drawer.subtitle_delay_changed.connect(self._bridge.set_subtitle_delay)
        self.tracks_drawer.aspect_changed.connect(self._bridge.set_aspect_ratio)

        # Wire playlist drawer
        self.playlist_drawer.episode_clicked.connect(self._on_playlist_jump)
        self.playlist_drawer.auto_advance_toggled.connect(
            lambda v: self._bridge.setAutoAdvance(v)
        )

        # HUD auto-hide timer (3s, matches run_player.py)
        self._hide_controls_timer = QTimer(self)
        self._hide_controls_timer.setSingleShot(True)
        self._hide_controls_timer.timeout.connect(lambda: self._set_controls_visible(False))

        # Cursor auto-hide timer (2s, fullscreen only, matches run_player.py)
        self._hide_cursor_timer = QTimer(self)
        self._hide_cursor_timer.setSingleShot(True)
        self._hide_cursor_timer.timeout.connect(self._maybe_hide_cursor)

        # Aspect ratio cycling
        self._aspect_presets = ["", "16:9", "4:3", "21:9", "2.35:1", "1:1"]
        self._aspect_index = 0

        # Context menu
        from PySide6.QtWidgets import QMenu
        self._QMenu = QMenu

        # Tell bridge about us (we handle update_state)
        player_bridge.setOverlay(self)

    def get_render_widget(self):
        """Return the widget whose winId() should be passed to mpv."""
        return self.render_host

    # ── layout on resize ────────────────────────────────────────────────

    def resizeEvent(self, event):
        super().resizeEvent(event)
        w, h = self.width(), self.height()
        # render_host fills the entire area
        self.render_host.setGeometry(0, 0, w, h)
        # Controls positioned on top, raised above render_host
        self.top_strip.setGeometry(0, 0, w, 40)
        self.top_strip.raise_()
        self.bottom_hud.setGeometry(0, h - 90, w, 90)
        self.bottom_hud.raise_()
        # Drawers on the right side
        self.tracks_drawer.setGeometry(w - 340, 40, 340, h - 130)
        self.tracks_drawer.raise_()
        self.playlist_drawer.setGeometry(w - 320, 40, 320, h - 130)
        self.playlist_drawer.raise_()

    # ── overlay / drawer helpers (matches run_player.py) ────────────────

    def _any_overlay_open(self):
        """Check if any overlay drawer is currently open."""
        try:
            if self.tracks_drawer.is_open():
                return True
            if self.playlist_drawer.is_open():
                return True
        except Exception:
            pass
        return False

    def _dismiss_overlays_on_click(self):
        """If any overlay drawer is open, close it and return True."""
        try:
            dismissed = False
            if self.tracks_drawer.is_open():
                self.tracks_drawer.hide()
                dismissed = True
            if self.playlist_drawer.is_open():
                self.playlist_drawer.hide()
                dismissed = True
            if dismissed:
                self._set_controls_visible(True)
                self._arm_controls_autohide()
            return dismissed
        except Exception:
            return False

    # ── controls visibility (matches run_player.py _set_controls_visible) ─

    def _set_controls_visible(self, visible):
        self._controls_visible = bool(visible)
        if visible:
            self.top_strip.show()
            self.top_strip.raise_()
            self.bottom_hud.show()
            self.bottom_hud.raise_()
            self._show_cursor()
            self._hide_cursor_timer.stop()
            self._arm_controls_autohide()
        else:
            self.top_strip.hide()
            self.bottom_hud.hide()
            self._hide_controls_timer.stop()
            # Don't brick the cursor — use a timer so movement brings it back.
            self._show_cursor()
            self._arm_cursor_autohide()

    def _arm_controls_autohide(self):
        """Start/refresh the HUD auto-hide timer unless an overlay is open."""
        try:
            if self._controls_visible and not self._any_overlay_open():
                self._hide_controls_timer.stop()
                self._hide_controls_timer.start(self._CONTROLS_AUTOHIDE_MS)
            else:
                self._hide_controls_timer.stop()
        except Exception:
            pass

    def _show_controls(self):
        """Show controls and arm auto-hide."""
        if not self._controls_visible:
            self._set_controls_visible(True)
        else:
            self._arm_controls_autohide()

    # ── cursor auto-hide (matches run_player.py — fullscreen only) ──────

    def _show_cursor(self):
        try:
            if self.cursor().shape() == Qt.CursorShape.BlankCursor:
                self.setCursor(Qt.CursorShape.ArrowCursor)
        except Exception:
            try:
                self.setCursor(Qt.CursorShape.ArrowCursor)
            except Exception:
                pass

    def _arm_cursor_autohide(self):
        """Hide cursor after 2s idle in fullscreen; always show on movement."""
        try:
            if not self._is_fullscreen():
                self._hide_cursor_timer.stop()
                return
            # Keep cursor visible when controls or overlays are open
            if self._controls_visible or self._any_overlay_open():
                self._hide_cursor_timer.stop()
                self._show_cursor()
                return
            self._hide_cursor_timer.stop()
            self._hide_cursor_timer.start(self._CURSOR_AUTOHIDE_MS)
        except Exception:
            pass

    def _maybe_hide_cursor(self):
        try:
            if self._is_fullscreen() and not self._controls_visible and not self._any_overlay_open():
                self.setCursor(Qt.CursorShape.BlankCursor)
            else:
                self.setCursor(Qt.CursorShape.ArrowCursor)
        except Exception:
            pass

    # ── mouse activity (matches run_player.py _on_mouse_activity) ───────

    def _on_mouse_activity(self, pos):
        """Any movement reveals cursor; HUD only reveals in bottom zone."""
        try:
            self._show_cursor()
            self._arm_cursor_autohide()
        except Exception:
            pass
        try:
            self._handle_mouse_move_for_hud(pos)
        except Exception:
            pass

    def _handle_mouse_move_for_hud(self, pos):
        """HUD reveals only when mouse is in the bottom activation zone."""
        try:
            bottom_threshold = max(0, self.height() - self._BOTTOM_ZONE_HEIGHT)
            is_in_bottom_zone = (int(pos.y()) >= bottom_threshold)
            if is_in_bottom_zone:
                if not self._controls_visible:
                    self._set_controls_visible(True)
                else:
                    self._arm_controls_autohide()
            self._was_in_bottom_zone = bool(is_in_bottom_zone)
        except Exception:
            pass

    # ── state updates from PlayerBridge ──────────────────────────────────

    def update_state(self, state):
        """Called by PlayerBridge._poll_tick with current state dict."""
        self._last_state = state
        pos = state.get("positionSec", 0)
        dur = state.get("durationSec", 0)
        playing = state.get("isPlaying", False)

        self.bottom_hud.update_scrubber(pos, dur)
        self.bottom_hud.update_time_labels(pos, dur)
        self.bottom_hud.set_play_pause_icon(playing)

        speed = state.get("speed", 1.0)
        self.bottom_hud.set_speed_label(speed)

        # Title from media ref
        ref = state.get("mediaRef", {})
        path = ref.get("path", "")
        if path:
            name = os.path.splitext(os.path.basename(path))[0]
            self.top_strip.set_title(name)
            self.bottom_hud.set_title(name)

        # Chapter ticks
        chapters = state.get("chapters", [])
        if chapters:
            times = []
            for c in chapters:
                try:
                    times.append(float(c.get("time", 0) if isinstance(c, dict) else c))
                except Exception:
                    pass
            self.bottom_hud.set_chapters(times)

    # ── event filter for render_host mouse events ───────────────────────

    def eventFilter(self, obj, event):
        """Forward mouse events from render_host (matches run_player.py MpvRenderHost)."""
        if obj is self.render_host:
            etype = event.type()
            if etype == QEvent.Type.MouseMove:
                self._on_mouse_activity(event.position().toPoint())
                return False
            if etype == QEvent.Type.MouseButtonPress:
                self._handle_render_host_click(event)
                return True
            if etype == QEvent.Type.MouseButtonDblClick:
                self._handle_render_host_dblclick(event)
                return True
            if etype == QEvent.Type.Wheel:
                self._handle_wheel(event)
                return True
        return super().eventFilter(obj, event)

    # ── mouse events (matches run_player.py MpvRenderHost exactly) ──────

    def mouseMoveEvent(self, event):
        self._on_mouse_activity(event.position().toPoint())
        super().mouseMoveEvent(event)

    def _handle_render_host_click(self, event):
        """Left click: dismiss overlays, keep focus.  NO play/pause on click.
        Right click: context menu.  (Matches run_player.py MpvRenderHost.)"""
        if event.button() == Qt.MouseButton.RightButton:
            global_pos = self.render_host.mapToGlobal(event.position().toPoint())
            self._show_context_menu(global_pos)
            event.accept()
            return
        if event.button() == Qt.MouseButton.LeftButton:
            # Dismiss overlays if any are open (matches _dismiss_overlays_on_click)
            if self._dismiss_overlays_on_click():
                event.accept()
                return
            # Keep focus for hotkeys
            try:
                w = self.window()
                if w:
                    w.activateWindow()
                    w.raise_()
                    w.setFocus(Qt.FocusReason.ActiveWindowFocusReason)
            except Exception:
                pass
            self.setFocus(Qt.FocusReason.ActiveWindowFocusReason)
            event.accept()
            return

    def _handle_render_host_dblclick(self, event):
        """Double-click: toggle fullscreen (left button only).
        Matches run_player.py MpvRenderHost.mouseDoubleClickEvent."""
        if event.button() == Qt.MouseButton.LeftButton:
            self.request_fullscreen.emit()
            # Keep focus reliable after toggling
            try:
                w = self.window()
                if w:
                    w.activateWindow()
                    w.raise_()
                    w.setFocus(Qt.FocusReason.ActiveWindowFocusReason)
            except Exception:
                pass
            self.setFocus(Qt.FocusReason.ActiveWindowFocusReason)
            event.accept()

    def wheelEvent(self, event):
        self._handle_wheel(event)

    def _handle_wheel(self, event):
        delta = event.angleDelta().y()
        if delta > 0:
            self._bridge.adjust_volume(5)
        elif delta < 0:
            self._bridge.adjust_volume(-5)
        self.volume_hud.show_volume(self._bridge._volume)
        event.accept()

    # ── context menu (ported from run_player.py _show_context_menu) ─────

    def _show_context_menu(self, global_pos):
        """Show context menu at position (text labels; matches run_player.py)."""
        try:
            menu = self._QMenu(self)
            menu.setStyleSheet("""
                QMenu {
                    background: rgba(12, 12, 12, 0.88);
                    color: rgba(255, 255, 255, 0.92);
                    border: 1px solid rgba(255, 255, 255, 0.12);
                    padding: 6px;
                }
                QMenu::item {
                    padding: 8px 18px;
                    border-radius: 8px;
                }
                QMenu::item:selected {
                    background: rgba(255, 255, 255, 0.12);
                }
                QMenu::separator {
                    height: 1px;
                    background: rgba(255, 255, 255, 0.08);
                    margin: 6px 6px;
                }
            """)

            menu.addSeparator()

            # Playback submenu
            playback_m = menu.addMenu("Playback")
            paused = not self._bridge._is_playing
            playback_m.addAction("Play" if paused else "Pause").triggered.connect(self._toggle_play_pause)
            playback_m.addAction("Stop").triggered.connect(self._on_back)
            playback_m.addAction("Restart from Beginning").triggered.connect(
                lambda: self._bridge.seek("0")
            )

            # Seek submenu
            seek_m = playback_m.addMenu("Seek")
            seek_m.addAction("Back 10 seconds").triggered.connect(lambda: self._seek_relative(-10))
            seek_m.addAction("Back 30 seconds").triggered.connect(lambda: self._seek_relative(-30))
            seek_m.addAction("Forward 10 seconds").triggered.connect(lambda: self._seek_relative(10))
            seek_m.addAction("Forward 30 seconds").triggered.connect(lambda: self._seek_relative(30))

            # Speed submenu
            sp_m = playback_m.addMenu("Speed")
            speed_presets = self._bridge._SPEED_PRESETS if hasattr(self._bridge, '_SPEED_PRESETS') else [
                0.25, 0.5, 0.75, 1.0, 1.25, 1.5, 1.75, 2.0, 2.5, 3.0
            ]
            for sp in speed_presets:
                a = sp_m.addAction(f"{sp}\u00d7")
                a.setCheckable(True)
                a.setChecked(abs(float(sp) - float(self._bridge._speed)) < 1e-6)
                a.triggered.connect(lambda checked=False, s=sp: self._set_speed(s))
            sp_m.addSeparator()
            sp_m.addAction("Reset to 1.0\u00d7").triggered.connect(lambda: self._set_speed(1.0))

            # Video submenu
            video_m = menu.addMenu("Video")
            ar_m = video_m.addMenu("Aspect Ratio")
            ar_presets = [
                ("Default", "-1"), ("16:9", "16:9"), ("4:3", "4:3"),
                ("21:9", "2.33:1"), ("2.35:1", "2.35:1"), ("1:1", "1:1"),
                ("9:16", "9:16"), ("3:2", "3:2"),
            ]
            for label, val in ar_presets:
                ar_m.addAction(label).triggered.connect(
                    lambda checked=False, v=val: self._bridge.set_aspect_ratio(v)
                )
            video_m.addAction("Fullscreen").triggered.connect(
                lambda: self.request_fullscreen.emit()
            )

            # Audio submenu
            try:
                tracks = self._bridge.get_track_list()
                cur_aid = self._bridge._last_aid
                cur_sid = self._bridge._last_sid

                audio_m = menu.addMenu("Audio")
                aud_m = audio_m.addMenu("Audio Track")
                audio_tracks = [t for t in tracks if t.get("type") == "audio"]
                if not audio_tracks:
                    na = aud_m.addAction("(No audio tracks)")
                    na.setEnabled(False)
                else:
                    for t in audio_tracks:
                        tid = int(t.get("id", 0))
                        lang = (t.get("lang") or "").strip()
                        title = (t.get("title") or "").strip()
                        parts = []
                        if lang:
                            parts.append(lang.upper())
                        if title and (not lang or title.lower() != lang.lower()):
                            parts.append(title)
                        txt = " \u00b7 ".join(parts) if parts else f"Track #{tid}"
                        a = aud_m.addAction(txt)
                        a.setCheckable(True)
                        a.setChecked(str(tid) == str(cur_aid))
                        a.triggered.connect(lambda checked=False, x=tid: self._on_audio_selected(x))

                # Subtitles submenu
                subtitle_m = menu.addMenu("Subtitles")
                sub_m = subtitle_m.addMenu("Subtitle Track")
                off = sub_m.addAction("Off")
                off.setCheckable(True)
                off.setChecked(cur_sid in (None, "no", 0, "0", False))
                off.triggered.connect(lambda: self._on_subtitle_selected(0))

                sub_tracks = [t for t in tracks if t.get("type") == "sub"]
                if not sub_tracks:
                    ns = sub_m.addAction("(No subtitles)")
                    ns.setEnabled(False)
                else:
                    for t in sub_tracks:
                        tid = int(t.get("id", 0))
                        lang = (t.get("lang") or "").strip()
                        title = (t.get("title") or "").strip()
                        parts = []
                        if lang:
                            parts.append(lang.upper())
                        if title and (not lang or title.lower() != lang.lower()):
                            parts.append(title)
                        txt = " \u00b7 ".join(parts) if parts else f"Sub #{tid}"
                        a = sub_m.addAction(txt)
                        a.setCheckable(True)
                        a.setChecked(str(tid) == str(cur_sid))
                        a.triggered.connect(lambda checked=False, x=tid: self._on_subtitle_selected(x))
            except Exception:
                pass

            # Filters / Advanced
            adv_m = menu.addMenu("Filters / Advanced")
            adv_m.addAction("Show Info").triggered.connect(self._show_info_toast)

            # Playlist submenu
            playlist_m = menu.addMenu("Playlist")
            prev_a = playlist_m.addAction("Previous Episode")
            prev_a.triggered.connect(self._prev_episode)
            next_a = playlist_m.addAction("Next Episode")
            next_a.triggered.connect(self._next_episode)
            playlist_m.addAction("Playlist\u2026").triggered.connect(self._toggle_playlist)

            menu.exec(global_pos)
        except Exception as e:
            print(f"Context menu error: {e}")

    # ── keyboard shortcuts (exact match with run_player.py) ─────────────

    def keyPressEvent(self, event):
        if self._handle_key(event):
            event.accept()
        else:
            super().keyPressEvent(event)

    def _handle_key(self, event):
        key = event.key()
        mods = event.modifiers()

        # Back to library
        if key == Qt.Key.Key_Backspace:
            self._on_back()
            return True

        # Escape
        if key == Qt.Key.Key_Escape:
            if self._is_fullscreen():
                self.request_fullscreen.emit()
                return True
            self._set_controls_visible(False)
            return True

        # Play/pause
        if key in (Qt.Key.Key_Space, Qt.Key.Key_K):
            self._toggle_play_pause()
            return True

        # Seek
        if key in (Qt.Key.Key_Left, Qt.Key.Key_Right):
            direction = -1 if key == Qt.Key.Key_Left else 1
            big = bool(mods & (Qt.KeyboardModifier.ControlModifier | Qt.KeyboardModifier.ShiftModifier | Qt.KeyboardModifier.MetaModifier))
            self._seek_relative(direction * (30 if big else 10))
            return True

        # J/L for 10s seek
        if key == Qt.Key.Key_J:
            self._seek_relative(-10)
            return True
        if key == Qt.Key.Key_L and not (mods & Qt.KeyboardModifier.AltModifier):
            self._seek_relative(10)
            return True

        # Volume
        if key == Qt.Key.Key_Up:
            self._bridge.adjust_volume(5)
            self.volume_hud.show_volume(self._bridge._volume)
            return True
        if key == Qt.Key.Key_Down:
            self._bridge.adjust_volume(-5)
            self.volume_hud.show_volume(self._bridge._volume)
            return True
        if key == Qt.Key.Key_M:
            self._bridge.toggle_mute()
            self.volume_hud.show_volume(0 if self._bridge._muted else self._bridge._volume)
            return True

        # Fullscreen
        if key in (Qt.Key.Key_Enter, Qt.Key.Key_Return, Qt.Key.Key_F):
            self.request_fullscreen.emit()
            return True

        # Speed
        if key in (Qt.Key.Key_C, Qt.Key.Key_BracketRight):
            self._bridge.cycle_speed(+1)
            self.toast.show_toast(f"Speed {self._bridge._speed:.2f}\u00d7")
            self.bottom_hud.set_speed_label(self._bridge._speed)
            return True
        if key in (Qt.Key.Key_X, Qt.Key.Key_BracketLeft):
            self._bridge.cycle_speed(-1)
            self.toast.show_toast(f"Speed {self._bridge._speed:.2f}\u00d7")
            self.bottom_hud.set_speed_label(self._bridge._speed)
            return True
        if key in (Qt.Key.Key_Z, Qt.Key.Key_Backslash):
            self._bridge.reset_speed()
            self.toast.show_toast("Speed 1.00\u00d7")
            self.bottom_hud.set_speed_label(1.0)
            return True

        # Tracks
        if key == Qt.Key.Key_A and not (mods & Qt.KeyboardModifier.AltModifier):
            self._bridge.cycle_audio_track()
            return True
        if key == Qt.Key.Key_S and not (mods & Qt.KeyboardModifier.AltModifier):
            self._bridge.cycle_subtitle_track()
            return True

        # Alt track keys
        if (mods & Qt.KeyboardModifier.AltModifier) and key == Qt.Key.Key_H:
            self._bridge.toggle_subtitle_visibility()
            return True

        # Subtitle delay
        if key == Qt.Key.Key_Greater:
            self._nudge_sub_delay(+0.1)
            return True
        if key == Qt.Key.Key_Less:
            self._nudge_sub_delay(-0.1)
            return True
        if key == Qt.Key.Key_Slash:
            self._bridge.set_subtitle_delay(0)
            self.toast.show_toast("Subtitle delay reset")
            return True

        # Chapter navigation (Shift+N/P)
        if mods & Qt.KeyboardModifier.ShiftModifier:
            if key == Qt.Key.Key_N:
                self._bridge.next_chapter()
                return True
            if key == Qt.Key.Key_P:
                self._bridge.prev_chapter()
                return True

        # Episode navigation (N/P without shift)
        if not (mods & Qt.KeyboardModifier.ShiftModifier):
            if key == Qt.Key.Key_N:
                self._next_episode()
                return True
            if key == Qt.Key.Key_P:
                self._prev_episode()
                return True

        # Go to time
        if key == Qt.Key.Key_G:
            self._prompt_goto_time()
            return True

        # Diagnostics (I)
        if key == Qt.Key.Key_I:
            self._show_info_toast()
            return True

        return False

    # ── actions ─────────────────────────────────────────────────────────

    def _toggle_play_pause(self):
        self._bridge.togglePlayPause()
        is_playing = self._bridge._is_playing
        self.center_flash.flash("\u23f8" if is_playing else "\u25b6")

    def _seek_relative(self, delta):
        self._bridge.seekRelative(str(delta))
        icon = "\u23e9" if delta > 0 else "\u23ea"
        self.center_flash.flash(icon)

    def _on_seek_fraction(self, frac):
        dur = self._bridge._duration_sec
        if dur and dur > 0:
            self._bridge.seek(str(frac * dur))

    def _next_episode(self):
        result = json.loads(self._bridge.nextEpisode())
        if result.get("navigated"):
            self.toast.show_toast("Next episode")
            self._refresh_playlist_drawer()
        else:
            self.toast.show_toast("End of playlist")

    def _prev_episode(self):
        result = json.loads(self._bridge.prevEpisode())
        if result.get("navigated"):
            self.toast.show_toast("Previous episode")
            self._refresh_playlist_drawer()
        else:
            self.toast.show_toast("Start of playlist")

    def _on_back(self):
        self._bridge.stop("user_back")
        self.request_back.emit()

    def _toggle_tracks(self):
        self.playlist_drawer.hide()
        # Populate tracks before showing
        track_list = self._bridge.get_track_list()
        self.tracks_drawer.populate(track_list, self._bridge._last_aid, self._bridge._last_sid)
        self.tracks_drawer.toggle()

    def _toggle_playlist(self):
        self.tracks_drawer.hide()
        self._refresh_playlist_drawer()
        self.playlist_drawer.toggle()

    def _refresh_playlist_drawer(self):
        try:
            pl = json.loads(self._bridge.getPlaylist())
            self.playlist_drawer.populate(
                pl.get("items", []),
                pl.get("index", 0),
                pl.get("autoAdvance", True),
            )
        except Exception:
            pass

    def _on_playlist_jump(self, index):
        result = json.loads(self._bridge.jumpToEpisode(index))
        if result.get("navigated"):
            self.toast.show_toast("Jumped to episode")
            self._refresh_playlist_drawer()

    def _on_audio_selected(self, tid):
        try:
            if self._bridge._mpv:
                self._bridge._mpv.aid = tid
        except Exception:
            pass

    def _set_audio_track(self, tid):
        self._on_audio_selected(tid)

    def _on_subtitle_selected(self, tid):
        try:
            if self._bridge._mpv:
                if tid == 0:
                    self._bridge._mpv.sub_visibility = False
                else:
                    self._bridge._mpv.sid = tid
                    self._bridge._mpv.sub_visibility = True
        except Exception:
            pass

    def _show_speed_menu(self):
        """Show speed preset menu anchored to the speed chip (matches run_player.py)."""
        try:
            m = self._QMenu(self)
            m.setStyleSheet("""
                QMenu { background: rgba(12, 12, 12, 0.88); color: rgba(255, 255, 255, 0.92); border: 1px solid rgba(255, 255, 255, 0.12); padding: 6px; }
                QMenu::item { padding: 8px 18px; border-radius: 8px; }
                QMenu::item:selected { background: rgba(255, 255, 255, 0.12); }
            """)
            speed_presets = self._bridge._SPEED_PRESETS if hasattr(self._bridge, '_SPEED_PRESETS') else [
                0.25, 0.5, 0.75, 1.0, 1.25, 1.5, 1.75, 2.0, 2.5, 3.0
            ]
            for sp in speed_presets:
                a = m.addAction(f"{sp}\u00d7")
                a.setCheckable(True)
                a.setChecked(abs(float(sp) - float(self._bridge._speed)) < 1e-6)
                a.triggered.connect(lambda checked=False, s=sp: self._set_speed(s))
            m.addSeparator()
            m.addAction("Reset to 1.0\u00d7").triggered.connect(lambda: self._set_speed(1.0))
            # Anchor to speed button
            btn = self.bottom_hud.speed_btn
            m.exec(btn.mapToGlobal(QPoint(0, -m.sizeHint().height())))
        except Exception:
            # Fallback: cycle speed
            self._bridge.cycle_speed(+1)
            self.toast.show_toast(f"Speed {self._bridge._speed:.2f}\u00d7")
            self.bottom_hud.set_speed_label(self._bridge._speed)

    def _set_speed(self, speed):
        self._bridge.set_speed(speed)
        self.toast.show_toast(f"Speed {speed:.2f}\u00d7")
        self.bottom_hud.set_speed_label(speed)

    def _show_info_toast(self):
        """Show diagnostics info toast (matches run_player.py 'I' key)."""
        st = self._last_state
        info = (
            f"Pos: {_fmt_time(st.get('positionSec'))} / {_fmt_time(st.get('durationSec'))}\n"
            f"Watched: {_fmt_time(st.get('watchedTime'))}\n"
            f"Speed: {st.get('speed', 1.0):.2f}\u00d7\n"
            f"Playlist: {st.get('playlistIndex', 0)+1}/{st.get('playlistLength', 0)}"
        )
        self.toast.show_toast(info, 3000)

    def _cycle_aspect(self):
        self._aspect_index = (self._aspect_index + 1) % len(self._aspect_presets)
        ratio = self._aspect_presets[self._aspect_index]
        self._bridge.set_aspect_ratio(ratio)
        label = ratio if ratio else "Default"
        self.toast.show_toast(f"Aspect: {label}")

    def _nudge_sub_delay(self, delta):
        try:
            current = 0
            if self._bridge._mpv:
                current = float(self._bridge._mpv.sub_delay or 0)
            new_val = current + delta
            self._bridge.set_subtitle_delay(new_val)
            self.toast.show_toast(f"Sub delay: {new_val:+.1f}s")
        except Exception:
            pass

    def _prompt_goto_time(self):
        try:
            dur = self._bridge._duration_sec or 0
            text, ok = QInputDialog.getText(
                self, "Go to time",
                f"Enter time (e.g. 1:23:45 or 85) — duration: {_fmt_time(dur)}",
            )
            if ok and text:
                self._goto_time(text.strip())
        except Exception:
            pass

    def _goto_time(self, text):
        try:
            parts = text.replace(".", ":").split(":")
            secs = 0
            for p in parts:
                secs = secs * 60 + float(p)
            self._bridge.seek(str(secs))
        except Exception:
            self.toast.show_toast("Invalid time format")

    def _is_fullscreen(self):
        try:
            w = self.window()
            return w.isFullScreen() if w else False
        except Exception:
            return False
