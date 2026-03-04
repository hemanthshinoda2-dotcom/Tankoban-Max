"""Appearance overlay for the books reader — theme, font, size, spacing."""

from __future__ import annotations

from PySide6.QtCore import Qt, Signal
from PySide6.QtWidgets import (
    QComboBox,
    QFrame,
    QHBoxLayout,
    QLabel,
    QPushButton,
    QSlider,
    QVBoxLayout,
    QWidget,
)

from books_state import THEME_COLORS
from books_ruler import RULER_COLORS


class BooksAppearanceOverlay(QWidget):
    """Translucent overlay for reader appearance settings."""

    settings_changed = Signal(dict)
    close_requested = Signal()

    def __init__(self, parent: QWidget | None = None):
        super().__init__(parent)
        self.setAttribute(Qt.WidgetAttribute.WA_TranslucentBackground)
        self.setStyleSheet("background: transparent;")
        self._settings: dict = {}

    def set_settings(self, settings: dict) -> None:
        self._settings = dict(settings)
        self._rebuild()

    def _rebuild(self) -> None:
        # Clear old layout
        old = self.layout()
        if old:
            while old.count():
                item = old.takeAt(0)
                w = item.widget()
                if w:
                    w.deleteLater()

        outer = QVBoxLayout(self) if not self.layout() else self.layout()
        outer.setContentsMargins(0, 0, 0, 0)

        # Backdrop
        backdrop = QWidget()
        backdrop.setStyleSheet("background: rgba(0,0,0,0.5);")
        backdrop.mousePressEvent = lambda _: self.close_requested.emit()
        outer.addWidget(backdrop)

        # Card
        card = QFrame(self)
        card.setFixedWidth(340)
        card.setStyleSheet("""
            QFrame {
                background: #2a2a3e;
                border-radius: 12px;
                padding: 16px;
            }
            QLabel { color: #e0e0e0; font-size: 13px; }
        """)
        card_layout = QVBoxLayout(card)
        card_layout.setSpacing(14)

        # Theme row
        card_layout.addWidget(QLabel("Theme"))
        theme_row = QHBoxLayout()
        for name in ("light", "sepia", "dark"):
            colors = THEME_COLORS[name]
            btn = QPushButton(name.capitalize())
            btn.setFixedHeight(36)
            btn.setCursor(Qt.CursorShape.PointingHandCursor)
            active = self._settings.get("theme") == name
            border = "2px solid #4a90d9" if active else "2px solid transparent"
            btn.setStyleSheet(f"""
                QPushButton {{
                    background: {colors['bg']};
                    color: {colors['fg']};
                    border: {border};
                    border-radius: 6px;
                    font-size: 12px;
                    padding: 4px 12px;
                }}
                QPushButton:hover {{ border: 2px solid #4a90d9; }}
            """)
            btn.clicked.connect(lambda _, n=name: self._set("theme", n))
            theme_row.addWidget(btn)
        card_layout.addLayout(theme_row)

        # Font size slider
        card_layout.addWidget(QLabel("Font Size"))
        fs_row = QHBoxLayout()
        self._fs_slider = QSlider(Qt.Orientation.Horizontal)
        self._fs_slider.setRange(75, 250)
        self._fs_slider.setValue(self._settings.get("fontSize", 100))
        self._fs_label = QLabel(f"{self._fs_slider.value()}%")
        self._fs_label.setFixedWidth(45)
        self._fs_slider.valueChanged.connect(self._on_font_size)
        fs_row.addWidget(self._fs_slider)
        fs_row.addWidget(self._fs_label)
        card_layout.addLayout(fs_row)

        # Font family
        card_layout.addWidget(QLabel("Font Family"))
        self._ff_combo = QComboBox()
        self._ff_combo.addItems(["serif", "sans-serif", "monospace"])
        current_ff = self._settings.get("fontFamily", "serif")
        idx = self._ff_combo.findText(current_ff)
        if idx >= 0:
            self._ff_combo.setCurrentIndex(idx)
        self._ff_combo.setStyleSheet("""
            QComboBox {
                background: #3a3a4e; color: #e0e0e0;
                border: 1px solid #555; border-radius: 4px;
                padding: 4px 8px; font-size: 13px;
            }
        """)
        self._ff_combo.currentTextChanged.connect(lambda t: self._set("fontFamily", t))
        card_layout.addWidget(self._ff_combo)

        # Line height slider
        card_layout.addWidget(QLabel("Line Height"))
        lh_row = QHBoxLayout()
        self._lh_slider = QSlider(Qt.Orientation.Horizontal)
        self._lh_slider.setRange(10, 20)  # 1.0 - 2.0
        lh_val = self._settings.get("lineHeight", 1.5)
        self._lh_slider.setValue(int(lh_val * 10))
        self._lh_label = QLabel(f"{lh_val:.1f}")
        self._lh_label.setFixedWidth(35)
        self._lh_slider.valueChanged.connect(self._on_line_height)
        lh_row.addWidget(self._lh_slider)
        lh_row.addWidget(self._lh_label)
        card_layout.addLayout(lh_row)

        # Margin slider
        card_layout.addWidget(QLabel("Margin"))
        m_row = QHBoxLayout()
        self._m_slider = QSlider(Qt.Orientation.Horizontal)
        self._m_slider.setRange(0, 40)  # 0.0 - 4.0
        m_val = self._settings.get("margin", 1.0)
        self._m_slider.setValue(int(m_val * 10))
        self._m_label = QLabel(f"{m_val:.1f}")
        self._m_label.setFixedWidth(35)
        self._m_slider.valueChanged.connect(self._on_margin)
        m_row.addWidget(self._m_slider)
        m_row.addWidget(self._m_label)
        card_layout.addLayout(m_row)

        # ── Reading Ruler section ──
        from PySide6.QtWidgets import QCheckBox
        ruler = self._settings.get("ruler", {})

        sep = QFrame()
        sep.setFrameShape(QFrame.Shape.HLine)
        sep.setStyleSheet("color: #444;")
        card_layout.addWidget(sep)

        ruler_header = QHBoxLayout()
        ruler_header.addWidget(QLabel("Reading Ruler"))
        self._ruler_cb = QCheckBox()
        self._ruler_cb.setChecked(ruler.get("enabled", False))
        self._ruler_cb.setStyleSheet("QCheckBox { color: #e0e0e0; }")
        self._ruler_cb.toggled.connect(self._on_ruler_enabled)
        ruler_header.addStretch()
        ruler_header.addWidget(self._ruler_cb)
        card_layout.addLayout(ruler_header)

        # Position slider
        rp_row = QHBoxLayout()
        rp_row.addWidget(QLabel("Position"))
        self._rp_slider = QSlider(Qt.Orientation.Horizontal)
        self._rp_slider.setRange(8, 92)
        self._rp_slider.setValue(ruler.get("yPct", 40))
        self._rp_slider.valueChanged.connect(self._on_ruler_pos)
        rp_row.addWidget(self._rp_slider)
        card_layout.addLayout(rp_row)

        # Height slider
        rh_row = QHBoxLayout()
        rh_row.addWidget(QLabel("Height"))
        self._rh_slider = QSlider(Qt.Orientation.Horizontal)
        self._rh_slider.setRange(36, 260)
        self._rh_slider.setValue(ruler.get("heightPx", 92))
        self._rh_slider.valueChanged.connect(self._on_ruler_height)
        rh_row.addWidget(self._rh_slider)
        card_layout.addLayout(rh_row)

        # Dim slider
        rd_row = QHBoxLayout()
        rd_row.addWidget(QLabel("Dim"))
        self._rd_slider = QSlider(Qt.Orientation.Horizontal)
        self._rd_slider.setRange(0, 85)
        self._rd_slider.setValue(ruler.get("dimPct", 42))
        self._rd_slider.valueChanged.connect(self._on_ruler_dim)
        rd_row.addWidget(self._rd_slider)
        card_layout.addLayout(rd_row)

        # Tint slider
        rt_row = QHBoxLayout()
        rt_row.addWidget(QLabel("Tint"))
        self._rt_slider = QSlider(Qt.Orientation.Horizontal)
        self._rt_slider.setRange(0, 60)
        self._rt_slider.setValue(ruler.get("tintPct", 12))
        self._rt_slider.valueChanged.connect(self._on_ruler_tint)
        rt_row.addWidget(self._rt_slider)
        card_layout.addLayout(rt_row)

        # Color swatches
        rc_row = QHBoxLayout()
        rc_row.addWidget(QLabel("Color"))
        current_color = ruler.get("color", "warm")
        for name, rgb in RULER_COLORS.items():
            btn = QPushButton()
            btn.setFixedSize(28, 28)
            btn.setCursor(Qt.CursorShape.PointingHandCursor)
            active = name == current_color
            border = "2px solid #4a90d9" if active else "2px solid transparent"
            btn.setStyleSheet(f"""
                QPushButton {{
                    background: rgb({rgb[0]},{rgb[1]},{rgb[2]});
                    border: {border}; border-radius: 14px;
                }}
                QPushButton:hover {{ border: 2px solid #4a90d9; }}
            """)
            btn.clicked.connect(lambda _, n=name: self._on_ruler_color(n))
            rc_row.addWidget(btn)
        card_layout.addLayout(rc_row)

        # Position card in center
        card.setParent(self)
        card.move(
            (self.width() - card.width()) // 2,
            (self.height() - card.height()) // 2,
        )
        card.show()
        self._card = card

    def resizeEvent(self, event) -> None:
        super().resizeEvent(event)
        if hasattr(self, "_card"):
            self._card.move(
                (self.width() - self._card.width()) // 2,
                (self.height() - self._card.height()) // 2,
            )
        # Resize backdrop to fill
        if self.layout() and self.layout().count() > 0:
            item = self.layout().itemAt(0)
            if item and item.widget():
                item.widget().setFixedSize(self.size())

    def paintEvent(self, event) -> None:
        # Draw semi-transparent backdrop
        from PySide6.QtGui import QPainter, QColor
        painter = QPainter(self)
        painter.fillRect(self.rect(), QColor(0, 0, 0, 128))
        painter.end()

    def keyPressEvent(self, event) -> None:
        if event.key() == Qt.Key.Key_Escape:
            self.close_requested.emit()
        else:
            super().keyPressEvent(event)

    def mousePressEvent(self, event) -> None:
        # Click outside card closes
        if hasattr(self, "_card") and not self._card.geometry().contains(event.pos()):
            self.close_requested.emit()
        super().mousePressEvent(event)

    def _set(self, key: str, value) -> None:
        self._settings[key] = value
        self.settings_changed.emit(dict(self._settings))
        self._rebuild()

    def _on_font_size(self, val: int) -> None:
        self._fs_label.setText(f"{val}%")
        self._settings["fontSize"] = val
        self.settings_changed.emit(dict(self._settings))

    def _on_line_height(self, val: int) -> None:
        fval = val / 10.0
        self._lh_label.setText(f"{fval:.1f}")
        self._settings["lineHeight"] = fval
        self.settings_changed.emit(dict(self._settings))

    def _on_margin(self, val: int) -> None:
        fval = val / 10.0
        self._m_label.setText(f"{fval:.1f}")
        self._settings["margin"] = fval
        self.settings_changed.emit(dict(self._settings))

    def _on_ruler_enabled(self, checked: bool) -> None:
        self._settings.setdefault("ruler", {})["enabled"] = checked
        self.settings_changed.emit(dict(self._settings))

    def _on_ruler_pos(self, val: int) -> None:
        self._settings.setdefault("ruler", {})["yPct"] = val
        self.settings_changed.emit(dict(self._settings))

    def _on_ruler_height(self, val: int) -> None:
        self._settings.setdefault("ruler", {})["heightPx"] = val
        self.settings_changed.emit(dict(self._settings))

    def _on_ruler_dim(self, val: int) -> None:
        self._settings.setdefault("ruler", {})["dimPct"] = val
        self.settings_changed.emit(dict(self._settings))

    def _on_ruler_tint(self, val: int) -> None:
        self._settings.setdefault("ruler", {})["tintPct"] = val
        self.settings_changed.emit(dict(self._settings))

    def _on_ruler_color(self, name: str) -> None:
        self._settings.setdefault("ruler", {})["color"] = name
        self.settings_changed.emit(dict(self._settings))
        self._rebuild()
