# ADR 0001: Section Boot Model

Date: 2026-02-24
Status: Accepted

## Context
The repo needs isolated, section-focused app boots for easier targeted testing and agent edits, while preserving integrated app startup.

## Decision
Use thin app entrypoints in `apps/*` that set `TANKOBAN_APP_SECTION` and delegate to shared boot logic in `packages/core-main/launch_section_app.js`.

Main process injects `?appSection=...` into renderer query params.
Renderer uses `src/state/app_section_boot.js` to activate section-specific startup behavior.

## Consequences
1. `npm start` remains unchanged and boots integrated app.
2. Section boots are explicit (`npm run start:<section>`).
3. Future extraction can move implementation internals without changing section launch UX.

