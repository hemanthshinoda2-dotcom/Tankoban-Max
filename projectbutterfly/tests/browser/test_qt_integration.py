import json
import os
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[3]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

pytest.importorskip("pytestqt")

from projectbutterfly.browser.chrome_browser import ChromeBrowser
from projectbutterfly.browser.permission_bar import PermissionBar
from projectbutterfly.browser.torrent_add_dialog import TorrentAddDialog
from PySide6.QtCore import QUrl
from PySide6.QtWebEngineCore import QWebEnginePage


def test_qt_tab_create_close_and_reopen(qtbot):
    browser = ChromeBrowser(bridge_root=None)
    qtbot.addWidget(browser)

    initial = browser._tab_mgr.count
    browser.new_tab("https://example.com")
    assert browser._tab_mgr.count == initial + 1

    active = browser._tab_mgr.active_id
    assert active
    browser._close_tab(active)

    browser.reopen_closed_tab()
    assert browser._tab_mgr.count >= initial


def test_permission_bar_emits_remember_payload(qtbot):
    bar = PermissionBar()
    qtbot.addWidget(bar)

    captured = []
    bar.permission_decided.connect(lambda origin, feature, granted, remember: captured.append((granted, remember)))

    bar.show_permission(QUrl("https://example.com"), QWebEnginePage.Feature.Geolocation)
    bar._remember_chk.setChecked(True)
    bar._decide(True)

    assert captured == [(True, True)]


def test_crash_recover_flow_smoke(qtbot):
    browser = ChromeBrowser(bridge_root=None)
    qtbot.addWidget(browser)

    tab = browser._tab_mgr.active_tab
    assert tab is not None
    tab.url = "https://example.com"

    browser._on_render_process_terminated(tab.id, None, 1)
    assert browser._tab_mgr.get(tab.id).crashed is True

    browser._recover_crashed_tab("tabId=" + tab.id)
    assert browser._tab_mgr.count >= 1


class _FakeWebSources:
    def __init__(self, videos_root):
        self._videos_root = str(videos_root)

    def getDestinations(self):
        return json.dumps({
            "ok": True,
            "allComics": [],
            "allVideos": [self._videos_root],
            "allBooks": [],
        })

    def listDestinationFolders(self, payload):
        data = json.loads(payload) if isinstance(payload, str) else payload
        path = str((data or {}).get("path", "") or "")
        base = path if path else self._videos_root
        rows = [
            {"name": "Existing A", "path": os.path.join(base, "Existing A")},
            {"name": "Existing B", "path": os.path.join(base, "Existing B")},
        ]
        return json.dumps({"ok": True, "folders": rows})


class _FakeWebBrowserSettings:
    def __init__(self):
        self.last_saved = {}

    def get(self):
        return json.dumps({"settings": {"sourcesLastDestinationByCategory": {}}})

    def save(self, payload):
        self.last_saved = json.loads(payload) if isinstance(payload, str) else dict(payload)
        return json.dumps({"ok": True})


class _FakeWebTorrent:
    def __init__(self):
        self.last_select_payload = None

    def selectFiles(self, payload):
        self.last_select_payload = json.loads(payload) if isinstance(payload, str) else dict(payload)
        return json.dumps({"ok": True, "selectedCount": len(self.last_select_payload.get("selectedIndices", []))})

    def getActive(self):
        return json.dumps({"torrents": []})


class _FakeBridgeRoot:
    def __init__(self, videos_root):
        self.webSources = _FakeWebSources(videos_root)
        self.webBrowserSettings = _FakeWebBrowserSettings()
        self.webTorrent = _FakeWebTorrent()


def test_torrent_manage_dialog_destination_modes_emit_select_payload(qtbot, tmp_path):
    videos_root = tmp_path / "videos"
    videos_root.mkdir(parents=True, exist_ok=True)
    (videos_root / "Existing A").mkdir(parents=True, exist_ok=True)
    (videos_root / "Existing B").mkdir(parents=True, exist_ok=True)

    bridge = _FakeBridgeRoot(videos_root)
    manage_row = {
        "id": "tor_manage_1",
        "name": "Managed Torrent",
        "destinationRoot": str(videos_root / "Existing A"),
        "sequential": False,
        "files": [
            {
                "index": 0,
                "path": "Managed Torrent/E01.mkv",
                "name": "E01.mkv",
                "length": 1024,
                "selected": True,
                "priority": "high",
            }
        ],
    }

    dlg = TorrentAddDialog(
        "magnet:?xt=urn:btih:manage",
        bridge_root=bridge,
        manage_torrent=manage_row,
    )
    qtbot.addWidget(dlg)
    dlg._load_manage_snapshot()

    assert dlg._dest_type == "videos"
    assert dlg._btn_download.isEnabled()

    idx_new = dlg._dest_mode.findData("new")
    assert idx_new >= 0
    dlg._dest_mode.setCurrentIndex(idx_new)
    dlg._new_folder_input.setText("Fresh Show")

    expected_dest = os.path.abspath(str(videos_root / "Fresh Show"))
    assert os.path.abspath(dlg._dest_path) == expected_dest

    dlg._on_download()

    payload = bridge.webTorrent.last_select_payload
    assert isinstance(payload, dict)
    assert payload["id"] == "tor_manage_1"
    assert payload["selectedIndices"] == [0]
    assert payload["priorities"] == {"0": "high"}
    assert payload["sequential"] is False
    assert os.path.abspath(payload["destinationRoot"]) == expected_dest

    saved = bridge.webBrowserSettings.last_saved
    assert saved["sourcesLastDestinationByCategory"]["videos"] == str(videos_root / "Fresh Show")
