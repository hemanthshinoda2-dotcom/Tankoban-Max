import os
import base64
import hashlib
import subprocess
import time

from PySide6.QtCore import Qt, Signal, QTimer
from PySide6.QtGui import QAction
from PySide6.QtWidgets import QApplication, QMenu, QMessageBox, QWidget

from archive_session import ArchiveSessionManager
from bitmap_cache import BitmapCache
from canvas_widget import CanvasWidget
from hud_core import BottomHud, HudController, ManualScroller, TopBar
from input_keyboard import KeyboardRouter
from input_pointer import PointerRouter
from mega_settings import MegaSettingsOverlay
from page_layout import build_two_page_scroll_rows
from scroll_physics import ManualWheelPump, WheelAccumulator
from settings_store import flush_all, read_json, write_json_debounced
from state import ReaderState
from state_machine import (
    ReaderStateMachine,
    is_two_page_flip_mode,
    is_two_page_mangaplus_mode,
    is_two_page_scroll_mode,
    normalize_settings,
    uses_vertical_scroll,
)
from end_overlay import EndOfVolumeOverlay
from goto_page_overlay import GotoPageOverlay
from loupe_widget import LoupeWidget
from volume_nav_overlay import VolumeNavOverlay


class ComicReaderWidget(QWidget):
    book_opened = Signal(dict)
    book_closed = Signal()
    progress_changed = Signal(dict)

    def __init__(self, parent=None):
        super().__init__(parent)
        self.state = ReaderState()
        self._session_manager = ArchiveSessionManager()
        self._current_session = None
        self._book_meta = {}

        self.bitmap_cache = BitmapCache(self, memory_saver=bool(self.state.settings.get("memory_saver", False)))
        self.state_machine = ReaderStateMachine(self.state, self.bitmap_cache)
        self.state_machine.ensure_normalized_settings()

        self.canvas = CanvasWidget(self)
        self.canvas.set_strip_context(
            self.state,
            self._get_cache_entry,
            self._get_flip_pair,
            self._get_two_page_scroll_rows,
        )

        self.bitmap_cache.page_ready.connect(self._on_cache_page_ready)
        self.bitmap_cache.page_failed.connect(self._on_cache_page_failed)

        self.wheel_acc = WheelAccumulator(alpha=0.62, noise_threshold=2.5, reset_after_ms=140)
        self.manual_wheel_pump = ManualWheelPump(self, consume_fraction=0.52)
        self.manual_wheel_pump.stepped.connect(self._on_manual_wheel_step)

        self.keyboard = KeyboardRouter(self)
        self.pointer = PointerRouter(self)

        self._mp_dragging = False
        self._mp_drag_moved = False
        self._mp_last_x = 0.0
        self._mp_last_y = 0.0
        self._mp_start_x = 0.0

        self._two_page_scroll_rows = []
        self._two_page_scroll_sig = None
        self._two_page_scroll_hold_single_row_until_sync = False
        self._two_page_scroll_pending_sync_index = None
        self._two_page_scroll_pending_scroll_progress01 = None

        self._auto_flip_timer = QTimer(self)
        self._auto_flip_timer.setSingleShot(True)
        self._auto_flip_timer.timeout.connect(self._on_auto_flip_timer_tick)
        self._auto_flip_paused = False

        self._db_path = self._default_progress_db_path()
        self._db = read_json(self._db_path, fallback={"books": {}, "series": {}}) or {"books": {}, "series": {}}
        self._current_book_id = ""
        self._current_series_id = ""
        self._bookmarks = set()
        self._save_timer = QTimer(self)
        self._save_timer.setSingleShot(True)
        self._save_timer.timeout.connect(self._save_progress_now)

        self.setFocusPolicy(Qt.FocusPolicy.StrongFocus)
        self.setStyleSheet("background: black;")
        self.setWindowTitle("Qt Comic Reader")
        self.setMouseTracking(True)
        self.canvas.setMouseTracking(True)

        self.top_bar = TopBar(self)
        self.bottom_hud = BottomHud(self)
        self.manual_scroller = ManualScroller(self)
        self.hud = HudController(self, self.top_bar, self.bottom_hud, self.manual_scroller)

        self.mega_settings_overlay = MegaSettingsOverlay(self)
        self.volume_nav_overlay = VolumeNavOverlay(self)
        self.goto_page_overlay = GotoPageOverlay(self)
        self.loupe = LoupeWidget(self)
        self.end_overlay = EndOfVolumeOverlay(self)
        self.mega_settings_overlay.hide()
        self.volume_nav_overlay.hide()
        self.goto_page_overlay.hide()
        self.loupe.hide()
        self.end_overlay.hide()

        self.end_overlay.next_volume.connect(self._on_end_next_volume)
        self.end_overlay.replay.connect(self._on_end_replay)
        self.end_overlay.go_back.connect(self._on_end_back)
        self.volume_nav_overlay.volume_selected.connect(self._on_volume_nav_selected)
        self.goto_page_overlay.page_selected.connect(lambda idx: self.go_to_page(idx, keep_scroll=False))

        self.top_bar.back_clicked.connect(self._on_hud_back_clicked)
        self.bottom_hud.prev_clicked.connect(self._on_hud_prev)
        self.bottom_hud.play_clicked.connect(self._on_hud_play_pause)
        self.bottom_hud.next_clicked.connect(self._on_hud_next)
        self.bottom_hud.mode_clicked.connect(self.toggle_control_mode)
        self.bottom_hud.seek_commit.connect(self._on_hud_seek_commit)
        self.bottom_hud.prev_vol_clicked.connect(self._on_hud_prev_vol)
        self.bottom_hud.next_vol_clicked.connect(self._on_hud_next_vol)
        self.manual_scroller.drag_progress.connect(self._on_manual_scroller_drag_progress)

        self.setContextMenuPolicy(Qt.ContextMenuPolicy.CustomContextMenu)
        self.customContextMenuRequested.connect(lambda p: self._on_context_menu_requested(self, p))
        for w in (self.canvas, self.top_bar, self.bottom_hud, self.manual_scroller):
            w.setContextMenuPolicy(Qt.ContextMenuPolicy.CustomContextMenu)
            w.customContextMenuRequested.connect(lambda p, src=w: self._on_context_menu_requested(src, p))

        self._update_hud_geometry()
        self._update_hud_state()

    def get_control_mode(self):
        return self.state_machine.mode()

    def is_mangaplus_mode(self):
        return is_two_page_mangaplus_mode(self.get_control_mode())

    def _is_flip_mode(self):
        return is_two_page_flip_mode(self.get_control_mode())

    def _mangaplus_zoom_pct(self):
        value = float(self.state.settings.get("two_page_mangaplus_zoom_pct", 100))
        return int(max(100.0, min(260.0, value)))

    def get_mangaplus_zoom_pct(self):
        return self._mangaplus_zoom_pct()

    def _mode_label(self, mode: str):
        mapping = {
            "manual": "Manual",
            "twoPage": "Double Page",
            "twoPageMangaPlus": "Double Page (MangaPlus)",
            "twoPageScroll": "Double Page (Scroll)",
            "autoFlip": "Auto Flip",
        }
        return mapping.get(str(mode), "Manual")

    def _page_text_for_hud(self):
        if not self.state.pages:
            return "-"
        total = len(self.state.pages)
        mode = self.get_control_mode()
        if self._is_flip_mode() or mode == "autoFlip":
            pair = self._get_flip_pair()
            if pair is not None and pair.left_index_or_none is not None:
                a = int(pair.right_index) + 1
                b = int(pair.left_index_or_none) + 1
                return f"Pages {a}-{b}/{total}"
        return f"Page {int(self.state.page_index) + 1}/{total}"

    def _progress01_for_scroller(self):
        if not self.state.pages:
            return 0.0
        mode = self.get_control_mode()
        if mode == "twoPageScroll":
            if self.state.y_max <= 0:
                return 0.0
            return max(0.0, min(1.0, float(self.state.y) / float(self.state.y_max)))
        total = max(1, len(self.state.pages))
        local = 0.0
        if mode == "manual":
            h = self.canvas.get_scaled_page_height(self.state.page_index)
            if h and h > 0:
                local = max(0.0, min(1.0, float(self.state.y) / float(h)))
        elif self._is_flip_mode() or mode == "autoFlip":
            pair = self._get_flip_pair()
            if pair is not None:
                idx = int(pair.right_index)
                return max(0.0, min(1.0, float(idx) / float(max(1, total - 1))))
        return max(0.0, min(1.0, (float(self.state.page_index) + local) / float(total)))

    def _apply_scroller_progress(self, progress01: float, commit: bool):
        p = max(0.0, min(1.0, float(progress01)))
        if not self.state.pages:
            return
        mode = self.get_control_mode()
        if mode == "twoPageScroll":
            if self.state.y_max <= 0:
                self._two_page_scroll_pending_scroll_progress01 = p
                self.canvas.update()
                return
            old_y = float(self.state.y)
            self.state.y = p * float(self.state.y_max)
            self._sync_page_from_two_page_scroll_y()
            if abs(old_y - self.state.y) > 0.01:
                self.bitmap_cache.set_current_index(self.state.page_index)
                self._prefetch_for_current_mode()
                self._set_title_for_page()
                self.canvas.update()
                self._emit_progress_changed()
            return

        total = len(self.state.pages)
        target = max(0, min(total - 1, int(p * max(1, total - 1))))
        if commit:
            self.go_to_page(target, keep_scroll=False)

    def _on_manual_scroller_drag_progress(self, progress01: float, commit: bool):
        self._apply_scroller_progress(progress01, bool(commit))

    def _on_hud_seek_commit(self, idx: int):
        if not self.state.pages:
            return
        self.go_to_page(int(idx), keep_scroll=False)

    def _on_hud_back_clicked(self):
        self.close_book()

    def _on_hud_prev(self):
        mode = self.get_control_mode()
        if self._is_flip_mode() or mode == "autoFlip":
            self.prev_two_page()
            return
        self.prev_page()

    def _on_hud_next(self):
        mode = self.get_control_mode()
        if self._is_flip_mode() or mode == "autoFlip":
            self.next_two_page()
            return
        self.next_page()

    def _on_hud_prev_vol(self):
        siblings = self._find_sibling_volumes()
        cur = os.path.normcase(os.path.abspath(self.state.book_path)) if self.state.book_path else ""
        for i, p in enumerate(siblings):
            if os.path.normcase(p) == cur and i > 0:
                self.close_book()
                self.open_book(siblings[i - 1])
                return

    def _on_hud_next_vol(self):
        siblings = self._find_sibling_volumes()
        cur = os.path.normcase(os.path.abspath(self.state.book_path)) if self.state.book_path else ""
        for i, p in enumerate(siblings):
            if os.path.normcase(p) == cur and i < len(siblings) - 1:
                self.close_book()
                self.open_book(siblings[i + 1])
                return

    def _on_hud_play_pause(self):
        mode = self.get_control_mode()
        if mode == "autoFlip":
            self.toggle_auto_flip_pause()
            self._update_hud_state()
            return

    def _is_bookmarked(self, idx: int):
        return int(idx) in self._bookmarks

    def _toggle_bookmark(self, idx: int | None = None):
        if not self.state.pages:
            return
        page_idx = int(self.state.page_index if idx is None else idx)
        page_idx = max(0, min(len(self.state.pages) - 1, page_idx))
        if page_idx in self._bookmarks:
            self._bookmarks.discard(page_idx)
        else:
            self._bookmarks.add(page_idx)
        self._emit_progress_changed()

    def _set_two_page_image_fit(self, fit: str):
        value = "width" if str(fit) == "width" else "height"
        mode = self.get_control_mode()
        if mode == "twoPageMangaPlus":
            key = "two_page_mangaplus_image_fit"
            self.state.settings[key] = value
        else:
            key = "two_page_flip_image_fit"
            self.state.settings[key] = value
        self._set_flip_pan(0.0, 0.0, redraw=False)
        self.canvas.update()
        self._emit_progress_changed()

    def _set_scale_quality(self, quality: str):
        q = str(quality or "off").strip().lower()
        if q not in ("off", "smooth", "sharp", "pixel"):
            q = "off"
        self.state.settings["image_scale_quality"] = q
        self.canvas.update()
        self._emit_progress_changed()

    def _set_gutter_shadow_preset(self, value: float):
        self.state.settings["gutter_shadow_strength"] = max(0.0, min(1.0, float(value)))
        self.canvas.update()
        self._emit_progress_changed()

    def _save_current_page(self):
        """Export the current page image to a file."""
        if not self.state.pages:
            return
        entry = self._get_cache_entry(self.state.page_index)
        if entry is None or entry.pixmap is None:
            return
        from PySide6.QtWidgets import QFileDialog
        name = os.path.basename(self.state.book_path) if self.state.book_path else "page"
        name = os.path.splitext(name)[0]
        default_name = f"{name}_page{self.state.page_index + 1}.png"
        path, _ = QFileDialog.getSaveFileName(
            self, "Save Page Image", default_name,
            "PNG (*.png);;JPEG (*.jpg);;WebP (*.webp)"
        )
        if not path:
            return
        entry.pixmap.save(path)

    def _copy_current_page_to_clipboard(self):
        """Copy the current page image to the system clipboard."""
        if not self.state.pages:
            return
        entry = self._get_cache_entry(self.state.page_index)
        if entry is None or entry.pixmap is None:
            return
        QApplication.clipboard().setPixmap(entry.pixmap)

    def _open_goto_page_dialog(self):
        if not self.state.pages:
            return
        self._close_other_overlays("goto")
        self.goto_page_overlay.setGeometry(self.rect())
        self.goto_page_overlay.open(int(self.state.page_index), len(self.state.pages))

    def _open_volume_nav(self):
        if not self.state.book_path:
            return
        self._close_other_overlays("volnav")
        siblings = self._find_sibling_volumes()
        if not siblings:
            return
        current_path = os.path.abspath(self.state.book_path)
        books = []
        for path in siblings:
            name = os.path.splitext(os.path.basename(path))[0]
            is_current = os.path.normcase(path) == os.path.normcase(current_path)
            bid = self._book_id_for_path(path)
            saved = self._load_saved_progress(bid)
            progress_page = None
            time_ago = ""
            if saved:
                progress_page = saved.get("page_index")
                updated_at = saved.get("updated_at")
                if updated_at:
                    from volume_nav_overlay import _format_time_ago
                    time_ago = _format_time_ago(updated_at)
            books.append({
                "path": path,
                "name": name,
                "is_current": is_current,
                "progress_page": progress_page,
                "time_ago": time_ago,
            })
        self.volume_nav_overlay.setGeometry(self.rect())
        self.volume_nav_overlay.open(books)

    def _on_volume_nav_selected(self, path: str):
        if path:
            self.close_book()
            self.open_book(path)

    def _close_other_overlays(self, keep: str = ""):
        if keep != "mega" and self.mega_settings_overlay.is_open():
            self.mega_settings_overlay.close()
        if keep != "volnav" and self.volume_nav_overlay.is_open():
            self.volume_nav_overlay.close()
        if keep != "goto" and self.goto_page_overlay.is_open():
            self.goto_page_overlay.close()
        if keep != "end" and self.end_overlay.is_open():
            self.end_overlay.hide_overlay()

    def _copy_volume_path(self):
        if not self.state.book_path:
            return
        QApplication.clipboard().setText(self.state.book_path)

    def _reveal_volume_in_explorer(self):
        if not self.state.book_path:
            return
        path = os.path.abspath(self.state.book_path)
        if os.name == "nt":
            try:
                subprocess.Popen(["explorer.exe", "/select,", path])
                return
            except Exception:
                pass
        parent = os.path.dirname(path)
        if parent and os.path.isdir(parent):
            try:
                os.startfile(parent)
            except Exception:
                pass

    def _open_reader_context_menu(self, global_pos):
        if not self.state.pages:
            return
        menu = QMenu(self)

        settings_action = QAction("Settings  (S)", self)
        settings_action.triggered.connect(self._open_mega_settings)
        menu.addAction(settings_action)

        volumes_action = QAction("Volumes  (O)", self)
        volumes_action.triggered.connect(self._open_volume_nav)
        volumes_action.setEnabled(bool(self.state.book_path))
        menu.addAction(volumes_action)

        go_to_page = QAction("Go to page...  (G)", self)
        go_to_page.triggered.connect(self._open_goto_page_dialog)
        menu.addAction(go_to_page)

        menu.addSeparator()

        copy_path = QAction("Copy volume path", self)
        copy_path.triggered.connect(self._copy_volume_path)
        copy_path.setEnabled(bool(self.state.book_path))
        menu.addAction(copy_path)

        reveal = QAction("Reveal volume in Explorer", self)
        reveal.triggered.connect(self._reveal_volume_in_explorer)
        reveal.setEnabled(bool(self.state.book_path))
        menu.addAction(reveal)

        menu.addSeparator()

        flip_mode = self._is_flip_mode() or self.get_control_mode() == "autoFlip"
        fit_menu = menu.addMenu("Image fit")
        fit_menu.setEnabled(flip_mode)
        fit_value = (
            str(self.state.settings.get("two_page_mangaplus_image_fit", "width"))
            if self.get_control_mode() == "twoPageMangaPlus"
            else str(self.state.settings.get("two_page_flip_image_fit", "height"))
        )

        fit_h = QAction("Fit height", self)
        fit_h.setCheckable(True)
        fit_h.setChecked(fit_value != "width")
        fit_h.triggered.connect(lambda: self._set_two_page_image_fit("height"))
        fit_menu.addAction(fit_h)

        fit_w = QAction("Fit width", self)
        fit_w.setCheckable(True)
        fit_w.setChecked(fit_value == "width")
        fit_w.triggered.connect(lambda: self._set_two_page_image_fit("width"))
        fit_menu.addAction(fit_w)

        direction = QAction("Next page on left", self)
        direction.setCheckable(True)
        direction.setChecked(bool(self.state.settings.get("two_page_next_on_left", False)))
        direction.triggered.connect(lambda: self.toggle_manga_invert())
        direction.setEnabled(flip_mode)
        menu.addAction(direction)

        nudge = QAction("Coupling nudge", self)
        nudge.setCheckable(True)
        nudge.setChecked(bool(self.state.settings.get("two_page_coupling_nudge", 0)))
        nudge.triggered.connect(lambda: self.toggle_two_page_coupling_nudge())
        nudge.setEnabled(bool(flip_mode or self.get_control_mode() == "twoPageScroll"))
        menu.addAction(nudge)

        shadow_menu = menu.addMenu("Gutter shadow")
        cur_shadow = float(self.state.settings.get("gutter_shadow_strength", 0.35))
        presets = [
            ("Off", 0.0),
            ("Subtle", 0.22),
            ("Medium", 0.35),
            ("Strong", 0.55),
        ]
        for label, value in presets:
            action = QAction(label, self)
            action.setCheckable(True)
            action.setChecked(abs(cur_shadow - value) < 0.03)
            action.triggered.connect(lambda _checked=False, v=value: self._set_gutter_shadow_preset(v))
            shadow_menu.addAction(action)

        menu.addSeparator()

        q_menu = menu.addMenu("Scaling")
        current_q = str(self.state.settings.get("image_scale_quality", "off"))
        for q_label, q_value in (("Off", "off"), ("Smoother", "smooth"), ("Sharper", "sharp"), ("Pixel", "pixel")):
            qa = QAction(q_label, self)
            qa.setCheckable(True)
            qa.setChecked(current_q == q_value)
            qa.triggered.connect(lambda _checked=False, v=q_value: self._set_scale_quality(v))
            q_menu.addAction(qa)

        menu.addSeparator()

        save_page = QAction("Save current page...", self)
        save_page.triggered.connect(self._save_current_page)
        save_page.setEnabled(bool(self.state.pages))
        menu.addAction(save_page)

        copy_page = QAction("Copy current page to clipboard", self)
        copy_page.triggered.connect(self._copy_current_page_to_clipboard)
        copy_page.setEnabled(bool(self.state.pages))
        menu.addAction(copy_page)

        menu.addSeparator()

        cur_page = int(self.state.page_index)
        b_action = QAction(
            "Remove bookmark" if self._is_bookmarked(cur_page) else "Bookmark this page",
            self,
        )
        b_action.triggered.connect(lambda: self._toggle_bookmark(cur_page))
        menu.addAction(b_action)

        if self._bookmarks:
            menu.addSeparator()
            for bi in sorted(self._bookmarks)[:6]:
                jump = QAction(f"Go to bookmark: Page {bi + 1}", self)
                jump.triggered.connect(lambda _checked=False, idx=bi: self.go_to_page(idx, keep_scroll=False))
                menu.addAction(jump)

        menu.exec(global_pos)

    def _on_context_menu_requested(self, source_widget, local_pos):
        self.hud.note_activity()
        if not self.state.pages:
            return
        try:
            global_pos = source_widget.mapToGlobal(local_pos)
        except Exception:
            global_pos = self.mapToGlobal(local_pos)
        self._open_reader_context_menu(global_pos)

    def toggle_hud_visibility(self):
        self.hud.toggle_hud()

    def _update_hud_geometry(self):
        w = max(1, self.width())
        h = max(1, self.height())
        top_h = 58
        bottom_h = 104
        scroller_w = 16
        self.top_bar.setGeometry(0, 0, w, top_h)
        self.bottom_hud.setGeometry(0, max(0, h - bottom_h), w, bottom_h)
        self.manual_scroller.setGeometry(max(0, w - scroller_w - 6), top_h + 12, scroller_w, max(40, h - top_h - bottom_h - 24))
        self.top_bar.raise_()
        self.bottom_hud.raise_()
        self.manual_scroller.raise_()

    def _update_hud_state(self):
        name = os.path.basename(self.state.book_path) if self.state.book_path else ""
        self.top_bar.set_title(name)

        total = len(self.state.pages)
        self.bottom_hud.set_slider_range(total)
        self.bottom_hud.set_slider_value(int(self.state.page_index))
        self.bottom_hud.set_page_text(self._page_text_for_hud())
        self.bottom_hud.set_mode(self.get_control_mode())
        playing = bool(self.get_control_mode() == "autoFlip" and self._auto_flip_timer.isActive() and not self._auto_flip_paused)
        self.bottom_hud.set_playing(playing)

        self.bottom_hud.slider.set_bookmarks(self._bookmarks)

        has_prev_vol = False
        has_next_vol = False
        if self.state.book_path:
            siblings = self._find_sibling_volumes()
            cur = os.path.normcase(os.path.abspath(self.state.book_path))
            for i, p in enumerate(siblings):
                if os.path.normcase(p) == cur:
                    has_prev_vol = i > 0
                    has_next_vol = i < len(siblings) - 1
                    break
        self.bottom_hud.prev_vol_btn.setEnabled(has_prev_vol)
        self.bottom_hud.next_vol_btn.setEnabled(has_next_vol)

        self.manual_scroller.set_progress(self._progress01_for_scroller())
        visible = bool(self.state.pages)
        self.top_bar.setVisible(visible and not self.hud.hud_hidden)
        self.bottom_hud.setVisible(visible and not self.hud.hud_hidden)
        self.manual_scroller.setVisible(visible and not self.hud.hud_hidden)

    def _default_progress_db_path(self):
        appdata = os.environ.get("APPDATA") or os.path.expanduser("~")
        return os.path.join(appdata, "Tankoban", "comic_reader_qt", "progress.json")

    def _id_from_text(self, text: str) -> str:
        digest = hashlib.sha1(text.encode("utf-8")).digest()
        return base64.urlsafe_b64encode(digest).decode("ascii").rstrip("=")

    def _book_id_for_path(self, path: str) -> str:
        ap = os.path.abspath(path)
        try:
            st = os.stat(ap)
            payload = f"{ap}|{st.st_size}|{int(st.st_mtime)}"
        except Exception:
            payload = ap
        return self._id_from_text(payload)

    def _series_id_for_path(self, path: str) -> str:
        folder = os.path.dirname(os.path.abspath(path))
        return self._id_from_text(folder or path)

    def _books_store(self):
        self._db.setdefault("books", {})
        return self._db["books"]

    def _series_store(self):
        self._db.setdefault("series", {})
        return self._db["series"]

    def _schedule_save(self, delay_ms: int):
        self._save_timer.start(max(120, int(delay_ms)))

    def _save_progress_now(self):
        if not self._current_book_id:
            return
        mode = self.get_control_mode()
        seen = int(self.state.max_page_seen)
        seen = max(seen, int(self.state.page_index))
        if self._is_flip_mode() or mode == "autoFlip":
            pair = self._get_flip_pair()
            if pair is not None:
                seen = max(seen, int(pair.right_index))
                if pair.left_index_or_none is not None:
                    seen = max(seen, int(pair.left_index_or_none))
        self.state.max_page_seen = seen

        books = self._books_store()
        series = self._series_store()
        prev = dict(books.get(self._current_book_id) or {})
        payload = {
            "page_index": int(self.state.page_index),
            "x": float(self.state.x),
            "y": float(self.state.y),
            "y_max": float(self.state.y_max),
            "settings": dict(self.state.settings),
            "page_count": int(len(self.state.pages)),
            "updated_at": time.time(),
            "book_path": self.state.book_path,
            "book_meta": dict(self._book_meta or {}),
            "known_spread_indices": sorted(int(i) for i in self.state.known_spread_indices),
            "known_normal_indices": sorted(int(i) for i in self.state.known_normal_indices),
            "max_page_seen": int(max(int(prev.get("max_page_seen", 0)), self.state.max_page_seen)),
            "bookmarks": sorted(int(i) for i in self._bookmarks),
        }
        books[self._current_book_id] = payload
        if self._current_series_id:
            series[self._current_series_id] = {"settings": dict(self.state.settings)}
        write_json_debounced(self._db_path, self._db, delay_ms=150)

    def _load_saved_progress(self, book_id: str):
        books = self._books_store()
        if not book_id:
            return None
        data = books.get(book_id)
        return dict(data) if isinstance(data, dict) else None

    def _load_series_settings(self, series_id: str):
        store = self._series_store()
        row = store.get(series_id)
        if not isinstance(row, dict):
            return None
        settings = row.get("settings")
        if not isinstance(settings, dict):
            return None
        return dict(settings)

    def _auto_flip_interval_sec(self):
        raw = float(self.state.settings.get("auto_flip_interval_sec", 30))
        return int(max(5, min(600, raw)))

    def _stop_auto_flip_timer(self):
        self._auto_flip_timer.stop()
        self.state.playing = False
        self._update_hud_state()

    def _restart_auto_flip_timer(self):
        if self.get_control_mode() != "autoFlip":
            self._stop_auto_flip_timer()
            return
        if self._auto_flip_paused:
            self._stop_auto_flip_timer()
            return
        self.state.playing = True
        self._auto_flip_timer.start(self._auto_flip_interval_sec() * 1000)
        self._update_hud_state()

    def toggle_auto_flip_pause(self):
        if self.get_control_mode() != "autoFlip":
            return
        self._auto_flip_paused = not self._auto_flip_paused
        if self._auto_flip_paused:
            self._stop_auto_flip_timer()
        else:
            self._restart_auto_flip_timer()
        self._update_hud_state()

    def _on_auto_flip_timer_tick(self):
        if self.get_control_mode() != "autoFlip":
            return
        if self._auto_flip_paused:
            return
        before = int(self.state.page_index)
        self.next_two_page()
        if int(self.state.page_index) == before:
            self._stop_auto_flip_timer()
            return

    def _invalidate_two_page_scroll_rows(self):
        self._two_page_scroll_rows = []
        self._two_page_scroll_sig = None

    def _collect_dims_from_cache(self):
        dims = {}
        for idx in range(len(self.state.pages)):
            entry = self.bitmap_cache.get_entry(idx)
            if entry is not None:
                dims[idx] = (int(entry.width), int(entry.height))
        return dims

    def _ensure_two_page_scroll_rows(self):
        if not self.state.pages:
            self._two_page_scroll_rows = []
            self._two_page_scroll_sig = None
            self.state.y_max = 0.0
            return

        spreads_cached = set(self.bitmap_cache.get_cached_spread_indices())
        spreads = frozenset(set(self.state.known_spread_indices) | spreads_cached)
        nudge = int(self.state.settings.get("two_page_coupling_nudge", 0))
        width = int(max(1, self.width()))
        gap = int(self.state.settings.get("two_page_scroll_row_gap_px", 16))
        sig = (len(self.state.pages), spreads, nudge, width, gap)
        if self._two_page_scroll_sig == sig and self._two_page_scroll_rows:
            return

        dims = self._collect_dims_from_cache()
        rows = list(
            build_two_page_scroll_rows(
                len(self.state.pages),
                set(spreads),
                nudge=nudge,
                viewport_width=width,
                row_gap=gap,
                dims=dims,
                gutter=8,
            )
        )
        self._two_page_scroll_rows = rows
        self._two_page_scroll_sig = sig
        if rows:
            self.state.y_max = float(max(0, rows[-1]["y_end"] - max(1, self.height())))
        else:
            self.state.y_max = 0.0

        if self._two_page_scroll_hold_single_row_until_sync and self._two_page_scroll_pending_sync_index is not None:
            row = self._row_for_page_index(int(self._two_page_scroll_pending_sync_index))
            if row is not None:
                local_y = float(self.state.y)
                self.state.y = float(row.get("y_start", 0)) + max(0.0, local_y)
                self._two_page_scroll_hold_single_row_until_sync = False
                self._two_page_scroll_pending_sync_index = None

        if self._two_page_scroll_pending_scroll_progress01 is not None:
            p = float(self._two_page_scroll_pending_scroll_progress01)
            p = max(0.0, min(1.0, p))
            self._two_page_scroll_pending_scroll_progress01 = None
            self.state.y = p * float(self.state.y_max)

        self.state.y = max(0.0, min(self.state.y, self.state.y_max))

    def _get_two_page_scroll_rows(self):
        self._ensure_two_page_scroll_rows()
        return self._two_page_scroll_rows

    def resizeEvent(self, event):
        mode = self.get_control_mode()
        prev_h = None
        ratio = 0.0
        if mode == "manual":
            prev_h = self.canvas.get_scaled_page_height(self.state.page_index)
            if prev_h and prev_h > 0:
                ratio = max(0.0, min(1.0, float(self.state.y) / float(max(1, prev_h))))
        super().resizeEvent(event)
        self.canvas.setGeometry(self.rect())
        self.canvas.lower()
        self._invalidate_two_page_scroll_rows()
        if mode == "manual":
            new_h = self.canvas.get_scaled_page_height(self.state.page_index)
            if new_h and new_h > 0:
                self.state.y = ratio * float(new_h)
        elif mode == "twoPageScroll":
            self._ensure_two_page_scroll_rows()
        else:
            self._set_flip_pan(self.state.x, self.state.y, redraw=False)
        self._update_hud_geometry()
        self._update_hud_state()
        for overlay in (self.end_overlay, self.mega_settings_overlay, self.volume_nav_overlay, self.goto_page_overlay):
            if overlay.isVisible():
                overlay.setGeometry(self.rect())
        self.canvas.update()

    def closeEvent(self, event):
        try:
            self.close_book()
        finally:
            super().closeEvent(event)

    def open_book(self, path: str, book_meta: dict | None = None):
        try:
            session = self._session_manager.open(path)
            self._current_session = session
            self._book_meta = dict(book_meta or {})
            self.state.book_path = os.path.abspath(path)
            self._current_book_id = self._book_id_for_path(self.state.book_path)
            self._current_series_id = self._series_id_for_path(self.state.book_path)
            self.state.pages = list(session.entries)
            self.state.page_index = 0
            self.state.x = 0.0
            self.state.y = 0.0
            self.state.y_max = 0.0
            self.state.max_page_seen = 0
            self.state.known_spread_indices = set()
            self.state.known_normal_indices = set()

            series_settings = self._load_series_settings(self._current_series_id) or {}
            self.state.settings = normalize_settings(series_settings)
            self.state_machine.ensure_normalized_settings()

            self.state.tokens["open"] = int(self.state.tokens.get("open", 0)) + 1
            self.state.tokens["volume"] = int(self.state.tokens.get("volume", 0)) + 1
            self.state.tokens["mode"] = int(self.state.tokens.get("mode", 0)) + 1

            self.bitmap_cache.set_session(
                session,
                self.state.tokens["volume"],
                len(self.state.pages),
            )
            self._invalidate_two_page_scroll_rows()

            saved = self._load_saved_progress(self._current_book_id)
            target_idx = 0
            keep_scroll = False
            if saved:
                try:
                    self.state.settings = normalize_settings(saved.get("settings"))
                    self.state.max_page_seen = int(saved.get("max_page_seen", 0))
                    self.state.known_spread_indices = set(int(i) for i in (saved.get("known_spread_indices") or []))
                    self.state.known_normal_indices = set(int(i) for i in (saved.get("known_normal_indices") or []))
                    self._bookmarks = set(int(i) for i in (saved.get("bookmarks") or []))
                    target_idx = int(saved.get("page_index", 0))
                    self.state.x = max(0.0, float(saved.get("x", 0.0)))
                    self.state.y = max(0.0, float(saved.get("y", 0.0)))
                    keep_scroll = True
                except Exception:
                    target_idx = 0
                    keep_scroll = False
                    self.state.x = 0.0
                    self.state.y = 0.0
                    self._bookmarks = set()

            self.go_to_page(target_idx, keep_scroll=keep_scroll)
            if self.get_control_mode() == "autoFlip":
                self._auto_flip_paused = False
                self._restart_auto_flip_timer()
            self.hud.set_hidden(False)
            self.hud.note_activity()
            self._update_hud_state()
            payload = self.get_progress()
            payload["book_meta"] = dict(self._book_meta)
            self.book_opened.emit(payload)
        except Exception as exc:
            self.canvas.clear()
            QMessageBox.critical(self, "Open failed", str(exc))

    def close_book(self):
        self._stop_auto_flip_timer()
        self._save_progress_now()
        self.manual_wheel_pump.clear()
        self._mp_dragging = False
        self._mp_drag_moved = False
        self._save_timer.stop()
        self._current_session = None
        self.bitmap_cache.clear()
        self._invalidate_two_page_scroll_rows()
        self._two_page_scroll_hold_single_row_until_sync = False
        self._two_page_scroll_pending_sync_index = None
        self._two_page_scroll_pending_scroll_progress01 = None
        self.state.book_path = ""
        self.state.pages = []
        self.state.page_index = 0
        self.state.x = 0.0
        self.state.y = 0.0
        self.state.y_max = 0.0
        self._bookmarks = set()
        self._current_book_id = ""
        self._current_series_id = ""
        self.canvas.clear()
        self.hud.set_hidden(False)
        self._update_hud_state()
        try:
            self._session_manager.close_all()
        except Exception:
            pass
        try:
            flush_all()
        except Exception:
            pass
        self.book_closed.emit()

    def _find_sibling_volumes(self):
        """Return a sorted list of CBZ/CBR files in the same directory."""
        if not self.state.book_path:
            return []
        folder = os.path.dirname(os.path.abspath(self.state.book_path))
        if not os.path.isdir(folder):
            return []
        exts = (".cbz", ".cbr")
        siblings = []
        try:
            for f in os.listdir(folder):
                if any(f.lower().endswith(e) for e in exts):
                    siblings.append(os.path.join(folder, f))
        except OSError:
            return []
        siblings.sort(key=lambda p: p.lower())
        return siblings

    def _find_next_volume(self):
        siblings = self._find_sibling_volumes()
        if not siblings or not self.state.book_path:
            return None
        current = os.path.abspath(self.state.book_path)
        try:
            idx = [s.lower() for s in siblings].index(current.lower())
        except ValueError:
            return None
        if idx + 1 < len(siblings):
            return siblings[idx + 1]
        return None

    def _show_end_overlay(self):
        name = os.path.basename(self.state.book_path) if self.state.book_path else ""
        series = str(self._book_meta.get("series") or "")
        has_next = self._find_next_volume() is not None
        self.end_overlay.setGeometry(self.rect())
        self.end_overlay.show_overlay(name, series, has_next)

    def _on_end_next_volume(self):
        nxt = self._find_next_volume()
        if nxt:
            self.close_book()
            self.open_book(nxt)

    def _on_end_replay(self):
        self.go_to_page(0, keep_scroll=False)

    def _on_end_back(self):
        self.close_book()

    def get_progress(self) -> dict:
        return self.state_machine.get_progress()

    def _emit_progress_changed(self):
        if self.state.pages:
            self.state.max_page_seen = max(int(self.state.max_page_seen), int(self.state.page_index))
            delay = 1500 if self.state.playing else 450
            self._schedule_save(delay)
        self._update_hud_state()
        self.progress_changed.emit(self.get_progress())

    def _set_title_for_page(self):
        if not self.state.pages:
            self.setWindowTitle("Qt Comic Reader")
            return
        total = len(self.state.pages)
        name = os.path.basename(self.state.book_path) if self.state.book_path else "Book"
        if self._is_flip_mode():
            pair = self._get_flip_pair()
            if pair is None:
                current = self.state.page_index + 1
                self.setWindowTitle(f"{name} - Page {current}/{total}")
                return
            if pair.left_index_or_none is not None:
                right = pair.right_index + 1
                left = pair.left_index_or_none + 1
                self.setWindowTitle(f"{name} - Pages {right}-{left}/{total}")
            else:
                current = pair.right_index + 1
                self.setWindowTitle(f"{name} - Page {current}/{total}")
            return
        current = self.state.page_index + 1
        self.setWindowTitle(f"{name} - Page {current}/{total}")

    def _get_cache_entry(self, index: int):
        return self.bitmap_cache.get_entry(index)

    def _get_flip_pair(self):
        return self.state_machine.get_flip_pair()

    def _prefetch_for_current_mode(self):
        mode = self.get_control_mode()
        idx = int(self.state.page_index)
        if mode == "manual":
            self.bitmap_cache.prefetch_neighbors(idx, radius=2)
            return
        if mode == "twoPageScroll":
            self._prefetch_two_page_scroll_rows()
            return
        self.bitmap_cache.prefetch_neighbors(idx, radius=2)
        pair = self._get_flip_pair()
        if pair is not None and pair.left_index_or_none is not None:
            self.bitmap_cache.request_page(pair.left_index_or_none)

    def _prefetch_two_page_scroll_rows(self):
        rows = self._get_two_page_scroll_rows()
        if not rows:
            self.bitmap_cache.prefetch_neighbors(int(self.state.page_index), radius=2)
            return
        view_h = max(1.0, float(self.height()))
        y0 = max(0.0, float(self.state.y) - (0.60 * view_h))
        y1 = float(self.state.y) + view_h + (1.60 * view_h)
        seen = set()
        for row in rows:
            rs = float(row.get("y_start", 0))
            re = float(row.get("y_end", 0))
            if re < y0:
                continue
            if rs > y1:
                break
            for page_idx in (row.get("indices") or []):
                i = int(page_idx)
                if i in seen:
                    continue
                seen.add(i)
                self.bitmap_cache.request_page(i)
                if len(seen) >= 9:
                    return

    def _row_for_page_index(self, page_index: int):
        rows = self._get_two_page_scroll_rows()
        for row in rows:
            indices = row.get("indices") or []
            if page_index in indices:
                return row
        return rows[0] if rows else None

    def _row_index_for_scroll_y(self, y_value: float):
        rows = self._get_two_page_scroll_rows()
        if not rows:
            return None
        y = float(y_value)
        lo = 0
        hi = len(rows) - 1
        while lo <= hi:
            mid = (lo + hi) // 2
            row = rows[mid]
            ys = float(row.get("y_start", 0))
            ye = float(row.get("y_end", 0))
            if y < ys:
                hi = mid - 1
            elif y >= ye:
                lo = mid + 1
            else:
                return row
        return rows[-1]

    def _sync_page_from_two_page_scroll_y(self):
        rows = self._get_two_page_scroll_rows()
        if not rows:
            return
        y = float(self.state.y)
        lo = 0
        hi = len(rows) - 1
        hit = rows[hi]
        while lo <= hi:
            mid = (lo + hi) // 2
            row = rows[mid]
            ys = float(row.get("y_start", 0))
            ye = float(row.get("y_end", 0))
            if y < ys:
                hi = mid - 1
            elif y >= ye:
                lo = mid + 1
            else:
                hit = row
                break
        indices = hit.get("indices") or [0]
        target = int(indices[0])
        self.state.page_index = max(0, min(len(self.state.pages) - 1, target))

    def go_to_page(self, index: int, keep_scroll: bool = False):
        if self._current_session is None:
            return
        if not self.state.pages:
            return
        if self.end_overlay.is_open():
            self.end_overlay.hide_overlay()
        idx = max(0, min(len(self.state.pages) - 1, int(index)))
        mode = self.get_control_mode()
        self.state.page_index = idx

        if self._is_flip_mode():
            if not keep_scroll:
                self.state.x = 0.0
                self.state.y = 0.0
            self._set_flip_pan(self.state.x, self.state.y, redraw=False)
        elif mode == "twoPageScroll":
            self._ensure_two_page_scroll_rows()
            if not keep_scroll:
                row = self._row_for_page_index(idx)
                self.state.y = float(row.get("y_start", 0)) if row else 0.0
                self._two_page_scroll_hold_single_row_until_sync = False
                self._two_page_scroll_pending_sync_index = None
            self.state.y = max(0.0, min(self.state.y, self.state.y_max))
            self._sync_page_from_two_page_scroll_y()
        else:
            if not keep_scroll:
                self.state.y = 0.0
            self.state.y = max(0.0, float(self.state.y))

        self.bitmap_cache.set_current_index(self.state.page_index)
        self.bitmap_cache.request_page(self.state.page_index)
        self._prefetch_for_current_mode()
        self._set_title_for_page()
        if mode == "autoFlip":
            self._restart_auto_flip_timer()
        self.hud.note_activity()
        self.canvas.update()
        self._emit_progress_changed()

    def prev_page(self):
        self.go_to_page(self.state.page_index - 1, keep_scroll=False)

    def next_page(self):
        if self.state.pages and self.state.page_index >= len(self.state.pages) - 1:
            self._show_end_overlay()
            return
        self.go_to_page(self.state.page_index + 1, keep_scroll=False)

    def next_two_page(self):
        nxt = self.state_machine.next_two_page_index()
        if self.state.pages and nxt == self.state.page_index and nxt >= len(self.state.pages) - 1:
            self._show_end_overlay()
            return
        self.go_to_page(nxt, keep_scroll=False)

    def prev_two_page(self):
        self.go_to_page(self.state_machine.prev_two_page_index(), keep_scroll=False)

    def _snap_current_for_two_page(self):
        snapped = self.state_machine.snap_current_two_page_index()
        self.go_to_page(snapped, keep_scroll=False)

    def _scroll_manual(self, delta_px: float, max_jumps: int = 3):
        if not self.state.pages:
            return
        if abs(delta_px) < 0.01:
            return

        gap = int(self.state.settings.get("two_page_scroll_row_gap_px", 16))
        jump_count = 0
        remaining = float(delta_px)
        changed = False

        while abs(remaining) > 0.01:
            cur_idx = self.state.page_index
            cur_h = self.canvas.get_scaled_page_height(cur_idx)
            if cur_h is None:
                self.bitmap_cache.request_page(cur_idx)
                break
            boundary = float(cur_h + gap)

            if remaining > 0:
                needed = boundary - float(self.state.y)
                if remaining < needed:
                    self.state.y += remaining
                    changed = True
                    break
                if cur_idx >= (len(self.state.pages) - 1):
                    self.state.y = max(0.0, min(boundary - 1.0, self.state.y + remaining))
                    changed = True
                    break
                if not self.bitmap_cache.is_cached(cur_idx + 1):
                    self.bitmap_cache.request_page(cur_idx + 1)
                    self.bitmap_cache.prefetch_neighbors(cur_idx + 1, radius=2)
                    break
                if jump_count >= max_jumps:
                    break
                remaining -= needed
                self.state.page_index = cur_idx + 1
                self.state.y = 0.0
                jump_count += 1
                changed = True
                continue

            needed_up = float(self.state.y)
            if -remaining <= needed_up:
                self.state.y += remaining
                changed = True
                break
            if cur_idx <= 0:
                self.state.y = 0.0
                changed = True
                break
            if not self.bitmap_cache.is_cached(cur_idx - 1):
                self.bitmap_cache.request_page(cur_idx - 1)
                self.bitmap_cache.prefetch_neighbors(cur_idx - 1, radius=2)
                break
            if jump_count >= max_jumps:
                break
            remaining += needed_up
            self.state.page_index = cur_idx - 1
            prev_h = self.canvas.get_scaled_page_height(self.state.page_index)
            if prev_h is None:
                self.bitmap_cache.request_page(self.state.page_index)
                self.state.y = 0.0
                break
            self.state.y = float(prev_h + gap)
            jump_count += 1
            changed = True

        if changed:
            self.bitmap_cache.set_current_index(self.state.page_index)
            self._prefetch_for_current_mode()
            self._set_title_for_page()
            self.canvas.update()
            self._emit_progress_changed()

    def _scroll_two_page_scroll(self, delta_px: float):
        self._ensure_two_page_scroll_rows()
        if not self._two_page_scroll_rows:
            return
        old = float(self.state.y)
        self.state.y = max(0.0, min(self.state.y_max, old + float(delta_px)))
        if abs(self.state.y - old) < 0.01:
            return
        self._sync_page_from_two_page_scroll_y()
        self.bitmap_cache.set_current_index(self.state.page_index)
        self._prefetch_for_current_mode()
        self._set_title_for_page()
        self.canvas.update()
        self._emit_progress_changed()

    def _set_flip_pan(self, x: float | None = None, y: float | None = None, redraw: bool = True):
        mode = self.get_control_mode()
        if not self._is_flip_mode() and mode != "autoFlip":
            return False
        max_x, max_y = self.canvas.get_flip_pan_bounds()
        old_x = float(self.state.x)
        old_y = float(self.state.y)
        next_x = old_x if x is None else float(x)
        next_y = old_y if y is None else float(y)
        next_x = max(0.0, min(max_x, next_x))
        next_y = max(0.0, min(max_y, next_y))
        if abs(next_x - old_x) < 0.01 and abs(next_y - old_y) < 0.01:
            return False
        self.state.x = next_x
        self.state.y = next_y
        if redraw:
            self.canvas.update()
            self._emit_progress_changed()
        return True

    def _pan_two_page(self, dx: float = 0.0, dy: float = 0.0, dominant_axis: bool = True, dual_axis: bool = False):
        mode = self.get_control_mode()
        if (not self._is_flip_mode() and mode != "autoFlip") or not self.state.pages:
            return
        max_x, max_y = self.canvas.get_flip_pan_bounds()
        if max_x <= 0.0 and max_y <= 0.0:
            self._set_flip_pan(0.0, 0.0, redraw=True)
            return

        if mode == "twoPage":
            self._set_flip_pan(None, self.state.y + dy, redraw=True)
            return

        if mode == "twoPageMangaPlus":
            if dual_axis:
                self._set_flip_pan(self.state.x + dx, self.state.y + dy, redraw=True)
                return
            if dominant_axis and max_x > 0.0 and abs(dx) > abs(dy):
                self._set_flip_pan(self.state.x + dx, None, redraw=True)
                return
            self._set_flip_pan(None, self.state.y + dy, redraw=True)
            return

        self._set_flip_pan(None, self.state.y + dy, redraw=True)

    def _on_cache_page_ready(self, index: int):
        entry = self.bitmap_cache.get_entry(index)
        if entry is not None:
            if bool(entry.spread):
                self.state.known_spread_indices.add(int(index))
                self.state.known_normal_indices.discard(int(index))
            else:
                self.state.known_normal_indices.add(int(index))
                self.state.known_spread_indices.discard(int(index))
        if abs(index - self.state.page_index) <= 6:
            self._invalidate_two_page_scroll_rows()
            if self._is_flip_mode():
                self._set_flip_pan(self.state.x, self.state.y, redraw=False)
            self.canvas.update()

    def _on_cache_page_failed(self, index: int, error: str):
        if index != self.state.page_index:
            return
        QMessageBox.warning(self, "Page decode failed", f"Page {index + 1}: {error}")

    def _on_manual_wheel_step(self, delta_px: float):
        mode = self.get_control_mode()
        if mode == "manual":
            self._scroll_manual(delta_px, max_jumps=3)
            return
        if mode == "twoPageScroll":
            self._scroll_two_page_scroll(delta_px)

    def toggle_control_mode(self):
        self.manual_wheel_pump.clear()
        self.wheel_acc.reset()
        self.hud.note_activity()
        prev_mode = self.get_control_mode()
        next_mode = self.state_machine.cycle_mode()

        if prev_mode == "autoFlip" and next_mode != "autoFlip":
            self._auto_flip_paused = False
            self._stop_auto_flip_timer()

        if prev_mode == "twoPageScroll" and next_mode != "twoPageScroll":
            row = self._row_index_for_scroll_y(self.state.y)
            if row is not None:
                indices = row.get("indices") or [self.state.page_index]
                self.state.page_index = max(0, min(len(self.state.pages) - 1, int(indices[0])))
            self.state.page_index = self.state_machine.snap_current_two_page_index()
            self._two_page_scroll_hold_single_row_until_sync = False
            self._two_page_scroll_pending_sync_index = None
            self._two_page_scroll_pending_scroll_progress01 = None

        if next_mode == "twoPageScroll":
            if is_two_page_flip_mode(prev_mode) or prev_mode == "autoFlip":
                self.state.page_index = self.state_machine.snap_current_two_page_index()
                self._two_page_scroll_hold_single_row_until_sync = True
                self._two_page_scroll_pending_sync_index = int(self.state.page_index)
            else:
                self._two_page_scroll_hold_single_row_until_sync = False
                self._two_page_scroll_pending_sync_index = None
            self._invalidate_two_page_scroll_rows()
            self._ensure_two_page_scroll_rows()
            row = self._row_for_page_index(self.state.page_index)
            if row is not None:
                self.state.y = float(row.get("y_start", 0))
            self.state.y = max(0.0, min(self.state.y, self.state.y_max))
            self._sync_page_from_two_page_scroll_y()
            self.bitmap_cache.set_current_index(self.state.page_index)
            self.bitmap_cache.request_page(self.state.page_index)
            self._prefetch_for_current_mode()
            self._set_title_for_page()
            self.canvas.update()
            self._emit_progress_changed()
            return

        if is_two_page_flip_mode(next_mode) or next_mode == "autoFlip":
            snapped = self.state_machine.snap_current_two_page_index()
            self.state.x = 0.0
            self.state.y = 0.0
            self.go_to_page(snapped, keep_scroll=False)
            if next_mode == "autoFlip":
                self._auto_flip_paused = False
                self._restart_auto_flip_timer()
            return

        self.go_to_page(self.state.page_index, keep_scroll=False)

    def toggle_manga_invert(self):
        self.state.settings["two_page_next_on_left"] = not bool(self.state.settings.get("two_page_next_on_left", False))
        self.canvas.update()
        self._emit_progress_changed()

    def toggle_two_page_coupling_nudge(self):
        cur = int(self.state.settings.get("two_page_coupling_nudge", 0))
        self.state.settings["two_page_coupling_nudge"] = 0 if cur else 1
        self._invalidate_two_page_scroll_rows()
        if self.get_control_mode() == "twoPageScroll":
            self._two_page_scroll_hold_single_row_until_sync = True
            self._two_page_scroll_pending_sync_index = int(self.state.page_index)
            self._ensure_two_page_scroll_rows()
            self.canvas.update()
            self._emit_progress_changed()
            return
        if self._is_flip_mode():
            self._snap_current_for_two_page()
            return
        self.canvas.update()
        self._emit_progress_changed()

    def toggle_two_page_image_fit(self):
        mode = self.get_control_mode()
        if mode == "twoPageMangaPlus":
            key = "two_page_mangaplus_image_fit"
            cur = str(self.state.settings.get(key, "width"))
            self.state.settings[key] = "height" if cur == "width" else "width"
        else:
            key = "two_page_flip_image_fit"
            cur = str(self.state.settings.get(key, "height"))
            self.state.settings[key] = "height" if cur == "width" else "width"
        self._set_flip_pan(0.0, 0.0, redraw=False)
        self.canvas.update()
        self._emit_progress_changed()

    def _open_mega_settings(self):
        self._close_other_overlays("mega")
        self.mega_settings_overlay.setGeometry(self.rect())
        self.mega_settings_overlay.open()

    def toggle_loupe(self):
        enabled = not self.loupe.isVisible()
        self.loupe.setVisible(enabled)
        if enabled:
            zoom = float(self.state.settings.get("loupe_zoom", 2.0))
            size = int(self.state.settings.get("loupe_size", 220))
            self.loupe.set_zoom(zoom)
            self.loupe.set_loupe_size(size)

    def _update_loupe(self, pos):
        if not self.loupe.isVisible():
            return
        canvas_pos = self.canvas.mapFromParent(pos)
        self.loupe.set_frame_rects(self.canvas.last_frame_rects)
        self.loupe.update_cursor(canvas_pos)
        self.loupe.raise_()

    def toggle_fullscreen_window(self):
        win = self.window()
        if win is None:
            return
        if win.isFullScreen():
            win.showNormal()
        else:
            win.showFullScreen()

    def adjust_mangaplus_zoom(self, delta_pct: int):
        if not self.is_mangaplus_mode():
            return
        cur = self._mangaplus_zoom_pct()
        self.state.settings["two_page_mangaplus_zoom_pct"] = max(100, min(260, cur + int(delta_pct)))
        self._set_flip_pan(0.0, 0.0, redraw=False)
        self.canvas.update()
        self._emit_progress_changed()

    def reset_mangaplus_zoom(self):
        if not self.is_mangaplus_mode():
            return
        self.state.settings["two_page_mangaplus_zoom_pct"] = 100
        self._set_flip_pan(0.0, 0.0, redraw=False)
        self.canvas.update()
        self._emit_progress_changed()

    def _flip_key_inverted(self):
        return bool(self.state.settings.get("two_page_next_on_left", False))

    def on_nav_left(self):
        mode = self.get_control_mode()
        if mode == "autoFlip":
            self.next_two_page()
            return
        if mode == "manual":
            self.prev_page()
            return
        if mode == "twoPageScroll":
            self.prev_page()
            return
        if mode == "twoPageMangaPlus" and self._mangaplus_zoom_pct() > 100:
            max_x, max_y = self.canvas.get_flip_pan_bounds()
            has_x = max_x > 0.0
            has_y = max_y > 0.0
            eps = 2.0
            next_on_left = self._flip_key_inverted()
            if next_on_left:
                at_bottom = (not has_y) or (self.state.y >= (max_y - eps))
                at_edge = (not has_x) or (self.state.x <= eps)
                if at_bottom and at_edge:
                    self.next_two_page()
                    return
            if has_x:
                self._pan_two_page(dx=-160.0, dy=0.0, dominant_axis=False, dual_axis=False)
            return
        if self._flip_key_inverted():
            self.next_two_page()
        else:
            self.prev_two_page()

    def on_nav_right(self):
        mode = self.get_control_mode()
        if mode == "autoFlip":
            self.prev_two_page()
            return
        if mode == "manual":
            self.next_page()
            return
        if mode == "twoPageScroll":
            self.next_page()
            return
        if mode == "twoPageMangaPlus" and self._mangaplus_zoom_pct() > 100:
            max_x, max_y = self.canvas.get_flip_pan_bounds()
            has_x = max_x > 0.0
            has_y = max_y > 0.0
            eps = 2.0
            next_on_left = self._flip_key_inverted()
            if not next_on_left:
                at_bottom = (not has_y) or (self.state.y >= (max_y - eps))
                at_edge = (not has_x) or (self.state.x >= (max_x - eps))
                if at_bottom and at_edge:
                    self.next_two_page()
                    return
            if has_x:
                self._pan_two_page(dx=160.0, dy=0.0, dominant_axis=False, dual_axis=False)
            return
        if self._flip_key_inverted():
            self.prev_two_page()
        else:
            self.next_two_page()

    def on_nav_up(self):
        mode = self.get_control_mode()
        if mode == "manual":
            self._scroll_manual(-self.height() * 0.12, max_jumps=3)
            return
        if mode == "twoPageScroll":
            self._scroll_two_page_scroll(-self.height() * 0.08)
            return
        if self._is_flip_mode():
            step = -128.0 if mode == "twoPageMangaPlus" else -self.height() * 0.14
            self._pan_two_page(dx=0.0, dy=step, dominant_axis=False, dual_axis=False)

    def on_nav_down(self):
        mode = self.get_control_mode()
        if mode == "manual":
            self._scroll_manual(self.height() * 0.12, max_jumps=3)
            return
        if mode == "twoPageScroll":
            self._scroll_two_page_scroll(self.height() * 0.08)
            return
        if self._is_flip_mode():
            step = 128.0 if mode == "twoPageMangaPlus" else self.height() * 0.14
            self._pan_two_page(dx=0.0, dy=step, dominant_axis=False, dual_axis=False)

    def handle_pointer_wheel(self, event) -> bool:
        mode = self.get_control_mode()
        if uses_vertical_scroll(mode):
            pixel_delta = event.pixelDelta().y()
            if pixel_delta != 0:
                raw = -float(pixel_delta) * 1.35
            else:
                raw = -(float(event.angleDelta().y()) / 120.0) * 112.0
            filtered = self.wheel_acc.push(raw)
            if abs(filtered) > 0.0:
                self.hud.note_activity()
                self.manual_wheel_pump.add(filtered)
                return True
            return False

        if self._is_flip_mode() or mode == "autoFlip":
            pd = event.pixelDelta()
            if not pd.isNull():
                dx = float(pd.x()) * 1.35
                dy = -float(pd.y()) * 1.35
            else:
                ad = event.angleDelta()
                dx = float(ad.x()) / 120.0 * 112.0
                dy = -float(ad.y()) / 120.0 * 112.0
            if abs(dx) > 0.0 or abs(dy) > 0.0:
                self.hud.note_activity()
                if self._is_flip_mode():
                    self._pan_two_page(dx=dx, dy=dy, dominant_axis=True, dual_axis=False)
                else:
                    self._pan_two_page(dx=0.0, dy=dy, dominant_axis=False, dual_axis=False)
                return True
            return False

        return False

    def _handle_flip_click_nav(self, x_pos):
        zone = self._flip_click_zone(x_pos)
        invert = self._flip_key_inverted()
        go_next = bool(invert) if zone == "left" else not bool(invert)
        if go_next:
            self.next_two_page()
        else:
            self.prev_two_page()

    def _flip_click_zone(self, x_pos):
        """Divide into left half / right half for two-page click navigation."""
        width = max(1, self.width())
        x = float(x_pos)
        if x < width / 2.0:
            return "left"
        return "right"

    def handle_pointer_press(self, event) -> bool:
        if event.button() != Qt.MouseButton.LeftButton:
            return False
        if not self._is_flip_mode():
            return False
        pt = event.position().toPoint()
        # MangaPlus zoomed: start drag tracking on any press
        if self.is_mangaplus_mode() and self._mangaplus_zoom_pct() > 100:
            self._mp_dragging = True
            self._mp_drag_moved = False
            self._mp_last_x = float(pt.x())
            self._mp_last_y = float(pt.y())
            self._mp_start_x = float(pt.x())
            self.hud.note_activity()
            return True
        # Normal two-page: left half = prev, right half = next
        self._handle_flip_click_nav(pt.x())
        return True

    def handle_pointer_move(self, event) -> bool:
        if not self._mp_dragging:
            return False
        pt = event.position().toPoint()
        x = float(pt.x())
        y = float(pt.y())
        dx = x - self._mp_last_x
        dy = y - self._mp_last_y
        self._mp_last_x = x
        self._mp_last_y = y

        if not self._mp_drag_moved and (abs(dx) + abs(dy) < 4.0):
            return True

        self._mp_drag_moved = True
        self.hud.note_activity()
        self._pan_two_page(dx=-dx, dy=-dy, dominant_axis=False, dual_axis=True)
        return True

    def handle_pointer_release(self, event) -> bool:
        if not self._mp_dragging:
            return self._is_flip_mode()
        self._mp_dragging = False
        was_drag = self._mp_drag_moved
        self._mp_drag_moved = False
        if not was_drag:
            # No drag movement — treat as tap navigation
            pt = event.position().toPoint()
            self._handle_flip_click_nav(pt.x())
        return True

    def keyPressEvent(self, event):
        self.hud.note_activity()
        # Route to active overlay first
        if self.mega_settings_overlay.is_open():
            self.mega_settings_overlay.keyPressEvent(event)
            event.accept()
            return
        if self.volume_nav_overlay.is_open():
            self.volume_nav_overlay.keyPressEvent(event)
            event.accept()
            return
        if self.goto_page_overlay.is_open():
            self.goto_page_overlay.keyPressEvent(event)
            event.accept()
            return
        if self.end_overlay.is_open():
            self.end_overlay.keyPressEvent(event)
            event.accept()
            return
        if self.keyboard.handle_key_press(event):
            event.accept()
            return
        super().keyPressEvent(event)

    def wheelEvent(self, event):
        self.hud.note_activity()
        if self.pointer.handle_wheel(event):
            event.accept()
            return
        super().wheelEvent(event)

    def mousePressEvent(self, event):
        self.hud.note_activity()
        if self.pointer.handle_mouse_press(event):
            event.accept()
            return
        # For non-flip modes (manual, twoPageScroll): mid click toggles HUD,
        # side clicks are disabled (matching Electron behaviour).
        if event.button() == Qt.MouseButton.LeftButton and self.state.pages:
            mode = self.get_control_mode()
            if mode == "autoFlip":
                x = float(event.position().x())
                w = max(1.0, float(self.width()))
                zone = self._flip_click_zone(x)
                if zone == "left":
                    self.prev_two_page()
                elif zone == "right":
                    self.next_two_page()
                else:
                    self.toggle_hud_visibility()
                event.accept()
                return
            # manual / twoPageScroll: only mid-click for HUD toggle
            self.toggle_hud_visibility()
            event.accept()
            return
        super().mousePressEvent(event)

    def mouseMoveEvent(self, event):
        self.hud.note_activity()
        self._update_loupe(event.position().toPoint())
        if self.pointer.handle_mouse_move(event):
            event.accept()
            return
        super().mouseMoveEvent(event)

    def mouseReleaseEvent(self, event):
        self.hud.note_activity()
        if self.pointer.handle_mouse_release(event):
            event.accept()
            return
        super().mouseReleaseEvent(event)

    def contextMenuEvent(self, event):
        self.hud.note_activity()
        if self.state.pages:
            self._open_reader_context_menu(event.globalPos())
            event.accept()
            return
        super().contextMenuEvent(event)
