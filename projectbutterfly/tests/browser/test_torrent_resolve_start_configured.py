import json
import sys
from pathlib import Path
from types import SimpleNamespace

PKG_ROOT = Path(__file__).resolve().parents[2]
if str(PKG_ROOT) not in sys.path:
    sys.path.insert(0, str(PKG_ROOT))

import bridge as bridge_module


class _FakeLT:
    @staticmethod
    def parse_magnet_uri(uri):
        return SimpleNamespace(save_path="", magnet=uri)

    @staticmethod
    def bdecode(data):
        return {"decoded": bytes(data)}

    @staticmethod
    def torrent_info(decoded):
        return {"ti": decoded}


class _FakePendingHandle:
    def __init__(self, has_metadata=False, ti=None):
        self._has_metadata = has_metadata
        self._ti = ti or {"name": "pending"}

    def has_metadata(self):
        return self._has_metadata

    def get_torrent_info(self):
        return self._ti


class _FakeSession:
    def __init__(self):
        self.removed = []

    def remove_torrent(self, handle):
        self.removed.append(handle)


def test_start_configured_from_magnet_with_streamable_and_priorities(tmp_path, monkeypatch):
    bridge = bridge_module.WebTorrentBridge()
    fake_lt = _FakeLT()
    fake_session = _FakeSession()

    monkeypatch.setattr(bridge, "_try_import", lambda: fake_lt)
    monkeypatch.setattr(bridge, "_ensure_session", lambda: fake_session)

    added = {}

    def _fake_add(entry, params):
        added["entry"] = dict(entry)
        added["params"] = params
        return {"ok": True, "id": entry["id"]}

    monkeypatch.setattr(bridge, "_add_torrent", _fake_add)

    selections = []
    monkeypatch.setattr(
        bridge,
        "selectFiles",
        lambda payload: selections.append(dict(payload)) or json.dumps({"ok": True}),
    )

    pending_handle = _FakePendingHandle()
    bridge._pending["res1"] = {
        "handle": pending_handle,
        "info": {
            "magnetUri": "magnet:?xt=urn:btih:abcdef",
            "name": "Pack",
            "infoHash": "abcdef",
            "totalSize": 1234,
        },
    }

    out = json.loads(bridge.startConfigured(json.dumps({
        "resolveId": "res1",
        "savePath": str(tmp_path / "save"),
        "selectedFiles": [1, 0],
        "priorities": {"1": "high"},
        "sequential": False,
        "streamableOnly": True,
        "origin": "browser",
    })))

    assert out["ok"] is True
    assert "res1" not in bridge._pending
    assert fake_session.removed == [pending_handle]

    entry = added["entry"]
    assert entry["destinationRoot"] == ""
    assert entry["savePath"] == str((tmp_path / "save").resolve())
    assert entry["directWrite"] is False
    assert entry["sequential"] is False
    assert entry["filePriorities"] == {"1": "high"}
    assert entry["videoLibraryStreamable"] is True

    params = added["params"]
    assert getattr(params, "save_path") == str((tmp_path / "save").resolve())
    assert getattr(params, "magnet") == "magnet:?xt=urn:btih:abcdef"

    assert selections
    assert selections[0]["id"] == out["id"]
    assert selections[0]["selectedIndices"] == [1, 0]
    assert selections[0]["priorities"] == {"1": "high"}
    assert selections[0]["sequential"] is False
    assert "destinationRoot" not in selections[0]


def test_start_configured_supports_torrent_file_source(tmp_path, monkeypatch):
    bridge = bridge_module.WebTorrentBridge()
    fake_lt = _FakeLT()
    fake_session = _FakeSession()

    monkeypatch.setattr(bridge, "_try_import", lambda: fake_lt)
    monkeypatch.setattr(bridge, "_ensure_session", lambda: fake_session)

    torrent_path = tmp_path / "sample.torrent"
    torrent_path.write_bytes(b"d4:infod4:name4:teste")

    added = {}

    def _fake_add(entry, params):
        added["entry"] = dict(entry)
        added["params"] = dict(params)
        return {"ok": True, "id": entry["id"]}

    monkeypatch.setattr(bridge, "_add_torrent", _fake_add)

    selections = []
    monkeypatch.setattr(
        bridge,
        "selectFiles",
        lambda payload: selections.append(dict(payload)) or json.dumps({"ok": True}),
    )

    pending_handle = _FakePendingHandle()
    bridge._pending["res2"] = {
        "handle": pending_handle,
        "info": {
            "magnetUri": "",
            "torrentPath": str(torrent_path),
            "name": "FromTorrentFile",
            "infoHash": "hash_from_file",
            "totalSize": 777,
        },
    }

    out = json.loads(bridge.startConfigured(json.dumps({
        "resolveId": "res2",
        "destinationRoot": str(tmp_path / "library"),
        "selectedFiles": [0],
        "priorities": {"0": "normal"},
        "sequential": True,
        "streamableOnly": False,
    })))

    assert out["ok"] is True
    assert "res2" not in bridge._pending

    params = added["params"]
    assert params["save_path"] == str((tmp_path / "library").resolve())
    assert isinstance(params["ti"], dict)
    assert params["ti"]["ti"]["decoded"] == b"d4:infod4:name4:teste"

    entry = added["entry"]
    assert entry["destinationRoot"] == str((tmp_path / "library").resolve())
    assert entry["directWrite"] is True
    assert entry["sequential"] is True

    assert selections
    assert selections[0]["destinationRoot"] == str((tmp_path / "library").resolve())
