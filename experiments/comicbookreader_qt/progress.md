# Qt Comic Book Reader — Progress Tracker

| Phase | Description | Status |
|-------|-------------|--------|
| 1 | Skeleton + Archive + Single Page Display | Completed (2026-03-02) |
| 2 | Bitmap Cache + Threaded Decode | Completed (2026-03-02) |
| 3 | Portrait Strip Rendering (Manual Scroll + Auto Scroll) | Completed (2026-03-02) |
| 4 | Two-Page Layout Engine | Completed (2026-03-02) |
| 5 | Two-Page Flip Rendering | Completed (2026-03-02) |
| 6 | Two-Page Scroll + MangaPlus Zoom | In Progress (2026-03-02) |
| 7 | Auto Flip Timer | Not Started |
| 8 | HUD System (Top Bar + Bottom HUD + Scroller) | Not Started |
| 9 | Full Input System | Not Started |
| 10 | Overlays (Mega Settings + Volume Nav + Speed + Keys + Context Menu) | Not Started |
| 11 | Progress & Settings Persistence | Not Started |
| 12 | Polish, Testing & Integration Prep | Not Started |

---

## Notes

- Phase 1 implemented:
  - Standalone launcher with file picker (`launcher.py`)
  - Main reader widget + keyboard page navigation (`comic_reader_widget.py`)
  - Canvas painter surface with centered no-upscale rendering (`canvas_widget.py`)
  - CBZ/CBR archive sessions with natural-sort image indexing + 3-session LRU (`archive_session.py`)
  - Reader state dataclass + constants + requirements scaffold (`state.py`, `constants.py`, `requirements.txt`)
- Phase 2 implemented:
  - Threaded decode cache with `QThreadPool` (2-4 workers), page-ready/page-failed signals (`bitmap_cache.py`)
  - LRU eviction with memory budget (512MB default, 256MB memory-saver), keep-set cap (12), and lock-set (current +/- 1)
  - Fast header dimension parsing for PNG/JPEG/WebP/GIF + spread detection (`width/height > 1.35`)
  - Reader integration switched to async cache-backed page loads + neighbor prefetch (`comic_reader_widget.py`)
  - Archive read lock added for safe concurrent decode reads (`archive_session.py`)
- Phase 3 implemented:
  - Portrait strip render path in canvas with multi-page draw (up to 6 pages/frame), no-upscale scaling, spread full-width behavior (`canvas_widget.py`)
  - Manual scroll via arrow step (12% viewport) + wheel smoothing pipeline (accumulator + timer pump) (`scroll_physics.py`, `comic_reader_widget.py`)
  - Boundary crossing guarded by cache readiness, with max 3 page jumps per input burst and 35% viewport prefetch trigger (`comic_reader_widget.py`)
  - Resize scroll-preservation by relative page position (`comic_reader_widget.py`)
  - Auto-scroll intentionally removed per product direction (manual reading only)
- Phase 4 implemented:
  - Two-page spread detection helper with precedence chain (manual spread override -> manual normal override -> cached dimensions)
  - Effective-index parity math helpers (`two_page_extra_slots_before`, `two_page_effective_index`)
  - Pair snapping and pair extraction (`snap_two_page_index`, `get_two_page_pair`) handling cover-alone/spread/unpaired cases
  - Two-page scroll row builder (`build_two_page_scroll_rows`) with optional dimension-aware row heights for cover/spread/single/pair rows
- Phase 5 implemented:
  - Flip mode rendering path with cover/spread/pair/unpaired handling and gutter shadow (`canvas_widget.py`)
  - Fit behavior for two-page flip (`two_page_fit_mode`: height default, width optional; spreads forced fit-width)
  - Two-page navigation (`next_two_page`, `prev_two_page`) using parity snap + spread-aware stepping (`comic_reader_widget.py`)
  - Partner prefetch for visible pair pages in flip mode (`comic_reader_widget.py`)
  - Flip click-zones (left/right half) with manga direction inversion toggle (`I`) and mode toggle (`M`)
  - Coupling nudge toggle (`N`) to re-snap parity pairing in flip mode
- Phase 6 started (MangaPlus track):
  - Added explicit `mangaplus` control mode (cycle with `M`: portrait -> flip -> mangaplus)
  - Added MangaPlus zoom state (`mangaplus_zoom_pct`, 100-260) with key controls (`+`, `-`, `0`)
  - Added two-axis pan state (`x`,`y`) and renderer pan bounds (`get_flip_pan_bounds`) for overflow clamping
  - Wheel in two-page modes now pans current spread/page only (no implicit page turn at bounds)
  - Added drag-pan in MangaPlus zoom mode (4px threshold) and vertical/horizontal keyboard panning when zoomed
