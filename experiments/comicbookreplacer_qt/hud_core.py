from PySide6.QtCore import QEasingCurve, QObject, QPropertyAnimation, QRect, Qt, QTimer, Signal
from PySide6.QtGui import QColor, QLinearGradient, QPainter, QPen
from PySide6.QtWidgets import QGraphicsOpacityEffect
from PySide6.QtWidgets import (
    QFrame,
    QHBoxLayout,
    QLabel,
    QPushButton,
    QVBoxLayout,
    QWidget,
)


class OutlinedButton(QPushButton):
    """QPushButton that draws text with a black outline for readability on any background."""

    def __init__(self, text="", parent=None):
        super().__init__(text, parent)
        self._fg_color = QColor(255, 255, 255)
        self._fg_disabled = QColor(255, 255, 255, 80)

    def set_fg_color(self, color: QColor):
        self._fg_color = color

    def paintEvent(self, event):
        from PySide6.QtWidgets import QStyleOptionButton, QStyle
        # Draw button background only (hover highlight, etc.)
        p = QPainter(self)
        opt = QStyleOptionButton()
        self.initStyleOption(opt)
        # Clear text so style only draws background
        opt.text = ""
        opt.icon = self.icon()  # keep icon if any
        self.style().drawControl(QStyle.ControlElement.CE_PushButton, opt, p, self)

        p.setRenderHint(QPainter.RenderHint.Antialiasing, True)
        p.setRenderHint(QPainter.RenderHint.TextAntialiasing, True)
        p.setFont(self.font())

        rect = self.contentsRect()
        text = self.text()
        if not text:
            p.end()
            return

        align = Qt.AlignmentFlag.AlignCenter

        # Foreground
        fg = self._fg_color if self.isEnabled() else self._fg_disabled

        # Black outline: draw text offset in 8 directions (skip for disabled)
        if self.isEnabled():
            p.setPen(QPen(QColor(0, 0, 0, 200), 1))
            for dx, dy in ((-1, -1), (-1, 0), (-1, 1), (0, -1), (0, 1), (1, -1), (1, 0), (1, 1)):
                p.drawText(rect.adjusted(dx, dy, dx, dy), align, text)
        p.setPen(fg)
        p.drawText(rect, align, text)
        p.end()


class OutlinedLabel(QLabel):
    """QLabel that draws text with a black outline."""

    def paintEvent(self, event):
        p = QPainter(self)
        p.setRenderHint(QPainter.RenderHint.Antialiasing, True)
        p.setRenderHint(QPainter.RenderHint.TextAntialiasing, True)
        p.setFont(self.font())
        rect = self.contentsRect()
        text = self.text()
        if not text:
            p.end()
            return
        align = int(self.alignment())
        p.setPen(QPen(QColor(0, 0, 0, 200), 1))
        for dx, dy in ((-1, -1), (-1, 0), (-1, 1), (0, -1), (0, 1), (1, -1), (1, 0), (1, 1)):
            p.drawText(rect.adjusted(dx, dy, dx, dy), align, text)
        p.setPen(self.palette().color(self.foregroundRole()))
        p.drawText(rect, align, text)
        p.end()


