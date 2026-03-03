# QTRoute: Add A New Media Profile

This guide keeps renderer IPC stable while adding a new media route.

## Goal
Add a new media kind without introducing a new renderer API namespace and without duplicating scan lifecycle plumbing.

## Steps
1. Define media scope and canonical storage files.
2. Reuse `QTRouteStore` for config/index IO (add helpers only if required).
3. Add a profile factory in `QTRoute/src/profiles.py` (same callback shape as existing profiles).
4. In the bridge class:
   1. Create `_route_store`, `_route_runtime`, and `_route = QTRouteService(...)`.
   2. Implement profile callbacks:
      1. `_route_observe_runtime`
      2. `_route_get_state`
      3. `_route_scan`
      4. `_route_cancel_scan`
      5. `_route_mutate_config`
      6. `_route_lookup_from_path` (if needed)
   3. Route public slot methods through `self._route.*` wrappers.
5. Keep payload/event names unchanged for renderer contracts.
6. Run parity verification:
   1. `python projectbutterfly/QTRoute/scripts/verify_phase1_parity.py`
   2. Only refresh fixtures intentionally via `capture_phase1_baseline.py`.

## Rules
1. Never rename or reshape existing `library.*`, `books.*`, `video.*` APIs.
2. Keep scan thread ownership in bridge internals; route service is the orchestrator surface.
3. Preserve empty-scan overwrite guards and stale scan protection.
4. Keep config/index files backward compatible.

## Where To Extend
1. Shared helpers/constants: `QTRoute/src/common.py`
2. Storage mapping: `QTRoute/src/store.py`
3. Service orchestration: `QTRoute/src/service.py`
4. Profile wiring: `QTRoute/src/profiles.py`
