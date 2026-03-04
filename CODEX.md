# Tankoban Max - Canonical Agent Map

## 1. Purpose
This is the canonical repo map for AI agents.
`CLAUDE.md`, `chatgpt.md`, and `CODEX.md` must remain identical (structural map).
`agents.md` contains deep architectural knowledge (patterns, debugging, CSS, bridge APIs).

Goals:
1. Keep root `npm start` running the Qt app.
2. Allow section-focused standalone boots for isolated testing.
3. Keep ownership boundaries explicit for safer edits.

## 2. Boot Commands
Primary commands:
1. `npm start` - Qt runtime (default product boot).
2. `npm run start:qt` - explicit Qt runtime boot.
3. `npm run start:electron-legacy` - legacy Electron runtime boot.
4. `npm run start:legacy:shell` - shell-focused legacy standalone boot.
5. `npm run start:legacy:library` - library-focused legacy standalone boot.
6. `npm run start:legacy:comic` - comic-reader-focused legacy standalone boot.
7. `npm run start:legacy:book` - book-reader-focused legacy standalone boot.
8. `npm run start:legacy:audiobook` - audiobook-focused legacy standalone boot.
9. `npm run start:legacy:video` - video-focused legacy standalone boot.
10. `npm run start:legacy:browser` - browser-focused legacy standalone boot.
11. `npm run start:legacy:torrent` - torrent-focused legacy standalone boot.

Validation and diagnostics:
1. `npm run smoke` — `tools/smoke_check.js`
2. `npm run doctor` — `tools/doctor.js`
3. `npm run ipc:check` — `tools/ipc_sync_check.js`
4. `npm run map` — `tools/repo_map.js`
5. `npm run boundaries:check` — `tools/enforce_feature_boundaries.js`
6. `npm run fixtures:check` — `tools/fixture_manifest.js --check`
7. `npm run ipc:contracts` — `tools/ipc_contract_check.js`
8. `npm run smoke:all` — runs all section smokes
9. `npm run test:sections` — `tools/section_test_harness.js --all`
10. `npm run docs:verify-sync` — `tools/verify_agent_docs.js`

## 3. Root Folder Map
Top-level ownership:
1. `projectbutterfly/` - canonical Qt runtime.
2. `src/` - shared renderer HTML/CSS/JS domains.
3. `runtime/electron_legacy/main/` - legacy Electron main-process runtime and IPC registration.
4. `preload.js` + `runtime/electron_legacy/preload/` - legacy contextBridge API surface.
5. `runtime/electron_legacy/shared/` - legacy cross-process contracts (`runtime/electron_legacy/shared/ipc.js`).
6. `runtime/electron_legacy/workers/` + root scan worker shims (`library_scan_worker.js`, `books_scan_worker.js`, `video_scan_worker.js`, `audiobook_scan_worker.js`).
7. `runtime/electron_legacy/apps/` - standalone legacy app entrypoints by section.
8. `runtime/electron_legacy/packages/` - legacy logical boundaries and ownership maps.
9. `resources/` + `player_qt/` - native/media runtime assets.
10. `tools/` + `qa/` - smoke checks, audits, diagnostics, visual QA.
11. `contracts/` - IPC payload contracts and schema coverage.
12. `types/` - critical interface declarations (`.d.ts`) for high-value boundaries.
13. `docs/` - supporting architecture, ADRs, and canonical agent source.
14. `archive/` - archived experiments and legacy docs (read-only reference).

## 4. Apps Directory
Each app is a thin launcher around the same runtime.

1. `runtime/electron_legacy/apps/shell-app/main.js`
- Boots section `shell`.
- Integrated default app behavior.

2. `runtime/electron_legacy/apps/library-app/main.js`
- Boots section `library`.
- Focused on comics library workflows.

3. `runtime/electron_legacy/apps/comic-reader-app/main.js`
- Boots section `comic`.
- Focused on comic reader workflows.

4. `runtime/electron_legacy/apps/book-reader-app/main.js`
- Boots section `book`.
- Focused on books library/reader workflows.

5. `runtime/electron_legacy/apps/audiobook-app/main.js`
- Boots section `audiobook`.
- Focused on audiobook workflows in books domain.

