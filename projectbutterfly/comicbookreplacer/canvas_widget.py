"""
Canvas widget — QWidget that paints the comic page strip in portrait mode.

Infinite vertical strip: renders the current page and up to 5 neighbors
in a single paint pass, seamlessly bridging pages as the user scrolls.

No-upscale rule: a page is never drawn wider than its natural pixel width.
Portrait width cap: pages are drawn at portraitWidthPct of canvas width,
except spreads which get full width.
"""

from PySide6.QtCore import Qt, QRectF
from PySide6.QtGui import QPainter, QColor
from PySide6.QtWidgets import QWidget

from state import ReaderState, WIDE_RATIO_SECONDARY
from bitmap_cache import BitmapCache, CacheEntry

# Max pages to render in one paint pass (current + neighbors)
MAX_PAGES_PER_FRAME = 6

# Background color
BG_COLOR = QColor(0, 0, 0)


class CanvasWidget(QWidget):
    """Paints the portrait strip. Owns no state — reads from ReaderState
    and BitmapCache, and is told when to repaint by the parent."""

    def __init__(self, state: ReaderState, cache: BitmapCache, parent=None):
        super().__init__(parent)
        self.state = state
        self.cache = cache

        # For loupe: list of (page_index, src_rect, dst_rect) from last paint
        self.last_frame_rects: list[tuple[int, QRectF, QRectF]] = []

        self.setAttribute(Qt.WidgetAttribute.WA_OpaquePaintEvent, True)
        self.setMinimumSize(1, 1)

    def paintEvent(self, event):
        painter = QPainter(self)
        painter.setRenderHint(QPainter.RenderHint.SmoothPixmapTransform, False)
        painter.fillRect(self.rect(), BG_COLOR)

        volume = self.state.volume
        if volume is None or volume.page_count == 0:
            painter.end()
            return

        self.last_frame_rects.clear()
        self._paint_portrait_strip(painter)
        painter.end()

    def _paint_portrait_strip(self, painter: QPainter):
        """Draw the infinite vertical strip centered on current page + scroll_y."""
        canvas_w = self.width()
        canvas_h = self.height()
        volume = self.state.volume
        page_idx = self.state.page_index
        scroll_y = self.state.scroll_y

        # We'll lay pages out top-to-bottom starting from the current page.
        # scroll_y is the offset into the current page (positive = scrolled down).
        # We render upward from the current page if scroll_y < 0 or if there's
        # room above, and downward to fill the canvas.

        # First, figure out where to start painting (y position on canvas).
        # The top of the current page is at canvas y = -scroll_y.
        y_cursor = -scroll_y
        start_page = page_idx

        # Walk backward to find pages that are visible above
        while y_cursor > 0 and start_page > 0:
            prev_page = start_page - 1
            prev_entry = self.cache.get(prev_page)
            if prev_entry is None:
                self.cache.request(prev_page)
                break
            prev_h = self._page_draw_height(prev_entry, canvas_w)
            y_cursor -= prev_h
            start_page = prev_page

        # Now paint pages downward from start_page at y_cursor
        current_page = start_page
        pages_drawn = 0

        while y_cursor < canvas_h and pages_drawn < MAX_PAGES_PER_FRAME:
            if current_page >= volume.page_count:
                break

            entry = self.cache.get(current_page)
            if entry is None:
                self.cache.request(current_page)
                # Leave a gap — the page will repaint when decode finishes
                # Estimate height as canvas height for gap
                y_cursor += canvas_h
                current_page += 1
                pages_drawn += 1
                continue

            draw_w, draw_h = self._page_draw_size(entry, canvas_w)

            # Center horizontally
            x = (canvas_w - draw_w) / 2

            dst_rect = QRectF(x, y_cursor, draw_w, draw_h)
            src_rect = QRectF(0, 0, entry.width, entry.height)

            painter.drawPixmap(dst_rect, entry.pixmap, src_rect)

            self.last_frame_rects.append((current_page, src_rect, dst_rect))

            y_cursor += draw_h
            current_page += 1
            pages_drawn += 1

    def _page_draw_size(self, entry: CacheEntry, canvas_w: int) -> tuple[float, float]:
        """Compute the draw width and height for a page, respecting portrait
        width cap, no-upscale, and spread rules."""
        is_spread = (
            entry.spread
            or self.state.is_spread(0)  # won't matter, we check by entry
            or (entry.width / entry.height >= WIDE_RATIO_SECONDARY if entry.height > 0 else False)
        )

        if is_spread:
            # Spreads get full canvas width
            max_w = canvas_w
        else:
            # Portrait width cap
            max_w = canvas_w * self.state.portrait_width_fraction()

        # No-upscale: never wider than natural pixel width
        draw_w = min(entry.width, max_w)

        # Scale height proportionally
        scale = draw_w / entry.width if entry.width > 0 else 1.0
        draw_h = entry.height * scale

        return draw_w, draw_h

    def _page_draw_height(self, entry: CacheEntry, canvas_w: int) -> float:
        """Just the height portion of _page_draw_size."""
        _, h = self._page_draw_size(entry, canvas_w)
        return h

    def page_height_at(self, page_index: int) -> float:
        """Get the draw height of a specific page, or estimate if not cached."""
        entry = self.cache.get(page_index)
        if entry is not None:
            return self._page_draw_height(entry, self.width())
        # Estimate: assume full canvas height (worst case, will correct when decoded)
        return float(self.height())