class WindowControlButton(QPushButton):
    """Draws minimize/maximize/close icons matching the main Tankoban app's SVG shapes."""

    def __init__(self, kind: str, parent=None):
        super().__init__("", parent)
        self._kind = kind  # "minimize", "maximize", "close"
        self.setFixedSize(36, 28)
        self.setCursor(Qt.CursorShape.PointingHandCursor)
        self.setStyleSheet(
            "QPushButton { background: transparent; border: none; }"
            "QPushButton:hover { background: rgba(255,255,255,30); }"
        )
        if kind == "close":
            self.setStyleSheet(
                "QPushButton { background: transparent; border: none; }"
                "QPushButton:hover { background: rgba(232,17,35,200); }"
            )

    def _draw_icon(self, p: QPainter, cx: float, cy: float):
        if self._kind == "minimize":
            p.drawLine(int(cx - 5), int(cy), int(cx + 5), int(cy))
        elif self._kind == "maximize":
            p.setBrush(Qt.BrushStyle.NoBrush)
            p.drawRect(int(cx - 5), int(cy - 5), 10, 10)
        elif self._kind == "close":
            p.drawLine(int(cx - 4), int(cy - 4), int(cx + 4), int(cy + 4))
            p.drawLine(int(cx + 4), int(cy - 4), int(cx - 4), int(cy + 4))

    def paintEvent(self, event):
        super().paintEvent(event)
        p = QPainter(self)
        p.setRenderHint(QPainter.RenderHint.Antialiasing, True)
        cx, cy = self.width() / 2, self.height() / 2

        # Black outline: draw icon offset in 8 directions
        outline_pen = QPen(QColor(0, 0, 0, 200), 1.2)
        outline_pen.setCapStyle(Qt.PenCapStyle.RoundCap)
        for dx, dy in ((-1, -1), (-1, 0), (-1, 1), (0, -1), (0, 1), (1, -1), (1, 0), (1, 1)):
            p.setPen(outline_pen)
            self._draw_icon(p, cx + dx, cy + dy)

        # White foreground
        fg_pen = QPen(QColor(255, 255, 255), 1.2)
        fg_pen.setCapStyle(Qt.PenCapStyle.RoundCap)
        p.setPen(fg_pen)
        self._draw_icon(p, cx, cy)
        p.end()


class ArrowButton(QPushButton):
    """Painted arrow button — guaranteed identical rendering for left/right."""

    def __init__(self, direction: str, parent=None):
        super().__init__("", parent)
        self._direction = direction  # "left" or "right"
        self.setCursor(Qt.CursorShape.PointingHandCursor)
        self.setFixedSize(40, 34)
        self.setStyleSheet(
            "QPushButton { background: transparent; border: none; border-radius: 10px; }"
            "QPushButton:hover { background: rgba(255,255,255,30); }"
        )

    def _draw_chevron(self, p: QPainter, cx: float, cy: float):
        """Draw a simple > or < chevron centered at (cx, cy)."""
        sign = 1 if self._direction == "right" else -1
        # Three points: top-back, tip, bottom-back
        tip_x = cx + sign * 6
        back_x = cx - sign * 6
        p.drawLine(int(back_x), int(cy - 7), int(tip_x), int(cy))
        p.drawLine(int(tip_x), int(cy), int(back_x), int(cy + 7))

    def paintEvent(self, event):
        super().paintEvent(event)
        p = QPainter(self)
        p.setRenderHint(QPainter.RenderHint.Antialiasing, True)
        cx, cy = self.width() / 2, self.height() / 2

        fg = QColor(255, 255, 255) if self.isEnabled() else QColor(255, 255, 255, 80)

        if self.isEnabled():
            outline_pen = QPen(QColor(0, 0, 0, 200), 2.0)
            outline_pen.setCapStyle(Qt.PenCapStyle.RoundCap)
            outline_pen.setJoinStyle(Qt.PenJoinStyle.RoundJoin)
            for dx, dy in ((-1, -1), (-1, 0), (-1, 1), (0, -1), (0, 1), (1, -1), (1, 0), (1, 1)):
                p.setPen(outline_pen)
                self._draw_chevron(p, cx + dx, cy + dy)

        fg_pen = QPen(fg, 2.0)
        fg_pen.setCapStyle(Qt.PenCapStyle.RoundCap)
        fg_pen.setJoinStyle(Qt.PenJoinStyle.RoundJoin)
        p.setPen(fg_pen)
        self._draw_chevron(p, cx, cy)
        p.end()


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
_SYM_PLAY = "\u25b6"   # ▶
_SYM_PAUSE = "\u23f8"  # ⏸
_SYM_NEXT = ">|"
_SYM_PREV_VOL = "<<"
_SYM_NEXT_VOL = ">>"
_SYM_MODE = "*"


