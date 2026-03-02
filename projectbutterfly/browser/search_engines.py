"""
Search engine definitions and current selection.

The default search engine can be changed at runtime via set_default().
All browser features (omnibox, context menu) use get_search_url() and
get_engine_name() to stay agnostic.
"""

from __future__ import annotations

ENGINES = {
    "yandex": {
        "name": "Yandex",
        "search_url": "https://yandex.com/search/?text={}",
        "home_url": "https://yandex.com",
    },
    "google": {
        "name": "Google",
        "search_url": "https://www.google.com/search?q={}",
        "home_url": "https://www.google.com",
    },
    "duckduckgo": {
        "name": "DuckDuckGo",
        "search_url": "https://duckduckgo.com/?q={}",
        "home_url": "https://duckduckgo.com",
    },
    "bing": {
        "name": "Bing",
        "search_url": "https://www.bing.com/search?q={}",
        "home_url": "https://www.bing.com",
    },
}

_current_engine = "google"


def set_default(engine_id: str):
    """Set the default search engine by ID."""
    global _current_engine
    if engine_id in ENGINES:
        _current_engine = engine_id


def get_default_id() -> str:
    """Get the current default engine ID."""
    return _current_engine


def get_engine_name() -> str:
    """Get the display name of the current search engine."""
    return ENGINES.get(_current_engine, ENGINES["google"])["name"]


def get_search_url(query: str) -> str:
    """Build a search URL for the given query using the current engine."""
    from PySide6.QtCore import QUrl
    engine = ENGINES.get(_current_engine, ENGINES["google"])
    encoded = QUrl.toPercentEncoding(query).data().decode()
    return engine["search_url"].format(encoded)


def get_home_url() -> str:
    """Get the homepage URL for the current engine."""
    return ENGINES.get(_current_engine, ENGINES["google"])["home_url"]
