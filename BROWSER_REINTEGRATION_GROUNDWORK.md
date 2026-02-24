# Tankoban Browser-less Groundwork (Aspect Re-integration Ready)

This build intentionally detaches the current embedded browser UI from Tankoban by default.

## What changed

- **New browser host bridge:** `src/domains/browser_host/host_runtime.js`
  - Provides a stable adapter contract (`window.Tanko.browserHost`) for future browser embedding.
  - Default adapter is **disabled** (`enabled: false`, `adapter: "none"`).
  - Legacy `window.Tanko.web` calls are safely stubbed so older callers do not crash.

- **Deferred loading split**
  - `src/state/deferred_modules.js` now exposes:
    - `ensureWebModulesLoaded()` → adapter-aware wrapper (preferred)
    - `ensureWebModulesLoadedLegacy()` → legacy embedded web loader (fallback / transition path)
  - This avoids hard-coupling shell routes to the legacy browser implementation.

- **Shell and standalone section routing now use the bridge first**
  - `src/domains/shell/shell_bindings.js`
  - `src/state/app_section_boot.js`
  - Browser and add-source actions now go through `window.Tanko.browserHost` when available.

- **Main-process browser security bootstrap disabled by default**
  - `main/index.js` skips `ensureWebModeSecurity()` unless `TANKOBAN_EMBEDDED_BROWSER=1`.
  - This keeps the groundwork build truly browser-less at startup.

## How to temporarily re-enable the old embedded browser (transition only)

### Option A (quick runtime config in renderer)
Set this before using browser actions:
```js
window.Tanko.browserHost.setConfig({ enabled: true, adapter: 'legacy-web-embed', hideLaunchButtons: false });
```

### Option B (main process web security bootstrap)
Launch with:
- `TANKOBAN_EMBEDDED_BROWSER=1`

(You can use both together during migration/testing.)

## Future Aspect embed contract (recommended)

Register the upgraded Aspect adapter from a renderer script after it initializes:

```js
window.Tanko.browserHost.registerAdapter({
  name: 'aspect-embed',
  async ensureReady() {},
  async openDefault() {},
  async openTorrentWorkspace() {},
  async openAddSourceDialog() {},
  async openUrl(url) {},
  canOpenAddSource() { return true; },
  isBrowserOpen() { return true; }
});
window.Tanko.browserHost.setConfig({ enabled: true, adapter: 'aspect-embed', hideLaunchButtons: false });
```

## Why this helps reintegration

- Shell buttons / section routing no longer depend directly on the legacy browser module.
- Legacy web loader still exists as a fallback, but it is isolated behind a bridge.
- You can build and test an upgraded Aspect embed independently, then plug it in with a small adapter.
- Fewer cross-domain side effects while the browser is being upgraded.

## Notes

- This build does **not** promise zero bugs (no build can), but it removes the old integration coupling so the next re-embed can be much cleaner.
- Existing browser DOM (`#webBrowserView`) remains in the repo so future integration can reuse or replace it incrementally.
