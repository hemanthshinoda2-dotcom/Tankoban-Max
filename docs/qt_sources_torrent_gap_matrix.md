# Qt Sources Torrent Gap Matrix

## Current Gaps and Owners

### G1: Blocking metadata resolve in renderer
- Symptom: Save-flow stalls/freezes while resolving.
- Owner files:
  - `src/domains/web/web.js`
  - `src/services/api_gateway.js`
  - `projectbutterfly/bridge.py`
- Fix: move to `startResolve` + `getResolveStatus` polling.

### G2: Search hangs in `Searching...`
- Symptom: no results with async signal race.
- Owner files:
  - `projectbutterfly/bridge.py` (`TorrentSearchBridge.query`)
  - `src/domains/web/web.js`
- Fix: return final query result directly; keep signal optional.

### G3: Provider overlay causes blinking/jitter
- Symptom: viewport hide/show flicker and z-order glitches.
- Owner files:
  - `src/index.html`
  - `src/domains/web/web.js`
  - `src/styles/web-browser.css`
- Fix: move provider configuration to sidebar panel; remove modal dependency.

### G4: Torrent remove/manage incomplete for history rows
- Symptom: remove action appears non-functional for non-active entries.
- Owner files:
  - `src/domains/web/web.js`
- Fix: fall back to `removeHistory` when active remove fails/not active.

### G5: Streamable action discoverability in manage flow
- Symptom: no direct streamable manage entry.
- Owner files:
  - `src/domains/web/web.js`
- Fix: explicit context action for streamable save and improved category inference.
