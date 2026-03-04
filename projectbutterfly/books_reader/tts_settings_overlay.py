"""TTS settings overlay — voice selection, rate/pitch/volume, presets."""

from __future__ import annotations

from PySide6.QtCore import Qt, Signal, QThread, Slot
from PySide6.QtGui import QFont
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

from tts_engine_base import TTS_PRESETS, TtsEngineBase


class _VoiceLoader(QThread):
    """Load voices in background thread."""
    voices_loaded = Signal(list)

    def __init__(self, engine: TtsEngineBase, parent=None):
        super().__init__(parent)
        self._engine = engine

    def run(self):
        try:
            voices = self._engine.get_voices()
            self.voices_loaded.emit(voices)
        except Exception:
            self.voices_loaded.emit([])


class TtsSettingsOverlay(QWidget):
    """Overlay for TTS voice/rate/pitch/volume settings."""

    close_requested = Signal()
    settings_changed = Signal(dict)  # Emitted on every change

    def __init__(self, parent: QWidget | None = None):
        super().__init__(parent)
        self.setObjectName("tts_settings_overlay")
        self.setAttribute(Qt.WidgetAttribute.WA_StyledBackground, True)
        self.setStyleSheet("""
            #tts_settings_overlay {
                background: rgba(0, 0, 0, 0.6);
            }
        """)

        # Center card
        outer = QVBoxLayout(self)
        outer.setAlignment(Qt.AlignmentFlag.AlignCenter)

        self._card = QFrame()
        self._card.setFixedWidth(380)
        self._card.setStyleSheet("""
            QFrame {
                background: #1e1e2e;
                border-radius: 12px;
                border: 1px solid rgba(255,255,255,0.1);
            }
        """)
        card_layout = QVBoxLayout(self._card)
        card_layout.setContentsMargins(24, 20, 24, 20)
        card_layout.setSpacing(16)

        # Title
        title = QLabel("TTS Settings")
        title.setStyleSheet("color: white; font-size: 16px; font-weight: bold; border: none;")
        card_layout.addWidget(title)

        # Engine label
        self._engine_label = QLabel("Engine: —")
        self._engine_label.setStyleSheet("color: rgba(255,255,255,0.6); font-size: 12px; border: none;")
        card_layout.addWidget(self._engine_label)

        # Voice selector
        voice_row = QHBoxLayout()
        vlabel = QLabel("Voice")
        vlabel.setStyleSheet("color: white; font-size: 13px; border: none;")
        vlabel.setFixedWidth(60)
        self._voice_combo = QComboBox()
        self._voice_combo.setMinimumWidth(200)
        self._voice_combo.setStyleSheet("""
            QComboBox {
                background: #2a2a3e;
                color: white;
                border: 1px solid rgba(255,255,255,0.15);
                border-radius: 4px;
                padding: 4px 8px;
                font-size: 12px;
            }
            QComboBox::drop-down { border: none; }
            QComboBox QAbstractItemView {
                background: #2a2a3e;
                color: white;
                selection-background-color: #3a3a5e;
            }
        """)
        self._voice_combo.currentIndexChanged.connect(self._on_voice_changed)
        voice_row.addWidget(vlabel)
        voice_row.addWidget(self._voice_combo, 1)
        card_layout.addLayout(voice_row)

        # Sliders
        self._rate_slider = self._add_slider(card_layout, "Rate", 50, 200, 100, "1.0×")
        self._pitch_slider = self._add_slider(card_layout, "Pitch", 50, 150, 100, "1.0")
        self._volume_slider = self._add_slider(card_layout, "Volume", 0, 100, 100, "100%")

        self._rate_slider.valueChanged.connect(self._on_rate_changed)
        self._pitch_slider.valueChanged.connect(self._on_pitch_changed)
        self._volume_slider.valueChanged.connect(self._on_volume_changed)

        # Presets
        presets_label = QLabel("Presets")
        presets_label.setStyleSheet("color: white; font-size: 13px; font-weight: bold; border: none;")
        card_layout.addWidget(presets_label)

        presets_row = QHBoxLayout()
        preset_btn_style = """
            QPushButton {
                background: #2a2a3e;
                color: white;
                border: 1px solid rgba(255,255,255,0.1);
                border-radius: 6px;
                padding: 6px 12px;
                font-size: 12px;
            }
            QPushButton:hover { background: #3a3a5e; }
        """
        for key, preset in TTS_PRESETS.items():
            btn = QPushButton(preset["label"])
            btn.setStyleSheet(preset_btn_style)
            btn.setCursor(Qt.CursorShape.PointingHandCursor)
            btn.clicked.connect(lambda checked=False, k=key: self._apply_preset(k))
            presets_row.addWidget(btn)
        card_layout.addLayout(presets_row)

        outer.addWidget(self._card)

        # State
        self._voices: list[dict] = []
        self._voice_id = ""
        self._loader: _VoiceLoader | None = None
        self._slider_labels: dict[str, QLabel] = {}

    def _add_slider(self, layout: QVBoxLayout, label: str,
                    min_val: int, max_val: int, default: int,
                    display: str) -> QSlider:
        row = QHBoxLayout()
        lbl = QLabel(label)
        lbl.setStyleSheet("color: white; font-size: 13px; border: none;")
        lbl.setFixedWidth(60)

        slider = QSlider(Qt.Orientation.Horizontal)
        slider.setRange(min_val, max_val)
        slider.setValue(default)
        slider.setStyleSheet("""
            QSlider::groove:horizontal {
                background: #2a2a3e;
                height: 4px;
                border-radius: 2px;
            }
            QSlider::handle:horizontal {
                background: #6c8aff;
                width: 14px;
                height: 14px;
                margin: -5px 0;
                border-radius: 7px;
            }
            QSlider::sub-page:horizontal {
                background: #6c8aff;
                border-radius: 2px;
            }
        """)

        val_label = QLabel(display)
        val_label.setStyleSheet("color: rgba(255,255,255,0.8); font-size: 12px; border: none;")
        val_label.setFixedWidth(50)
        val_label.setAlignment(Qt.AlignmentFlag.AlignRight | Qt.AlignmentFlag.AlignVCenter)
        self._slider_labels[label] = val_label

        row.addWidget(lbl)
        row.addWidget(slider, 1)
        row.addWidget(val_label)
        layout.addLayout(row)
        return slider

    def load_voices(self, engine: TtsEngineBase) -> None:
        """Start loading voices from the engine in a background thread."""
        self._engine_label.setText(f"Engine: {engine.name()}")
        self._voice_combo.clear()
        self._voice_combo.addItem("Loading voices...")
        self._loader = _VoiceLoader(engine, self)
        self._loader.voices_loaded.connect(self._on_voices_loaded)
        self._loader.start()

    @Slot(list)
    def _on_voices_loaded(self, voices: list[dict]) -> None:
        self._voices = voices
        self._voice_combo.clear()
        if not voices:
            self._voice_combo.addItem("No voices found")
            return
        for v in voices:
            locale = v.get("locale", "")
            name = v.get("name", v.get("id", "?"))
            display = f"{name} ({locale})" if locale else name
            self._voice_combo.addItem(display, v.get("id", ""))
        # Restore selected voice
        if self._voice_id:
            for i in range(self._voice_combo.count()):
                if self._voice_combo.itemData(i) == self._voice_id:
                    self._voice_combo.setCurrentIndex(i)
                    break

    def set_settings(self, settings: dict) -> None:
        """Apply saved TTS settings to the overlay controls."""
        self._voice_id = settings.get("voice", "")
        rate = settings.get("rate", 1.0)
        pitch = settings.get("pitch", 1.0)
        volume = settings.get("volume", 1.0)

        self._rate_slider.blockSignals(True)
        self._rate_slider.setValue(int(rate * 100))
        self._rate_slider.blockSignals(False)
        self._slider_labels["Rate"].setText(f"{rate:.1f}×")

        self._pitch_slider.blockSignals(True)
        self._pitch_slider.setValue(int(pitch * 100))
        self._pitch_slider.blockSignals(False)
        self._slider_labels["Pitch"].setText(f"{pitch:.2f}")

        self._volume_slider.blockSignals(True)
        self._volume_slider.setValue(int(volume * 100))
        self._volume_slider.blockSignals(False)
        self._slider_labels["Volume"].setText(f"{int(volume * 100)}%")

        # Select voice in combo
        if self._voice_id and self._voices:
            for i in range(self._voice_combo.count()):
                if self._voice_combo.itemData(i) == self._voice_id:
                    self._voice_combo.setCurrentIndex(i)
                    break

    def get_settings(self) -> dict:
        """Return current settings as a dict."""
        return {
            "voice": self._voice_id,
            "rate": self._rate_slider.value() / 100.0,
            "pitch": self._pitch_slider.value() / 100.0,
            "volume": self._volume_slider.value() / 100.0,
        }

    def _emit_changed(self) -> None:
        self.settings_changed.emit(self.get_settings())

    def _on_voice_changed(self, index: int) -> None:
        vid = self._voice_combo.itemData(index)
        if vid and isinstance(vid, str):
            self._voice_id = vid
            self._emit_changed()

    def _on_rate_changed(self, value: int) -> None:
        rate = value / 100.0
        self._slider_labels["Rate"].setText(f"{rate:.1f}×")
        self._emit_changed()

    def _on_pitch_changed(self, value: int) -> None:
        pitch = value / 100.0
        self._slider_labels["Pitch"].setText(f"{pitch:.2f}")
        self._emit_changed()

    def _on_volume_changed(self, value: int) -> None:
        self._slider_labels["Volume"].setText(f"{value}%")
        self._emit_changed()

    def _apply_preset(self, key: str) -> None:
        preset = TTS_PRESETS.get(key)
        if not preset:
            return
        self._rate_slider.setValue(int(preset["rate"] * 100))
        self._pitch_slider.setValue(int(preset["pitch"] * 100))

    def keyPressEvent(self, event):
        if event.key() == Qt.Key.Key_Escape:
            self.close_requested.emit()
            return
        super().keyPressEvent(event)

    def mousePressEvent(self, event):
        # Close if clicked outside card
        if not self._card.geometry().contains(event.pos()):
            self.close_requested.emit()
            return
        super().mousePressEvent(event)
