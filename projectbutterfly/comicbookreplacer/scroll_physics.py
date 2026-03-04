import time

from PySide6.QtCore import QObject, QTimer, Signal


class WheelAccumulator:
    def __init__(self, alpha: float = 0.72, noise_threshold: float = 6.0, reset_after_ms: int = 140):
        self.alpha = float(alpha)
        self.noise_threshold = float(noise_threshold)
        self.reset_after_ms = int(reset_after_ms)
        self._value = 0.0
        self._last_ts = 0.0

    def push(self, delta_px: float) -> float:
        now = time.monotonic()
        if self._last_ts > 0 and ((now - self._last_ts) * 1000.0) > self.reset_after_ms:
            self._value = 0.0
        self._last_ts = now
        self._value = (self.alpha * self._value) + ((1.0 - self.alpha) * float(delta_px))
        if abs(self._value) < self.noise_threshold:
            return 0.0
        return self._value

    def reset(self):
        self._value = 0.0
        self._last_ts = 0.0


class ManualWheelPump(QObject):
    stepped = Signal(float)

    def __init__(self, parent=None, consume_fraction: float = 0.36):
        super().__init__(parent)
        self.consume_fraction = float(consume_fraction)
        self._pending = 0.0
        self._timer = QTimer(self)
        self._timer.setInterval(16)
        self._timer.timeout.connect(self._on_tick)

    def add(self, delta_px: float):
        self._pending += float(delta_px)
        if not self._timer.isActive():
            self._timer.start()

    def clear(self):
        self._pending = 0.0
        self._timer.stop()

    def _on_tick(self):
        if abs(self._pending) < 0.5:
            self.clear()
            return
        step = self._pending * self.consume_fraction
        self._pending -= step
        self.stepped.emit(step)
