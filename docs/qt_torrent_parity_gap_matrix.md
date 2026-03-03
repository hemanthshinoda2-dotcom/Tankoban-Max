# Qt Torrent Parity Gap Matrix

Status legend:
- `Done`: implemented in Qt branch
- `Done (QA pending)`: implemented, requires runtime/manual parity signoff
- `Open`: not implemented

| Gap | Master Behavior | Qt Target | Status | Validation |
|---|---|---|---|---|
| Metadata-ready transition + event emission | Transition to metadata-ready with explicit metadata payload | `projectbutterfly/bridge.py` (`WebTorrentBridge._tick`, `_apply_metadata_if_ready`) | Done (QA pending) | `test_torrent_state_transitions.py` |
| Deferred pre-metadata file selection replay | Queue and replay file selections/priorities when metadata arrives | `projectbutterfly/bridge.py` (`selectFiles`, `_apply_deferred_selection`) | Done (QA pending) | `test_torrent_file_priorities.py` |
| Priority + sequential mapping correctness | Apply high/normal/low and sequential flags deterministically | `projectbutterfly/bridge.py` (`selectFiles`) | Done (QA pending) | `test_torrent_file_priorities.py` |
| Completed pending routing flow | Finished torrent without destination can be recovered by destination assignment | `projectbutterfly/bridge.py` (`_tick`, `setDestination`) | Done (QA pending) | `test_torrent_state_transitions.py` + manual |
| Streamable folder manifest + placeholders | Create stream manifest and placeholder files for video mode | `projectbutterfly/bridge.py` (`addToVideoLibrary`) | Done (QA pending) | `test_torrent_streamable_manifest.py` |
| Playback path contract from streamFile | Return usable `path/url/transport` payload and prioritize target file | `projectbutterfly/bridge.py` (`streamFile`) | Done (QA pending) | `test_torrent_streamable_manifest.py` |
| Tankoban destination picker model in add/manage dialog | Category-root constrained standalone/existing/new flow; no primary OS picker | `projectbutterfly/browser/torrent_add_dialog.py` | Done (QA pending) | `test_qt_integration.py` + manual |
| Provider dropdown + fallback chain | Jackett/Prowlarr/Tankorent selection with deterministic fallback | `projectbutterfly/bridge.py`, `projectbutterfly/browser/chrome_browser.py`, `projectbutterfly/browser/data/torrents.html` | Done (QA pending) | `test_torrent_search_provider_fallback.py` |
| Manage Files/Save action in downloads | Reopen dialog in manage mode for active/history torrents | `projectbutterfly/browser/chrome_browser.py`, `projectbutterfly/browser/data/torrents.html` | Done (QA pending) | manual checklist |
| Destination persistence by category | Remember last used destination per category | `projectbutterfly/browser/torrent_add_dialog.py`, `web_browser_settings.json` | Done (QA pending) | `test_qt_integration.py` + manual |

## Remaining Signoff Work
1. Execute full torrent + qt integration pytest gate in CI/runtime with `pytest` installed.
2. Run manual parity checklist on Windows with real libtorrent session.
3. Capture parity signoff evidence for metadata, manage flow, and streamable playback.
