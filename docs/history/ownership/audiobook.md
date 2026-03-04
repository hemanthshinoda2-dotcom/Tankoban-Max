# Audiobook Ownership Manifest

- Feature: `audiobook`
- App entry: `apps/audiobook-app/main.js`
- Renderer owners: `src/domains/books/reader/reader_audiobook.js`, `src/domains/books/audiobook_*`
- Main owners: `main/domains/audiobooks/*`, `main/domains/audiobook*/*`
- Preload namespaces: `preload/namespaces/audiobooks.js`
- IPC registers: `main/ipc/register/audiobooks.js`, `main/ipc/register/audiobook_*`
- Shared dependencies:
  - `packages/core-main`
  - `packages/shared-media`
  - `packages/core-ipc-contracts`
