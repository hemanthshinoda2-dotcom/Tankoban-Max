from PySide6.QtCore import QObject, Qt, QTimer, Signal
from PySide6.QtGui import QColor, QPainter, QPen
from PySide6.QtWidgets import (
    QFrame,
    QHBoxLayout,
    QLabel,
    QPushButton,
    QSlider,
    QVBoxLayout,
    QWidget,
)


MODE_LABELS = {
    "manual": "Manual",
    "twoPage": "Double Page",
    "twoPageMangaPlus": "Double Page (MangaPlus)",
    "twoPageScroll": "Double Page (Scroll)",
    "autoFlip": "Auto Flip",
}


class TopBar(QFrame):
    back_clicked = Signal()
    hover_changed = Signal(bool)

    def __init__(self, parent=None):
        super().__init__(parent)
        self.setObjectName("readerTopBar")
        self.setStyleSheet(
            """
            QFrame#readerTopBar {
              background: rgba(0,0,0,190);
              border: 0;
            }
            QLabel#topTitle {
              color: #ffffff;
              font-size: 14px;
              font-weight: 600;
            }
            QLabel#topSub {
              color: #b8b8b8;
              font-size: 11px;
            }
            QPushButton#backButton {
              color: #ffffff;
              background: rgba(255,255,255,24);
              border: 1px solid rgba(255,255,255,56);
              border-radius: 8px;
              padding: 4px 10px;
              font-size: 14px;
            }
            QPushButton#backButton:hover {
              background: rgba(255,255,255,38);
            }
            """
        )

        row = QHBoxLayout(self)
        row.setContentsMargins(12, 8, 12, 8)
        row.setSpacing(10)

        self.back_btn = QPushButton("Back", self)
        self.back_btn.setObjectName("backButton")
        self.back_btn.clicked.connect(self.back_clicked.emit)
        row.addWidget(self.back_btn, 0, Qt.AlignmentFlag.AlignVCenter)

        text_col = QVBoxLayout()
        text_col.setContentsMargins(0, 0, 0, 0)
        text_col.setSpacing(1)

        self.title = QLabel("-", self)
        self.title.setObjectName("topTitle")
        self.subtitle = QLabel("-", self)
        self.subtitle.setObjectName("topSub")

        text_col.addWidget(self.title)
        text_col.addWidget(self.subtitle)
        row.addLayout(text_col, 1)

    def set_texts(self, title: str, subtitle: str):
        self.title.setText(title or "-")
        self.subtitle.setText(subtitle or "-")

    def enterEvent(self, event):
        self.hover_changed.emit(True)
        super().enterEvent(event)

    def leaveEvent(self, event):
        self.hover_changed.emit(False)
        super().leaveEvent(event)


