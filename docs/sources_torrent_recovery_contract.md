# Sources Torrent Recovery Contract (P0)

## Scope
This contract covers the Sources torrent workspace in Butterfly Qt:
- Torrent search lifecycle
- Metadata resolve and save-flow
- Streamable-folder path
- Torrent list actions (active + history)
- qBittorrent popup mitigation while qBit remains temporary backend

## Hard P0 Gates
1. Search must never stay in permanent `Searching...` state.
2. Search must end with a terminal state (`success|partial|timeout|error`) in <= 45s.
3. Metadata resolve in save-flow must be non-blocking and cancellable.
4. Streamable folder creation must only proceed after validated metadata readiness.
5. Torrent remove actions must work for active and history-only rows.
6. qBittorrent must not visibly pop UI windows in normal in-app operations.
7. Errors must be explicit in UI status text; no silent no-op failures.

## Runtime Behavior Rules
- Search uses progressive updates plus final envelope.
- Timeout cap is derived from settings but clamped to 45s.
- Late async search packets are ignored after hard timeout for that request token.
- Save-flow resolve uses `startResolve + getResolveStatus` when available.
- Legacy `resolveMetadata` remains fallback only.
- Streamable readiness requires `metadataReady=true` or validated non-empty files list.

## Telemetry Requirements
Expose in `window.Tanko.sources.debugDump()`:
- Search counters: started/partial/final/timeout/error/lastElapsedMs
- Resolve counters: started/retrying/ready/timeout/error/lastElapsedMs
- Streamable counters: started/success/error/lastError

## Non-Goals For This Slice
- Full backend replacement from qBit to sidecar in one step.
- Browser parity/UI polish work outside torrent workspace behavior.
- Destructive settings/history migrations.
