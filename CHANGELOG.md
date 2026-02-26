# Changelog

## v0.1.1 – Holy Grail reliability improvements (2026‑02‑26)

### Added

* **Ring‑buffered shared texture cache:** Introduced a three‑slot ring buffer in the Holy Grail main‑process bridge (`main/domains/holyGrail/index.js`).  Previously only one imported D3D11 texture was kept; a second frame arriving while the first was still being consumed by the renderer caused stutters or driver stalls.  The new cache tracks imported textures by a key composed of the NT handle and resolution, reuses them when possible, and evicts the oldest entry when exceeding three.  This reduces churn of `sharedTexture.importSharedTexture` calls and prevents blocking on the GPU.
* **Persistent fallback logging:** Added logging utilities in the main process to write a JSON‑line log into the user data directory.  Every fallback or error now records the timestamp, reason code and details such as file path, hwdec mode, mpv errors and exception messages.  These logs make it obvious why the embedded renderer fell back to the Qt player or produced a blank screen.
* **Hardware‑decode retry ladder:** Added logic in the renderer (`src/domains/video/video.js`) to retry loading a video with software decoding when the first frame is not produced within five seconds.  If the initial load uses hardware decoding (`hwdec=auto` or `auto‑safe`) and no frame arrives, the player is torn down and reloaded with `hwdec=no` once.  If the retry still fails, the player cleanly falls back to the Qt player with a `_routeReason` of `no_frame` or `hwdec_retry`.
* **Asynchronous frame submission:** Modified the Holy Grail frame loop to send shared textures asynchronously rather than awaiting the promise.  The previous synchronous call to `sharedTexture.sendSharedTexture()` could block the Node main process when the GPU driver stalled.  Now the promise is handled in a `then()/catch()` chain and the frame loop schedules the next tick without waiting on GPU work.  Error streaks trigger back‑off delays and cache eviction.
* **First‑frame watchdog improvements:** The first‑frame watchdog now includes the hwdec retry logic and uses a distinct `forceEmbFlag` variable to avoid variable shadowing.  It calls `player.destroy()` and reopens the video with `hwdec=no` on the first stall, then falls back to Qt on subsequent stalls.

### Fixed

* **Cache key correctness:** `makeImportedTextureKey()` now hashes the NT handle in hexadecimal along with the video dimensions, ensuring that new frames with different handles do not erroneously hit the cache.  The ring buffer stores entries with this key in a map for efficient look‑ups.
* **Resource release:** Implemented `releaseImportedSharedTextureCache()` to free all imported textures (both the legacy single entry and ring‑buffer entries) when tearing down or reloading the player.  This prevents leaking GDI handles or saturating the texture cache.
* **Duplicate variable declaration:** Resolved a duplicate `forceEmbedded` constant in the first‑frame watchdog, which previously caused syntax errors.  A new local variable `forceEmbFlag` is used instead.

### Changed

* Updated `holy_grail_backend.js` to respect a `hwdec` option passed via `loadOpts`.  The renderer can now explicitly request software decoding when retrying after a stall.
* Enhanced diagnostics counters for import cache hits, misses and resets and recorded the timestamp of the last frame sent.
* Added guards around sending frames when the owner frame is not live and when errors occur; errors are logged and the cache is reset to avoid repeated failures.