class BottomHud(QFrame):
    prev_clicked = Signal()
    play_clicked = Signal()
    next_clicked = Signal()
    mode_clicked = Signal()
    seek_preview = Signal(int)
    seek_commit = Signal(int)
    scrub_drag_changed = Signal(bool)
    hover_changed = Signal(bool)

    def __init__(self, parent=None):
        super().__init__(parent)
        self.setObjectName("readerBottomHud")
        self.setStyleSheet(
            """
            QFrame#readerBottomHud {
              background: rgba(0,0,0,204);
              border: 0;
            }
            QPushButton.hudBtn {
              color: #ffffff;
              background: rgba(255,255,255,24);
              border: 1px solid rgba(255,255,255,56);
              border-radius: 9px;
              padding: 4px 10px;
              min-height: 24px;
            }
            QPushButton.hudBtn:hover {
              background: rgba(255,255,255,44);
            }
            QLabel#pageText {
              color: #d6d6d6;
              font-size: 12px;
            }
            QLabel#modeText {
              color: #b8b8b8;
              font-size: 11px;
            }
            QSlider::groove:horizontal {
              background: rgba(255,255,255,34);
              height: 4px;
              border-radius: 2px;
            }
            QSlider::handle:horizontal {
              background: #ffffff;
              width: 14px;
              margin: -5px 0;
              border-radius: 7px;
            }
            QSlider::sub-page:horizontal {
              background: rgba(255,255,255,160);
              border-radius: 2px;
            }
            """
        )
        outer = QVBoxLayout(self)
        outer.setContentsMargins(12, 8, 12, 10)
        outer.setSpacing(8)

        self.slider = QSlider(Qt.Orientation.Horizontal, self)
        self.slider.setRange(0, 0)
        self.slider.valueChanged.connect(self._on_slider_value_changed)
        self.slider.sliderPressed.connect(self._on_slider_pressed)
        self.slider.sliderReleased.connect(self._on_slider_released)
        outer.addWidget(self.slider, 0)

        row = QHBoxLayout()
        row.setContentsMargins(0, 0, 0, 0)
        row.setSpacing(8)

        self.prev_btn = QPushButton("Prev", self)
        self.prev_btn.setProperty("class", "hudBtn")
        self.prev_btn.clicked.connect(self.prev_clicked.emit)
        row.addWidget(self.prev_btn, 0)

        self.play_btn = QPushButton("Play", self)
        self.play_btn.setProperty("class", "hudBtn")
        self.play_btn.clicked.connect(self.play_clicked.emit)
        row.addWidget(self.play_btn, 0)

        self.next_btn = QPushButton("Next", self)
        self.next_btn.setProperty("class", "hudBtn")
        self.next_btn.clicked.connect(self.next_clicked.emit)
        row.addWidget(self.next_btn, 0)

        self.mode_btn = QPushButton("Mode", self)
        self.mode_btn.setProperty("class", "hudBtn")
        self.mode_btn.clicked.connect(self.mode_clicked.emit)
        row.addWidget(self.mode_btn, 0)

        row.addStretch(1)

        text_col = QVBoxLayout()
        text_col.setContentsMargins(0, 0, 0, 0)
        text_col.setSpacing(0)

        self.page_text = QLabel("-", self)
        self.page_text.setObjectName("pageText")
        self.mode_text = QLabel("-", self)
        self.mode_text.setObjectName("modeText")
        self.mode_text.setAlignment(Qt.AlignmentFlag.AlignRight | Qt.AlignmentFlag.AlignVCenter)

        text_col.addWidget(self.page_text)
        text_col.addWidget(self.mode_text)
        row.addLayout(text_col, 0)

        outer.addLayout(row)

    def _on_slider_pressed(self):
        self.scrub_drag_changed.emit(True)

    def _on_slider_released(self):
        self.scrub_drag_changed.emit(False)
        self.seek_commit.emit(int(self.slider.value()))

    def _on_slider_value_changed(self, value: int):
        if self.slider.isSliderDown():
            self.seek_preview.emit(int(value))

    def set_slider_range(self, count: int):
        n = max(0, int(count))
        hi = max(0, n - 1)
        self.slider.setRange(0, hi)

    def set_slider_value(self, idx: int):
        v = int(max(self.slider.minimum(), min(self.slider.maximum(), int(idx))))
        old = self.slider.blockSignals(True)
        self.slider.setValue(v)
        self.slider.blockSignals(old)

    def set_mode(self, mode: str):
        label = MODE_LABELS.get(str(mode), "Manual")
        self.mode_text.setText(label)
        self.mode_btn.setText(label)

    def set_page_text(self, text: str):
        self.page_text.setText(text or "-")

    def set_playing(self, playing: bool):
        self.play_btn.setText("Pause" if bool(playing) else "Play")

    def enterEvent(self, event):
        self.hover_changed.emit(True)
        super().enterEvent(event)

    def leaveEvent(self, event):
        self.hover_changed.emit(False)
        super().leaveEvent(event)


class ManualScroller(QWidget):
    drag_state_changed = Signal(bool)
    drag_progress = Signal(float, bool)

    def __init__(self, parent=None):
        super().__init__(parent)
        self._progress = 0.0
        self._dragging = False
        self.setMouseTracking(True)
        self.setCursor(Qt.CursorShape.PointingHandCursor)

    def set_progress(self, p: float):
        next_p = max(0.0, min(1.0, float(p)))
        if abs(next_p - self._progress) < 0.0001:
            return
        self._progress = next_p
        self.update()

    def progress(self):
        return float(self._progress)

    def _thumb_rect(self):
        track_margin = 6
        w = max(8, self.width() - 4)
        h = max(40, int(self.height() * 0.10))
        top_min = track_margin
        top_max = max(top_min, self.height() - h - track_margin)
        top = int(top_min + (top_max - top_min) * self._progress)
        x = int((self.width() - w) / 2)
        return x, top, w, h

    def _progress_from_y(self, y: float):
        _, _, _, h = self._thumb_rect()
        track_margin = 6
        top_min = track_margin
        top_max = max(top_min, self.height() - h - track_margin)
        if top_max <= top_min:
            return 0.0
        top = float(y) - (h / 2.0)
        top = max(float(top_min), min(float(top_max), top))
        return (top - float(top_min)) / float(top_max - top_min)

    def mousePressEvent(self, event):
        if event.button() != Qt.MouseButton.LeftButton:
            return super().mousePressEvent(event)
        self._dragging = True
        self.drag_state_changed.emit(True)
        p = self._progress_from_y(event.position().y())
        self.set_progress(p)
        self.drag_progress.emit(self._progress, False)
        event.accept()

    def mouseMoveEvent(self, event):
        if not self._dragging:
            return super().mouseMoveEvent(event)
        p = self._progress_from_y(event.position().y())
        self.set_progress(p)
        self.drag_progress.emit(self._progress, False)
        event.accept()

    def mouseReleaseEvent(self, event):
        if event.button() != Qt.MouseButton.LeftButton:
            return super().mouseReleaseEvent(event)
        if self._dragging:
            self._dragging = False
            self.drag_state_changed.emit(False)
            p = self._progress_from_y(event.position().y())
            self.set_progress(p)
            self.drag_progress.emit(self._progress, True)
            event.accept()
            return
        super().mouseReleaseEvent(event)

    def paintEvent(self, event):
        painter = QPainter(self)
        painter.setRenderHint(QPainter.RenderHint.Antialiasing, True)
        painter.fillRect(self.rect(), Qt.GlobalColor.transparent)

        track_x = int((self.width() - 7) / 2)
        track_rect = self.rect().adjusted(track_x, 6, -(self.width() - track_x - 7), -6)
        painter.setPen(Qt.PenStyle.NoPen)
        painter.setBrush(QColor(255, 255, 255, 24))
        painter.drawRoundedRect(track_rect, 3, 3)

        x, y, w, h = self._thumb_rect()
        thumb_color = QColor(255, 255, 255, 210 if self._dragging else 165)
        painter.setBrush(thumb_color)
        painter.drawRoundedRect(x, y, w, h, 7, 7)
        painter.setPen(QPen(QColor(0, 0, 0, 60), 1))
        painter.drawRoundedRect(x, y, w, h, 7, 7)
        painter.end()