6. `runtime/electron_legacy/apps/video-player-app/main.js`
- Boots section `video`.
- Focused on video library/player workflows.

7. `runtime/electron_legacy/apps/browser-app/main.js`
- Boots section `browser`.
- Focused on web browser workflows.

8. `runtime/electron_legacy/apps/torrent-app/main.js`
- Boots section `torrent`.
- Focused on torrent/browser hub workflows.

## 5. Packages Directory

### Core
1. `runtime/electron_legacy/packages/core-main`
- `launch_section_app.js`: canonical section launcher and section normalization.
- `index.js`: re-export.

2. `runtime/electron_legacy/packages/core-preload`
- Maps preload bridge ownership to `runtime/electron_legacy/preload/index.js` and `runtime/electron_legacy/preload/namespaces/*`.

3. `runtime/electron_legacy/packages/core-ipc-contracts`
- Re-exports `runtime/electron_legacy/shared/ipc.js`.
- Single source of truth for channel/event names.

4. `runtime/electron_legacy/packages/core-storage`
- Maps persistence ownership to `runtime/electron_legacy/main/lib/storage.js` and data files.

5. `runtime/electron_legacy/packages/core-logging`
- Maps logging/health ownership across main + renderer health monitor.

6. `runtime/electron_legacy/packages/core-testing`
- Maps test and smoke ownership (`tools/*`, `qa/*`).

### Shared
1. `runtime/electron_legacy/packages/shared-ui`
- Shared renderer layers: `src/ui`, `src/services`, `src/state`, `src/styles`.

2. `runtime/electron_legacy/packages/shared-media`
- Shared media stack across `src/domains/video`, `runtime/electron_legacy/main/domains/player_core`, `resources/mpv`, `player_qt`.

3. `runtime/electron_legacy/packages/shared-workers`
- Worker/scanner ownership map.

### Feature
1. `runtime/electron_legacy/packages/feature-library`
- Comics library renderer/runtime/preload/worker map.

2. `runtime/electron_legacy/packages/feature-comic-reader`
- Comic reader renderer + comic/archive main domains.

3. `runtime/electron_legacy/packages/feature-book-reader`
- Books renderer + books main domains + preload books namespaces.

4. `runtime/electron_legacy/packages/feature-audiobook`
- Audiobook renderer modules + audiobook main domains + preload audiobooks namespace.

5. `runtime/electron_legacy/packages/feature-video`
- Video renderer + video/player main domains + preload video/media/player namespaces.

6. `runtime/electron_legacy/packages/feature-browser`
- Browser renderer + web/browser_host main domains + preload web namespace.

7. `runtime/electron_legacy/packages/feature-torrent`
- Torrent renderer module + `webTorrent` / `torProxy` / `torrentSearch` main domains.

## 6. Runtime Layer Map

1. Renderer (`src/`)
- `src/index.html` loads baseline shell and deferred loaders.
- `src/state/deferred_modules.js` lazy-loads heavy domains.
- `src/state/mode_router.js` handles comics/books/videos mode switching.
- `src/state/app_section_boot.js` applies standalone `appSection` startup routing.
- Web standalone entry helpers split from `src/domains/web/web.js` into `src/domains/web/web_module_standalone.js`.
- TankoBrowser: Sources panel embeds `<webview id="sourcesBrowserWebview">` which loads the Aspect Browser from `src/domains/browser_host/aspect_embed/index.html`. Host-to-iframe communication uses `window.__ASPECT_TANKO_BRIDGE__`. See `agents.md` for bridge details.

2. Preload (`runtime/electron_legacy/preload/`)
- `runtime/electron_legacy/preload/index.js` composes namespace APIs.
- `runtime/electron_legacy/preload/namespaces/*.js` groups domain-safe IPC wrappers:
  - Feature: `library.js`, `books.js`, `books_metadata.js`, `audiobooks.js`, `video.js`, `web.js`
  - Shared: `media.js`, `player.js`, `shell.js`, `window.js`, `progress.js`, `series.js`
  - Legacy/archived: `_legacy.js`, `holy_grail.js`

3. Main (`runtime/electron_legacy/main/`)
- `runtime/electron_legacy/main/index.js` owns app lifecycle and window boot.
- `runtime/electron_legacy/main/ipc/index.js` owns ipcMain registration and domain handler wiring.
- `runtime/electron_legacy/main/domains/*` owns feature-specific backend logic.

