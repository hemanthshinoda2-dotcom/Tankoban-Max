# Docs Layout

## Canonical Architecture Docs

1. `architecture/runtime-contract.md`
2. `architecture/repo-layout.md`
3. `architecture/path-status.yaml`
4. `architecture/ownership-map.md`
5. `architecture/module-index.yaml`
6. `architecture/dependency-boundaries.yaml`

## Agent Docs

1. `agent-map.source.md` is the canonical source.
2. Generated files: `CLAUDE.md`, `chatgpt.md`, `CODEX.md`.

## History and Migration

1. `history/` contains archived progress/legacy docs.
2. `migration/` contains restructure playbooks and baseline snapshots.

## Automation

1. `npm run docs:sync` - regenerate agent docs.
2. `npm run docs:verify-sync` - verify generated docs are in sync.
3. `npm run check:docs-links` - validate docs path references.
