"""
Canonical bridge composition entrypoint.

Staged-facade phase: composition delegates to the legacy implementation module
while domain bridge classes migrate into dedicated modules.
"""

from bridges._legacy_bridge_impl import BridgeRoot, setup_bridge

__all__ = [
    "BridgeRoot",
    "setup_bridge",
]
