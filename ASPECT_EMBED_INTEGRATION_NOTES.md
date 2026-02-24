# Aspect Browser → Tankoban Max Embed Integration Notes

## Summary
This build embeds the provided **Aspect Browser (embed-ready)** into the Tankoban Max groundwork host as an **in-app Browser pane** using a **single persistent iframe** mounted inside Tankoban’s existing `#webBrowserView` container.

The iframe approach keeps Aspect’s DOM and keyboard handling isolated (good shortcut scoping) while still allowing full access to Tankoban’s Electron preload APIs via a small parent↔iframe bridge.

## Where it mounts
- Host mount point: `src/index.html` → `#webBrowserView`
- Embed host wrapper inserted at runtime: `#aspectEmbedMountRoot`
- The iframe: `#aspectEmbedFrame`
  - URL: `./domains/browser_host/aspect_embed/index.html?embed=1`

## Key files added/changed
### New
- `src/domains/browser_host/aspect_embed_mount.js`
  - Creates the iframe mount, installs the host bridge (`window.__ASPECT_TANKO_BRIDGE__`), registers the Tankoban `browserHost` adapter (`aspect-embed`), and hides legacy web browser markup inside `#webBrowserView`.
- `src/domains/browser_host/aspect_embed/`
  - Copied Aspect embed-ready frontend assets:
    - `index.html`, `renderer.js`, `torrent-tab.js`, `torrent-tab.css`, `styles.css`
  - Plus a new bootstrap file:
    - `host_bridge_bootstrap.js` (defines `window.aspect` + compatibility aliases, and proxies into the parent bridge)

### Modified
- `src/domains/browser_host/host_runtime.js`
  - Added small pane-control helpers used by the adapter:
    - `showBrowserPane()`, `showLibraryPane()`, `showLaunchButtons()`
- `src/domains/shell/shell_bindings.js`
  - Fixed a recursion bug in `applyBrowserlessGroundworkUiState()` and ensured it runs once at startup.
- `src/domains/web/web.js`
  - Prevents legacy web keyboard shortcut handling when the Aspect embed is active (avoids shortcut collisions).
- `src/index.html`
  - Loads `aspect_embed_mount.js` after `host_runtime.js`.

## Host bridge methods provided
The iframe defines `window.aspect` expected by Aspect’s renderer (desktop preload API shape). The implementation proxies to the parent `window.__ASPECT_TANKO_BRIDGE__`, which uses Tankoban’s existing preload APIs (`window.Tanko.api.web.*` / `window.electronAPI.web*` where needed).

Notable bridge coverage:
- History + bookmarks (load/add/remove/check)
- Tor (status/start/stop + status event)
- Torrents (active/history/start/pause/resume/cancel/remove + events)
- Context menu + ctxAction
- Create-tab events (popup → new tab)
- Downloads: started/progress/done + actions (pause/resume/cancel) + open/show-in-folder

## How to open it
- Use the existing host button `#webHubToggleBtn` (“Browser” / “Web” entry point depending on UI).
- “Add source” uses `#webHubAddSourceBtn` and opens Aspect’s torrent add-source dialog when available.

## Known limitations
- GUI/runtime tests can’t be executed in this environment (no Electron UI). This build includes static validation (syntax checks, wiring checks), but you should run the manual checklist once locally.
- Clipboard read/write is best-effort in iframe context (browser clipboard API + cached fallback).
- Generic OS open/save dialogs (non-torrent-specific) are left as safe fallbacks because the host preload does not expose generic dialog APIs.