4. Worker layer (`workers/` + root workers)
- Scanning and metadata tasks for library/books/video/audiobooks.
- Root: `library_scan_worker.js`, `books_scan_worker.js`, `video_scan_worker.js`, `audiobook_scan_worker.js`
- Implementations: `workers/*_scan_worker_impl.js`, `workers/shared/*`

## 7. Section Ownership Map (File-Level)

### Library
1. Renderer: `src/domains/library/library.js`, `src/domains/shell/core.js`
2. Main: `runtime/electron_legacy/main/domains/library/index.js`
3. Preload: `runtime/electron_legacy/preload/namespaces/library.js`
4. Worker: `library_scan_worker.js`, `workers/shared/*`

### Comic Reader
1. Renderer: `src/domains/reader/*`
2. Main: `runtime/electron_legacy/main/domains/comic/index.js`, `runtime/electron_legacy/main/domains/archives/index.js`
3. Preload: `runtime/electron_legacy/preload/namespaces/media.js`, `runtime/electron_legacy/preload/namespaces/player.js`

### Book Reader
1. Renderer: `src/domains/books/library.js`, `src/domains/books/reader/*`, `src/domains/books/books_opds.js`
2. Main: `runtime/electron_legacy/main/domains/books*` — includes `booksProgress`, `booksBookmarks`, `booksAnnotations`, `booksSettings`, `booksDisplayNames`, `booksTtsEdge`, `booksTtsProgress`, `booksOpds`, `booksUi`
3. Preload: `runtime/electron_legacy/preload/namespaces/books.js`, `runtime/electron_legacy/preload/namespaces/books_metadata.js`
4. Worker: `books_scan_worker.js`

### Audiobook
1. Renderer: `src/domains/books/listening_player.js`, `src/domains/books/audiobook_player_overlay.js`, `src/domains/books/reader/reader_audiobook*.js`
2. Main: `runtime/electron_legacy/main/domains/audiobooks/index.js`, `audiobookProgress/index.js`, `audiobookPairing/index.js`
3. Preload: `runtime/electron_legacy/preload/namespaces/audiobooks.js`
4. Worker: `audiobook_scan_worker.js`

### Video
1. Renderer: `src/domains/video/*`
2. Main: `runtime/electron_legacy/main/domains/video/index.js`, `videoProgress/index.js`, `videoSettings/index.js`, `videoDisplayNames/index.js`, `videoUi/index.js`, `player_core/index.js`, `holyGrail/index.js` (archived experiment, code still present)
3. Preload: `runtime/electron_legacy/preload/namespaces/video.js`, `player.js`, `media.js`, `holy_grail.js`
4. Native/media resources: `resources/mpv/windows/*`, `player_qt/*`
5. Worker: `video_scan_worker.js`

### Browser
1. Renderer: `src/domains/web/*`, `src/domains/browser_host/aspect_embed/*`
2. Main: `runtime/electron_legacy/main/domains/webSources`, `webHistory`, `webBookmarks`, `webBrowserSettings`, `webSession`, `webPermissions`, `webData`, `webAdblock`, `webUserscripts`, `webSearchHistory`
3. Preload: `runtime/electron_legacy/preload/namespaces/web.js`

### Torrent
1. Renderer: `src/domains/web/web_module_torrent_tab.js`, `src/domains/web/web.js`, `src/domains/browser_host/aspect_embed/torrent-tab.js`
2. Main: `runtime/electron_legacy/main/domains/webTorrent/index.js`, `runtime/electron_legacy/main/domains/torProxy/index.js`, `runtime/electron_legacy/main/domains/torrentSearch/index.js`
3. Preload: `runtime/electron_legacy/preload/namespaces/web.js`
4. Tools: `tools/fetch_tor.js`

