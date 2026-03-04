"""
Mega Settings overlay for the comic reader.

Nested menu system matching the Electron reader's mega_settings.js.
Main panel with rows, each opening submenus. Supports keyboard nav,
back/forward navigation stack, and floater/corner positioning.
"""

from __future__ import annotations

import os
from functools import partial

from PySide6.QtCore import Qt, Signal
from PySide6.QtGui import QColor, QFont, QPainter

from overlay_anim import animate_close, animate_open
from PySide6.QtWidgets import (
    QHBoxLayout,
    QLabel,
    QPushButton,
    QScrollArea,
    QVBoxLayout,
    QWidget,
)


# ── helpers ─────────────────────────────────────────────────────

def _speed_label(level: int) -> str:
    return f"Speed {int(level)}"


def _mode_label(mode: str) -> str:
    return {
        "manual": "Manual",
        "twoPage": "Double Page",
        "twoPageMangaPlus": "Double Page (MangaPlus)",
        "twoPageScroll": "Double Page (Scroll)",
        "auto": "Auto Scroll",
    }.get(str(mode), "Manual")


def _width_label(pct: float) -> str:
    return f"{int(pct * 100)}%"


def _fit_label(fit: str) -> str:
    return "Fit Width" if str(fit) == "width" else "Fit Height"


def _shadow_label(strength: float) -> str:
    if strength < 0.05:
        return "Off"
    if strength < 0.28:
        return "Subtle"
    if strength < 0.45:
        return "Medium"
    return "Strong"


def _quality_label(q: str) -> str:
    return {"off": "Off", "smooth": "Smoother", "sharp": "Sharper", "pixel": "Pixel"}.get(str(q), "Off")


# ── styles ──────────────────────────────────────────────────────

_PANEL_SS = """
QWidget#megaPanel {
  background: rgba(24, 24, 24, 240);
  border: 1px solid rgba(255, 255, 255, 50);
  border-radius: 14px;
}
QLabel#megaTitle {
  color: #ffffff;
  font-size: 16px;
  font-weight: 700;
}
QLabel#megaSubTitle {
  color: #ffffff;
  font-size: 14px;
  font-weight: 600;
}
QPushButton.megaRow {
  color: #ffffff;
  background: transparent;
  border: none;
  border-bottom: 1px solid rgba(255, 255, 255, 18);
  padding: 10px 16px;
  font-size: 13px;
  text-align: left;
}
QPushButton.megaRow:hover {
  background: rgba(255, 255, 255, 22);
}
QPushButton.megaRow:focus {
  background: rgba(255, 255, 255, 30);
  outline: none;
}
QPushButton.megaOption {
  color: #ffffff;
  background: transparent;
  border: none;
  border-bottom: 1px solid rgba(255, 255, 255, 12);
  padding: 9px 16px;
  font-size: 13px;
  text-align: left;
}
QPushButton.megaOption:hover {
  background: rgba(255, 255, 255, 22);
}
QPushButton.megaOption:focus {
  background: rgba(255, 255, 255, 30);
  outline: none;
}
QPushButton#megaBackBtn {
  color: #b8b8b8;
  background: rgba(255, 255, 255, 14);
  border: 1px solid rgba(255, 255, 255, 30);
  border-radius: 8px;
  padding: 4px 12px;
  font-size: 12px;
}
QPushButton#megaBackBtn:hover {
  background: rgba(255, 255, 255, 28);
}
QScrollArea {
  background: transparent;
  border: none;
}
QWidget#megaSubListInner {
  background: transparent;
}
"""


# ── MegaRow ─────────────────────────────────────────────────────

class _MegaRow(QPushButton):
    """A main panel row with label on left, value + chevron on right."""

    def __init__(self, label: str, parent=None):
        super().__init__(parent)
        self.setProperty("class", "megaRow")
        self.setCursor(Qt.CursorShape.PointingHandCursor)
        self.setFocusPolicy(Qt.FocusPolicy.StrongFocus)
        self._label = label
        self._value = ""
        self._update_text()

    def set_value(self, text: str):
        self._value = str(text)
        self._update_text()

    def _update_text(self):
        if self._value:
            self.setText(f"{self._label}        {self._value}  \u203A")
        else:
            self.setText(f"{self._label}  \u203A")


# ── MegaOption ──────────────────────────────────────────────────

class _MegaOption(QPushButton):
    """A submenu option with optional checkmark."""

    def __init__(self, label: str, checked: bool = False, has_chevron: bool = False, parent=None):
        super().__init__(parent)
        self.setProperty("class", "megaOption")
        self.setCursor(Qt.CursorShape.PointingHandCursor)
        self.setFocusPolicy(Qt.FocusPolicy.StrongFocus)
        mark = "  \u2713" if checked else ""
        chev = "  \u203A" if has_chevron else ""
        self.setText(f"{label}{mark}{chev}")


