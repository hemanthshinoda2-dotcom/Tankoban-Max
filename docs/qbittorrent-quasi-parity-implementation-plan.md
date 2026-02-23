# Tankoban WebView Torrent Ecosystem: qBittorrent Quasi-Parity Implementation Plan

## Document Status
- Version: `1.1`
- Date: `2026-02-23`
- Owner: `Codex plan draft`
- Scope: Torrent manager behavior and UI parity with qBittorrent core workflows, embedded inside Tankoban web browser module.

## Executive Summary
This plan delivers qBittorrent-like torrent management inside Tankoban without cloning qBittorrent internals or UI verbatim. The target is **core quasi-parity**: transfer list quality, reliable controls, file selection/destination flow, categories/tags, properties panel, and robust persistence.

The delivery path is:
1. Keep current `WebTorrent` engine and harden it for parity-level UX.
2. Keep the entire torrent ecosystem inside the existing **web view/browser area** (no separate app mode).
3. Add a versioned torrent state store and migration.
4. Add a qB-like sync/update model and richer IPC contract.
5. Build a clear adapter boundary so a future `libtorrent` sidecar can be added without rewriting the UI.

## Decisions Locked
- Parity target: **Core qB parity first**.
- Integration surface: **Embedded WebView Torrent Workspace**.
- Backend direction: **Hybrid path** (WebTorrent now, optional libtorrent sidecar later).
- V1 feature bundle: **Transfer-core + properties + categories/tags**.
- Category model: **Dual model** (qB categories + optional routing to Books/Comics/Videos).
- Persistence: **Versioned state store + one-time migration**.
- Platform priority: **Windows-first**.
- Licensing strategy: **Behavioral reference only** (no direct qB code copy).

## Hard Constraint (User Requirement)
Torrent management must remain inside the existing browser/web module. The implementation will:
- Not add a separate top-level shell mode for torrents.
- Reuse and expand current web surfaces (`webHub`, `webTorrentPanel`, browser tab area).
- Provide qB-like management views as embedded panels/tabs within web mode.

## Current Baseline (Tankoban)
### Existing implementation
- Engine + lifecycle: `main/domains/webTorrent/index.js`
- IPC registration: `main/ipc/register/web_torrent.js`
- Channel/event constants: `shared/ipc.js`
- Renderer implementation: `src/domains/web/web.js`
- Current panel markup: `src/index.html`

### What already works
- Add torrent by magnet/URL.
- Pause/resume/cancel per torrent.
- File selection and destination selection.
- Progress events and history persistence.
- Stream readiness support.

### Key gaps vs qB core behavior
- No dedicated transfer table with qB-style columns/sort/filter semantics.
- No normalized sync model (`rid`/delta style).
- No categories/tags management model.
- No robust properties workspace with consistent refresh cadence.
- Limited bulk operations and queue/rate semantics.
- State is history-oriented rather than model-oriented.

## Reference Mapping (Behavioral, Not Copying)
Use these only as behavioral guides:
- qB Web API controller patterns:
  - `reference/qb-sample/qBittorrent-master/src/webui/api/torrentscontroller.cpp`
- qB Web UI state/sync patterns:
  - `reference/qb-sample/qBittorrent-master/src/webui/www/private/scripts/client.js`

Explicitly avoid copying qB source code or assets.

## Target Product Scope
## V1 (Must-Have)
- Embedded Torrent Workspace inside web browser UI with:
  - Transfer list table.
  - Status/category/tag filters.
  - Toolbar actions (add, pause, resume, delete/cancel, force start equivalent).
  - Bottom properties panel (General, Trackers, Peers, Files).
- Add Torrent flow with:
  - Save path chooser.
  - File tree and per-file selection.
  - Sequential intent toggle.
- Categories and tags:
  - CRUD categories/tags.
  - Assign/remove per torrent.
  - Optional auto-route to library domains.
- Persistent v2 torrent state with migration from current history.
- Bulk actions and reliable feedback/error states.

## V1.5 (Should-Have if schedule allows)
- Queue position model and move up/down/top/bottom.
- Per-torrent and global rate limits.
- Share ratio/time limits.
- Recheck/reannounce equivalents where feasible in WebTorrent path.

## Deferred (Not in this plan)
- RSS/search engine parity.
- Full remote web UI parity.
- Plugin/advanced scheduler parity.
- Full libtorrent replacement in this phase.

## Target Architecture
## 1) Engine Adapter Layer
Create adapter interface so UI/state are engine-agnostic.

Proposed interface (internal):
- `addTorrent(input, options)`
- `pause(hash)`
- `resume(hash)`
- `remove(hash, { deleteFiles })`
- `setFilePriority(hash, fileIndex, priority)`
- `setTorrentOptions(hash, options)`
- `getSnapshot()`
- `subscribe(onDelta)`

Implementations:
- `WebTorrentAdapter` (immediate).
- `LibtorrentAdapter` (future sidecar).

## 2) Torrent Domain Services
Add service modules in main process:
- `TorrentStateStoreV2`: normalized persistence and migration.
- `TorrentSyncService`: snapshot + delta generation with monotonic `rid`.
- `TorrentCommandService`: validates and executes commands.
- `TorrentClassificationService`: category/tag + library routing mapping.

