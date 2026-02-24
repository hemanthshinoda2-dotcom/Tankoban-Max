# Tankoban Web Parity Plan: Chrome-Like Browser + qBittorrent-Like Torrent (Core Quasi-Parity)

## Summary
Implement a **stability-first, phased roadmap** to bring Tankoban’s web browser and torrent experience closer to Chrome and qBittorrent in core behavior and UI, while preserving current architecture and app identity.

This plan focuses on:
1. Fixing behavioral defects first (especially input/event conflicts).
2. Delivering core browser parity interactions (tabs, omnibox, context menu correctness, downloads, history/bookmarks/session quality).
3. Delivering core torrent parity interactions (file selection, destination flow, progress/control model, queue-like clarity, completion UX).
4. Improving UI consistency to feel intentionally Chrome/qBittorrent-inspired, not cloned.

## Scope and Non-Goals
### In Scope
1. Core browser workflows and controls.
2. Core torrent workflows and controls.
3. Existing feature hardening and UX consistency.
4. Lightweight new features that directly support core parity.

### Out of Scope
1. Full Chrome clone features (profiles sync, extension ecosystem, devtools parity).
2. Full qBittorrent advanced stack (RSS automation, remote web UI, deep scheduler rules).
3. Full browser engine architecture rewrite.

## Current-Gap Snapshot (from app code)
1. Input/event conflicts exist (example: right-click can trigger context menu and navigation/new-tab side effects).
2. Popup/new-window handling is duplicated across several paths (`new-window`, popup bridge IPC, `onPopupOpen`), increasing duplicate-open risk.
3. Omnibox lacks Chrome-like suggestion/dropdown interaction model.
4. Download UX is split across multiple surfaces with partial parity behavior.
5. Torrent flow is strong but still lacks qBittorrent-like control clarity and state ergonomics (queue/status semantics, destination persistence behavior consistency, richer list-level operations).

## Phase Roadmap

## Phase 1: Stability and Event Correctness (P0)
### Goal
Remove behavioral regressions and interaction ambiguity before feature expansion.

### Work
1. **Context menu hardening**
- Prevent accidental open/navigation when invoking right-click on links/media.
- Add click suppression window after context-menu invocation for same target/coords.
- Ensure `context-menu` path is side-effect free unless explicit menu action is clicked.

2. **Popup/new-tab dedupe unification**
- Consolidate popup routing to a single canonical path in `src/domains/web/web.js`.
- Keep one dedupe gate keyed by URL + source tab + short time window.
- Ensure magnet/.torrent interception runs exactly once.

3. **Navigation action determinism**
- Separate left-click, ctrl/cmd-click, middle-click, keyboard open behaviors explicitly.
- Prevent mixed outcomes (context + open, reload + duplicate history insert, etc.).

4. **State update throttling consistency**
- Normalize per-tab and per-torrent update cadence to avoid UI flicker/re-render clobbering.

### Acceptance
1. Right-click on link/media/text never opens a tab unless chosen from menu.
2. Popup-triggered links open once.
3. Magnet/.torrent links never start duplicate torrent sessions.

## Phase 2: Chrome-Like Browser Core UX (P1)
### Goal
Make core browsing feel predictably Chrome-like.

### Work
1. **Tab model polish**
- Add robust tab actions: duplicate tab, reopen closed tab, close others, close tabs to right.
- Improve tab drag reorder reliability and active tab focus behavior.
- Preserve pinned-tab behavior groundwork (UI + persistence flags).

2. **Omnibox parity uplift**
- Add dropdown suggestions from history/bookmarks/open tabs while typing.
- Better URL/query parsing and canonicalization.
- Keyboard behavior parity: Enter, Shift+Enter variant, Esc restore, Ctrl/Cmd+L focus, Alt+Enter new tab.

3. **Find-in-page and in-page controls**
- Stabilize match count updates and next/prev behavior.
- Ensure find state is tab-local and clears correctly on tab switches/close.

4. **Browser home/new tab behavior**
- Improve source tiles as speed-dial style start surface with recents.
- Better empty states and first-run guidance.

5. **Session and history quality**
- Reliable restore semantics for tabs and active tab.
- More consistent history insertion and dedupe rules.

### Acceptance
1. Omnibox + shortcuts feel consistent in common Chrome workflows.
2. Tab operations behave deterministically under rapid user actions.
3. Session restore and history no longer exhibit obvious duplicates/omissions.

## Phase 3: Chrome-Like Download Manager Core (P1)
### Goal
Unify direct and webview-triggered downloads into one coherent UX.

### Work
1. **Single mental model**
- Keep one unified list for active + completed (direct + electron-item + torrent history labeling).
- Clear status taxonomy and badges.

