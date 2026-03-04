# Runtime Contract

## Canonical Runtime

`projectbutterfly/` is the product-default runtime.

- Language/runtime: Python + Qt
- Entrypoint: `projectbutterfly/app.py`
- Startup command: `npm start` / `npm run start:qt`
- Bridge composition entrypoint: `projectbutterfly/bridge_root.py`

## Legacy Runtime

`runtime/electron_legacy/` is supported for compatibility and migration only.

- Entrypoint: `runtime/electron_legacy/main.js`
- Startup command: `npm run start:electron-legacy`

## Command Contract

- `npm start`: Qt runtime
- `npm run start:qt`: Qt runtime
- `npm run start:electron-legacy`: legacy Electron runtime
- `npm run start:legacy:*`: section-scoped legacy app entrypoints

## Compatibility Shims

These root files are intentional wrappers for legacy tooling and packaging:

- `main.js`
- `preload.js`
- `library_scan_worker.js`
- `books_scan_worker.js`
- `video_scan_worker.js`
- `audiobook_scan_worker.js`

Do not place new runtime logic in those shim files.

## Modularization Contract

- Domain/module index: `docs/architecture/module-index.yaml`
- Dependency boundaries: `docs/architecture/dependency-boundaries.yaml`
- Bridge implementation modules: `projectbutterfly/bridges/`
