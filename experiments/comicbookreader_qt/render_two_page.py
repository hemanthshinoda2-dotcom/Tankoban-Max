def get_flip_pan_bounds(canvas):
    return canvas.get_flip_pan_bounds()


def get_flip_pan_max(canvas):
    return canvas.get_flip_pan_max()


def paint_two_page_frame(canvas, painter):
    canvas._paint_two_page_flip(painter)
