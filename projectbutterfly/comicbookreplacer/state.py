"""
Reader state — single source of truth for the comic reader.
All mutable state lives in ReaderState. No scattered globals.
"""

from dataclasses import dataclass, field
from typing import Optional


# Scroll speed presets (px/s), index 0 = Speed 1, index 9 = Speed 10
SPEED_PRESETS = [80, 100, 125, 155, 190, 235, 290, 360, 450, 560]

PORTRAIT_WIDTH_STEPS = [50, 60, 70, 74, 78, 90, 100]

DEFAULTS = {
    "controlMode": "manual",
    "portraitWidthPct": 100,
    "scrollPxPerSec": 190,          # Speed 5
    "topHoldSec": 0.55,
    "bottomHoldSec": 0.55,
    "twoPageFlipImageFit": "height",
    "twoPageMangaPlusImageFit": "width",
    "twoPageMangaPlusZoomPct": 100,
    "twoPageScrollRowGapPx": 16,
    "twoPageCouplingNudge": 0,
    "scrollMode": "infinite",
    "autoFlipIntervalSec": 30,
    "imageBrightnessPct": 100,
    "imageContrastPct": 100,
    "imageSaturatePct": 100,
    "imageSepiaPct": 0,
    "imageHueDeg": 0,
    "imageScaleQuality": "off",
    "imageInvert": 0,
    "imageGrayscale": 0,
    "twoPageGutterShadow": 0.35,
    "memorySaver": False,
    "loupeEnabled": False,
    "loupeZoom": 2.0,
    "loupeSizePx": 220,
}

# Spread detection thresholds (width / height)
WIDE_RATIO_PRIMARY = 1.25
WIDE_RATIO_SECONDARY = 1.15


@dataclass
class PageEntry:
    """One image entry inside an archive."""
    index: int              # position in the natural-sorted entry list
    filename: str           # original filename inside the archive
    entry_index: int        # raw index into the archive's entry list


@dataclass
class VolumeInfo:
    """Metadata about the currently open volume."""
    file_path: str = ""
    title: str = ""
    series: str = ""
    series_id: str = ""
    page_count: int = 0
    entries: list = field(default_factory=list)   # list[PageEntry]


@dataclass
class ReaderState:
    """All mutable reader state in one place."""

    # Volume
    volume: Optional[VolumeInfo] = None

    # Navigation
    page_index: int = 0
    scroll_y: float = 0.0          # device pixels from top of current page (portrait strip)

    # Settings (copy of DEFAULTS, per-series overrides applied on open)
    settings: dict = field(default_factory=lambda: dict(DEFAULTS))

    # Spread tracking
    known_spread_indices: set = field(default_factory=set)
    known_normal_indices: set = field(default_factory=set)

    # Progress tracking
    max_page_seen: int = 0
    bookmarks: list = field(default_factory=list)   # sorted list[int]
    finished: bool = False
    finished_at: Optional[float] = None
    updated_at: Optional[float] = None

    # Tokens for stale-decode protection
    volume_token: int = 0
    open_token: int = 0

    def is_spread(self, page_idx: int) -> bool:
        """Check if a page is a known spread (forced or detected)."""
        if page_idx in self.known_normal_indices:
            return False
        return page_idx in self.known_spread_indices

    def portrait_width_fraction(self) -> float:
        """Portrait width as a 0..1 fraction."""
        return self.settings.get("portraitWidthPct", 100) / 100.0

    def memory_budget_bytes(self) -> int:
        """Bitmap cache budget in bytes."""
        if self.settings.get("memorySaver", False):
            return 256 * 1024 * 1024   # 256 MB
        return 512 * 1024 * 1024       # 512 MB
