"""Edge TTS engine — uses Microsoft Edge neural voices via edge-tts package."""

from __future__ import annotations

import asyncio
import os
import tempfile

from tts_engine_base import TtsEngineBase, TtsBoundary


class EdgeTtsEngine(TtsEngineBase):
    """TTS engine using the edge-tts Python package."""

    def __init__(self, parent=None):
        super().__init__(parent)
        self._cancelled = False

    def name(self) -> str:
        return "Edge TTS"

    def is_available(self) -> bool:
        try:
            import edge_tts  # noqa: F401
            return True
        except ImportError:
            return False

    def get_voices(self) -> list[dict]:
        """Fetch available voices (blocks — call from worker thread)."""
        try:
            import edge_tts
            voices = asyncio.run(edge_tts.list_voices())
            return [
                {
                    "id": v["ShortName"],
                    "name": v.get("FriendlyName", v["ShortName"]),
                    "locale": v.get("Locale", ""),
                    "gender": v.get("Gender", ""),
                }
                for v in voices
            ]
        except Exception as e:
            print(f"[tts-edge] get_voices error: {e}")
            return []

    def synthesize(self, text: str, voice: str,
                   rate: float, pitch: float, volume: float) -> tuple[str, list[TtsBoundary]]:
        """Synthesize text to MP3. Blocks — call from worker thread."""
        try:
            import edge_tts
        except ImportError:
            return "", []

        self._cancelled = False

        rate_str = f"{int((rate - 1) * 100):+d}%"
        pitch_str = f"{int((pitch - 1) * 50):+d}Hz"
        vol_str = f"{int((volume - 1) * 100):+d}%"

        if not voice:
            voice = "en-US-AriaNeural"

        try:
            communicate = edge_tts.Communicate(
                text, voice, rate=rate_str, pitch=pitch_str, volume=vol_str,
            )

            fd, tmp_path = tempfile.mkstemp(suffix=".mp3", prefix="tts_")
            os.close(fd)

            boundaries: list[TtsBoundary] = []

            async def _run():
                with open(tmp_path, "wb") as f:
                    async for chunk in communicate.stream():
                        if self._cancelled:
                            break
                        if chunk["type"] == "audio":
                            f.write(chunk["data"])
                        elif chunk["type"] == "WordBoundary":
                            boundaries.append(TtsBoundary(
                                offset_ms=chunk["offset"] // 10000,
                                text_offset=chunk["text_offset"],
                                text_length=len(chunk["text"]),
                            ))

            asyncio.run(_run())

            if self._cancelled:
                try:
                    os.unlink(tmp_path)
                except OSError:
                    pass
                return "", []

            return tmp_path, boundaries

        except Exception as e:
            print(f"[tts-edge] synthesize error: {e}")
            return "", []

    def cancel(self) -> None:
        self._cancelled = True
