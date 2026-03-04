"""
Project Butterfly bridge compatibility facade.

Canonical composition entrypoint lives in ``bridge_root.py`` and implementation
classes are organized under ``projectbutterfly/bridges``.

This module intentionally preserves the historic ``import bridge`` surface,
including internal helper symbols used by existing tests and tooling.
"""

import bridges._legacy_bridge_impl as _legacy_impl

BridgeRoot = _legacy_impl.BridgeRoot
setup_bridge = _legacy_impl.setup_bridge

for _name in dir(_legacy_impl):
    if _name.startswith("__"):
        continue
    globals()[_name] = getattr(_legacy_impl, _name)

__all__ = [name for name in globals() if not name.startswith("__")]

