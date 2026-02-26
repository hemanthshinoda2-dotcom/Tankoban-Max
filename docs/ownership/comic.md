# Comic Reader Ownership Manifest

- Feature: `comic`
- App entry: `apps/comic-reader-app/main.js`
- Renderer owners: `src/domains/reader/*`
- Main owners: `main/domains/comic/*`, `main/domains/archives/*`
- Preload namespaces: `preload/namespaces/library.js`, `preload/namespaces/files.js`
- IPC registers: `main/ipc/register/library.js`, `main/ipc/register/archives.js`
- Shared dependencies:
  - `packages/core-main`
  - `packages/shared-ui`
  - `packages/core-ipc-contracts`
