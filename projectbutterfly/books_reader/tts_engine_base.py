"""TTS engine abstraction — base classes, enums, dataclasses."""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from enum import Enum
from typing import Any

from PySide6.QtCore import QObject, Signal


class TtsState(Enum):
    IDLE = "idle"
    PLAYING = "playing"
    PAUSED = "paused"


@dataclass
class TtsBlock:
    """A block of text to be spoken (one sentence or paragraph)."""
    index: int
    text: str
    href: str = ""   # EPUB chapter href
    page: int = 0    # PDF page number


@dataclass
class TtsBoundary:
    """Word boundary event from synthesis."""
    offset_ms: int      # audio time in milliseconds
    text_offset: int    # character offset in source text
    text_length: int    # character length of the word


TTS_PRESETS: dict[str, dict[str, Any]] = {
    "natural": {"rate": 1.0, "pitch": 1.0, "label": "Natural"},
    "clear":   {"rate": 0.9, "pitch": 1.05, "label": "Clear"},
    "fast":    {"rate": 1.4, "pitch": 1.0, "label": "Fast Study"},
    "slow":    {"rate": 0.7, "pitch": 0.95, "label": "Slow & Steady"},
}


class TtsEngineBase(QObject, ABC):
    """Abstract base for TTS synthesis engines."""

    synthesis_ready = Signal(str, list)   # (audio_file_path, boundaries)
    synthesis_error = Signal(str)

    @abstractmethod
    def name(self) -> str:
        """Engine display name."""
        ...

    @abstractmethod
    def is_available(self) -> bool:
        """Whether this engine can be used on this system."""
        ...

    @abstractmethod
    def get_voices(self) -> list[dict]:
        """Return list of {id, name, locale, gender} voice dicts."""
        ...

    @abstractmethod
    def synthesize(self, text: str, voice: str,
                   rate: float, pitch: float, volume: float) -> tuple[str, list[TtsBoundary]]:
        """Synthesize text to audio file. Returns (audio_path, boundaries).

        Called from a worker thread — may block.
        """
        ...

    def cancel(self) -> None:
        """Cancel any in-progress synthesis."""
        pass
