# Video Ownership Manifest

- Feature: `video`
- App entry: `apps/video-player-app/main.js`
- Renderer owners: `src/domains/video/*`
- Main owners: `main/domains/video/*`, `main/domains/player_core/*`, `main/domains/holyGrail/*`, `main/domains/videoSettings/*`
- Preload namespaces: `preload/namespaces/video.js`, `preload/namespaces/player.js`, `preload/namespaces/holy_grail.js`
- IPC registers: `main/ipc/register/video.js`, `main/ipc/register/player_core.js`, `main/ipc/register/holy_grail.js`, `main/ipc/register/video_settings.js`
- Shared dependencies:
  - `packages/core-main`
  - `packages/core-storage`
  - `packages/core-ipc-contracts`
- Renderer boundary contract:
  - Player preference read/write should prefer `window.Tanko.features.video`.
  - Raw `window.Tanko.api.videoSettings` is compatibility fallback only.