# ── FilterRow ──────────────────────────────────────────────────

class _FilterRow(QWidget):
    """A row with label, -/+ buttons, and value display for image filters."""
    value_changed = Signal(str, int)  # (settings_key, new_value)

    def __init__(self, label: str, key: str, value: int, unit: str,
                 lo: int, hi: int, step: int, parent=None):
        super().__init__(parent)
        self._key = key
        self._value = value
        self._unit = unit
        self._lo = lo
        self._hi = hi
        self._step = step
        self.setFixedHeight(38)
        self.setStyleSheet("background: transparent; border-bottom: 1px solid rgba(255,255,255,12);")

        row = QHBoxLayout(self)
        row.setContentsMargins(16, 2, 16, 2)
        row.setSpacing(6)

        lbl = QLabel(label, self)
        lbl.setStyleSheet("color: #ffffff; font-size: 13px; border: none;")
        row.addWidget(lbl, 1)

        minus_btn = QPushButton("-", self)
        minus_btn.setFixedSize(28, 28)
        minus_btn.setStyleSheet(
            "QPushButton { color: #fff; background: rgba(255,255,255,14); "
            "border: 1px solid rgba(255,255,255,30); border-radius: 6px; font-size: 16px; font-weight: bold; }"
            "QPushButton:hover { background: rgba(255,255,255,28); }"
        )
        minus_btn.setCursor(Qt.CursorShape.PointingHandCursor)
        minus_btn.clicked.connect(self._dec)
        row.addWidget(minus_btn, 0)

        self._val_label = QLabel(f"{value}{unit}", self)
        self._val_label.setFixedWidth(52)
        self._val_label.setAlignment(Qt.AlignmentFlag.AlignCenter)
        self._val_label.setStyleSheet("color: #ffffff; font-size: 13px; font-weight: 600; border: none;")
        row.addWidget(self._val_label, 0)

        plus_btn = QPushButton("+", self)
        plus_btn.setFixedSize(28, 28)
        plus_btn.setStyleSheet(
            "QPushButton { color: #fff; background: rgba(255,255,255,14); "
            "border: 1px solid rgba(255,255,255,30); border-radius: 6px; font-size: 16px; font-weight: bold; }"
            "QPushButton:hover { background: rgba(255,255,255,28); }"
        )
        plus_btn.setCursor(Qt.CursorShape.PointingHandCursor)
        plus_btn.clicked.connect(self._inc)
        row.addWidget(plus_btn, 0)

    def _dec(self):
        self._value = max(self._lo, self._value - self._step)
        self._val_label.setText(f"{self._value}{self._unit}")
        self.value_changed.emit(self._key, self._value)

    def _inc(self):
        self._value = min(self._hi, self._value + self._step)
        self._val_label.setText(f"{self._value}{self._unit}")
        self.value_changed.emit(self._key, self._value)


# ── MegaSettingsOverlay ─────────────────────────────────────────

