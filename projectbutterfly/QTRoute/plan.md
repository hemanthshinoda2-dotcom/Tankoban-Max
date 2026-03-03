# QTRoute Plan: One Reusable Qt Library Shell for Comics, Books, and Video

## Summary
Create `projectbutterfly/QTRoute` as the migration control center and define one shared Qt library shell architecture that powers all three media libraries (comics, books, video) with media adapters for small differences.

Bridge compatibility is strict: existing `Tanko.api.library`, `Tanko.api.books`, and `Tanko.api.video` contracts remain stable while bridge internals are routed through shared QTRoute services.

## Locked Decisions
1. Scope: library shell only (scan/config/folders/grid/search/continue/backing state).
2. Location: `projectbutterfly/QTRoute`.
3. Compatibility: strict parity with current bridge contracts.
4. Media set: comics + books + video only.

## Internal Interfaces
1. `MediaKind = "comics" | "books" | "video"`.
2. `QTRouteProfile`:
   1. config/index mapping and IO surface
   2. scan orchestration hooks
   3. snapshot builder
   4. optional config mutation/lookup hooks
3. `QTRouteService`:
   1. `get_state(opts)`
   2. `scan(force, opts)`
   3. `cancel_scan()`
   4. `mutate_config(action, payload)`
   5. `lookup_from_path(path)`
4. `QTRouteScanRuntime`:
   1. scan request/start/cancel/finish telemetry
   2. thread/cancel-event attachment
   3. stale scan id tracking
5. `QTRouteStore`:
   1. shared JSON IO
   2. config/index read-write helpers
   3. media index mapping

## Implementation Notes
1. Keep bridge namespace APIs untouched at callsites.
2. Route LibraryBridge/BooksBridge/VideoBridge state + scan lifecycle through QTRoute service.
3. Preserve existing JSON canonical files:
   1. `library_state.json`
   2. `library_index.json`
   3. `books_library_state.json`
   4. `books_library_index.json`
   5. `video_index.json`

## Acceptance Criteria
1. Existing renderer views for comics/books/video keep working without JS API changes.
2. Bridge payload/event contracts remain stable.
3. Shared QTRoute runtime is the control surface for get-state/scan/cancel in all three bridge domains.
4. No storage format breakage.
