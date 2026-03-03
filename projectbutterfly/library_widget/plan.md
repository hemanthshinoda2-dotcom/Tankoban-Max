# Unified QT Library Widget — Plan

## Context

The three JS library UIs (comics, books, video) share a near-identical two-level layout: home grid + detail table. Rather than porting each separately, we build **one native PySide6 library widget** parameterized by `MediaKind` that handles all three. This is an isolated experiment in `projectbutterfly/library_widget/` — no readers, no players, no changes to existing Electron code. The QTRoute backend (scan/state/config services) is already complete and will be reused for data access.

## Scope: Libraries ONLY

- Series/show grid with thumbnails
- Continue reading/watching shelf
- Volume/episode detail table with preview pane
- Sidebar with root folder tree
- Context menus, search, sort, hide-finished
- Scan integration with live progress
- NO comic reader, NO book reader, NO video player

## Module Structure

```
projectbutterfly/library_widget/
    __init__.py
    launcher.py              # Standalone QApplication entry point
    plan.md / progress.md    # Tracking docs

    # Data layer
    data_provider.py         # Reads QTRouteStore indexes, emits Signals
    media_adapter.py         # MediaKindAdapter protocol + Comics/Books/Video
    thumb_provider.py        # Async thumbnail loading via QThreadPool

    # Widget layer
    library_widget.py        # Top-level: sidebar + stacked home/detail views
    sidebar_widget.py        # QTreeWidget: "All" + root folders + child series
    home_view.py             # QScrollArea: continue shelf + series card grid
    detail_view.py           # QSplitter: episode/volume table + preview pane
    series_card.py           # Single card widget for the grid
    continue_tile.py         # Single tile widget for the continue shelf
    flow_layout.py           # QLayout subclass for responsive wrapping grid
    episode_table.py         # QTableWidget with media-kind-aware columns
    context_menu.py          # QMenu builders for cards, rows, sidebar items

    # Utilities
    thumb_extractor.py       # Extract cover from CBZ/CBR archives
    constants.py             # MediaKind enum, colors, sizes, fonts
    styles.py                # QSS dark theme stylesheet
```

## Data Flow

The widget does NOT import bridge.py. Instead:
1. `data_provider.py` uses `QTRouteStore` + `storage.py` to read index JSON files
2. Scanning is ported from bridge.py into the data provider
3. Thumbnail extraction runs in QThreadPool background threads

## 10 Testable Slices

Each slice ends with `python launcher.py` opening a window with real library data.

1. **Skeleton + Data + Plain Grid** — colored placeholder cards with names
2. **Sidebar + Root Folder Filtering** — tree sidebar, click to filter
3. **Detail View (Volume Table)** — click card → table of volumes
4. **Thumbnail Loading** — real cover images from CBZ archives
5. **Continue Reading Shelf** — horizontal shelf with progress badges
6. **Context Menus + Sort** — right-click menus, sort dropdown
7. **Books + Video Modes** — `--kind` flag for all three media types
8. **Scan + Live Updates** — background scanning with progress bar
9. **Search + Hide Finished** — text filter + toggle
10. **Preview Pane + Polish** — cover preview pane, dark theme QSS