class MegaSettingsOverlay(QWidget):
    setting_changed = Signal(str, object)  # (key, value)
    action_triggered = Signal(str)         # action name

    def __init__(self, parent=None):
        super().__init__(parent)
        self.setVisible(False)
        self.setAttribute(Qt.WidgetAttribute.WA_TranslucentBackground, True)
        self.setFocusPolicy(Qt.FocusPolicy.StrongFocus)

        self._reader = parent
        self._nav_stack: list[str] = []
        self._current_sub: str = "main"
        self._floater_pos = None

        # ── panel container ───────────────────────────────────
        self._panel = QWidget(self)
        self._panel.setObjectName("megaPanel")
        self._panel.setFixedWidth(380)
        self._panel.setStyleSheet(_PANEL_SS)

        self._panel_layout = QVBoxLayout(self._panel)
        self._panel_layout.setContentsMargins(0, 16, 0, 12)
        self._panel_layout.setSpacing(0)

        # ── main panel ────────────────────────────────────────
        self._main_widget = QWidget(self._panel)
        main_layout = QVBoxLayout(self._main_widget)
        main_layout.setContentsMargins(16, 0, 16, 0)
        main_layout.setSpacing(0)

        title = QLabel("Settings", self._main_widget)
        title.setObjectName("megaTitle")
        title.setAlignment(Qt.AlignmentFlag.AlignCenter)
        main_layout.addWidget(title)
        main_layout.addSpacing(12)

        self._row_mode = _MegaRow("Mode", self._main_widget)
        self._row_mode.clicked.connect(lambda: self._open_sub("modes"))
        main_layout.addWidget(self._row_mode)

        self._row_width = _MegaRow("Portrait width", self._main_widget)
        self._row_width.clicked.connect(lambda: self._open_sub("width"))
        main_layout.addWidget(self._row_width)

        self._row_fit = _MegaRow("Image fit", self._main_widget)
        self._row_fit.clicked.connect(lambda: self._open_sub("imageFit"))
        main_layout.addWidget(self._row_fit)

        self._row_tools = _MegaRow("Tools", self._main_widget)
        self._row_tools.clicked.connect(lambda: self._open_sub("tools"))
        main_layout.addWidget(self._row_tools)

        self._row_progress = _MegaRow("Progress", self._main_widget)
        self._row_progress.clicked.connect(lambda: self._open_sub("progress"))
        main_layout.addWidget(self._row_progress)

        main_layout.addSpacing(8)
        hint = QLabel("Esc to close", self._main_widget)
        hint.setStyleSheet("color: rgba(255,255,255,80); font-size: 11px;")
        hint.setAlignment(Qt.AlignmentFlag.AlignCenter)
        main_layout.addWidget(hint)

        self._panel_layout.addWidget(self._main_widget)

        # ── sub panel ─────────────────────────────────────────
        self._sub_widget = QWidget(self._panel)
        sub_layout = QVBoxLayout(self._sub_widget)
        sub_layout.setContentsMargins(12, 0, 12, 0)
        sub_layout.setSpacing(0)

        top_row = QHBoxLayout()
        top_row.setContentsMargins(4, 0, 4, 8)
        self._back_btn = QPushButton("Back", self._sub_widget)
        self._back_btn.setObjectName("megaBackBtn")
        self._back_btn.clicked.connect(self._go_back)
        top_row.addWidget(self._back_btn, 0)

        self._sub_title = QLabel("", self._sub_widget)
        self._sub_title.setObjectName("megaSubTitle")
        self._sub_title.setAlignment(Qt.AlignmentFlag.AlignCenter)
        top_row.addWidget(self._sub_title, 1)

        # spacer matching back button width
        spacer = QWidget(self._sub_widget)
        spacer.setFixedWidth(50)
        top_row.addWidget(spacer, 0)

        sub_layout.addLayout(top_row)

        self._sub_scroll = QScrollArea(self._sub_widget)
        self._sub_scroll.setWidgetResizable(True)
        self._sub_scroll.setHorizontalScrollBarPolicy(Qt.ScrollBarPolicy.ScrollBarAlwaysOff)
        self._sub_scroll.setVerticalScrollBarPolicy(Qt.ScrollBarPolicy.ScrollBarAsNeeded)
        self._sub_scroll.setStyleSheet("QScrollArea { background: transparent; border: none; }")

        self._sub_list_inner = QWidget()
        self._sub_list_inner.setObjectName("megaSubListInner")
        self._sub_list_layout = QVBoxLayout(self._sub_list_inner)
        self._sub_list_layout.setContentsMargins(0, 0, 0, 0)
        self._sub_list_layout.setSpacing(0)
        self._sub_scroll.setWidget(self._sub_list_inner)

        sub_layout.addWidget(self._sub_scroll, 1)

        self._panel_layout.addWidget(self._sub_widget)
        self._sub_widget.setVisible(False)

    # ── public API ────────────────────────────────────────────

    def open(self):
        self._floater_pos = None  # corner mode (centered)
        self._current_sub = "main"
        self._nav_stack.clear()
        self._sync_main_values()
        self._show_main()
        self.setVisible(True)
        self.raise_()
        self._position_panel()
        animate_open(self._panel)
        self.setFocus()
        self._focus_first_row()

    def open_at(self, pos):
        """Open as a floater near the given local position (right-click mode)."""
        self._floater_pos = pos
        self._current_sub = "main"
        self._nav_stack.clear()
        self._sync_main_values()
        self._show_main()
        self.setVisible(True)
        self.raise_()
        self._position_panel()
        animate_open(self._panel)
        self.setFocus()
        self._focus_first_row()

    def close(self):
        animate_close(self._panel, on_done=lambda: self.setVisible(False))

    def is_open(self) -> bool:
        return self.isVisible()

    # ── paint backdrop ────────────────────────────────────────

    def paintEvent(self, event):
        painter = QPainter(self)
        painter.fillRect(self.rect(), QColor(0, 0, 0, 100))
        painter.end()

    def resizeEvent(self, event):
        super().resizeEvent(event)
        self._position_panel()

    def _position_panel(self):
        pw = self._panel.width()
        ph = min(self._panel.sizeHint().height(), max(200, self.height() - 40))
        self._panel.setFixedHeight(ph)

        if self._floater_pos is not None:
            # Floater mode: position near cursor, clamped to viewport
            x = int(self._floater_pos.x()) - pw // 2
            y = int(self._floater_pos.y()) - ph // 2
            x = max(10, min(self.width() - pw - 10, x))
            y = max(10, min(self.height() - ph - 10, y))
        else:
            # Corner mode: centered
            x = (self.width() - pw) // 2
            y = (self.height() - ph) // 2

        self._panel.move(max(0, x), max(0, y))

    # ── keyboard ──────────────────────────────────────────────

    def keyPressEvent(self, event):
        key = event.key()
        if key == Qt.Key.Key_Escape:
            self.close()
            return
        if key in (Qt.Key.Key_Backspace, Qt.Key.Key_Left):
            if self._current_sub != "main":
                self._go_back()
            else:
                self.close()
            return
        if key == Qt.Key.Key_Down:
            self._focus_next_option(1)
            return
        if key == Qt.Key.Key_Up:
            self._focus_next_option(-1)
            return
        if key in (Qt.Key.Key_Return, Qt.Key.Key_Enter):
            focused = self._panel.focusWidget()
            if isinstance(focused, QPushButton):
                focused.click()
            return
        super().keyPressEvent(event)

    def mousePressEvent(self, event):
        # click on backdrop → close
        child = self.childAt(event.position().toPoint())
        if child is None:
            self.close()
            return
        super().mousePressEvent(event)

    # ── navigation ────────────────────────────────────────────

    def _show_main(self):
        self._main_widget.setVisible(True)
        self._sub_widget.setVisible(False)
        self._current_sub = "main"

    def _show_sub(self, sub_id: str, title: str):
        self._current_sub = sub_id
        self._sub_title.setText(title)
        self._main_widget.setVisible(False)
        self._sub_widget.setVisible(True)
        self._position_panel()

    def _open_sub(self, sub_id: str):
        self._nav_stack.append(self._current_sub)
        self._build_sub(sub_id)
        self._focus_first_option()

    def _go_back(self):
        if self._nav_stack:
            prev = self._nav_stack.pop()
            if prev == "main":
                self._sync_main_values()
                self._show_main()
                self._focus_first_row()
            else:
                self._build_sub(prev)
                self._focus_first_option()
        else:
            self._sync_main_values()
            self._show_main()
            self._focus_first_row()

    # ── focus helpers ─────────────────────────────────────────

    def _focus_first_row(self):
        for child in self._main_widget.findChildren(QPushButton):
            if child.isVisible() and child.isEnabled():
                child.setFocus()
                return

    def _focus_first_option(self):
        for child in self._sub_list_inner.findChildren(QPushButton):
            if child.isVisible() and child.isEnabled():
                child.setFocus()
                return

    def _focus_next_option(self, direction: int):
        current = self._panel.focusWidget()
        if not isinstance(current, QPushButton):
            return
        parent = self._main_widget if self._current_sub == "main" else self._sub_list_inner
        buttons = [b for b in parent.findChildren(QPushButton) if b.isVisible() and b.isEnabled()]
        if current not in buttons:
            return
        idx = buttons.index(current)
        nxt = idx + direction
        if 0 <= nxt < len(buttons):
            buttons[nxt].setFocus()

    # ── sync main row values ──────────────────────────────────

    def _settings(self) -> dict:
        if self._reader is not None:
            return dict(getattr(self._reader, "state", None) and self._reader.state.settings or {})
        return {}

    def _mode(self) -> str:
        if self._reader is not None and hasattr(self._reader, "get_control_mode"):
            return self._reader.get_control_mode()
        return "manual"

    def _sync_main_values(self):
        s = self._settings()
        mode = self._mode()

        self._row_mode.set_value(_mode_label(mode))

        self._row_width.set_value(_width_label(float(s.get("portrait_width_pct", 1.0))))

        is_flip = mode in ("twoPage", "twoPageMangaPlus")
        self._row_fit.setVisible(is_flip)
        if is_flip:
            if mode == "twoPageMangaPlus":
                fit = str(s.get("two_page_mangaplus_image_fit", "width"))
            else:
                fit = str(s.get("two_page_flip_image_fit", "height"))
            self._row_fit.set_value(_fit_label(fit))

        self._row_tools.set_value("")
        self._row_progress.set_value("")

    # ── submenu builders ──────────────────────────────────────

    def _clear_sub_list(self):
        layout = self._sub_list_layout
        while layout.count():
            item = layout.takeAt(0)
            w = item.widget()
            if w:
                w.deleteLater()

    def _build_sub(self, sub_id: str):
        self._clear_sub_list()
        builders = {
            "modes": self._build_modes_sub,
            "width": self._build_width_sub,
            "imageFit": self._build_image_fit_sub,
            "tools": self._build_tools_sub,
            "progress": self._build_progress_sub,
            "view": self._build_view_sub,
            "navigate": self._build_navigate_sub,
            "imageFilters": self._build_filters_sub,
            "shadow": self._build_shadow_sub,
            "scaling": self._build_scaling_sub,
            "bookmarks": self._build_bookmarks_sub,
            "file": self._build_file_sub,
            "keys": self._build_keys_sub,
            "loupe": self._build_loupe_sub,
        }
        builder = builders.get(sub_id)
        if builder:
            builder()
        self._sub_list_layout.addStretch(1)
        self._position_panel()

    def _build_modes_sub(self):
        self._show_sub("modes", "Mode")
        mode = self._mode()
        modes = [
            ("manual", "Manual"),
            ("twoPage", "Double Page"),
            ("twoPageMangaPlus", "Double Page (MangaPlus)"),
            ("twoPageScroll", "Double Page (Scroll)"),
            ("auto", "Auto Scroll"),
        ]
        for m_id, m_label in modes:
            opt = _MegaOption(m_label, checked=(mode == m_id), parent=self._sub_list_inner)
            opt.clicked.connect(partial(self._set_mode, m_id))
            self._sub_list_layout.addWidget(opt)

    def _build_width_sub(self):
        self._show_sub("width", "Portrait Width")
        s = self._settings()
        cur = float(s.get("portrait_width_pct", 1.0))
        widths = [0.50, 0.60, 0.70, 0.74, 0.78, 0.90, 1.00]
        for w in widths:
            opt = _MegaOption(f"{int(w * 100)}%", checked=(abs(cur - w) < 0.02), parent=self._sub_list_inner)
            opt.clicked.connect(partial(self._set_portrait_width, w))
            self._sub_list_layout.addWidget(opt)

    def _build_image_fit_sub(self):
        self._show_sub("imageFit", "Image Fit")
        s = self._settings()
        mode = self._mode()
        if mode == "twoPageMangaPlus":
            cur = str(s.get("two_page_mangaplus_image_fit", "width"))
        else:
            cur = str(s.get("two_page_flip_image_fit", "height"))
        for fit_val, fit_label in [("height", "Fit Height"), ("width", "Fit Width")]:
            opt = _MegaOption(fit_label, checked=(cur == fit_val), parent=self._sub_list_inner)
            opt.clicked.connect(partial(self._set_image_fit, fit_val))
            self._sub_list_layout.addWidget(opt)

    def _build_tools_sub(self):
        self._show_sub("tools", "Tools")
        items = [
            ("Modes", "modes"),
            ("Navigate", "navigate"),
            ("View", "view"),
            ("Bookmarks", "bookmarks"),
            ("File", "file"),
            ("Keys", "keys"),
        ]
        for label, sub_id in items:
            opt = _MegaOption(label, has_chevron=True, parent=self._sub_list_inner)
            opt.clicked.connect(partial(self._open_sub, sub_id))
            self._sub_list_layout.addWidget(opt)

        # Memory saver toggle
        s = self._settings()
        mem = bool(s.get("memory_saver", False))
        mem_opt = _MegaOption(f"Memory Saver {'ON' if mem else 'OFF'}", checked=mem, parent=self._sub_list_inner)
        mem_opt.clicked.connect(self._toggle_memory_saver)
        self._sub_list_layout.addWidget(mem_opt)

        # Cache budget display
        r = self._reader
        if r is not None:
            used, budget = r.bitmap_cache.get_stats()
            used_mb = used / (1024 * 1024)
            budget_mb = budget / (1024 * 1024)
            cache_label = _MegaOption(f"Cache: {used_mb:.0f} MB / {budget_mb:.0f} MB", parent=self._sub_list_inner)
            cache_label.setEnabled(False)
            self._sub_list_layout.addWidget(cache_label)

    def _build_progress_sub(self):
        self._show_sub("progress", "Progress")
        r = self._reader
        if r is None:
            return

        # Current page info
        if r.state.pages:
            total = len(r.state.pages)
            cur = int(r.state.page_index) + 1
            seen = max(int(r.state.max_page_seen) + 1, cur)
            info = _MegaOption(f"Page {cur} of {total}  (furthest: {seen})", parent=self._sub_list_inner)
            info.setEnabled(False)
            self._sub_list_layout.addWidget(info)

        # Go to page
        goto = _MegaOption("Go to page...", parent=self._sub_list_inner)
        goto.clicked.connect(self._action_goto_page)
        self._sub_list_layout.addWidget(goto)

        # Volumes
        vol = _MegaOption("Volumes...", has_chevron=True, parent=self._sub_list_inner)
        vol.clicked.connect(self._action_open_volumes)
        self._sub_list_layout.addWidget(vol)

    def _build_view_sub(self):
        self._show_sub("view", "View")

        # Loupe toggle
        r = self._reader
        loupe_on = r is not None and r.loupe.isVisible()
        loupe = _MegaOption(f"Loupe {'ON' if loupe_on else 'OFF'}", checked=loupe_on, parent=self._sub_list_inner)
        loupe.clicked.connect(self._toggle_loupe)
        self._sub_list_layout.addWidget(loupe)

        # Loupe settings
        loupe_cfg = _MegaOption("Loupe settings...", has_chevron=True, parent=self._sub_list_inner)
        loupe_cfg.clicked.connect(partial(self._open_sub, "loupe"))
        self._sub_list_layout.addWidget(loupe_cfg)

        # Image filters
        filt = _MegaOption("Image filters...", has_chevron=True, parent=self._sub_list_inner)
        filt.clicked.connect(partial(self._open_sub, "imageFilters"))
        self._sub_list_layout.addWidget(filt)

        # Gutter shadow
        shad = _MegaOption("Gutter shadow...", has_chevron=True, parent=self._sub_list_inner)
        shad.clicked.connect(partial(self._open_sub, "shadow"))
        self._sub_list_layout.addWidget(shad)

        # Scaling quality
        scal = _MegaOption("Scaling...", has_chevron=True, parent=self._sub_list_inner)
        scal.clicked.connect(partial(self._open_sub, "scaling"))
        self._sub_list_layout.addWidget(scal)

    def _build_navigate_sub(self):
        self._show_sub("navigate", "Navigate")
        vol = _MegaOption("Volumes...", parent=self._sub_list_inner)
        vol.clicked.connect(self._action_open_volumes)
        self._sub_list_layout.addWidget(vol)

        goto = _MegaOption("Go to page...", parent=self._sub_list_inner)
        goto.clicked.connect(self._action_goto_page)
        self._sub_list_layout.addWidget(goto)

    def _build_filters_sub(self):
        self._show_sub("imageFilters", "Image Filters")
        s = self._settings()
        filters = [
            ("Brightness", "image_brightness_pct", 100, "%", 60, 300, 5),
            ("Contrast", "image_contrast_pct", 100, "%", 60, 300, 5),
            ("Saturation", "image_saturate_pct", 100, "%", 50, 500, 10),
            ("Sepia", "image_sepia_pct", 0, "%", 0, 100, 5),
            ("Hue Rotate", "image_hue_deg", 0, "\u00B0", 0, 360, 15),
        ]
        for label, key, default, unit, lo, hi, step in filters:
            cur = s.get(key, default)
            row = _FilterRow(label, key, int(cur), unit, lo, hi, step, parent=self._sub_list_inner)
            row.value_changed.connect(self._on_filter_value_changed)
            self._sub_list_layout.addWidget(row)

        # Invert toggle
        inv = bool(s.get("image_invert", 0))
        inv_opt = _MegaOption(f"Invert {'ON' if inv else 'OFF'}", checked=inv, parent=self._sub_list_inner)
        inv_opt.clicked.connect(self._toggle_invert)
        self._sub_list_layout.addWidget(inv_opt)

        # Grayscale toggle
        gs = bool(s.get("image_grayscale", 0))
        gs_opt = _MegaOption(f"Grayscale {'ON' if gs else 'OFF'}", checked=gs, parent=self._sub_list_inner)
        gs_opt.clicked.connect(self._toggle_grayscale)
        self._sub_list_layout.addWidget(gs_opt)

        # Presets
        sep_label = QLabel("  Presets")
        sep_label.setStyleSheet(
            "color: rgba(255,255,255,100); font-size: 11px; font-weight: 600; "
            "padding: 10px 16px 4px 16px; background: transparent;"
        )
        self._sub_list_layout.addWidget(sep_label)

        presets = [
            ("Night", {"image_brightness_pct": 70, "image_contrast_pct": 140,
                       "image_saturate_pct": 80, "image_sepia_pct": 15,
                       "image_hue_deg": 0, "image_invert": 0, "image_grayscale": 0}),
            ("Soft", {"image_brightness_pct": 105, "image_contrast_pct": 85,
                      "image_saturate_pct": 85, "image_sepia_pct": 0,
                      "image_hue_deg": 0, "image_invert": 0, "image_grayscale": 0}),
            ("Wash fix", {"image_brightness_pct": 95, "image_contrast_pct": 130,
                          "image_saturate_pct": 140, "image_sepia_pct": 0,
                          "image_hue_deg": 0, "image_invert": 0, "image_grayscale": 0}),
            ("None", {"image_brightness_pct": 100, "image_contrast_pct": 100,
                      "image_saturate_pct": 100, "image_sepia_pct": 0,
                      "image_hue_deg": 0, "image_invert": 0, "image_grayscale": 0}),
        ]
        for name, vals in presets:
            opt = _MegaOption(name, parent=self._sub_list_inner)
            opt.clicked.connect(partial(self._apply_filter_preset, vals))
            self._sub_list_layout.addWidget(opt)

        # Reset all
        reset = _MegaOption("Reset all filters", parent=self._sub_list_inner)
        reset.clicked.connect(self._reset_filters)
        self._sub_list_layout.addWidget(reset)

    def _on_filter_value_changed(self, key: str, value: int):
        self._apply_setting(key, value)

    def _build_shadow_sub(self):
        self._show_sub("shadow", "Gutter Shadow")
        s = self._settings()
        cur = float(s.get("gutter_shadow_strength", 0.35))
        presets = [("Off", 0.0), ("Subtle", 0.22), ("Medium", 0.35), ("Strong", 0.55)]
        for label, value in presets:
            opt = _MegaOption(label, checked=(abs(cur - value) < 0.03), parent=self._sub_list_inner)
            opt.clicked.connect(partial(self._set_shadow, value))
            self._sub_list_layout.addWidget(opt)

    def _build_scaling_sub(self):
        self._show_sub("scaling", "Scaling Quality")
        s = self._settings()
        cur = str(s.get("image_scale_quality", "off"))
        options = [("Off", "off"), ("Smoother", "smooth"), ("Sharper", "sharp"), ("Pixel", "pixel")]
        for label, value in options:
            opt = _MegaOption(label, checked=(cur == value), parent=self._sub_list_inner)
            opt.clicked.connect(partial(self._set_scaling, value))
            self._sub_list_layout.addWidget(opt)

    def _build_bookmarks_sub(self):
        self._show_sub("bookmarks", "Bookmarks")
        r = self._reader
        if r is None:
            return
        # Bookmark current page
        cur_page = int(r.state.page_index)
        is_bm = r._is_bookmarked(cur_page)
        bm = _MegaOption("Remove bookmark" if is_bm else "Bookmark this page", parent=self._sub_list_inner)
        bm.clicked.connect(self._toggle_bookmark)
        self._sub_list_layout.addWidget(bm)

        # Show bookmarks
        bookmarks = sorted(r._bookmarks)
        for bi in bookmarks[:10]:
            opt = _MegaOption(f"Page {bi + 1}", parent=self._sub_list_inner)
            opt.clicked.connect(partial(self._goto_bookmark, bi))
            self._sub_list_layout.addWidget(opt)

    def _build_file_sub(self):
        self._show_sub("file", "File")

        save_opt = _MegaOption("Save current page...", parent=self._sub_list_inner)
        save_opt.clicked.connect(self._action_save_page)
        self._sub_list_layout.addWidget(save_opt)

        copy_img = _MegaOption("Copy current page to clipboard", parent=self._sub_list_inner)
        copy_img.clicked.connect(self._action_copy_page_image)
        self._sub_list_layout.addWidget(copy_img)

        sep = _MegaOption("", parent=self._sub_list_inner)
        sep.setEnabled(False)
        sep.setFixedHeight(1)
        self._sub_list_layout.addWidget(sep)

        copy_opt = _MegaOption("Copy volume path", parent=self._sub_list_inner)
        copy_opt.clicked.connect(self._action_copy_path)
        self._sub_list_layout.addWidget(copy_opt)

        reveal_opt = _MegaOption("Reveal in Explorer", parent=self._sub_list_inner)
        reveal_opt.clicked.connect(self._action_reveal)
        self._sub_list_layout.addWidget(reveal_opt)

    def _build_keys_sub(self):
        self._show_sub("keys", "Keyboard Shortcuts")
        shortcuts = [
            ("M", "Toggle Manual / Auto Scroll"),
            ("I", "Toggle manga invert (R\u2192L)"),
            ("P", "Toggle page coupling nudge"),
            ("F", "Toggle fullscreen"),
            ("H", "Toggle HUD"),
            ("S", "Open settings"),
            ("K", "Keyboard shortcuts"),
            ("L", "Toggle loupe"),
            ("V", "Speed slider"),
            ("O", "Volume navigator"),
            ("G", "Go to page"),
            ("B", "Toggle bookmark"),
            ("Z", "Instant replay (restart volume)"),
            (",  /  .", "Decrease / Increase scroll speed"),
            ("Space", "Play / Pause (auto modes)"),
            ("\u2190  /  \u2192", "Previous / Next page"),
            ("\u2191  /  \u2193", "Scroll up / down"),
            ("Home / End", "First / Last page"),
            ("Ctrl+M", "Minimize window"),
            ("Ctrl+Q", "Quit application"),
            ("Ctrl+0", "Reset settings to defaults"),
            ("Esc", "Close overlay / Back"),
        ]
        for key, desc in shortcuts:
            opt = _MegaOption(f"{key}    {desc}", parent=self._sub_list_inner)
            opt.setEnabled(False)
            opt.setStyleSheet(
                "QPushButton { color: rgba(255,255,255,200); font-size: 12px; "
                "padding: 6px 16px; border-bottom: 1px solid rgba(255,255,255,8); }"
            )
            self._sub_list_layout.addWidget(opt)

    def _build_loupe_sub(self):
        self._show_sub("loupe", "Loupe Settings")
        s = self._settings()

        cur_zoom = float(s.get("loupe_zoom", 2.0))
        zoom_row = _FilterRow("Zoom", "loupe_zoom_x10", int(cur_zoom * 10), "x",
                              10, 40, 5, parent=self._sub_list_inner)
        zoom_row.value_changed.connect(self._on_loupe_zoom_changed)
        self._sub_list_layout.addWidget(zoom_row)

        cur_size = int(s.get("loupe_size", 220))
        size_row = _FilterRow("Size", "loupe_size", cur_size, "px",
                              140, 500, 20, parent=self._sub_list_inner)
        size_row.value_changed.connect(self._on_loupe_size_changed)
        self._sub_list_layout.addWidget(size_row)

    def _on_loupe_zoom_changed(self, key: str, value: int):
        zoom = float(value) / 10.0
        self._apply_setting("loupe_zoom", zoom)
        r = self._reader
        if r is not None:
            r.loupe.set_zoom(zoom)

    def _on_loupe_size_changed(self, key: str, value: int):
        self._apply_setting("loupe_size", value)
        r = self._reader
        if r is not None:
            r.loupe.set_loupe_size(value)

    # ── actions ───────────────────────────────────────────────

    def _apply_setting(self, key: str, value):
        r = self._reader
        if r is not None:
            r.state.settings[key] = value
            r.canvas.update()
            r._emit_progress_changed()
        self.setting_changed.emit(key, value)

    def _set_mode(self, mode_id: str):
        r = self._reader
        if r is not None:
            prev = r.get_control_mode()
            if prev == "auto":
                r._stop_auto_scroll()
            r.state_machine.set_mode(mode_id)
            if mode_id == "auto":
                r._auto_scroll_paused = False
                r._start_auto_scroll()
            r.go_to_page(r.state.page_index, keep_scroll=False)
            r._toast(r._mode_label(mode_id))
        self.close()

    def _set_portrait_width(self, pct: float):
        self._apply_setting("portrait_width_pct", pct)
        self._go_back()

    def _set_image_fit(self, fit: str):
        r = self._reader
        if r is not None:
            r._set_two_page_image_fit(fit)
        self._go_back()

    def _set_shadow(self, value: float):
        self._apply_setting("gutter_shadow_strength", value)
        self._go_back()

    def _set_scaling(self, value: str):
        r = self._reader
        if r is not None:
            r._set_scale_quality(value)
        self._go_back()

    def _toggle_memory_saver(self):
        s = self._settings()
        cur = bool(s.get("memory_saver", False))
        self._apply_setting("memory_saver", not cur)
        r = self._reader
        if r is not None:
            r.bitmap_cache.set_memory_saver(not cur)
        self._build_sub("tools")

    def _toggle_loupe(self):
        r = self._reader
        if r is not None:
            r.toggle_loupe()
        self.close()

    def _toggle_invert(self):
        s = self._settings()
        cur = int(s.get("image_invert", 0))
        self._apply_setting("image_invert", 0 if cur else 1)
        self._build_sub("imageFilters")

    def _toggle_grayscale(self):
        s = self._settings()
        cur = int(s.get("image_grayscale", 0))
        self._apply_setting("image_grayscale", 0 if cur else 1)
        self._build_sub("imageFilters")

    def _apply_filter_preset(self, vals: dict):
        r = self._reader
        if r is not None:
            for k, v in vals.items():
                r.state.settings[k] = v
            r.canvas.update()
            r._emit_progress_changed()
        self._build_sub("imageFilters")

    def _reset_filters(self):
        keys = [
            "image_brightness_pct", "image_contrast_pct", "image_saturate_pct",
            "image_sepia_pct", "image_hue_deg", "image_invert", "image_grayscale",
        ]
        defaults = {"image_brightness_pct": 100, "image_contrast_pct": 100,
                     "image_saturate_pct": 100, "image_sepia_pct": 0,
                     "image_hue_deg": 0, "image_invert": 0, "image_grayscale": 0}
        r = self._reader
        if r is not None:
            for k in keys:
                r.state.settings[k] = defaults[k]
            r.canvas.update()
            r._emit_progress_changed()
        self._build_sub("imageFilters")

    def _toggle_bookmark(self):
        r = self._reader
        if r is not None:
            r._toggle_bookmark()
        self._build_sub("bookmarks")

    def _goto_bookmark(self, page_idx: int):
        r = self._reader
        if r is not None:
            r.go_to_page(page_idx, keep_scroll=False)
        self.close()

    def _action_goto_page(self):
        self.close()
        r = self._reader
        if r is not None:
            r._open_goto_page_dialog()

    def _action_open_volumes(self):
        self.close()
        r = self._reader
        if r is not None:
            r._open_volume_nav()

    def _action_save_page(self):
        self.close()
        r = self._reader
        if r is not None:
            r._save_current_page()

    def _action_copy_page_image(self):
        r = self._reader
        if r is not None:
            r._copy_current_page_to_clipboard()
        self.close()

    def _action_copy_path(self):
        r = self._reader
        if r is not None:
            r._copy_volume_path()
        self.close()

    def _action_reveal(self):
        r = self._reader
        if r is not None:
            r._reveal_volume_in_explorer()
        self.close()