## 3) Renderer Web Module Extension
Extend the existing web renderer module (instead of adding a separate app mode):
- Suggested path: `src/domains/web/torrent-workspace/`
- Submodules:
  - `store.js` (view model + selectors)
  - `actions.js` (IPC commands)
  - `views/transfer-list.js`
  - `views/filters.js`
  - `views/properties.js`
  - `views/add-dialog.js`

## Data Model (New v2 Store)
Create `web_torrent_state_v2.json` with this high-level shape:

```json
{
  "version": 2,
  "rid": 0,
  "torrents": {
    "<hashOrId>": {
      "id": "string",
      "name": "string",
      "state": "downloading|paused|stalled|checking|queued|completed|error|metadata",
      "progress": 0.0,
      "sizeBytes": 0,
      "downloadRate": 0,
      "uploadRate": 0,
      "etaSec": -1,
      "ratio": 0,
      "peers": 0,
      "seeds": 0,
      "category": "",
      "tags": [],
      "savePath": "",
      "queuePosition": -1,
      "sequential": false,
      "addedAt": 0,
      "completedAt": 0,
      "lastActiveAt": 0,
      "error": "",
      "files": []
    }
  },
  "categories": {
    "<name>": {
      "savePath": "",
      "libraryRoute": "none|books|comics|videos"
    }
  },
  "tags": {
    "<tagName>": {
      "color": ""
    }
  },
  "prefs": {
    "defaultSavePath": "",
    "maxActiveDownloads": 3,
    "maxActiveTorrents": 5
  }
}
```

## Migration Plan
On first startup after release:
1. Read existing `web_torrent_history.json`.
2. Convert entries into v2 `torrents` map with derived defaults.
3. Preserve unknown/legacy fields in `legacy` object for rollback safety.
4. Write `web_torrent_state_v2.json`.
5. Keep old file untouched for one release cycle.

## IPC Contract Additions
Add channels in `shared/ipc.js`, handlers in `main/ipc/register/web_torrent.js`, and preload bridges.

Command channels:
- `WEB_TORRENT_SYNC_MAIN_DATA` -> `{ rid, filters }`
- `WEB_TORRENT_BULK_ACTION` -> `{ action, ids }`
- `WEB_TORRENT_SET_CATEGORY` -> `{ ids, category }`
- `WEB_TORRENT_SET_TAGS` -> `{ ids, addTags, removeTags }`
- `WEB_TORRENT_CREATE_CATEGORY` -> `{ name, savePath, libraryRoute }`
- `WEB_TORRENT_UPDATE_CATEGORY` -> `{ name, savePath, libraryRoute }`
- `WEB_TORRENT_DELETE_CATEGORY` -> `{ name }`
- `WEB_TORRENT_CREATE_TAG` -> `{ name, color }`
- `WEB_TORRENT_DELETE_TAG` -> `{ name }`
- `WEB_TORRENT_SET_LIMITS` -> `{ ids, dlLimit, ulLimit, ratioLimit, seedingTimeLimit }`
- `WEB_TORRENT_MOVE_QUEUE` -> `{ ids, direction }`

Event channels:
- `WEB_TORRENT_SYNC_PATCH` -> `{ rid, fullUpdate, torrents, removed, categories, tags, serverState }`
- `WEB_TORRENT_COMMAND_RESULT` -> `{ ok, commandId, error? }`

## UI Plan: Embedded WebView Torrent Workspace
## Layout
- Keep workspace inside web browser context:
  - Web sidebar: compact active torrent strip + quick controls.
  - Main browser area: internal workspace view for full transfer table and properties.
  - Bottom pane: properties tabs in the same web page container.
  - Top toolbar: add torrent, start/pause/resume/delete, filter/search, global speeds.

## Navigation Model (Inside Web Mode)
- Add an internal browser route, e.g. `tankoban://torrents` (or equivalent internal view ID).
- Opening "Torrents" from sidebar/hub navigates current web tab to this internal workspace.
- New tabs can still be regular websites; torrent workspace remains a first-class internal tab target.
- Legacy torrent sidebar cards remain available as quick monitor/controls.

## Transfer Table Columns (V1)
- Name
- Size
- Progress
- Status
- Seeds/Peers
- Down Speed
- Up Speed
- ETA
- Ratio
- Category
- Tags

## Properties Tabs (V1)
- General: hash, save path, piece info, timestamps, ratio, total transferred.
- Trackers: URL, status, peers.
- Peers: IP/client/progress/speed (as available from adapter).
- Files: tree with size/progress/priority.

## Context Menu Actions (V1)
- Resume/Pause
- Force start equivalent
- Delete torrent / delete torrent + data
- Set category
- Manage tags
- Set location

## Routing Rules (Dual Category Model)
When category has `libraryRoute`:
- `books` -> trigger books scan domain
- `comics` -> trigger comics scan domain
- `videos` -> trigger video scan domain

If `libraryRoute = none`, keep torrent data unmanaged by library scanners.