2. **Action consistency**
- Pause/resume/cancel/reveal actions displayed only when truly supported.
- Improve row status strings and progress ETA/rate formatting.

3. **Shelf/panel behavior**
- Tighten bottom shelf lifecycle and panel open/close rules.
- Add clear completed/failed filtering affordances.

4. **Destination picker UX**
- Improve folder navigation speed, breadcrumbs, and selected-root clarity.
- Preserve last-used destination by mode (books/comics/videos).

### Acceptance
1. User can reason about all downloads from one place.
2. No unsupported action buttons appear.
3. Destination choice flow is predictable and fast.

## Phase 4: qBittorrent-Like Torrent Core UX (P1)
### Goal
Retain current strong torrent base and make it feel like a proper manager.

### Work
1. **Torrent list ergonomics**
- Add sortable active list columns in hub/torrent tab style views: name, progress, size, rate, peers, state, ETA.
- Add quick filter chips: active, paused, completed, errored.

2. **Control model parity**
- Add global controls: pause all, resume all, cancel all completed/errored cleanup.
- Maintain per-torrent controls already present with improved feedback.

3. **File selection and destination flow**
- Keep metadata-first selection model.
- Persist user file-selection intent during metadata/progress updates (already partially done, complete edge cases).
- Add default save-path policy and per-torrent override visibility.

4. **Completion behavior**
- Consistent states for `completed`, `completed_pending`, `completed_with_errors`.
- Better post-completion CTA: open folder, close tab, remove from history.

5. **Streaming intent**
- Expose sequential mode clearly with warning/help text.
- Surface stream readiness state consistently.

### Acceptance
1. Torrent management feels list-driven and controllable (not tab-only).
2. Metadata/file-selection/destination flow has no clobbered state.
3. Completion actions are explicit and useful.

## Phase 5: UI Parity Layer (P2)
### Goal
Bring visual language closer to Chrome/qBittorrent patterns without cloning.

### Work
1. Standardize spacing, hit targets, iconography scale, and row density.
2. Improve hierarchy/contrast in tab strip, omnibox, download list, torrent file tree.
3. Apply consistent state colors and status badges.
4. Improve empty/loading/error states and inline guidance text.

### Acceptance
1. Browser/torrent screens look cohesive and intentional.
2. Core interactions are clearer at a glance.

## Important API / Interface / Type Changes
1. **IPC additions**
- `EVENT.WEB_PERMISSION_PROMPT` and `CHANNEL.WEB_PERMISSION_PROMPT_RESOLVE` for true ask flow.
- `CHANNEL.WEB_TORRENT_BULK_ACTION` for pause/resume/cancel-all ergonomics.
- `CHANNEL.WEB_DOWNLOAD_LIST_QUERY` for filtered/sorted unified list retrieval.

2. **Schema additions**
- `web_session_state.json`: persist pin/order metadata cleanly.
- `web_download_history.json`: add normalized `kind`, `capabilities`, `etaSec`, `lastRate`.
- `web_torrent_history.json`: add `etaSec`, `queuePosition`, `category/filter tags`, `lastActionAt`.

3. **Backward compatibility**
- All new fields optional with default fallbacks.
- One-time lazy migration on read, no destructive rewrite.

## Test Plan and Scenarios
1. **Unit tests**
- URL/magnet/.torrent detection and omnibox normalization.
- History/session dedupe logic.
- Torrent state transitions and file-selection merge behavior.
- Download state capability mapping (pause/resume/cancel availability).

2. **Integration tests**
- `will-download` direct file path and `.torrent` handoff path.
- Popup dedupe pipeline.
- Destination picker request/resolve lifecycle.
- Adblock/permission interactions with web partition.

3. **Manual acceptance matrix**
- Link right-click, ctrl-click, middle-click across common sites.
- Multiple concurrent direct downloads + torrent downloads.
- App restart with active downloads/torrents and session restore.
- Completion and rescan routing into books/comics/videos libraries.
- Error paths: network fail, invalid torrent URL, cancelled picker, interrupted app shutdown.

## Rollout Strategy
1. Ship phase-by-phase behind incremental flags where useful.
2. Add structured logs around popup routing, download transitions, torrent transitions.
3. Validate with a focused parity QA checklist per phase before moving forward.

## Assumptions and Defaults Chosen
1. Platform priority: Windows-first behavior parity (current app context), keep cross-platform-safe implementation.
2. Architecture: keep current renderer webview-based browser model for this roadmap (no full engine rewrite).
3. Scope depth: **Core Quasi-Parity** only, not deep advanced parity.
4. Delivery: **Phased roadmap** with **stability-first** sequencing.
5. Visual goal: inspired parity, not clone-level replication.
