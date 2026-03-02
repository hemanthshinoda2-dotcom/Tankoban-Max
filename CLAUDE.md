# Tankoban Max - Canonical Agent Map

## 1. Purpose
This is the canonical repo map for AI agents.
`CLAUDE.md` and `chatgpt.md` must remain identical (structural map).
`agents.md` contains deep architectural knowledge (patterns, debugging, CSS, bridge APIs).

Goals:
1. Keep root `npm start` running the integrated app.
2. Allow section-focused standalone boots for isolated testing.
3. Keep ownership boundaries explicit for safer edits.

## 2. Boot Commands
Primary commands:
1. `npm start` - integrated shell app (default product boot).
2. `npm run start:shell` - explicit shell-app entrypoint.
3. `npm run start:library` - library-focused standalone boot.
4. `npm run start:comic` - comic-reader-focused standalone boot.
5. `npm run start:book` - book-reader-focused standalone boot.
6. `npm run start:audiobook` - audiobook-focused standalone boot.
7. `npm run start:video` - video-focused standalone boot.
8. `npm run start:browser` - browser-focused standalone boot.
9. `npm run start:torrent` - torrent-focused standalone boot.

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
1. `main.js` - primary Electron entrypoint used by `npm start`; delegates to `main/index.js`.
2. `main/` - main-process runtime and IPC registration.
3. `preload.js` + `preload/` - contextBridge API surface.
4. `src/` - renderer HTML/CSS/JS domains.
5. `shared/` - cross-process contracts (`shared/ipc.js`).
6. `workers/` + root scan workers (`library_scan_worker.js`, `books_scan_worker.js`, `video_scan_worker.js`, `audiobook_scan_worker.js`).
7. `apps/` - standalone app entrypoints by section.
8. `packages/` - logical boundaries and ownership maps.
9. `resources/` + `player_qt/` - native/media runtime assets.
10. `tools/` + `qa/` - smoke checks, audits, diagnostics, visual QA.
11. `contracts/` - IPC payload contracts and schema coverage.
12. `types/` - critical interface declarations (`.d.ts`) for high-value boundaries.
13. `docs/` - supporting architecture, ADRs, ownership manifests, and canonical agent source.
14. `archive/` - archived experiments and legacy docs (read-only reference).

## 4. Apps Directory
Each app is a thin launcher around the same runtime.

1. `apps/shell-app/main.js`
- Boots section `shell`.
- Integrated default app behavior.

2. `apps/library-app/main.js`
- Boots section `library`.
- Focused on comics library workflows.

3. `apps/comic-reader-app/main.js`
- Boots section `comic`.
- Focused on comic reader workflows.

4. `apps/book-reader-app/main.js`
- Boots section `book`.
- Focused on books library/reader workflows.

5. `apps/audiobook-app/main.js`
- Boots section `audiobook`.
- Focused on audiobook workflows in books domain.

6. `apps/video-player-app/main.js`
- Boots section `video`.
- Focused on video library/player workflows.

7. `apps/browser-app/main.js`
- Boots section `browser`.
- Focused on web browser workflows.

8. `apps/torrent-app/main.js`
- Boots section `torrent`.
- Focused on torrent/browser hub workflows.

## 5. Packages Directory

### Core
1. `packages/core-main`
- `launch_section_app.js`: canonical section launcher and section normalization.
- `index.js`: re-export.

2. `packages/core-preload`
- Maps preload bridge ownership to `preload/index.js` and `preload/namespaces/*`.

3. `packages/core-ipc-contracts`
- Re-exports `shared/ipc.js`.
- Single source of truth for channel/event names.

4. `packages/core-storage`
- Maps persistence ownership to `main/lib/storage.js` and data files.

5. `packages/core-logging`
- Maps logging/health ownership across main + renderer health monitor.

6. `packages/core-testing`
- Maps test and smoke ownership (`tools/*`, `qa/*`).

### Shared
1. `packages/shared-ui`
- Shared renderer layers: `src/ui`, `src/services`, `src/state`, `src/styles`.

