from PySide6.QtCore import QObject, QRect, Qt, QTimer, Signal
from PySide6.QtGui import QColor, QLinearGradient, QPainter, QPen
from PySide6.QtWidgets import (
    QFrame,
    QHBoxLayout,
    QLabel,
    QPushButton,
    QVBoxLayout,
    QWidget,
)


MODE_LABELS = {
    "manual": "Manual",
    "twoPage": "Double Page",
    "twoPageMangaPlus": "MangaPlus",
    "twoPageScroll": "Scroll",
    "auto": "Auto Scroll",
}

# Plain text symbols for HUD buttons (avoid Unicode emoji rendering on Windows)
_SYM_BACK = "<"
_SYM_PREV = "|<"
_SYM_PLAY = ">"
_SYM_PAUSE = "||"
_SYM_NEXT = ">|"
_SYM_PREV_VOL = "<<"
_SYM_NEXT_VOL = ">>"
_SYM_MODE = "*"


class TopBar(QFrame):
    back_clicked = Signal()
    hover_changed = Signal(bool)

    def __init__(self, parent=None):
        super().__init__(parent)
        self.setObjectName("readerTopBar")
        self.setAttribute(Qt.WidgetAttribute.WA_TranslucentBackground, True)
        self.setStyleSheet(
            """
            QFrame#readerTopBar {
              background: transparent;
              border: 0;
            }
            QLabel#topTitle {
              color: rgba(255,255,255,220);
              background: transparent;
              font-size: 14px;
              font-weight: 600;
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

        self.back_btn = QPushButton(_SYM_BACK, self)
        self.back_btn.setObjectName("backButton")
        self.back_btn.setToolTip("Back")
        self.back_btn.clicked.connect(self.back_clicked.emit)
        row.addWidget(self.back_btn, 0, Qt.AlignmentFlag.AlignVCenter)

        self.title = QLabel("-", self)
        self.title.setObjectName("topTitle")
        row.addWidget(self.title, 1)

    def set_title(self, title: str):
        self.title.setText(title or "-")

    def paintEvent(self, event):
        p = QPainter(self)
        g = QLinearGradient(0, 0, 0, self.height())
        g.setColorAt(0.0, QColor(0, 0, 0, 180))
        g.setColorAt(1.0, QColor(0, 0, 0, 0))
        p.fillRect(self.rect(), g)
        p.end()
        super().paintEvent(event)

    def enterEvent(self, event):
        self.hover_changed.emit(True)
        super().enterEvent(event)

    def leaveEvent(self, event):
        self.hover_changed.emit(False)
        super().leaveEvent(event)


class BookmarkScrubBar(QWidget):
    """Custom scrub bar that draws bookmark marks on the track."""
    value_changed = Signal(int)
    slider_pressed = Signal()
    slider_released = Signal()

    def __init__(self, parent=None):
        super().__init__(parent)
        self._min = 0
        self._max = 0
        self._value = 0
        self._dragging = False
        self._bookmarks: set[int] = set()
        self.setFixedHeight(18)
        self.setMouseTracking(True)
        self.setCursor(Qt.CursorShape.PointingHandCursor)

    def setRange(self, lo: int, hi: int):
        self._min = int(lo)
        self._max = max(self._min, int(hi))
        self._value = max(self._min, min(self._max, self._value))
        self.update()

    def setValue(self, val: int):
        v = max(self._min, min(self._max, int(val)))
        if v != self._value:
            self._value = v
            self.update()

    def value(self):
        return self._value

    def minimum(self):
        return self._min

    def maximum(self):
        return self._max

    def isSliderDown(self):
        return self._dragging

    def blockSignals(self, block: bool):
        old = super().blockSignals(block)
        return old

    def set_bookmarks(self, bookmarks: set[int]):
        self._bookmarks = set(bookmarks)
        self.update()

    def _pos_to_value(self, x: float) -> int:
        margin = 8
        usable = max(1, self.width() - 2 * margin)
        frac = max(0.0, min(1.0, (float(x) - margin) / usable))
        span = max(1, self._max - self._min)
        return int(self._min + frac * span + 0.5)

    def _value_to_x(self, val: int) -> float:
        margin = 8
        usable = max(1, self.width() - 2 * margin)
        span = max(1, self._max - self._min)
        frac = float(val - self._min) / span
        return margin + frac * usable

    def mousePressEvent(self, event):
        if event.button() == Qt.MouseButton.LeftButton:
            self._dragging = True
            self.slider_pressed.emit()
            val = self._pos_to_value(event.position().x())
            if val != self._value:
                self._value = val
                self.value_changed.emit(self._value)
                self.update()
            event.accept()

    def mouseMoveEvent(self, event):
        if self._dragging:
            val = self._pos_to_value(event.position().x())
            if val != self._value:
                self._value = val
                self.value_changed.emit(self._value)
                self.update()
            event.accept()

    def mouseReleaseEvent(self, event):
        if event.button() == Qt.MouseButton.LeftButton and self._dragging:
            self._dragging = False
            val = self._pos_to_value(event.position().x())
            self._value = val
            self.slider_released.emit()
            self.update()
            event.accept()

    def paintEvent(self, event):
        painter = QPainter(self)
        painter.setRenderHint(QPainter.RenderHint.Antialiasing, True)

        margin = 8
        cy = self.height() // 2
        track_h = 4
        track_r = 2

        # track background
        painter.setPen(Qt.PenStyle.NoPen)
        painter.setBrush(QColor(255, 255, 255, 34))
        painter.drawRoundedRect(margin, cy - track_h // 2, self.width() - 2 * margin, track_h, track_r, track_r)

        # filled portion
        handle_x = self._value_to_x(self._value)
        fill_w = max(0, int(handle_x) - margin)
        if fill_w > 0:
            painter.setBrush(QColor(255, 255, 255, 160))
            painter.drawRoundedRect(margin, cy - track_h // 2, fill_w, track_h, track_r, track_r)

        # bookmark marks
        if self._bookmarks and self._max > self._min:
            painter.setBrush(QColor(199, 167, 107, 200))
            for bm in self._bookmarks:
                if self._min <= bm <= self._max:
                    bx = self._value_to_x(bm)
                    painter.drawRoundedRect(int(bx) - 1, cy - 5, 3, 10, 1, 1)

        # handle
        handle_r = 7
        painter.setBrush(QColor(255, 255, 255, 255))
        painter.drawEllipse(int(handle_x) - handle_r, cy - handle_r, handle_r * 2, handle_r * 2)

        painter.end()


class BottomHud(QFrame):
    prev_clicked = Signal()
    play_clicked = Signal()
    next_clicked = Signal()
    mode_clicked = Signal()
    prev_vol_clicked = Signal()
    next_vol_clicked = Signal()
    seek_preview = Signal(int)
    seek_commit = Signal(int)
    scrub_drag_changed = Signal(bool)
    hover_changed = Signal(bool)

    def __init__(self, parent=None):
        super().__init__(parent)
        self.setObjectName("readerBottomHud")
        self.setAttribute(Qt.WidgetAttribute.WA_TranslucentBackground, True)
        self.setStyleSheet(
            """
            QFrame#readerBottomHud {
              background: transparent;
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
            QPushButton.hudSmall {
              color: #b8b8b8;
              background: rgba(255,255,255,14);
              border: 1px solid rgba(255,255,255,36);
              border-radius: 8px;
              padding: 3px 7px;
              font-size: 13px;
              min-height: 22px;
              min-width: 22px;
            }
            QPushButton.hudSmall:hover {
              background: rgba(255,255,255,30);
              color: #ffffff;
            }
            QPushButton.hudSmall:disabled {
              color: rgba(255,255,255,20);
              border-color: rgba(255,255,255,10);
            }
            QLabel#pageText {
              color: rgba(255,255,255,200);
              background: transparent;
              font-size: 12px;
            }
            """
        )
        outer = QVBoxLayout(self)
        outer.setContentsMargins(12, 8, 12, 10)
        outer.setSpacing(8)

        self.slider = BookmarkScrubBar(self)
        self.slider.value_changed.connect(self._on_slider_value_changed)
        self.slider.slider_pressed.connect(self._on_slider_pressed)
        self.slider.slider_released.connect(self._on_slider_released)
        outer.addWidget(self.slider, 0)

        row = QHBoxLayout()
        row.setContentsMargins(0, 0, 0, 0)
        row.setSpacing(5)

        self.prev_vol_btn = self._icon_btn(_SYM_PREV_VOL, "hudSmall", "Previous volume")
        self.prev_vol_btn.clicked.connect(self.prev_vol_clicked.emit)
        row.addWidget(self.prev_vol_btn, 0)

        self.prev_btn = self._icon_btn(_SYM_PREV, "hudBtn", "Previous page")
        self.prev_btn.clicked.connect(self.prev_clicked.emit)
        row.addWidget(self.prev_btn, 0)

        self.play_btn = self._icon_btn(_SYM_PLAY, "hudBtn", "Play / Pause")
        self.play_btn.clicked.connect(self.play_clicked.emit)
        row.addWidget(self.play_btn, 0)

        self.next_btn = self._icon_btn(_SYM_NEXT, "hudBtn", "Next page")
        self.next_btn.clicked.connect(self.next_clicked.emit)
        row.addWidget(self.next_btn, 0)

        self.next_vol_btn = self._icon_btn(_SYM_NEXT_VOL, "hudSmall", "Next volume")
        self.next_vol_btn.clicked.connect(self.next_vol_clicked.emit)
        row.addWidget(self.next_vol_btn, 0)

        self.mode_btn = self._icon_btn(_SYM_MODE, "hudBtn", "Cycle mode")
        self.mode_btn.clicked.connect(self.mode_clicked.emit)
        row.addWidget(self.mode_btn, 0)

        row.addStretch(1)

        self.page_text = QLabel("-", self)
        self.page_text.setObjectName("pageText")
        row.addWidget(self.page_text, 0)

        outer.addLayout(row)

    def _icon_btn(self, text: str, cls: str, tooltip: str) -> QPushButton:
        btn = QPushButton(text, self)
        btn.setProperty("class", cls)
        btn.setToolTip(tooltip)
        return btn

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
        self.mode_btn.setToolTip(f"Mode: {label}")

    def set_page_text(self, text: str):
        self.page_text.setText(text or "-")

    def set_playing(self, playing: bool):
        self.play_btn.setText(_SYM_PAUSE if bool(playing) else _SYM_PLAY)

    def paintEvent(self, event):
        p = QPainter(self)
        g = QLinearGradient(0, 0, 0, self.height())
        g.setColorAt(0.0, QColor(0, 0, 0, 0))
        g.setColorAt(1.0, QColor(0, 0, 0, 190))
        p.fillRect(self.rect(), g)
        p.end()
        super().paintEvent(event)

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
        return mode in ("manual", "twoPage", "twoPageMangaPlus")

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

