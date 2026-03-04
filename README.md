# Tankoban Max (Qt-First)

Tankoban Max is a **Qt-first** media app.

- Canonical runtime: `projectbutterfly/` (Python + Qt)
- Shared renderer UI: `src/`
- Legacy runtime: `runtime/electron_legacy/` (kept runnable, not default)

## Quick Start

### Default (Qt runtime)
```bat
npm start
```

### Explicit Qt
```bat
npm run start:qt
```

### Legacy Electron
```bat
npm run start:electron-legacy
```

## Repository Layout (high level)

- `projectbutterfly/`: active Qt runtime and bridges
- `src/`: renderer domains, styles, and shell UI
- `runtime/electron_legacy/`: isolated legacy Electron runtime
- `player_qt/`: Qt video player runtime/build assets
- `resources/manifests/`: vendor fetch manifests
- `resources/cache/`: fetched vendor artifacts (ignored)
- `experiments/`: non-default experimental code
- `archive/`: historical archived material
- `docs/architecture/`: canonical repo/runtime contracts

## Contracts for Contributors and Agents

- Runtime contract: `docs/architecture/runtime-contract.md`
- Repo layout contract: `docs/architecture/repo-layout.md`
- Path status map: `docs/architecture/path-status.yaml`
- Ownership map: `docs/architecture/ownership-map.md`

## Validation Commands

```bat
npm run doctor
npm run check:path-status
npm run check:docs-links
npm run map
```

## Notes

- Root `main.js`, `preload.js`, and root worker files are **legacy shims** for tooling/packaging compatibility.
- Optional vendor binaries are not tracked as source-of-truth in git; use manifests + fetch scripts.
