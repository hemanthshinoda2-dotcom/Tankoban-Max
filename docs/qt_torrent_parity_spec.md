# Qt Torrent Parity Spec (Behavior-First)

## Goal
Match the Qt browser torrent behavior to the Electron/master torrent ecosystem for:
- metadata-first add flow
- file selection/priorities/sequential control
- destination/path picker workflow
- streamable video-folder workflow
- search provider model with fallback chain
- downloads/manage flow parity

Excluded from this spec: books/comics/torrent ecosystem expansion beyond parity baseline.

## Reference Implementation
Primary behavior references:
- `../Tankoban-Max-master/main/domains/webTorrent/index.js`
- `../Tankoban-Max-master/src/domains/web/web.js`
- Qt runtime targets:
  - `projectbutterfly/bridge.py` (`WebTorrentBridge`, `TorrentSearchBridge`)
  - `projectbutterfly/browser/torrent_add_dialog.py`
  - `projectbutterfly/browser/chrome_browser.py`
  - `projectbutterfly/browser/data/torrents.html`

## Canonical Behavior Contract

### 1. Metadata-first torrent start
- `resolveMetadata` resolves magnet or `.torrent` source.
- torrent enters `resolving_metadata` then `metadata_ready` if no destination.
- when destination is not chosen, file priorities are forced to `0` and files are deselected.
- `startConfigured` supports replay of selected files, priorities, and sequential mode.

### 2. File selection and priority semantics
- `selectFiles` accepts:
  - `selectedIndices[]`
  - `priorities{ index -> high|normal|low }`
  - `sequential` boolean
  - optional `destinationRoot`
- requests before metadata readiness are queued and replayed.
- priority mapping must be deterministic:
  - `high -> 7`
  - `normal -> 4`
  - `low -> 1`
  - unselected -> `0`

### 3. Completed-without-destination behavior
- finished torrents without destination move to `completed_pending`.
- `setDestination` routes/copies selected files to destination and finalizes:
  - `completed` on full success
  - `completed_with_errors` on partial failures

### 4. Streamable video folder path
- `addToVideoLibrary(streamable=true)` requires metadata readiness.
- writes `.tanko_torrent_stream.json` with torrent/file metadata.
- creates placeholder files for detected video files.
- registers show folder through video domain `addShowFolderPath`.
- `streamFile` returns playback-ready payload:
  - `{ ok, path, url?, transport, autoActivated, activationSource }`

### 5. Destination picker policy (Qt dialog)
- primary UX is Tankoban destination flow (not OS file picker):
  - `Standalone download`
  - `Pick existing folder`
  - `Create new folder`
- folder options come from:
  - `webSources.getDestinations`
  - `webSources.listDestinationFolders`
- per-category destination persistence:
  - `web_browser_settings.json -> sourcesLastDestinationByCategory`

### 6. Search providers and fallback
- provider values: `jackett | prowlarr | tankorent`.
- fallback chain:
  - jackett: `jackett -> prowlarr -> tankorent`
  - prowlarr: `prowlarr -> jackett -> tankorent`
  - tankorent: `tankorent -> jackett -> prowlarr`
- response includes fallback metadata:
  - `provider`, `activeProvider`, `fallbackUsed`, `fallbackChain`, `providersTried`.

## Acceptance Gate
Release gate for parity track:
1. no P0/P1 torrent defects
2. healthy magnets reach metadata-ready reliably
3. no mandatory OS picker in standard add/manage torrent flow
4. file selection/priorities/sequential apply deterministically
5. `completed_pending` recovery path works
6. streamable folder flow creates manifest/placeholders and supports playback path resolution
7. provider dropdown and fallback chain behave deterministically
8. tests pass:
   - `python -m pytest projectbutterfly/tests/browser -k "torrent or qt_integration"`
