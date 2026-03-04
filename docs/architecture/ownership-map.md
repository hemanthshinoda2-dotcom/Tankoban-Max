# Ownership Map

## Qt Runtime (primary)

- Owner area: `projectbutterfly/`
- Responsibility: product runtime, bridges, Qt widgets, persistence in Qt mode

## Shared Renderer

- Owner area: `src/`
- Responsibility: shell UI, library domains, web/sources renderer behavior, styling

## Legacy Electron Runtime

- Owner area: `runtime/electron_legacy/`
- Responsibility: migration-compatible Electron runtime and IPC stacks

## Player Runtime

- Owner area: `player_qt/`
- Responsibility: external Qt player build/runtime assets

## Tooling and Contracts

- Owner area: `tools/`, `contracts/`, `types/`, `docs/architecture/`
- Responsibility: validation, generation, repo governance

## Required Ownership Artifacts

- `docs/architecture/module-index.yaml` defines module-level ownership.
- `docs/architecture/path-status.yaml` defines top-level lifecycle ownership.
- `docs/architecture/dependency-boundaries.yaml` defines allowed module edges.
