# Torrent / Sources Ownership Manifest

- Feature: `torrent`
- App entry: `apps/torrent-app/main.js`
- Renderer owners: `src/domains/web/web.js`, `src/domains/web/web_module_torrent_tab.js`
- Main owners: `main/domains/webTorrent/*`, `main/domains/torrentSearch/*`, `main/domains/torProxy/*`
- Preload namespaces: `preload/namespaces/web.js`
- IPC registers: `main/ipc/register/web_torrent.js`, `main/ipc/register/torrent_search.js`, `main/ipc/register/tor_proxy.js`
- Shared dependencies:
  - `packages/feature-torrent`
  - `packages/core-main`
  - `packages/core-ipc-contracts`