2. `packages/shared-media`
- Shared media stack across `src/domains/video`, `main/domains/player_core`, `resources/mpv`, `player_qt`.

3. `packages/shared-workers`
- Worker/scanner ownership map.

### Feature
1. `packages/feature-library`
- Comics library renderer/main/preload/worker map.

2. `packages/feature-comic-reader`
- Comic reader renderer + comic/archive main domains.

3. `packages/feature-book-reader`
- Books renderer + books main domains + preload books namespaces.

4. `packages/feature-audiobook`
- Audiobook renderer modules + audiobook main domains + preload audiobooks namespace.

5. `packages/feature-video`
- Video renderer + video/player main domains + preload video/media/player namespaces.

6. `packages/feature-browser`
- Browser renderer + web/browser_host main domains + preload web namespace.

7. `packages/feature-torrent`
- Torrent renderer module + `webTorrent` / `torProxy` / `torrentSearch` main domains.

## 6. Runtime Layer Map

1. Renderer (`src/`)
- `src/index.html` loads baseline shell and deferred loaders.
- `src/state/deferred_modules.js` lazy-loads heavy domains.
- `src/state/mode_router.js` handles comics/books/videos mode switching.
- `src/state/app_section_boot.js` applies standalone `appSection` startup routing.
- Web standalone entry helpers split from `src/domains/web/web.js` into `src/domains/web/web_module_standalone.js`.
- TankoBrowser: Sources panel embeds `<webview id="sourcesBrowserWebview">` which loads the Aspect Browser from `src/domains/browser_host/aspect_embed/index.html`. Host-to-iframe communication uses `window.__ASPECT_TANKO_BRIDGE__`. See `agents.md` for bridge details.

2. Preload (`preload/`)
- `preload/index.js` composes namespace APIs.
- `preload/namespaces/*.js` groups domain-safe IPC wrappers:
  - Feature: `library.js`, `books.js`, `books_metadata.js`, `audiobooks.js`, `video.js`, `web.js`
  - Shared: `media.js`, `player.js`, `shell.js`, `window.js`, `progress.js`, `series.js`
  - Legacy/archived: `_legacy.js`, `holy_grail.js`

3. Main (`main/`)
- `main/index.js` owns app lifecycle and window boot.
- `main/ipc/index.js` owns ipcMain registration and domain handler wiring.
- `main/domains/*` owns feature-specific backend logic.

4. Worker layer (`workers/` + root workers)
- Scanning and metadata tasks for library/books/video/audiobooks.
- Root: `library_scan_worker.js`, `books_scan_worker.js`, `video_scan_worker.js`, `audiobook_scan_worker.js`
- Implementations: `workers/*_scan_worker_impl.js`, `workers/shared/*`

## 7. Section Ownership Map (File-Level)

### Library
1. Renderer: `src/domains/library/library.js`, `src/domains/shell/core.js`
2. Main: `main/domains/library/index.js`
3. Preload: `preload/namespaces/library.js`
4. Worker: `library_scan_worker.js`, `workers/shared/*`

### Comic Reader
1. Renderer: `src/domains/reader/*`
2. Main: `main/domains/comic/index.js`, `main/domains/archives/index.js`
3. Preload: `preload/namespaces/media.js`, `preload/namespaces/player.js`

### Book Reader
1. Renderer: `src/domains/books/library.js`, `src/domains/books/reader/*`, `src/domains/books/books_opds.js`
2. Main: `main/domains/books*` — includes `booksProgress`, `booksBookmarks`, `booksAnnotations`, `booksSettings`, `booksDisplayNames`, `booksTtsEdge`, `booksTtsProgress`, `booksOpds`, `booksUi`
3. Preload: `preload/namespaces/books.js`, `preload/namespaces/books_metadata.js`
4. Worker: `books_scan_worker.js`

### Audiobook
1. Renderer: `src/domains/books/listening_player.js`, `src/domains/books/audiobook_player_overlay.js`, `src/domains/books/reader/reader_audiobook*.js`
2. Main: `main/domains/audiobooks/index.js`, `audiobookProgress/index.js`, `audiobookPairing/index.js`
3. Preload: `preload/namespaces/audiobooks.js`
4. Worker: `audiobook_scan_worker.js`

