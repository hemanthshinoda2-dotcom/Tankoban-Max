# ADR-0004: Real Section Isolation

**Status:** Partially resolved
**Date:** 2026-02-24

## Problem

The restructuring added `apps/`, `packages/feature-*/`, section smoke checks, and boundary enforcement — but none of it delivers runtime isolation today.

### What's broken

1. ~~**Section apps crash on boot**~~ **RESOLVED** — Verified 2026-02-24: `app.isPackaged` is a static property available immediately on `require('electron')`, no `app.whenReady()` needed. Section apps (`npm run start:browser`, etc.) boot correctly.

2. **All IPC handlers load unconditionally** — `main/ipc/index.js` registers all 40+ handler modules regardless of `TANKOBAN_APP_SECTION`. Browser mode loads comic archive handlers, video scan handlers, everything.

3. **Feature packages are manifests, not code** — `packages/feature-browser/index.js` is a 22-line file that *lists* which files belong to the browser. The actual code stays in `src/`, `main/`, `preload/` where all sections can reach it.

4. **Boundary enforcement checks phantom rules** — Verifies that `packages/feature-browser` doesn't import from `packages/feature-video`, but those packages contain metadata, not code. The real code has no import boundaries.

5. **Smoke checks verify file existence, not functionality** — `npm run smoke:browser` checks "does `web.js` exist?" not "does the browser launch?"

## What real isolation requires

### Fix 1: Deferred `app` access in main/index.js
Move `app.isPackaged` and any other early `app.*` calls inside `app.whenReady()` or behind a lazy getter. This unblocks section app boot.

### Fix 2: Conditional IPC registration
Each register module checks `process.env.TANKOBAN_APP_SECTION` and skips if it's not relevant. Example:

```js
// main/ipc/register/web_torrent.js
module.exports = function register({ ipcMain, CHANNEL, ctx, domains }) {
  if (ctx.section && ctx.section !== 'browser' && ctx.section !== 'torrent') return;
  // ... register handlers
};
```

Or: build a section→register mapping in `main/ipc/index.js` and only require/call relevant modules.

### Fix 3: Section-aware renderer loading
`src/state/deferred_modules.js` already lazy-loads web modules. Extend this so `app_section_boot.js` skips loading domains not needed for the active section (e.g., don't load `library.js` in browser mode).

### Fix 4: Boot smoke tests
Each section smoke test should actually launch the Electron app with `TANKOBAN_APP_SECTION=browser`, wait for `did-finish-load`, send a health ping, and verify the response. Kill after 10 seconds.

### Fix 5 (optional, future): Physical code separation
Move renderer code into `packages/feature-*/src/` so imports are physically impossible across sections. This is the nuclear option — high effort, high payoff, but only worth it if sections are genuinely developed by different people or shipped independently.

## Priority

Fixes 1-2 are small and high-value — they make `npm run start:browser` actually work, which is the whole point.
Fix 3 is medium effort, reduces memory footprint for section apps.
Fix 4 is straightforward once Fix 1 lands.
Fix 5 is a separate project.

## Decision

Defer until after browser integration (Phase 2-4). The browser integration doesn't need isolation — it works within the existing monolithic renderer. Revisit after the browser ships.
