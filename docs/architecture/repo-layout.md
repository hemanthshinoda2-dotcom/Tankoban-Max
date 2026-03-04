# Repo Layout

This document is the canonical high-level filesystem map.

```text
/
  README.md
  agents.md
  docs/
    architecture/
    migration/
    history/
  src/                         # shared renderer UI
  projectbutterfly/            # canonical Qt runtime
  runtime/
    electron_legacy/           # contained legacy Electron runtime
  player_qt/                   # Qt video runtime assets/build
  resources/
    manifests/                 # vendor fetch manifests
    cache/                     # fetched artifacts (ignored)
  scripts/
    run/
    windows/
  tools/
  qa/
  contracts/
  types/
  experiments/
  archive/
```

## Status Classes

- `active`: default product runtime or shared required code
- `legacy`: compatibility runtime, still runnable but non-default
- `experimental`: not default, can be enabled intentionally
- `archive`: historical reference, not active

## Module Contracts

- Module inventory: `docs/architecture/module-index.yaml`
- Dependency boundaries: `docs/architecture/dependency-boundaries.yaml`
- Path lifecycle map: `docs/architecture/path-status.yaml`