class HudController(QObject):
    def __init__(self, reader, top_bar: TopBar, bottom_hud: BottomHud, scroller: ManualScroller):
        super().__init__(reader)
        self.reader = reader
        self.top_bar = top_bar
        self.bottom_hud = bottom_hud
        self.scroller = scroller

        self.hud_hidden = False
        self.hud_pinned = False
        self.hover_hud = False
        self.scrub_dragging = False
        self.scroller_dragging = False

        self._timer = QTimer(self)
        self._timer.setSingleShot(True)
        self._timer.setInterval(3000)
        self._timer.timeout.connect(self._on_inactive_timeout)

        self.top_bar.hover_changed.connect(self._on_hover_changed)
        self.bottom_hud.hover_changed.connect(self._on_hover_changed)
        self.bottom_hud.scrub_drag_changed.connect(self._on_scrub_drag_changed)
        self.scroller.drag_state_changed.connect(self._on_scroller_drag_changed)

    def _is_manual_pinned_mode(self):
        mode = self.reader.get_control_mode()
        return mode in ("manual", "twoPage", "twoPageMangaPlus", "autoFlip")

    def _freeze_active(self):
        if self.scrub_dragging:
            return True
        if self.scroller_dragging:
            return True
        if self.hover_hud:
            return True
        for attr in ("mega_settings_overlay", "volume_nav_overlay", "goto_page_overlay"):
            overlay = getattr(self.reader, attr, None)
            if overlay is not None and overlay.isVisible():
                return True
        return False

    def _on_hover_changed(self, hovering: bool):
        self.hover_hud = bool(hovering)
        if self.hover_hud:
            self.cancel_auto_hide()
            self.set_hidden(False)
        else:
            self.schedule_auto_hide()

    def _on_scrub_drag_changed(self, dragging: bool):
        self.scrub_dragging = bool(dragging)
        if self.scrub_dragging:
            self.cancel_auto_hide()
            self.set_hidden(False)
        else:
            self.schedule_auto_hide()

    def _on_scroller_drag_changed(self, dragging: bool):
        self.scroller_dragging = bool(dragging)
        if self.scroller_dragging:
            self.cancel_auto_hide()
            self.set_hidden(False)
        else:
            self.schedule_auto_hide()

    def _on_inactive_timeout(self):
        if self._is_manual_pinned_mode():
            return
        if self._freeze_active():
            return
        if self.hud_pinned:
            return
        self.set_hidden(True)

    def cancel_auto_hide(self):
        self._timer.stop()

    def schedule_auto_hide(self):
        if self._is_manual_pinned_mode():
            self.cancel_auto_hide()
            return
        if self._freeze_active():
            self.cancel_auto_hide()
            return
        if self.hud_pinned:
            self.cancel_auto_hide()
            return
        self._timer.start()

    def set_hidden(self, hidden: bool):
        next_hidden = bool(hidden)
        if self.hud_hidden == next_hidden:
            return
        self.hud_hidden = next_hidden
        self.top_bar.setVisible(not next_hidden)
        self.bottom_hud.setVisible(not next_hidden)
        self.scroller.setVisible(not next_hidden)
        if not next_hidden:
            self.top_bar.raise_()
            self.bottom_hud.raise_()
            self.scroller.raise_()

    def toggle_hud(self):
        next_hidden = not bool(self.hud_hidden)
        if self._is_manual_pinned_mode():
            if next_hidden:
                self.hud_pinned = False
                self.set_hidden(True)
                self.cancel_auto_hide()
            else:
                self.hud_pinned = True
                self.set_hidden(False)
                self.cancel_auto_hide()
            return
        self.hud_pinned = False
        self.set_hidden(next_hidden)
        if next_hidden:
            self.cancel_auto_hide()
        else:
            self.note_activity()

    def note_activity(self):
        self.set_hidden(False)
        if self._is_manual_pinned_mode():
            self.cancel_auto_hide()
            return
        if self._freeze_active():
            self.cancel_auto_hide()
            return
        self.schedule_auto_hide()

    def refresh_after_ui_change(self):
        if self.hud_hidden and not self._is_manual_pinned_mode():
            self.cancel_auto_hide()
            return
        self.note_activity()

