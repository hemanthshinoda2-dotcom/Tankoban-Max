# Repo Overhaul Playbook (Qt-first Nirvana)

This log tracks the repository topology overhaul.

## Completed

1. Created migration safety branch and pre-overhaul tag.
2. Moved legacy Electron runtime from root into `runtime/electron_legacy/`.
3. Moved experimental paths into `experiments/`.
4. Added root compatibility shims for `main.js`, `preload.js`, and worker wrappers.
5. Switched default start command to Qt runtime.
6. Moved historical progress docs into `docs/history/projectbutterfly/`.
7. Removed tracked Python cache artifacts (`__pycache__`, `*.pyc`) from git index.
8. Untracked heavy vendor payloads (`resources/prowlarr/*`, `resources/qbittorrent/*`) for on-demand strategy.

## In Progress

1. Path/tooling contract validation alignment after runtime path move.
2. Architecture docs consolidation under `docs/architecture/`.
3. Vendor manifest and fetch tooling hardening.

## Follow-ups

1. Keep legacy runtime runnable for transition, but do not add new default features there.
2. Keep `path-status.yaml` updated when top-level directories are added or reclassified.
3. Keep agent docs generated from `docs/agent-map.source.md`.
