"""System TTS fallback — uses pyttsx3 for offline speech synthesis."""

from __future__ import annotations

import os
import tempfile

from tts_engine_base import TtsEngineBase, TtsBoundary


class SystemTtsEngine(TtsEngineBase):
    """Fallback TTS using pyttsx3 (no word boundaries)."""

    def __init__(self, parent=None):
        super().__init__(parent)
        self._engine = None
        self._cancelled = False

    def name(self) -> str:
        return "System TTS"

    def is_available(self) -> bool:
        try:
            import pyttsx3
            e = pyttsx3.init()
            e.stop()
            return True
        except Exception:
            return False

    def get_voices(self) -> list[dict]:
        try:
            import pyttsx3
            engine = pyttsx3.init()
            voices = engine.getProperty("voices")
            result = [
                {
                    "id": v.id,
                    "name": v.name,
                    "locale": getattr(v, "languages", [""])[0] if getattr(v, "languages", []) else "",
                    "gender": getattr(v, "gender", ""),
                }
                for v in voices
            ]
            engine.stop()
            return result
        except Exception as e:
            print(f"[tts-system] get_voices error: {e}")
            return []

    def synthesize(self, text: str, voice: str,
                   rate: float, pitch: float, volume: float) -> tuple[str, list[TtsBoundary]]:
        """Synthesize to WAV file. No word boundary support."""
        self._cancelled = False
        try:
            import pyttsx3
            engine = pyttsx3.init()
            if voice:
                engine.setProperty("voice", voice)
            engine.setProperty("rate", int(150 * rate))
            engine.setProperty("volume", min(1.0, max(0.0, volume)))

            fd, tmp_path = tempfile.mkstemp(suffix=".wav", prefix="tts_")
            os.close(fd)

            engine.save_to_file(text, tmp_path)
            engine.runAndWait()
            engine.stop()

            if self._cancelled:
                try:
                    os.unlink(tmp_path)
                except OSError:
                    pass
                return "", []

            return tmp_path, []  # No boundaries for system TTS

        except Exception as e:
            print(f"[tts-system] synthesize error: {e}")
            return "", []

    def cancel(self) -> None:
        self._cancelled = True
