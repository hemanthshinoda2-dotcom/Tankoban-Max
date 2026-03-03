def paint_active_frame(canvas, painter):
    state = getattr(canvas, "_state", None)
    if state is None or not state.pages:
        return
    mode = str(state.settings.get("control_mode", "manual"))
    if mode in ("twoPage", "twoPageMangaPlus", "autoFlip") and getattr(canvas, "_get_flip_pair", None):
        from render_two_page import paint_two_page_frame
        paint_two_page_frame(canvas, painter)
        return
    if mode == "twoPageScroll":
        canvas._paint_two_page_scroll_rows(painter)
        return
    from render_portrait import paint_portrait_strip
    paint_portrait_strip(canvas, painter)
