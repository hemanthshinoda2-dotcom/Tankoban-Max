# Tankoban Max - Agent Architecture Guide

This is the canonical architecture guide for contributors and AI agents.

For high-level repo topology and path lifecycle, start with:
- `README.md`
- `docs/architecture/runtime-contract.md`
- `docs/architecture/repo-layout.md`
- `docs/architecture/path-status.yaml`

## 1. Runtime Ownership

- Canonical runtime: `projectbutterfly/` (Qt-first)
- Shared renderer UI: `src/`
- Legacy runtime: `runtime/electron_legacy/` (kept runnable, not default)

Default command:
- `npm start` -> Qt runtime

Legacy command:
- `npm run start:electron-legacy`

## 2. Script Loading Model (Renderer)

No build system. Renderer scripts are loaded by `<script>` tags in `src/index.html`.

- `src/state/bootstrap.js` creates `window.Tanko`.
- `src/state/deferred_modules.js` exposes deferred loaders.
- `src/state/mode_router.js` switches modes.
- Domain modules are loaded when their mode is activated.

If a feature depends on a deferred domain, ensure its loader has executed.

## 3. `el` Objects Are Domain-Scoped

Each domain has a separate `el` cache object.

- Shell: `src/domains/shell/core.js`
- Books: `src/domains/books/library.js`
- Video: `src/domains/video/video.js`
- Web/Sources: `src/domains/web/web.js`

Do not assume `el` from one domain is available in another.

## 4. IPC Tracing Cheatsheet (Legacy Electron Path)

1. Renderer call: `Tanko.api.namespace.method()`
2. Preload wrapper: `runtime/electron_legacy/preload/namespaces/*.js`
3. Contract constant: `runtime/electron_legacy/shared/ipc.js`
4. IPC registration: `runtime/electron_legacy/main/ipc/register/*.js`
5. Domain handler: `runtime/electron_legacy/main/domains/*/index.js`

## 5. CSS Load Priority

Lower to higher priority (later wins with equal specificity):

1. `shoelace/light.css`
2. `styles.css`
3. `ui-tokens.css`
4. `ui-bridge.css`
5. `overhaul.css`
6. `video-library-match.css`
7. `books-reader.css`
8. `web-browser.css`
9. `video-player.css`

Use existing `--vx-*` tokens where possible.

## 6. Browser Host Notes

Sources mode uses embedded browser host files under:
- `src/domains/browser_host/aspect_embed/`

Bridge object between host and embedded browser:
- `window.__ASPECT_TANKO_BRIDGE__`

## 7. Vendor Code

Do not modify third-party vendor trees unless required:
- `src/vendor/foliate/`
- `src/vendor/readiumcss/`

Document why when modifications are unavoidable.

## 8. Video Player Path

Qt path is active:
- `openVideo()` routes to Qt fallback in `player_qt/`.

Holy Grail code is archival/experimental and not default runtime.

## 9. New IPC Checklist (Legacy Electron)

1. Add channel in `runtime/electron_legacy/shared/ipc.js`.
2. Add preload wrapper in `runtime/electron_legacy/preload/namespaces/`.
3. Add `ipcMain.handle()` in `runtime/electron_legacy/main/ipc/register/`.
4. Add domain logic in `runtime/electron_legacy/main/domains/`.
5. Call through renderer `Tanko.api`.

## 10. Debugging Strategy

- Renderer issues: devtools console.
- Main-process legacy issues: add explicit file logging.
- IPC issues: log both preload and main sides.
- CSS issues: validate selector collisions in load order.

## 11. Code Style

- Renderer JS style follows existing codebase conventions.
- No renderer transpilation/bundling assumptions.
- Keep changes local and explicit in deferred-domain flows.