## Implementation Phases
## Phase 0: Foundation and Safety (P0)
1. Add adapter interface and wrap current WebTorrent operations.
2. Add v2 state store read/write and migration utilities.
3. Add sync service skeleton (`rid`, snapshot, delta).
4. Keep existing sidebar controls functional during transition.

Exit criteria:
- Existing start/pause/resume/cancel flows continue to work.
- v2 file created and populated without data loss.

## Phase 1: Sync + IPC Expansion (P0)
1. Add new IPC channels and preload bridge.
2. Implement `syncMainData` full + delta responses.
3. Emit incremental updates on state changes.
4. Add command result envelopes for user-visible errors.

Exit criteria:
- Renderer can subscribe and render from sync deltas only.
- No polling storms or duplicate updates.

## Phase 2: Embedded Torrent Workspace UI (P1)
1. Add an embedded torrent workspace view inside existing web module/tab container.
2. Implement transfer table with sort/filter/search.
3. Implement selection model and bulk toolbar actions.
4. Keep legacy sidebar list as compact monitor linking to the embedded workspace.

Exit criteria:
- User can manage active and completed torrents from one screen.
- Multi-select actions are deterministic.

## Phase 3: Add Dialog + Files + Destination (P1)
1. Implement qB-like add dialog workflow.
2. Ensure metadata-ready file list does not clobber user selection.
3. Implement per-file priority handling with sequential option.
4. Persist save path defaults and per-category overrides.

Exit criteria:
- Add flow is predictable and restart-safe.
- File choices survive refreshes and metadata updates.

## Phase 4: Categories/Tags + Properties (P1)
1. Implement category/tag CRUD.
2. Implement assignment actions and filter counts.
3. Build bottom properties tabs with periodic refresh hooks.
4. Add library route mapping and scan triggers.

Exit criteria:
- Category/tag workflows are fully usable and persisted.
- Properties panel reflects selected torrent reliably.

## Phase 5: Queue and Limits (P2)
1. Add queue position model and move actions.
2. Add global/per-torrent speed and ratio limits.
3. Map unsupported engine behavior to explicit UI states.

Exit criteria:
- Queue and limits behavior is transparent even when partially emulated.

## Phase 6: Hardening and Release (P1)
1. Add regression tests and failure-path tests.
2. Add structured logs for command failures and sync drift.
3. Add feature flag and staged rollout.
4. Ship migration safeguards and rollback notes.

Exit criteria:
- No critical regressions in torrent workflows.
- Rollback path documented.

## File-Level Change Plan
## Main Process
- Update: `main/domains/webTorrent/index.js`
- Add: `main/domains/webTorrent/adapter.js`
- Add: `main/domains/webTorrent/state_store_v2.js`
- Add: `main/domains/webTorrent/sync_service.js`
- Add: `main/domains/webTorrent/classification.js`
- Update: `main/ipc/register/web_torrent.js`

## Shared + Preload
- Update: `shared/ipc.js`
- Update: `preload/index.js`

## Renderer
- Add: `src/domains/web/torrent-workspace/*`
- Update: `src/domains/web/web.js` (route internal `torrents` workspace + legacy compact list)
- Update: `src/index.html` (embedded workspace mount point inside web area)
- Add/Update CSS in `src/styles/` for embedded torrent workspace layout

## Tests
## Unit
- State migration utility tests.
- Torrent status mapping tests.
- Filter/sort selector tests.
- Category/tag reducers and validators.

## Integration
- IPC sync full/delta behavior.
- Bulk command dispatch and partial failure handling.
- Add dialog metadata race handling.
- Library route trigger behavior.

## Manual Acceptance Scenarios
1. Add 10+ torrents, use multi-select pause/resume/delete, verify no stale UI rows.
2. Restart app during active torrents, verify state and selections restore correctly.
3. Apply category with library route and verify corresponding scanner fires once.
4. Set/remove tags and validate left rail counts immediately.
5. Test invalid magnet URL, missing path permissions, and network failures.
6. Verify completed/error torrents can be cleared without affecting active torrents.

## Release and Rollout
1. Ship behind `webTorrentWorkspaceV1` feature flag.
2. Internal dogfood on Windows first.
3. Enable by default after one stable cycle with migration telemetry/log checks.
4. Keep legacy sidebar list for one release as fallback/quick actions.

## Risks and Mitigations
- Risk: WebTorrent cannot match every qB queue primitive.
  - Mitigation: expose supported subset clearly; mark emulated behavior.
- Risk: Renderer performance with large transfer lists.
  - Mitigation: row virtualization and throttled repaint cadence.
- Risk: Migration regressions.
  - Mitigation: non-destructive migration + fallback reader.
- Risk: State drift between engine and UI.
  - Mitigation: `rid` sync model + periodic checksum validation.

## Definition of Done
All items below must be true:
1. Core transfer workflows are fully managed from the embedded web-view torrent workspace.
2. Categories/tags/properties are persisted and reliable across restarts.
3. Bulk operations and per-torrent actions never become non-responsive.
4. No P0/P1 torrent regressions remain in existing web flows.
5. Documentation for adapter boundary and future libtorrent sidecar is checked in.
