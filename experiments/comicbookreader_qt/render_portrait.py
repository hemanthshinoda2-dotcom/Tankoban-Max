def scaled_page_size(canvas, entry):
    return canvas._scaled_page_size(entry)


def get_scaled_page_height(canvas, index: int):
    return canvas.get_scaled_page_height(index)


def paint_portrait_strip(canvas, painter):
    canvas._paint_portrait_strip(painter)