### Video
1. Renderer: `src/domains/video/*`
2. Main: `main/domains/video/index.js`, `videoProgress/index.js`, `videoSettings/index.js`, `videoDisplayNames/index.js`, `videoUi/index.js`, `player_core/index.js`, `holyGrail/index.js` (archived experiment, code still present)
3. Preload: `preload/namespaces/video.js`, `player.js`, `media.js`, `holy_grail.js`
4. Native/media resources: `resources/mpv/windows/*`, `player_qt/*`
5. Worker: `video_scan_worker.js`

### Browser
1. Renderer: `src/domains/web/*`, `src/domains/browser_host/aspect_embed/*`
2. Main: `main/domains/webSources`, `webHistory`, `webBookmarks`, `webBrowserSettings`, `webSession`, `webPermissions`, `webData`, `webAdblock`, `webUserscripts`, `webSearchHistory`
3. Preload: `preload/namespaces/web.js`

### Torrent
1. Renderer: `src/domains/web/web_module_torrent_tab.js`, `src/domains/web/web.js`, `src/domains/browser_host/aspect_embed/torrent-tab.js`
2. Main: `main/domains/webTorrent/index.js`, `main/domains/torProxy/index.js`, `main/domains/torrentSearch/index.js`
3. Preload: `preload/namespaces/web.js`
4. Tools: `tools/fetch_tor.js`

### Cross-Section (shared main domains)
These main-process domains serve multiple sections:
- `main/domains/shell/` — shell UI state
- `main/domains/clipboard/` — clipboard operations
- `main/domains/export/` — export functionality
- `main/domains/files/` — file system operations
- `main/domains/progress/` — cross-section progress tracking
- `main/domains/seriesSettings/` — series metadata settings
- `main/domains/thumbs/` — thumbnail generation
- `main/domains/window/` — window management
- `main/domains/folder_thumbs.js` — folder thumbnail logic
- `main/domains/webPermissionPrompts.js` — permission prompt handling

## 8. Script-to-Responsibility Map

### Entrypoints
1. `main.js` — root integrated app entrypoint; delegates to `main/index.js` with `APP_ROOT`.
2. `main/index.js` — window creation, app lifecycle, section query injection; reads `TANKOBAN_APP_SECTION` or `--app-section=`.
3. `src/state/app_section_boot.js` — reads `?appSection=` and applies startup behavior.
4. `packages/core-main/launch_section_app.js` — shared launcher for all `apps/*/main.js` entrypoints.

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
2. Cross-feature interactions must use `shared/ipc.js` contracts or explicit public package APIs.
3. Renderer domain code must not call Electron primitives directly; use preload APIs.
4. Main domains must not depend on renderer code.

## 10. AI Conduct
1. Disagree with the user when it's valid. Push back on requests that would introduce bugs, break architecture, or waste effort.
2. Commit immediately after every logical change. Never hold uncommitted work across multiple edits. Small atomic commits are mandatory.

## 11. AI Change Procedure
When modifying code:
1. Locate the section package in `packages/feature-*`.
2. Update renderer/main/preload layers consistently.
3. If IPC changes, update all three:
- `shared/ipc.js`
- `preload/namespaces/*`
- `main/ipc/register/*` and/or `main/domains/*`
4. Run at minimum:
- `npm run smoke`
- targeted boot command(s) for touched section(s)
5. Keep `CLAUDE.md`, `chatgpt.md`, and `docs/agent-map.source.md` identical after structural changes.

## 12. Docs Policy
Keep active docs minimal:
1. `CLAUDE.md` — canonical structural map (this file)
2. `chatgpt.md` — must be identical to `CLAUDE.md`
3. `agents.md` — deep architectural knowledge, patterns, debugging
4. `docs/adr/*` — accepted architectural decisions
5. `docs/ownership/*` — per-section ownership manifests
6. Legal/compliance docs (e.g. `THIRD_PARTY_NOTICES.md`) must remain when required