### Cross-Section (shared main domains)
These main-process domains serve multiple sections:
- `runtime/electron_legacy/main/domains/shell/` — shell UI state
- `runtime/electron_legacy/main/domains/clipboard/` — clipboard operations
- `runtime/electron_legacy/main/domains/export/` — export functionality
- `runtime/electron_legacy/main/domains/files/` — file system operations
- `runtime/electron_legacy/main/domains/progress/` — cross-section progress tracking
- `runtime/electron_legacy/main/domains/seriesSettings/` — series metadata settings
- `runtime/electron_legacy/main/domains/thumbs/` — thumbnail generation
- `runtime/electron_legacy/main/domains/window/` — window management
- `runtime/electron_legacy/main/domains/folder_thumbs.js` — folder thumbnail logic
- `runtime/electron_legacy/main/domains/webPermissionPrompts.js` — permission prompt handling

## 8. Script-to-Responsibility Map

### Entrypoints
1. `main.js` — root integrated app entrypoint; delegates to `runtime/electron_legacy/main/index.js` with `APP_ROOT`.
2. `runtime/electron_legacy/main/index.js` — window creation, app lifecycle, section query injection; reads `TANKOBAN_APP_SECTION` or `--app-section=`.
3. `src/state/app_section_boot.js` — reads `?appSection=` and applies startup behavior.
4. `runtime/electron_legacy/packages/core-main/launch_section_app.js` — shared launcher for all `runtime/electron_legacy/apps/*/main.js` entrypoints.

### Diagnostics and validation tools
5. `tools/smoke_check.js` — main smoke check runner (`npm run smoke`).
6. `tools/doctor.js` — environment diagnostics (`npm run doctor`).
7. `tools/ipc_sync_check.js` — IPC channel sync verification (`npm run ipc:check`).
8. `tools/repo_map.js` — repository structure map (`npm run map`).
9. `tools/enforce_feature_boundaries.js` — feature package import boundary enforcement (`npm run boundaries:check`).
10. `tools/fixture_manifest.js` — fixture file validation (`npm run fixtures:check`).
11. `tools/ipc_contract_check.js` — IPC payload schema coverage (`npm run ipc:contracts`).
12. `tools/section_smoke.js` — deterministic fast section-level smoke checks.
13. `tools/section_test_harness.js` — runs section smoke + section-specific stable checks (`npm run test:sections`).
14. `tools/impact_map.js` + `tools/impact_map.rules.json` — maps changed files to recommended checks; optional `--run` execution.

### Code quality tools
15. `tools/css_usage_check.js` — dead CSS detection.
16. `tools/dead_export_check.js` — dead export detection.
17. `tools/ipc_scaffold.js` — IPC channel scaffolding (`node tools/ipc_scaffold.js --channel NAME --namespace NS`).
18. `tools/verify_renderer_load_order.js` — script load order validation.

### Agent doc tools
19. `tools/generate_agent_docs.js` + `tools/verify_agent_docs.js` — keeps `CLAUDE.md` and `chatgpt.md` generated and synchronized from `docs/agent-map.source.md`.

## 9. Forbidden Import Rules
Enforce these rules during future refactors:
1. Do not import one feature package from another feature package internals.
2. Cross-feature interactions must use `runtime/electron_legacy/shared/ipc.js` contracts or explicit public package APIs.
3. Renderer domain code must not call Electron primitives directly; use preload APIs.
4. Main domains must not depend on renderer code.

## 10. AI Change Procedure
When modifying code:
1. Locate the section package in `runtime/electron_legacy/packages/feature-*`.
2. Update renderer/main/preload layers consistently.
3. If IPC changes, update all three:
- `runtime/electron_legacy/shared/ipc.js`
- `runtime/electron_legacy/preload/namespaces/*`
- `runtime/electron_legacy/main/ipc/register/*` and/or `runtime/electron_legacy/main/domains/*`
4. Run at minimum:
- `npm run smoke`
- targeted boot command(s) for touched section(s)
5. Keep `CLAUDE.md`, `chatgpt.md`, and `docs/agent-map.source.md` identical after structural changes.

## 11. Docs Policy
Keep active docs minimal:
1. `CLAUDE.md` — canonical structural map (this file)
2. `chatgpt.md` — must be identical to `CLAUDE.md`
3. `agents.md` — deep architectural knowledge, patterns, debugging
4. `docs/adr/*` — accepted architectural decisions
5. `docs/ownership/*` — per-section ownership manifests
6. Legal/compliance docs (e.g. `THIRD_PARTY_NOTICES.md`) must remain when required


