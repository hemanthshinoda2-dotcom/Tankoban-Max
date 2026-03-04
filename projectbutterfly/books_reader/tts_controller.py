"""TTS Controller — central orchestrator for text-to-speech playback."""

from __future__ import annotations

import os
import queue
import tempfile
from typing import TYPE_CHECKING

from PySide6.QtCore import QObject, QThread, QTimer, Signal, Slot
from PySide6.QtMultimedia import QAudioOutput, QMediaPlayer

from tts_engine_base import TtsBlock, TtsBoundary, TtsEngineBase, TtsState

if TYPE_CHECKING:
    pass


# ---------------------------------------------------------------------------
# Synthesis worker thread
# ---------------------------------------------------------------------------

class _SynthWorker(QObject):
    """Runs TTS synthesis in a background thread."""

    ready = Signal(str, list)   # (audio_path, boundaries)
    error = Signal(str)

    def __init__(self, parent=None):
        super().__init__(parent)
        self._queue: queue.Queue[tuple | None] = queue.Queue()
        self._engine: TtsEngineBase | None = None

    def set_engine(self, engine: TtsEngineBase | None):
        self._engine = engine

    def enqueue(self, text: str, voice: str,
                rate: float, pitch: float, volume: float):
        self._queue.put((text, voice, rate, pitch, volume))

    def cancel(self):
        # Drain queue
        while not self._queue.empty():
            try:
                self._queue.get_nowait()
            except queue.Empty:
                break
        if self._engine:
            self._engine.cancel()

    @Slot()
    def run(self):
        """Main loop — blocks on queue, synthesizes, emits results."""
        while True:
            item = self._queue.get()
            if item is None:
                break  # Shutdown sentinel
            text, voice, rate, pitch, volume = item
            if self._engine is None:
                self.error.emit("No TTS engine available")
                continue
            try:
                path, boundaries = self._engine.synthesize(
                    text, voice, rate, pitch, volume,
                )
                if path:
                    self.ready.emit(path, boundaries)
                else:
                    self.error.emit("Synthesis returned empty result")
            except Exception as e:
                self.error.emit(str(e))


# ---------------------------------------------------------------------------
# TTS Controller
# ---------------------------------------------------------------------------

