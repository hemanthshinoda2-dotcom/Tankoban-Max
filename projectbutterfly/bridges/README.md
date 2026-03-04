# Qt Bridges Package

## Canonical Entrypoints
- `projectbutterfly/bridge_root.py`
- `projectbutterfly/bridges/__init__.py`

## Staged Facade Status
The bridge implementation currently lives in `bridges/_legacy_bridge_impl.py`.
Facade modules export domain-scoped classes while preserving the existing `bridge.py` import surface.

## Public API
- `BridgeRoot`
- `setup_bridge(web_view, win)`
- Domain bridge classes exposed from module-specific bridge files

## Migration Rule
New bridge logic must be added to dedicated modules in `projectbutterfly/bridges/`.
Do not expand the legacy implementation monolith.
