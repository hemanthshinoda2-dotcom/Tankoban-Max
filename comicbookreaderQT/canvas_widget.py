from PySide6.QtCore import QRect, Qt
from PySide6.QtGui import QColor, QLinearGradient, QPainter
from PySide6.QtWidgets import QWidget
from image_filters import apply_filters, filters_are_default
from render_core import paint_active_frame


class CanvasWidget(QWidget):
    def __init__(self, parent=None):
        super().__init__(parent)
        self._pixmap = None
        self._target_rect = QRect()
        self._state = None
        self._get_cache_entry = None
        self._get_flip_pair = None
        self._get_two_page_scroll_rows = None
        self.setAttribute(Qt.WidgetAttribute.WA_OpaquePaintEvent, True)
        self.setAutoFillBackground(False)

    def set_pixmap(self, pixmap):
        self._pixmap = pixmap
        self._recompute_target_rect()
        self.update()

    def clear(self):
        self._pixmap = None
        self._target_rect = QRect()
        self.update()

    def set_strip_context(self, state, get_cache_entry, get_flip_pair=None, get_two_page_scroll_rows=None):
        self._state = state
        self._get_cache_entry = get_cache_entry
        self._get_flip_pair = get_flip_pair
        self._get_two_page_scroll_rows = get_two_page_scroll_rows
        self.update()

    def resizeEvent(self, event):
        super().resizeEvent(event)
        self._recompute_target_rect()

    def _recompute_target_rect(self):
        if self._pixmap is None or self._pixmap.isNull():
            self._target_rect = QRect()
            return

        dpr = self._pixmap.devicePixelRatio()
        src_w = self._pixmap.width() / dpr
        src_h = self._pixmap.height() / dpr
        if src_w <= 0 or src_h <= 0:
            self._target_rect = QRect()
            return

        view_w = max(1, self.width())
        view_h = max(1, self.height())
        scale = min(view_w / src_w, view_h / src_h, 1.0)

        target_w = max(1, int(src_w * scale))
        target_h = max(1, int(src_h * scale))
        x = (view_w - target_w) // 2
        y = (view_h - target_h) // 2
        self._target_rect = QRect(x, y, target_w, target_h)

    def paintEvent(self, event):
        painter = QPainter(self)
        painter.fillRect(self.rect(), Qt.GlobalColor.black)
        if self._state is not None and self._get_cache_entry is not None and self._state.pages:
            paint_active_frame(self, painter)
        elif self._pixmap is not None and not self._pixmap.isNull() and not self._target_rect.isNull():
            painter.setRenderHint(QPainter.RenderHint.SmoothPixmapTransform, True)
            painter.drawPixmap(self._target_rect, self._pixmap)
        painter.end()

    def _filtered_pixmap(self, entry):
        if entry is None or entry.pixmap.isNull():
            return None
        if self._state is None:
            return entry.pixmap
        settings = self._state.settings
        if filters_are_default(settings):
            return entry.pixmap
        return apply_filters(entry.pixmap, settings)

    def _scaled_page_size(self, entry):
        if entry is None:
            return None, None
        src_w = max(1, int(entry.width))
        src_h = max(1, int(entry.height))
        view_w = max(1, self.width())

        pct = float(self._state.settings.get("portrait_width_pct", 0.84))
        pct = max(0.5, min(1.0, pct))
        target_w = view_w if entry.spread else int(view_w * pct)
        target_w = min(target_w, src_w)
        scale = min(1.0, float(target_w) / float(src_w))
        return max(1, int(src_w * scale)), max(1, int(src_h * scale))

    def get_scaled_page_height(self, index: int):
        if self._get_cache_entry is None:
            return None
        entry = self._get_cache_entry(index)
        _, h = self._scaled_page_size(entry)
        return h

    def _get_two_page_zoom_factor(self):
        mode = str(self._state.settings.get("control_mode", "manual"))
        if mode != "twoPageMangaPlus":
            return 1.0
        pct = float(self._state.settings.get("two_page_mangaplus_zoom_pct", 100))
        pct = max(100.0, min(260.0, pct))
        return pct / 100.0

    def get_flip_pan_bounds(self):
        if self._state is None or self._get_flip_pair is None:
            return 0.0, 0.0
        if str(self._state.settings.get("control_mode", "manual")) not in ("twoPage", "twoPageMangaPlus", "autoFlip"):
            return 0.0, 0.0

        pair = self._get_flip_pair()
        if pair is None:
            return 0.0, 0.0

        view_w = max(1, self.width())
        view_h = max(1, self.height())
        left_w = int(view_w / 2)
        right_w = int(view_w - left_w)
        mode = str(self._state.settings.get("control_mode", "manual"))
        if mode == "twoPageMangaPlus":
            fit_mode = str(self._state.settings.get("two_page_mangaplus_image_fit", "width"))
        else:
            fit_mode = str(self._state.settings.get("two_page_flip_image_fit", "height"))
        fit_mode = "width" if fit_mode == "width" else "height"
        zoom = self._get_two_page_zoom_factor()

        if pair.is_spread:
            entry = self._get_cache_entry(pair.right_index)
            if entry is None:
                return 0.0, 0.0
            src_w = max(1, int(entry.width))
            src_h = max(1, int(entry.height))
            max_w = min(view_w - 24, src_w)
            scale = min(1.0, float(max_w) / float(src_w)) * zoom
            draw_w = int(src_w * scale)
            draw_h = int(src_h * scale)
            return max(0.0, float(draw_w - view_w)), max(0.0, float(draw_h - view_h))

        right_entry = self._get_cache_entry(pair.right_index)
        if pair.cover_alone or pair.unpaired_single:
            if right_entry is None:
                return 0.0, 0.0
            src_w = max(1, int(right_entry.width))
            src_h = max(1, int(right_entry.height))
            slot_w = left_w if pair.cover_alone else right_w
            if fit_mode == "width":
                scale = min(float(slot_w) / float(src_w), 1.0)
            else:
                scale = min(float(slot_w) / float(src_w), float(view_h * 0.96) / float(src_h), 1.0)
            scale *= zoom
            draw_w = int(src_w * scale)
            draw_h = int(src_h * scale)
            return max(0.0, float(draw_w - view_w)), max(0.0, float(draw_h - view_h))

        left_entry = self._get_cache_entry(pair.left_index_or_none)
        if right_entry is None or left_entry is None:
            return 0.0, 0.0

        rw = max(1, int(right_entry.width))
        rh = max(1, int(right_entry.height))
        lw = max(1, int(left_entry.width))
        lh = max(1, int(left_entry.height))
        if fit_mode == "width":
            scale = min(float(right_w) / float(rw), float(left_w) / float(lw), 1.0)
        else:
            h_limit = max(1, int(view_h * 0.96))
            scale = min(
                float(right_w) / float(rw),
                float(left_w) / float(lw),
                float(h_limit) / float(max(rh, lh)),
                1.0,
            )
        scale *= zoom
        content_w = int(float(rw + lw) * scale)
        content_h = int(max(float(rh) * scale, float(lh) * scale))
        return max(0.0, float(content_w - view_w)), max(0.0, float(content_h - view_h))

    def get_flip_pan_max(self):
        _, max_y = self.get_flip_pan_bounds()
        return max_y

    def _paint_portrait_strip(self, painter: QPainter):
        view_h = max(1, self.height())
        view_w = max(1, self.width())
        gap = int(self._state.settings.get("two_page_scroll_row_gap_px", 16))
        gap = max(0, min(96, gap))

        index = int(self._state.page_index)
        y = -float(self._state.y)

        painter.setRenderHint(QPainter.RenderHint.SmoothPixmapTransform, True)

        for _ in range(6):
            if index < 0 or index >= len(self._state.pages):
                break
            if y > view_h:
                break

            entry = self._get_cache_entry(index)
            if entry is None or entry.pixmap.isNull():
                ph_h = max(220, int(view_h * 0.62))
                placeholder = QRect(24, int(y), max(32, view_w - 48), int(ph_h))
                painter.fillRect(placeholder, QColor(24, 24, 24))
                painter.setPen(QColor(140, 140, 140))
                painter.drawText(placeholder, Qt.AlignmentFlag.AlignCenter, "Loading page...")
                y += ph_h + gap
                index += 1
                continue

            draw_w, draw_h = self._scaled_page_size(entry)
            x = (view_w - draw_w) / 2.0
            target = QRect(int(x), int(y), int(draw_w), int(draw_h))
            painter.drawPixmap(target, self._filtered_pixmap(entry))
            y += draw_h + gap
            index += 1

    def _draw_loading_rect(self, painter: QPainter, rect: QRect):
        painter.fillRect(rect, QColor(24, 24, 24))
        painter.setPen(QColor(140, 140, 140))
        painter.drawText(rect, Qt.AlignmentFlag.AlignCenter, "Loading page...")

    def _paint_two_page_flip(self, painter: QPainter):
        pair = self._get_flip_pair()
        if pair is None:
            return

        view_w = max(1, self.width())
        view_h = max(1, self.height())
        gutter = 0
        left_w = int((view_w - gutter) / 2)
        right_w = int(view_w - gutter - left_w)
        left_rect = QRect(0, 0, left_w, view_h)
        right_rect = QRect(left_w + gutter, 0, right_w, view_h)
        pan_max_x, pan_max_y = self.get_flip_pan_bounds()
        pan_x = max(0.0, min(float(self._state.x), pan_max_x))
        pan_y = max(0.0, min(float(self._state.y), pan_max_y))
        self._state.x = pan_x
        self._state.y = pan_y
        zoom = self._get_two_page_zoom_factor()

        painter.setRenderHint(QPainter.RenderHint.SmoothPixmapTransform, True)

        right_entry = self._get_cache_entry(pair.right_index)
        left_entry = None
        if pair.left_index_or_none is not None:
            left_entry = self._get_cache_entry(pair.left_index_or_none)

        mode = str(self._state.settings.get("control_mode", "manual"))
        if mode == "twoPageMangaPlus":
            fit_mode = str(self._state.settings.get("two_page_mangaplus_image_fit", "width"))
        else:
            fit_mode = str(self._state.settings.get("two_page_flip_image_fit", "height"))
        fit_mode = "width" if fit_mode == "width" else "height"

        if pair.is_spread:
            if right_entry is None or right_entry.pixmap.isNull():
                self._draw_loading_rect(painter, QRect(24, 24, view_w - 48, view_h - 48))
                return
            src_w = max(1, int(right_entry.width))
            src_h = max(1, int(right_entry.height))
            max_w = min(view_w - 24, src_w)
            scale = min(1.0, float(max_w) / float(src_w)) * zoom
            draw_w = int(src_w * scale)
            draw_h = int(src_h * scale)
            x = int((view_w - draw_w) / 2) - int(pan_x)
            if draw_h > view_h:
                y = -int(pan_y)
            else:
                y = int((view_h - draw_h) / 2)
            painter.drawPixmap(QRect(x, y, draw_w, draw_h), self._filtered_pixmap(right_entry))
            return

        if pair.cover_alone:
            self._paint_single_in_slot(painter, right_entry, left_rect, pan_x, pan_y, zoom)
            self._paint_gutter_shadow(painter, left_w, gutter)
            return

        if pair.unpaired_single:
            self._paint_single_in_slot(painter, right_entry, right_rect, pan_x, pan_y, zoom)
            self._paint_gutter_shadow(painter, left_w, gutter)
            return

        if right_entry is None or right_entry.pixmap.isNull() or left_entry is None or left_entry.pixmap.isNull():
            self._draw_loading_rect(painter, QRect(24, 24, view_w - 48, view_h - 48))
            self._paint_gutter_shadow(painter, left_w, gutter)
            return

        rw = max(1, int(right_entry.width))
        rh = max(1, int(right_entry.height))
        lw = max(1, int(left_entry.width))
        lh = max(1, int(left_entry.height))

        if fit_mode == "width":
            scale = min(float(right_w) / float(rw), float(left_w) / float(lw), 1.0)
        else:
            h_limit = max(1, int(view_h * 0.96))
            scale = min(
                float(right_w) / float(rw),
                float(left_w) / float(lw),
                float(h_limit) / float(max(rh, lh)),
                1.0,
            )
        scale *= zoom

        draw_rw = max(1, int(rw * scale))
        draw_rh = max(1, int(rh * scale))
        draw_lw = max(1, int(lw * scale))
        draw_lh = max(1, int(lh * scale))

        # Keep pages snapped to the inner seam so they read as one spread.
        rx = right_rect.left() - int(pan_x)
        if max(draw_rh, draw_lh) > view_h:
            ry = -int(pan_y)
            ly = -int(pan_y)
        else:
            ry = int((view_h - draw_rh) / 2)
            ly = int((view_h - draw_lh) / 2)
        lx = left_rect.right() - draw_lw + 1 - int(pan_x)

        painter.drawPixmap(QRect(rx, ry, draw_rw, draw_rh), self._filtered_pixmap(right_entry))
        painter.drawPixmap(QRect(lx, ly, draw_lw, draw_lh), self._filtered_pixmap(left_entry))
        self._paint_gutter_shadow(painter, left_w, gutter)

    def _paint_single_in_slot(
        self,
        painter: QPainter,
        entry,
        slot_rect: QRect,
        pan_x: float = 0.0,
        pan_y: float = 0.0,
        zoom: float = 1.0,
    ):
        if entry is None or entry.pixmap.isNull():
            inset = QRect(
                slot_rect.left() + 12,
                slot_rect.top() + 24,
                max(10, slot_rect.width() - 24),
                max(10, slot_rect.height() - 48),
            )
            self._draw_loading_rect(painter, inset)
            return

        src_w = max(1, int(entry.width))
        src_h = max(1, int(entry.height))
        mode = str(self._state.settings.get("control_mode", "manual"))
        if mode == "twoPageMangaPlus":
            fit_mode = str(self._state.settings.get("two_page_mangaplus_image_fit", "width"))
        else:
            fit_mode = str(self._state.settings.get("two_page_flip_image_fit", "height"))
        fit_mode = "width" if fit_mode == "width" else "height"
        if fit_mode == "width":
            scale = min(float(slot_rect.width()) / float(src_w), 1.0)
        else:
            scale = min(
                float(slot_rect.width()) / float(src_w),
                float(slot_rect.height() * 0.96) / float(src_h),
                1.0,
            )
        scale *= zoom
        draw_w = max(1, int(src_w * scale))
        draw_h = max(1, int(src_h * scale))
        x = slot_rect.left() + int((slot_rect.width() - draw_w) / 2) - int(pan_x)
        if draw_h > slot_rect.height():
            y = slot_rect.top() - int(pan_y)
        else:
            y = slot_rect.top() + int((slot_rect.height() - draw_h) / 2)
        painter.drawPixmap(QRect(x, y, draw_w, draw_h), self._filtered_pixmap(entry))

    def _paint_two_page_scroll_rows(self, painter: QPainter):
        if self._get_two_page_scroll_rows is None:
            return
        rows = self._get_two_page_scroll_rows() or []
        if not rows:
            return
        view_w = max(1, self.width())
        view_h = max(1, self.height())
        scroll_y = float(self._state.y)
        painter.setRenderHint(QPainter.RenderHint.SmoothPixmapTransform, True)

        lo = 0
        hi = len(rows) - 1
        first = max(0, len(rows) - 1)
        while lo <= hi:
            mid = (lo + hi) // 2
            row = rows[mid]
            row_end = float(row.get("y_end", 0))
            if row_end <= scroll_y:
                lo = mid + 1
            else:
                first = mid
                hi = mid - 1

        for row in rows[first:]:
            y = float(row.get("y_start", 0)) - scroll_y
            h = float(row.get("row_height", 0))
            if (y + h) < -48:
                continue
            if y > (view_h + 48):
                break
            row_type = row.get("type")
            indices = row.get("indices") or []
            if not indices:
                continue
            if row_type == "pair" and len(indices) >= 2:
                self._draw_two_page_scroll_pair(painter, int(indices[0]), int(indices[1]), int(y), int(h), view_w)
            elif row_type == "cover":
                self._draw_two_page_scroll_cover(painter, int(indices[0]), int(y), int(h), view_w)
            elif row_type == "spread":
                self._draw_two_page_scroll_single(painter, int(indices[0]), int(y), int(h), view_w)
            else:
                self._draw_two_page_scroll_unpaired(painter, int(indices[0]), int(y), int(h), view_w)

    def _draw_two_page_scroll_single(self, painter: QPainter, idx: int, y: int, row_h: int, view_w: int):
        entry = self._get_cache_entry(idx)
        if entry is None or entry.pixmap.isNull():
            placeholder = QRect(24, y, max(32, view_w - 48), max(80, row_h))
            self._draw_loading_rect(painter, placeholder)
            return
        src_w = max(1, int(entry.width))
        src_h = max(1, int(entry.height))
        scale = min(1.0, float(view_w) / float(src_w))
        draw_w = max(1, int(src_w * scale))
        draw_h = max(1, int(src_h * scale))
        x = int((view_w - draw_w) / 2)
        if draw_h < row_h:
            draw_y = y + int((row_h - draw_h) / 2)
        else:
            draw_y = y
        painter.drawPixmap(QRect(x, draw_y, draw_w, draw_h), self._filtered_pixmap(entry))

    def _draw_two_page_scroll_cover(self, painter: QPainter, idx: int, y: int, row_h: int, view_w: int):
        entry = self._get_cache_entry(idx)
        gutter = 0
        left_w = int((view_w - gutter) / 2)
        if entry is None or entry.pixmap.isNull():
            self._draw_loading_rect(painter, QRect(12, y, max(12, left_w - 24), max(80, row_h)))
            return
        src_w = max(1, int(entry.width))
        src_h = max(1, int(entry.height))
        scale = min(1.0, float(left_w) / float(src_w))
        draw_w = max(1, int(src_w * scale))
        draw_h = max(1, int(src_h * scale))
        dx = left_w - draw_w
        dy = y + int((row_h - draw_h) / 2)
        painter.drawPixmap(QRect(dx, dy, draw_w, draw_h), self._filtered_pixmap(entry))

    def _draw_two_page_scroll_unpaired(self, painter: QPainter, idx: int, y: int, row_h: int, view_w: int):
        entry = self._get_cache_entry(idx)
        gutter = 0
        left_w = int((view_w - gutter) / 2)
        right_w = int(view_w - gutter - left_w)
        right_x = left_w + gutter
        if entry is None or entry.pixmap.isNull():
            self._draw_loading_rect(painter, QRect(right_x + 12, y, max(12, right_w - 24), max(80, row_h)))
            return
        src_w = max(1, int(entry.width))
        src_h = max(1, int(entry.height))
        scale = min(1.0, float(right_w) / float(src_w))
        draw_w = max(1, int(src_w * scale))
        draw_h = max(1, int(src_h * scale))
        dy = y + int((row_h - draw_h) / 2)
        painter.drawPixmap(QRect(right_x, dy, draw_w, draw_h), self._filtered_pixmap(entry))

    def _draw_two_page_scroll_pair(self, painter: QPainter, right_idx: int, left_idx: int, y: int, row_h: int, view_w: int):
        right_entry = self._get_cache_entry(right_idx)
        left_entry = self._get_cache_entry(left_idx)
        gutter = 0
        left_w = int((view_w - gutter) / 2)
        right_w = int(view_w - gutter - left_w)
        left_rect = QRect(0, y, left_w, row_h)
        right_rect = QRect(left_w + gutter, y, right_w, row_h)

        if right_entry is None or right_entry.pixmap.isNull():
            self._draw_loading_rect(painter, QRect(right_rect.left() + 12, y, max(12, right_w - 24), max(80, row_h)))
        else:
            rw = max(1, int(right_entry.width))
            rh = max(1, int(right_entry.height))
            scale = min(1.0, float(right_w) / float(rw))
            draw_w = max(1, int(rw * scale))
            draw_h = max(1, int(rh * scale))
            dy = y + int((row_h - draw_h) / 2)
            painter.drawPixmap(QRect(right_rect.left(), dy, draw_w, draw_h), self._filtered_pixmap(right_entry))

        if left_entry is None or left_entry.pixmap.isNull():
            self._draw_loading_rect(painter, QRect(left_rect.left() + 12, y, max(12, left_w - 24), max(80, row_h)))
        else:
            lw = max(1, int(left_entry.width))
            lh = max(1, int(left_entry.height))
            scale = min(1.0, float(left_w) / float(lw))
            draw_w = max(1, int(lw * scale))
            draw_h = max(1, int(lh * scale))
            dy = y + int((row_h - draw_h) / 2)
            dx = left_rect.right() - draw_w + 1
            painter.drawPixmap(QRect(dx, dy, draw_w, draw_h), self._filtered_pixmap(left_entry))

    def _paint_gutter_shadow(self, painter: QPainter, left_w: int, gutter: int):
        if gutter <= 0:
            return
        strength = float(self._state.settings.get("gutter_shadow_strength", 0.72))
        strength = max(0.0, min(1.0, strength))
        if strength <= 0:
            return
        g = QLinearGradient(left_w, 0, left_w + gutter, 0)
        alpha_outer = int(0)
        alpha_mid = int(90 * strength)
        alpha_inner = int(140 * strength)
        g.setColorAt(0.0, QColor(0, 0, 0, alpha_outer))
        g.setColorAt(0.2, QColor(0, 0, 0, alpha_mid))
        g.setColorAt(0.5, QColor(0, 0, 0, alpha_inner))
        g.setColorAt(0.8, QColor(0, 0, 0, alpha_mid))
        g.setColorAt(1.0, QColor(0, 0, 0, alpha_outer))
        painter.fillRect(QRect(left_w, 0, gutter, self.height()), g)