class TtsController(QObject):
    """Central TTS orchestrator: text extraction → synthesis → playback."""

    state_changed = Signal(str)              # TtsState value
    block_changed = Signal(int, str)         # (block_index, block_text)
    word_boundary = Signal(int, int)         # (text_offset, text_length)
    progress_changed = Signal(int, int)      # (current_block, total_blocks)
    error_occurred = Signal(str)

    def __init__(self, parent=None):
        super().__init__(parent)

        # State
        self._state = TtsState.IDLE
        self._blocks: list[TtsBlock] = []
        self._block_index = 0

        # Settings
        self._voice = ""
        self._rate = 1.0
        self._pitch = 1.0
        self._volume = 1.0

        # Engine
        self._engine: TtsEngineBase | None = None

        # Audio playback
        self._player = QMediaPlayer(self)
        self._audio_output = QAudioOutput(self)
        self._player.setAudioOutput(self._audio_output)
        self._audio_output.setVolume(1.0)  # TTS volume handled by engine

        self._player.mediaStatusChanged.connect(self._on_media_status)
        self._player.errorOccurred.connect(self._on_player_error)

        # Boundary tracking
        self._boundaries: list[TtsBoundary] = []
        self._boundary_idx = 0
        self._boundary_timer = QTimer(self)
        self._boundary_timer.setInterval(50)
        self._boundary_timer.timeout.connect(self._poll_boundaries)

        # Synthesis worker
        self._worker = _SynthWorker()
        self._thread = QThread(self)
        self._worker.moveToThread(self._thread)
        self._thread.started.connect(self._worker.run)
        self._worker.ready.connect(self._on_synthesis_ready)
        self._worker.error.connect(self._on_synthesis_error)
        self._thread.start()

        # Prefetch state
        self._prefetch_path = ""
        self._prefetch_boundaries: list[TtsBoundary] = []
        self._prefetch_index = -1

        # Current audio file (for cleanup)
        self._current_audio = ""

    # -- Public API ----------------------------------------------------------

    @property
    def state(self) -> TtsState:
        return self._state

    @property
    def current_block(self) -> TtsBlock | None:
        if 0 <= self._block_index < len(self._blocks):
            return self._blocks[self._block_index]
        return None

    @property
    def block_index(self) -> int:
        return self._block_index

    @property
    def block_count(self) -> int:
        return len(self._blocks)

    def set_engine(self, engine: TtsEngineBase | None):
        """Set the TTS synthesis engine."""
        self._engine = engine
        self._worker.set_engine(engine)

    def set_voice(self, voice: str):
        self._voice = voice

    def set_rate(self, rate: float):
        self._rate = max(0.5, min(2.0, rate))

    def set_pitch(self, pitch: float):
        self._pitch = max(0.5, min(1.5, pitch))

    def set_volume(self, volume: float):
        self._volume = max(0.0, min(1.0, volume))

    def set_settings(self, settings: dict):
        """Apply a dict of TTS settings."""
        if "voice" in settings:
            self._voice = settings["voice"]
        if "rate" in settings:
            self.set_rate(settings["rate"])
        if "pitch" in settings:
            self.set_pitch(settings["pitch"])
        if "volume" in settings:
            self.set_volume(settings["volume"])

    def play(self, blocks: list[TtsBlock], start_index: int = 0):
        """Start TTS playback from the given blocks."""
        if not blocks:
            self.error_occurred.emit("No text to read")
            return
        self.stop()
        self._blocks = blocks
        self._block_index = max(0, min(start_index, len(blocks) - 1))
        self._set_state(TtsState.PLAYING)
        self._synthesize_current()

    def pause(self):
        """Pause playback."""
        if self._state == TtsState.PLAYING:
            self._player.pause()
            self._boundary_timer.stop()
            self._set_state(TtsState.PAUSED)

    def resume(self):
        """Resume from pause."""
        if self._state == TtsState.PAUSED:
            self._player.play()
            self._boundary_timer.start()
            self._set_state(TtsState.PLAYING)

    def toggle(self):
        """Toggle play/pause. If idle, does nothing (caller should provide blocks)."""
        if self._state == TtsState.PLAYING:
            self.pause()
        elif self._state == TtsState.PAUSED:
            self.resume()

    def stop(self):
        """Stop playback and reset."""
        self._worker.cancel()
        self._player.stop()
        self._boundary_timer.stop()
        self._cleanup_audio()
        self._cleanup_prefetch()
        self._blocks = []
        self._block_index = 0
        self._boundaries = []
        self._boundary_idx = 0
        self._set_state(TtsState.IDLE)

    def skip_forward(self):
        """Skip to next block."""
        if self._state == TtsState.IDLE:
            return
        if self._block_index + 1 < len(self._blocks):
            self._player.stop()
            self._boundary_timer.stop()
            self._cleanup_audio()
            self._block_index += 1
            self._synthesize_current()
        else:
            self.stop()

    def skip_back(self):
        """Skip to previous block."""
        if self._state == TtsState.IDLE:
            return
        if self._block_index > 0:
            self._player.stop()
            self._boundary_timer.stop()
            self._cleanup_audio()
            self._block_index -= 1
            self._synthesize_current()

    # -- Internal ------------------------------------------------------------

    def _set_state(self, state: TtsState):
        if self._state != state:
            self._state = state
            self.state_changed.emit(state.value)

    def _synthesize_current(self):
        """Request synthesis for the current block."""
        block = self.current_block
        if block is None:
            self.stop()
            return

        self.block_changed.emit(block.index, block.text)
        self.progress_changed.emit(self._block_index, len(self._blocks))

        # Check prefetch
        if (self._prefetch_index == self._block_index
                and self._prefetch_path):
            self._on_synthesis_ready(
                self._prefetch_path, self._prefetch_boundaries,
            )
            self._prefetch_path = ""
            self._prefetch_boundaries = []
            self._prefetch_index = -1
            return

        self._worker.enqueue(
            block.text, self._voice,
            self._rate, self._pitch, self._volume,
        )

    def _prefetch_next(self):
        """Prefetch the next block while current one is playing."""
        next_idx = self._block_index + 1
        if next_idx < len(self._blocks):
            self._prefetch_index = next_idx
            self._worker.enqueue(
                self._blocks[next_idx].text, self._voice,
                self._rate, self._pitch, self._volume,
            )

    @Slot(str, list)
    def _on_synthesis_ready(self, audio_path: str, boundaries: list):
        """Synthesis complete — play the audio."""
        if self._state == TtsState.IDLE:
            # Stopped while synthesizing
            try:
                os.unlink(audio_path)
            except OSError:
                pass
            return

        # If this is a prefetch result (we're still playing current block)
        if (self._player.playbackState() == QMediaPlayer.PlaybackState.PlayingState
                and self._current_audio):
            self._prefetch_path = audio_path
            self._prefetch_boundaries = boundaries
            return

        self._cleanup_audio()
        self._current_audio = audio_path
        self._boundaries = boundaries
        self._boundary_idx = 0

        from PySide6.QtCore import QUrl
        self._player.setSource(QUrl.fromLocalFile(audio_path))
        self._player.play()

        if boundaries:
            self._boundary_timer.start()

        # Prefetch next block
        self._prefetch_next()

    @Slot(str)
    def _on_synthesis_error(self, msg: str):
        if self._state != TtsState.IDLE:
            self.error_occurred.emit(f"TTS synthesis failed: {msg}")
            # Try next block
            if self._block_index + 1 < len(self._blocks):
                self._block_index += 1
                self._synthesize_current()
            else:
                self.stop()

    @Slot(QMediaPlayer.MediaStatus)
    def _on_media_status(self, status: QMediaPlayer.MediaStatus):
        if status == QMediaPlayer.MediaStatus.EndOfMedia:
            self._boundary_timer.stop()
            self._cleanup_audio()
            # Advance to next block
            if self._block_index + 1 < len(self._blocks):
                self._block_index += 1
                self._synthesize_current()
            else:
                self.stop()

    @Slot(QMediaPlayer.Error, str)
    def _on_player_error(self, error, msg):
        if self._state != TtsState.IDLE:
            self.error_occurred.emit(f"Audio playback error: {msg}")

    @Slot()
    def _poll_boundaries(self):
        """Poll media position and emit word boundary signals."""
        if not self._boundaries:
            return
        pos_ms = self._player.position()
        while self._boundary_idx < len(self._boundaries):
            b = self._boundaries[self._boundary_idx]
            if b.offset_ms <= pos_ms:
                self.word_boundary.emit(b.text_offset, b.text_length)
                self._boundary_idx += 1
            else:
                break

    def _cleanup_audio(self):
        """Remove the current temp audio file."""
        if self._current_audio:
            try:
                os.unlink(self._current_audio)
            except OSError:
                pass
            self._current_audio = ""

    def _cleanup_prefetch(self):
        """Remove any prefetched audio file."""
        if self._prefetch_path:
            try:
                os.unlink(self._prefetch_path)
            except OSError:
                pass
            self._prefetch_path = ""
            self._prefetch_boundaries = []
            self._prefetch_index = -1

    def shutdown(self):
        """Clean shutdown — call before application exit."""
        self.stop()
        self._worker.cancel()
        self._worker._queue.put(None)  # Shutdown sentinel
        self._thread.quit()
        self._thread.wait(3000)
