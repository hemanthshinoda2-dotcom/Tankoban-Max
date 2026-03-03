import json
import sys
from pathlib import Path

PKG_ROOT = Path(__file__).resolve().parents[2]
if str(PKG_ROOT) not in sys.path:
    sys.path.insert(0, str(PKG_ROOT))

import bridge as bridge_module


class _FakeFiles:
    def __init__(self, rows):
        self._rows = rows

    def num_files(self):
        return len(self._rows)

    def file_path(self, idx):
        return self._rows[idx][0]

    def file_size(self, idx):
        return self._rows[idx][1]


class _FakeTi:
    def __init__(self, rows=None):
        self._rows = rows or [
            ("Pack/ep1.mkv", 100),
            ("Pack/ep2.mkv", 200),
            ("Pack/readme.txt", 5),
        ]

    def files(self):
        return _FakeFiles(self._rows)


class _FakeHandle:
    def __init__(self, *, has_metadata=True, ti=None):
        self._has_metadata = has_metadata
        self._ti = ti or _FakeTi()
        self.priority_calls = []
        self.sequential_calls = []

    def has_metadata(self):
        return self._has_metadata

    def set_has_metadata(self, value):
        self._has_metadata = bool(value)

    def get_torrent_info(self):
        return self._ti

    def prioritize_files(self, priorities):
        self.priority_calls.append(list(priorities))

    def set_sequential_download(self, enabled):
        self.sequential_calls.append(bool(enabled))


def test_select_files_applies_priorities_and_sequential(tmp_path):
    bridge = bridge_module.WebTorrentBridge()
    bridge._upsert_history = lambda _entry: None
    bridge._emit_updated = lambda: None

    handle = _FakeHandle(has_metadata=True)
    files = bridge._build_file_list(handle.get_torrent_info())
    entry = bridge._create_entry({
        "id": "tor_pri_1",
        "state": "metadata_ready",
        "metadataReady": True,
        "files": files,
        "savePath": str(tmp_path),
    })
    bridge._active["tor_pri_1"] = {"handle": handle, "entry": entry}

    out = json.loads(bridge.selectFiles(json.dumps({
        "id": "tor_pri_1",
        "selectedIndices": [2, 0],
        "priorities": {"0": "low", "2": "high"},
        "sequential": True,
        "destinationRoot": str(tmp_path / "dest"),
    })))

    assert out["ok"] is True
    assert out["selectedCount"] == 2
    assert handle.sequential_calls[-1] is True
    assert handle.priority_calls[-1] == [1, 0, 7]

    assert entry["filePriorities"]["0"] == "low"
    assert entry["filePriorities"]["2"] == "high"
    assert entry["destinationRoot"] == str((tmp_path / "dest").resolve())

    assert entry["files"][0]["selected"] is True
    assert entry["files"][0]["priority"] == "low"
    assert entry["files"][1]["selected"] is False
    assert entry["files"][2]["selected"] is True
    assert entry["files"][2]["priority"] == "high"


def test_select_files_defers_and_replays_after_metadata_ready(tmp_path):
    bridge = bridge_module.WebTorrentBridge()
    bridge._upsert_history = lambda _entry: None
    bridge._emit_updated = lambda: None

    handle = _FakeHandle(has_metadata=False)
    entry = bridge._create_entry({
        "id": "tor_pri_2",
        "state": "resolving_metadata",
        "metadataReady": False,
        "files": None,
    })
    bridge._active["tor_pri_2"] = {"handle": handle, "entry": entry}
    dest = tmp_path / "library"

    pending = json.loads(bridge.selectFiles(json.dumps({
        "id": "tor_pri_2",
        "selectedIndices": [1],
        "priorities": {"1": "high"},
        "sequential": False,
        "destinationRoot": str(dest),
    })))

    assert pending["ok"] is True
    assert pending["pending"] is True
    assert "deferredSelection" in bridge._active["tor_pri_2"]

    handle.set_has_metadata(True)
    entry["files"] = bridge._build_file_list(handle.get_torrent_info())
    entry["metadataReady"] = True
    entry["state"] = "metadata_ready"

    bridge._apply_deferred_selection("tor_pri_2")

    assert "deferredSelection" not in bridge._active["tor_pri_2"]
    assert handle.sequential_calls[-1] is False
    assert handle.priority_calls[-1] == [0, 7, 0]
    assert entry["state"] == "downloading"
    assert entry["filePriorities"]["1"] == "high"
    assert entry["files"][1]["selected"] is True
