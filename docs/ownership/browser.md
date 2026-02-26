# Browser Ownership Manifest

- Feature: `browser`
- App entry: `apps/browser-app/main.js`
- Renderer owners: `src/domains/web/*`, `src/domains/browser_host/*`
- Main owners: `main/domains/webSources/*`, `main/domains/web*/*`, `main/domains/torProxy/*`
- Preload namespaces: `preload/namespaces/web.js`
- IPC registers: `main/ipc/register/web_*.js`, `main/ipc/register/tor_proxy.js`
- Shared dependencies:
  - `packages/core-main`
  - `packages/core-preload`
  - `packages/core-ipc-contracts`