class TopBar(QFrame):
    back_clicked = Signal()
    minimize_clicked = Signal()
    fullscreen_clicked = Signal()
    close_clicked = Signal()
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
              color: #ffffff;
              background: transparent;
              font-size: 16px;
              font-weight: 700;
            }
            QPushButton#backButton {
              color: #ffffff;
              background: transparent;
              border: none;
              padding: 6px 14px;
              font-size: 20px;
              font-weight: bold;
            }
            QPushButton#backButton:hover {
              background: rgba(255,255,255,30);
              border-radius: 8px;
            }
            """
        )

        row = QHBoxLayout(self)
        row.setContentsMargins(12, 8, 12, 8)
        row.setSpacing(10)

        self.back_btn = OutlinedButton(_SYM_BACK, self)
        self.back_btn.setObjectName("backButton")
        self.back_btn.setToolTip("Back")
        self.back_btn.clicked.connect(self.back_clicked.emit)
        row.addWidget(self.back_btn, 0, Qt.AlignmentFlag.AlignVCenter)

        self.title = OutlinedLabel("-", self)
        self.title.setObjectName("topTitle")
        row.addWidget(self.title, 1)

        self.bookmark_icon = QLabel("", self)
        self.bookmark_icon.setStyleSheet(
            "color: rgba(199, 167, 107, 220); background: transparent; "
            "font-size: 18px; font-weight: bold; padding: 0 8px;"
        )
        self.bookmark_icon.setVisible(False)
        row.addWidget(self.bookmark_icon, 0, Qt.AlignmentFlag.AlignVCenter)

        # Window controls (right side, matching main app)
        self.min_btn = WindowControlButton("minimize", self)
        self.min_btn.setToolTip("Minimize")
        self.min_btn.clicked.connect(self.minimize_clicked.emit)
        row.addWidget(self.min_btn, 0, Qt.AlignmentFlag.AlignVCenter)

        self.max_btn = WindowControlButton("maximize", self)
        self.max_btn.setToolTip("Maximize / Restore")
        self.max_btn.clicked.connect(self.fullscreen_clicked.emit)
        row.addWidget(self.max_btn, 0, Qt.AlignmentFlag.AlignVCenter)

        self.close_btn = WindowControlButton("close", self)
        self.close_btn.setToolTip("Close")
        self.close_btn.clicked.connect(self.close_clicked.emit)
        row.addWidget(self.close_btn, 0, Qt.AlignmentFlag.AlignVCenter)

    def set_title(self, title: str):
        self.title.setText(title or "-")

    def set_bookmarked(self, is_bookmarked: bool):
        self.bookmark_icon.setText("[B]" if is_bookmarked else "")
        self.bookmark_icon.setVisible(bool(is_bookmarked))

    def paintEvent(self, event):
        p = QPainter(self)
        g = QLinearGradient(0, 0, 0, self.height())
        g.setColorAt(0.0, QColor(0, 0, 0, 220))
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
        self._hovered = False
        self._bookmarks: set[int] = set()
        self.setFixedHeight(18)
        self.setMouseTracking(True)
        self.setCursor(Qt.CursorShape.PointingHandCursor)

        # Page bubble tooltip
        self._bubble = QLabel(self)
        self._bubble.setStyleSheet(
            "background: rgba(30,30,30,220); color: #fff; font-size: 12px; "
            "font-weight: bold; padding: 3px 8px; border-radius: 6px;"
        )
        self._bubble.setAlignment(Qt.AlignmentFlag.AlignCenter)
        self._bubble.hide()

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

    def enterEvent(self, event):
        self._hovered = True
        self.update()
        super().enterEvent(event)

    def leaveEvent(self, event):
        self._hovered = False
        self._bubble.hide()
        self.update()
        super().leaveEvent(event)

    def _update_bubble(self, x: float):
        """Position and show the page bubble above the cursor."""
        page = self._pos_to_value(x)
        self._bubble.setText(str(page + 1))  # 1-based display
        self._bubble.adjustSize()
        bw = self._bubble.width()
        bx = int(x - bw / 2)
        bx = max(0, min(self.width() - bw, bx))
        self._bubble.move(bx, -self._bubble.height() - 4)
        self._bubble.show()

    def mousePressEvent(self, event):
        if event.button() == Qt.MouseButton.LeftButton:
            self._dragging = True
            self.slider_pressed.emit()
            val = self._pos_to_value(event.position().x())
            if val != self._value:
                self._value = val
                self.value_changed.emit(self._value)
                self.update()
            self._update_bubble(event.position().x())
            event.accept()

    def mouseMoveEvent(self, event):
        if self._dragging:
            val = self._pos_to_value(event.position().x())
            if val != self._value:
                self._value = val
                self.value_changed.emit(self._value)
                self.update()
            self._update_bubble(event.position().x())
            event.accept()
        elif self._hovered:
            self._update_bubble(event.position().x())

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
        track_h = 6 if self._hovered or self._dragging else 3
        track_r = track_h // 2

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

        # handle — only visible on hover or drag
        if self._hovered or self._dragging:
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
    navigate_clicked = Signal()
    fit_clicked = Signal()
    width_clicked = Signal()
    gap_changed = Signal(int)
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
              background: transparent;
              border: none;
              border-radius: 10px;
              padding: 6px 14px;
              font-size: 18px;
              font-weight: bold;
              min-height: 30px;
            }
            QPushButton.hudBtn:hover {
              background: rgba(255,255,255,30);
            }
            QPushButton.hudSmall {
              color: #b0b0b0;
              background: transparent;
              border: none;
              border-radius: 8px;
              padding: 6px 10px;
              font-size: 20px;
              font-weight: bold;
              min-height: 30px;
              min-width: 30px;
            }
            QPushButton.hudSmall:hover {
              background: rgba(255,255,255,20);
              color: #ffffff;
            }
            QPushButton.hudSmall:disabled {
              color: rgba(255,255,255,15);
            }
            QLabel#pageText {
              color: #ffffff;
              background: transparent;
              font-size: 14px;
              font-weight: bold;
              font-family: monospace;
            }
            """
        )
        outer = QVBoxLayout(self)
        outer.setContentsMargins(12, 6, 12, 8)
        outer.setSpacing(6)

        # --- Scrub row: scrub bar + quick actions ---
        scrub_row = QHBoxLayout()
        scrub_row.setContentsMargins(0, 0, 0, 0)
        scrub_row.setSpacing(6)

        self.slider = BookmarkScrubBar(self)
        self.slider.value_changed.connect(self._on_slider_value_changed)
        self.slider.slider_pressed.connect(self._on_slider_pressed)
        self.slider.slider_released.connect(self._on_slider_released)
        scrub_row.addWidget(self.slider, 1)

        # Quick actions next to scrub bar (matching original: modes, navigate, fit, width)
        self.mode_btn = self._icon_btn("\u25eb", "hudSmall", "Modes")  # ◫
        self.mode_btn.clicked.connect(self.mode_clicked.emit)
        scrub_row.addWidget(self.mode_btn, 0)

        self.nav_btn = self._icon_btn("\u2261", "hudSmall", "Navigate volumes")  # ≡
        self.nav_btn.clicked.connect(self.navigate_clicked.emit)
        scrub_row.addWidget(self.nav_btn, 0)

        self.fit_btn = self._icon_btn("\u2922", "hudSmall", "Image fit")  # ⤢
        self.fit_btn.clicked.connect(self.fit_clicked.emit)
        scrub_row.addWidget(self.fit_btn, 0)

        self.width_btn = self._icon_btn("\u2194", "hudSmall", "Portrait width")  # ↔
        self.width_btn.clicked.connect(self.width_clicked.emit)
        scrub_row.addWidget(self.width_btn, 0)

        # Row gap control (visible only in twoPageScroll mode)
        self._gap_widget = QWidget(self)
        gap_lay = QHBoxLayout(self._gap_widget)
        gap_lay.setContentsMargins(0, 0, 0, 0)
        gap_lay.setSpacing(2)
        self._gap_dec = self._icon_btn("\u2212", "hudSmall", "Decrease row gap")  # −
        self._gap_label = QLabel("16px", self)
        self._gap_label.setStyleSheet("color: #999; font-size: 11px; background: transparent;")
        self._gap_inc = self._icon_btn("+", "hudSmall", "Increase row gap")
        self._gap_dec.clicked.connect(lambda: self.gap_changed.emit(-4))
        self._gap_inc.clicked.connect(lambda: self.gap_changed.emit(4))
        gap_lay.addWidget(self._gap_dec)
        gap_lay.addWidget(self._gap_label)
        gap_lay.addWidget(self._gap_inc)
        self._gap_widget.setVisible(False)
        scrub_row.addWidget(self._gap_widget, 0)

        outer.addLayout(scrub_row)

        # --- Controls row: left (prev/play/next/page) + right (prevVol/nextVol/min/fs/close) ---
        controls_row = QHBoxLayout()
        controls_row.setContentsMargins(0, 0, 0, 0)
        controls_row.setSpacing(4)

        # Left controls
        self.prev_btn = self._icon_btn("\u27e8", "hudBtn", "Previous page")  # ⟨
        self.prev_btn.clicked.connect(self.prev_clicked.emit)
        controls_row.addWidget(self.prev_btn, 0)

        self.play_btn = self._icon_btn("\u25b6", "hudBtn", "Play / Pause")  # ▶
        self.play_btn.clicked.connect(self.play_clicked.emit)
        controls_row.addWidget(self.play_btn, 0)

        self.next_btn = self._icon_btn("\u27e9", "hudBtn", "Next page")  # ⟩
        self.next_btn.clicked.connect(self.next_clicked.emit)
        controls_row.addWidget(self.next_btn, 0)

        self.page_text = OutlinedLabel("\u2014", self)  # —
        self.page_text.setObjectName("pageText")
        controls_row.addWidget(self.page_text, 0)

        controls_row.addStretch(1)

        # Right controls — painted arrows for guaranteed identical rendering
        self.prev_vol_btn = ArrowButton("left", self)
        self.prev_vol_btn.setToolTip("Previous volume")
        self.prev_vol_btn.clicked.connect(self.prev_vol_clicked.emit)
        controls_row.addWidget(self.prev_vol_btn, 0)

        self.next_vol_btn = ArrowButton("right", self)
        self.next_vol_btn.setToolTip("Next volume")
        self.next_vol_btn.clicked.connect(self.next_vol_clicked.emit)
        controls_row.addWidget(self.next_vol_btn, 0)

        outer.addLayout(controls_row)

    def _icon_btn(self, text: str, cls: str, tooltip: str) -> OutlinedButton:
        btn = OutlinedButton(text, self)
        btn.setProperty("class", cls)
        btn.setToolTip(tooltip)
        if cls == "hudSmall":
            btn.set_fg_color(QColor(176, 176, 176))  # #b0b0b0
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

    def set_gap_visible(self, visible: bool):
        self._gap_widget.setVisible(bool(visible))

    def set_gap_value(self, px: int):
        self._gap_label.setText(f"{int(px)}px")

    def paintEvent(self, event):
        p = QPainter(self)
        g = QLinearGradient(0, 0, 0, self.height())
        g.setColorAt(0.0, QColor(0, 0, 0, 0))
        g.setColorAt(1.0, QColor(0, 0, 0, 230))
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
        for attr in ("mega_settings_overlay", "volume_nav_overlay", "goto_page_overlay", "speed_slider_overlay", "keys_overlay"):
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

    def _ensure_hud_effects(self):
        """Attach opacity effects to HUD bars for animation (lazy init)."""
        for bar in (self.top_bar, self.bottom_hud, self.scroller):
            if not hasattr(bar, "_hud_opacity_eff"):
                eff = QGraphicsOpacityEffect(bar)
                bar.setGraphicsEffect(eff)
                bar._hud_opacity_eff = eff

    def _animate_hud_bar(self, bar, show: bool):
        eff = bar._hud_opacity_eff
        anim = QPropertyAnimation(eff, b"opacity", bar)
        anim.setDuration(180)
        anim.setEasingCurve(QEasingCurve.Type.OutCubic if show else QEasingCurve.Type.InCubic)
        if show:
            bar.setVisible(True)
            bar.raise_()
            eff.setOpacity(0.0)
            anim.setStartValue(0.0)
            anim.setEndValue(1.0)
        else:
            anim.setStartValue(1.0)
            anim.setEndValue(0.0)
            anim.finished.connect(lambda: bar.setVisible(False))
            anim.finished.connect(lambda: eff.setOpacity(1.0))
        anim.start()
        bar._hud_anim = anim  # prevent GC

    def set_hidden(self, hidden: bool):
        next_hidden = bool(hidden)
        if self.hud_hidden == next_hidden:
            return
        self.hud_hidden = next_hidden
        self._ensure_hud_effects()
        show = not next_hidden
        for bar in (self.top_bar, self.bottom_hud, self.scroller):
            self._animate_hud_bar(bar, show)

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

