from __future__ import annotations

from dataclasses import asdict

from page_layout import get_two_page_pair, snap_two_page_index
from state import default_reader_settings


CONTROL_MODES = ("manual", "twoPage", "twoPageMangaPlus", "twoPageScroll", "auto")


def normalize_control_mode(mode: str) -> str:
    m = str(mode or "").strip()
    if m in CONTROL_MODES:
        return m
    legacy = {
        "portrait": "manual",
        "flip": "twoPage",
        "mangaplus": "twoPageMangaPlus",
        "scroll": "twoPageScroll",
        "autoFlip": "twoPage",
    }
    return legacy.get(m, "manual")


def is_two_page_flip_mode(mode: str) -> bool:
    m = normalize_control_mode(mode)
    return m in ("twoPage", "twoPageMangaPlus")


def is_two_page_mangaplus_mode(mode: str) -> bool:
    return normalize_control_mode(mode) == "twoPageMangaPlus"


def is_two_page_scroll_mode(mode: str) -> bool:
    return normalize_control_mode(mode) == "twoPageScroll"


def is_auto_scroll_mode(mode: str) -> bool:
    return normalize_control_mode(mode) == "auto"


def uses_vertical_scroll(mode: str) -> bool:
    m = normalize_control_mode(mode)
    return m in ("manual", "twoPageScroll", "auto")


def normalize_settings(settings: dict | None) -> dict:
    out = default_reader_settings()
    src = dict(settings or {})

    legacy_mode = src.get("control_mode", src.get("controlMode"))
    out["control_mode"] = normalize_control_mode(legacy_mode or out["control_mode"])

    legacy_map = {
        "row_gap_px": "two_page_scroll_row_gap_px",
        "two_page_nudge": "two_page_coupling_nudge",
        "two_page_fit_mode": "two_page_flip_image_fit",
        "mangaplus_zoom_pct": "two_page_mangaplus_zoom_pct",
        "manga_invert_click": "two_page_next_on_left",
        "auto_flip_interval": "auto_flip_interval_sec",
    }
    for old_k, new_k in legacy_map.items():
        if old_k in src and new_k not in src:
            src[new_k] = src[old_k]

    for k in list(out.keys()):
        if k in src:
            out[k] = src[k]

    out["control_mode"] = normalize_control_mode(out["control_mode"])
    out["portrait_width_pct"] = max(0.5, min(1.0, float(out["portrait_width_pct"])))
    out["two_page_scroll_row_gap_px"] = max(0, min(64, int(out["two_page_scroll_row_gap_px"])))
    out["two_page_coupling_nudge"] = 1 if int(out["two_page_coupling_nudge"]) else 0
    out["two_page_mangaplus_zoom_pct"] = max(100, min(260, int(out["two_page_mangaplus_zoom_pct"])))
    out["gutter_shadow_strength"] = max(0.0, min(1.0, float(out["gutter_shadow_strength"])))
    out["two_page_next_on_left"] = bool(out["two_page_next_on_left"])
    out["auto_flip_interval_sec"] = max(5, min(600, int(out["auto_flip_interval_sec"])))
    out["memory_saver"] = bool(out["memory_saver"])
    out["auto_scroll_speed_level"] = max(1, min(10, int(out.get("auto_scroll_speed_level", 5))))
    if str(out["two_page_flip_image_fit"]) not in ("height", "width"):
        out["two_page_flip_image_fit"] = "height"
    if str(out["two_page_mangaplus_image_fit"]) not in ("height", "width"):
        out["two_page_mangaplus_image_fit"] = "width"
    return out


def get_two_page_image_fit(settings: dict, mode: str) -> str:
    m = normalize_control_mode(mode)
    if m == "twoPageMangaPlus":
        v = str(settings.get("two_page_mangaplus_image_fit", "width"))
        return "width" if v == "width" else "height"
    v = str(settings.get("two_page_flip_image_fit", "height"))
    return "width" if v == "width" else "height"


class ReaderStateMachine:
    def __init__(self, state, bitmap_cache):
        self.state = state
        self.bitmap_cache = bitmap_cache

    def ensure_normalized_settings(self):
        self.state.settings = normalize_settings(self.state.settings)

    def mode(self) -> str:
        self.ensure_normalized_settings()
        return normalize_control_mode(self.state.settings.get("control_mode"))

    def set_mode(self, mode: str):
        self.ensure_normalized_settings()
        next_mode = normalize_control_mode(mode)
        cur_mode = self.mode()
        if cur_mode == next_mode:
            return False
        self.state.settings["control_mode"] = next_mode
        self.state.tokens["mode"] = int(self.state.tokens.get("mode", 0)) + 1
        return True

    def cycle_mode(self):
        order = ["manual", "twoPage", "twoPageMangaPlus", "twoPageScroll", "auto"]
        cur = self.mode()
        try:
            idx = order.index(cur)
        except ValueError:
            idx = 0
        nxt = order[(idx + 1) % len(order)]
        self.set_mode(nxt)
        return nxt

    def spread_set_from_cache(self) -> set[int]:
        return self.bitmap_cache.get_cached_spread_indices()

    def get_flip_pair(self):
        if not self.state.pages:
            return None
        spreads = self.spread_set_from_cache()
        nudge = int(self.state.settings.get("two_page_coupling_nudge", 0))
        return get_two_page_pair(self.state.page_index, len(self.state.pages), spreads, nudge=nudge)

    def snap_current_two_page_index(self) -> int:
        if not self.state.pages:
            return 0
        spreads = self.spread_set_from_cache()
        nudge = int(self.state.settings.get("two_page_coupling_nudge", 0))
        return snap_two_page_index(self.state.page_index, len(self.state.pages), spreads, nudge=nudge)

    def next_two_page_index(self) -> int:
        if not self.state.pages:
            return 0
        pair = self.get_flip_pair()
        if pair is None:
            return self.state.page_index
        if pair.cover_alone or pair.is_spread or pair.unpaired_single:
            nxt = pair.right_index + 1
        else:
            nxt = pair.left_index_or_none + 1
        return max(0, min(len(self.state.pages) - 1, nxt))

    def prev_two_page_index(self) -> int:
        if not self.state.pages:
            return 0
        pair = self.get_flip_pair()
        if pair is None:
            return self.state.page_index
        if pair.cover_alone:
            prev_index = 0
        else:
            prev_index = max(0, pair.right_index - 1)
        if prev_index > 0:
            spreads = self.spread_set_from_cache()
            nudge = int(self.state.settings.get("two_page_coupling_nudge", 0))
            prev_index = snap_two_page_index(prev_index, len(self.state.pages), spreads, nudge=nudge)
        return prev_index

    def get_progress(self) -> dict:
        return {
            "book_path": self.state.book_path,
            "page_index": int(self.state.page_index),
            "x": float(self.state.x),
            "y": float(self.state.y),
            "y_max": float(self.state.y_max),
            "mode": self.mode(),
            "settings": dict(self.state.settings),
            "tokens": dict(self.state.tokens),
            "page_count": len(self.state.pages),
        }

    def snapshot(self) -> dict:
        return asdict(self.state)
