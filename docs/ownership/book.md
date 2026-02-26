# Book Reader Ownership Manifest

- Feature: `book`
- App entry: `apps/book-reader-app/main.js`
- Renderer owners: `src/domains/books/*`
- Main owners: `main/domains/books/*`, `main/domains/books*/*`
- Preload namespaces: `preload/namespaces/books.js`, `preload/namespaces/books_metadata.js`
- IPC registers: `main/ipc/register/books.js`, `main/ipc/register/books_*`
- Shared dependencies:
  - `packages/core-main`
  - `packages/core-storage`
  - `packages/core-ipc-contracts`
