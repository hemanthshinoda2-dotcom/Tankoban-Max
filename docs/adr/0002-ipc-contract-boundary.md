# ADR 0002: IPC Contract Boundary

Date: 2026-02-24
Status: Accepted

## Context
Cross-process coupling is a major regression vector. We need consistent IPC channel naming and payload validation.

## Decision
Treat `shared/ipc.js` as the single source of truth for channel and event identifiers.

Add contract checks:
1. `tools/ipc_sync_check.js` for channel/event registration consistency.
2. `tools/ipc_contract_check.js` for payload schema coverage and sample validation.
3. `contracts/ipc/payload_schemas.js` for sectioned request/response/event schema definitions.

## Consequences
1. IPC regressions are caught before runtime.
2. Payload structure drift becomes visible in CI.
3. New channels/events must be updated in both contract constants and schema maps.

