"""
Scroll physics — wheel accumulator with EMA smoothing and momentum pump.

WheelAccumulator: exponential moving average on wheel deltas with noise
filtering and idle auto-reset.

ManualWheelPump: 60fps QTimer that consumes pending scroll at 52% per
tick, giving smooth momentum/easing for wheel input.
"""

import time

from PySide6.QtCore import QObject, QTimer, Signal


class WheelAccumulator:
    """Smooths raw wheel deltas with EMA and filters trackpad noise."""

    EMA_ALPHA = 0.62
    NOISE_THRESHOLD = 2.5    # px — ignore tiny deltas
    IDLE_RESET_MS = 140      # reset accumulator after this idle gap

    def __init__(self):
        self._ema = 0.0
        self._last_event_time = 0.0

    def feed(self, delta_px: float) -> float:
        """Feed a raw wheel delta, return the smoothed value."""
        now = time.monotonic()
        elapsed_ms = (now - self._last_event_time) * 1000
        self._last_event_time = now

        # Reset after idle gap
        if elapsed_ms > self.IDLE_RESET_MS:
            self._ema = 0.0

        # Filter noise
        if abs(delta_px) < self.NOISE_THRESHOLD:
            return 0.0

        # EMA update
        self._ema = self.EMA_ALPHA * delta_px + (1 - self.EMA_ALPHA) * self._ema
        return self._ema


class ManualWheelPump(QObject):
    """60fps timer that consumes pending scroll delta with momentum.
    Emits scroll_step(float) each tick with the px to scroll this frame."""

    TICK_MS = 16             # ~60fps
    CONSUME_FRACTION = 0.52  # consume 52% of pending per tick
    MIN_REMAINING = 0.5      # stop pumping below this threshold (px)

    scroll_step = Signal(float)

    def __init__(self, parent=None):
        super().__init__(parent)
        self._pending = 0.0
        self._timer = QTimer(self)
        self._timer.setInterval(self.TICK_MS)
        self._timer.timeout.connect(self._tick)

    def add(self, delta_px: float):
        """Add scroll delta to the pending backlog."""
        self._pending += delta_px
        if not self._timer.isActive():
            self._timer.start()

    def stop(self):
        """Kill momentum immediately."""
        self._pending = 0.0
        self._timer.stop()

    def _tick(self):
        if abs(self._pending) < self.MIN_REMAINING:
            self._pending = 0.0
            self._timer.stop()
            return

        step = self._pending * self.CONSUME_FRACTION
        self._pending -= step
        self.scroll_step.emit(step)
