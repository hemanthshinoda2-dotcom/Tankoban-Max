from PySide6.QtGui import QPainter


def apply_scale_quality(painter: QPainter, settings: dict):
    """Set QPainter render hints based on image_scale_quality setting."""
    q = str(settings.get("image_scale_quality", "off"))
    if q in ("sharp", "pixel"):
        painter.setRenderHint(QPainter.RenderHint.SmoothPixmapTransform, False)
    else:
        painter.setRenderHint(QPainter.RenderHint.SmoothPixmapTransform, True)


def paint_active_frame(canvas, painter):
    state = getattr(canvas, "_state", None)
    if state is None or not state.pages:
        return
    apply_scale_quality(painter, state.settings)
    mode = str(state.settings.get("control_mode", "manual"))
    if mode in ("twoPage", "twoPageMangaPlus") and getattr(canvas, "_get_flip_pair", None):
        from render_two_page import paint_two_page_frame
        paint_two_page_frame(canvas, painter)
        return
    if mode == "twoPageScroll":
        canvas._paint_two_page_scroll_rows(painter)
        return
    from render_portrait import paint_portrait_strip
    paint_portrait_strip(canvas, painter)
