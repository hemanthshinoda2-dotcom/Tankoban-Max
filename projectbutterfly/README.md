# Project Butterfly (Qt Runtime)

Canonical product runtime for Tankoban Max.

## Entrypoints
- `app.py`: Qt app shell startup
- `bridge_root.py`: canonical bridge composition surface
- `bridge.py`: compatibility facade for legacy imports

## Module Policy
- New bridge/domain logic should be added under dedicated modules.
- Avoid adding new monolithic logic to legacy compatibility files.
