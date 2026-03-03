from dataclasses import dataclass, field


def default_reader_settings():
    return {
        "control_mode": "manual",
        "portrait_width_pct": 1.0,
        "two_page_flip_image_fit": "height",
        "two_page_mangaplus_image_fit": "width",
        "two_page_mangaplus_zoom_pct": 100,
        "two_page_coupling_nudge": 0,
        "two_page_scroll_row_gap_px": 16,
        "two_page_next_on_left": False,
        "gutter_shadow_strength": 0.35,
        "auto_flip_interval_sec": 30,
        "memory_saver": False,
        "image_brightness_pct": 100,
        "image_contrast_pct": 100,
        "image_saturate_pct": 100,
        "image_sepia_pct": 0,
        "image_hue_deg": 0,
        "image_invert": 0,
        "image_grayscale": 0,
        "image_scale_quality": "off",
    }


@dataclass
class ReaderState:
    book_path: str = ""
    pages: list[str] = field(default_factory=list)
    page_index: int = 0
    x: float = 0.0
    y: float = 0.0
    y_max: float = 0.0
    playing: bool = False
    settings: dict = field(default_factory=default_reader_settings)
    tokens: dict = field(default_factory=lambda: {"open": 0, "volume": 0, "mode": 0})
    known_spread_indices: set[int] = field(default_factory=set)
    known_normal_indices: set[int] = field(default_factory=set)
    max_page_seen: int = 0
