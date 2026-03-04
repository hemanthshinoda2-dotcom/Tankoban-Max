"""Bridge package exports for modular Qt bridge surface."""

from .books_bridge import BooksBridge
from .library_bridge import LibraryBridge
from .shell_bridge import ShellBridge
from .torrent_search_bridge import TorrentSearchBridge
from .video_bridge import VideoBridge
from .web_sources_bridge import WebSourcesBridge
from .web_tab_manager_bridge import WebTabManagerBridge
from .web_torrent_bridge import WebTorrentBridge
from .window_bridge import WindowBridge

__all__ = [
    "BooksBridge",
    "LibraryBridge",
    "ShellBridge",
    "TorrentSearchBridge",
    "VideoBridge",
    "WebSourcesBridge",
    "WebTabManagerBridge",
    "WebTorrentBridge",
    "WindowBridge",
]
