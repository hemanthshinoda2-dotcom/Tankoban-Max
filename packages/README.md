# Package Boundaries

These package folders define explicit ownership boundaries for the app domains.

Current status:
- Runtime remains backward-compatible with existing paths.
- Each package exposes a canonical map to current implementation files.
- Future extraction work should move behavior into these packages without changing
  top-level app behavior.

Core packages:
- `core-main` -> section launch and root main bootstrap handoff
- `core-preload` -> preload bridge ownership map
- `core-ipc-contracts` -> shared channel/event contract (`shared/ipc.js`)
- `core-storage` -> storage ownership map (`main/lib/storage.js`)
- `core-logging` -> logging ownership map
- `core-testing` -> test/smoke ownership map

Shared packages:
- `shared-ui` -> renderer UI/state/services shared layer
- `shared-media` -> video/player shared media adapters
- `shared-workers` -> worker/scanner runtime

Feature packages:
- `feature-library`
- `feature-comic-reader`
- `feature-book-reader`
- `feature-audiobook`
- `feature-video`
- `feature-browser`
- `feature-torrent`

