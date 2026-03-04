# Modularization Playbook (Qt-First, Staged Facades)

This playbook tracks the extreme modularization rollout while preserving runtime behavior.

## Principles

1. Qt runtime remains canonical.
2. Splits are staged-facade first: behavior stays stable while files/modules are reorganized.
3. Legacy Electron runtime remains runnable but receives containment-only changes.
4. Every new module must declare owner + public API contract.

## Completed in this pass

1. Added bridge modular scaffolding under `projectbutterfly/bridges/`.
2. Added `projectbutterfly/bridge_root.py` and kept `projectbutterfly/bridge.py` as compatibility facade.
3. Added renderer domain entrypoint scaffolding (`src/domains/*/index.js`).
4. Added per-domain README contracts across shell/books/video/web/library/reader/browser_host.
5. Added architecture contracts:
   - `docs/architecture/module-index.yaml`
   - `docs/architecture/dependency-boundaries.yaml`
6. Added enforcement tooling:
   - `tools/check_module_contracts.js`
   - `tools/check_dependency_boundaries.js`
   - `tools/check_file_size_budget.js`
7. Wired enforcement into `npm run repo:contracts`.

## Next extraction targets

1. Migrate bridge class implementations from `_legacy_bridge_impl.py` into dedicated bridge modules.
2. Reduce `src/domains/web/web.js` by moving runtime slices into `web/state|browser|apps|torrents|providers|diagnostics` modules.
3. Reduce `src/domains/video/video.js` into `video/state|library|routing|player|search` modules.
4. Split books and shell monoliths while preserving deferred loading order.

## Guardrails

- Do not remove compatibility facades until one stable release cycle passes.
- Do not add new logic to archived/experimental paths.
- Keep docs and contract checks passing before merge.
