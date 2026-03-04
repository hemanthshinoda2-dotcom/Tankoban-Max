# Library Ownership Manifest

- Feature: `library`
- App entry: `apps/library-app/main.js`
- Renderer owners: `src/domains/library/*`, `src/domains/reader/*`
- Main owners: `main/domains/library/*`, `main/domains/comic/*`, `main/domains/archives/*`
- Preload namespaces: `preload/namespaces/library.js`, `preload/namespaces/files.js`
- IPC registers: `main/ipc/register/library.js`, `main/ipc/register/archives.js`, `main/ipc/register/files.js`
- Shared dependencies:
  - `packages/core-main`
  - `packages/core-storage`
  - `packages/core-ipc-contracts`
