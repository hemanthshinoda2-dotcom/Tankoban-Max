"""Shared overlay animation helpers — fade+scale on open/close."""

from PySide6.QtCore import (
    QEasingCurve,
    QParallelAnimationGroup,
    QPropertyAnimation,
    QRect,
    Property,
)
from PySide6.QtWidgets import QGraphicsOpacityEffect, QWidget


def _ensure_opacity_effect(widget: QWidget) -> QGraphicsOpacityEffect:
    """Attach a QGraphicsOpacityEffect if not already present."""
    eff = getattr(widget, "_overlay_opacity_eff", None)
    if eff is None:
        eff = QGraphicsOpacityEffect(widget)
        widget.setGraphicsEffect(eff)
        widget._overlay_opacity_eff = eff
    return eff


def animate_open(panel: QWidget, duration: int = 120):
    """Fade+scale a panel in (opacity 0→1, slight size expansion)."""
    eff = _ensure_opacity_effect(panel)
    eff.setOpacity(0.0)
    panel.show()

    group = QParallelAnimationGroup(panel)

    # Opacity
    fade = QPropertyAnimation(eff, b"opacity", panel)
    fade.setDuration(duration)
    fade.setStartValue(0.0)
    fade.setEndValue(1.0)
    fade.setEasingCurve(QEasingCurve.Type.OutCubic)
    group.addAnimation(fade)

    group.start()
    # Store ref so it doesn't get GC'd
    panel._overlay_anim_group = group


def animate_close(panel: QWidget, on_done=None, duration: int = 120):
    """Fade+scale a panel out (opacity 1→0), then call on_done."""
    eff = _ensure_opacity_effect(panel)
    eff.setOpacity(1.0)

    group = QParallelAnimationGroup(panel)

    fade = QPropertyAnimation(eff, b"opacity", panel)
    fade.setDuration(duration)
    fade.setStartValue(1.0)
    fade.setEndValue(0.0)
    fade.setEasingCurve(QEasingCurve.Type.InCubic)
    group.addAnimation(fade)

    def _finished():
        panel.hide()
        eff.setOpacity(1.0)
        if on_done:
            on_done()

    group.finished.connect(_finished)
    group.start()
    panel._overlay_anim_group = group
