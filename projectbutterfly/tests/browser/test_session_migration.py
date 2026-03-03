import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from projectbutterfly.browser.state_store import BrowserStateStore, SESSION_SCHEMA_VERSION


def test_session_migration_v1_urls_to_structured_tabs():
    store = BrowserStateStore(None)
    migrated = store.migrate_session({
        "version": 1,
        "tabs": ["https://a.com", "https://b.com"],
        "activeTabId": "1",
        "closedTabs": ["https://c.com"],
        "uiState": {"bookmarksBarVisible": True, "windowState": "maximized"},
    })

    assert migrated["version"] == SESSION_SCHEMA_VERSION
    assert migrated["tabs"][0]["url"] == "https://a.com"
    assert migrated["tabs"][1]["url"] == "https://b.com"
    assert migrated["closedTabs"][0]["url"] == "https://c.com"
    assert migrated["activeTabId"] == "1"
    assert migrated["uiState"]["bookmarksBarVisible"] is True
    assert migrated["uiState"]["windowState"] == "maximized"


def test_session_migration_preserves_active_tab_id_when_tab_ids_exist():
    store = BrowserStateStore(None)
    migrated = store.migrate_session({
        "version": 2,
        "tabs": [
            {"id": "tab-a", "url": "https://a.com"},
            {"id": "tab-b", "url": "https://b.com"},
        ],
        "activeTabId": "tab-b",
    })

    assert migrated["activeTabId"] == "tab-b"


def test_session_migration_sanitizes_invalid_window_state():
    store = BrowserStateStore(None)
    migrated = store.migrate_session({
        "version": 2,
        "tabs": [{"url": "https://a.com"}],
        "uiState": {"windowState": "broken-state"},
    })

    assert migrated["uiState"]["windowState"] == "normal"
