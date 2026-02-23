// Tankoban Max — Web domain module contract
//
// Chromium-parity low-risk merge contract:
// - `web.js` remains the only public entrypoint and owns initialization ordering.
// - Feature modules register factory functions on `window.__tankoWebModules`.
// - Factories receive a shared `bridge` object with:
//   - `state`, `el`, `api`, `webTabs` shared runtime references
//   - `on(event, fn)` / `emit(event, payload)` lightweight event bus
//   - `deps` utility methods from `web.js` (escapeHtml, showToast, etc.)
// - Factories return an object map of functions consumed by `web.js`.
// - Modules must avoid touching new globals outside `window.__tankoWebModules`.
(function tankoWebContractInit() {
  'use strict';
  if (!window.__tankoWebModules) window.__tankoWebModules = {};
})();
