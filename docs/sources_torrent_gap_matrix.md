# Sources Torrent Gap Matrix

| Gap ID | Symptom | Root Cause | File(s) | Fix Applied | Status |
|---|---|---|---|---|---|
| G1 | Search hangs at `Searching...` | Async ack returned but renderer lacked deterministic terminal timeout path | `src/domains/web/web.js` | Added request token tracking, pending timer, hard timeout cap (<=45s), terminal status handling, late-packet ignore for timed-out token | Closed |
| G2 | Search failures/timeouts with no useful output | Bridge sends timeout/worker args but scraper functions did not accept them | `projectbutterfly/browser/torrent_scrapers.py` | Added configurable timeout/worker clamps and plumbed timeout/workers across all scrapers + `search_all` | Closed |
| G3 | Slow scraper behavior under mixed sources | Fixed scraper-level timeout and worker pool behavior was static | `projectbutterfly/browser/torrent_scrapers.py` | Added bounded timeout/worker configuration and threaded source fanout | Closed |
| G4 | Streamable save fails after apparent start | Readiness checks could proceed without validated metadata/files | `src/domains/web/web.js` | Strict metadata validation gate in wait/poll path (metadataReady or validated file rows only) | Closed |
| G5 | Save-flow resolve can freeze UX | Blocking resolve path still active in renderer | `src/domains/web/web.js` | Switched save-flow to non-blocking `startResolve + getResolveStatus` with polling and explicit errors; legacy fallback retained | Closed |
| G6 | Cannot remove some torrents from list | Remove flow required active remove API even for history-only rows | `src/domains/web/web.js` | Remove actions now support history-only paths via `removeHistory` even if `remove` unavailable | Closed |
| G7 | qBittorrent UI popup in normal flow | Process launch not fully hidden on Windows | `projectbutterfly/qbit_process.py` | Added `SW_HIDE` startup info + detached/no-window process flags | Mitigated |
| G8 | No operational visibility during failures | Diagnostics lacked torrent-specific counters | `src/domains/web/web.js` | Added `sourcesTorrentDiag` counters and exposed in `debugDump()` | Closed |

## Remaining Work (Next Slice)
- Sidecar backend runtime (`torrent.backendMode=sidecar`) full implementation.
- Adapter switch in `WebTorrentBridge` from qBit to sidecar default.
- Sidecar packaging and restart policy.
