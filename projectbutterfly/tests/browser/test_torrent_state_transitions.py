import json
import sys
from pathlib import Path
from types import SimpleNamespace

PKG_ROOT = Path(__file__).resolve().parents[2]
if str(PKG_ROOT) not in sys.path:
    sys.path.insert(0, str(PKG_ROOT))

import bridge as bridge_module


class _FakeFiles:
    def __init__(self, rows):
        self._rows = rows

    def num_files(self):
        return len(self._rows)

    def file_path(self, i):
        return self._rows[i][0]

    def file_size(self, i):
        return self._rows[i][1]


class _FakeTi:
    def __init__(self, name="Pack", info_hash="abc123", rows=None):
        self._name = name
        self._hash = info_hash
        self._rows = rows or [("Pack/file1.mkv", 100), ("Pack/file2.srt", 10)]

    def info_hash(self):
        return self._hash

    def name(self):
        return self._name

    def total_size(self):
        return sum(size for _, size in self._rows)

    def files(self):
        return _FakeFiles(self._rows)


class _FakeHandle:
    def __init__(self, *, has_metadata=True, finished=False, ti=None):
        self._has_metadata = has_metadata
        self._finished = finished
        self._ti = ti or _FakeTi()
        self.last_priorities = None
        self.last_sequential = None

    def has_metadata(self):
        return self._has_metadata

    def get_torrent_info(self):
        return self._ti

    def status(self):
        return SimpleNamespace(
            progress=1.0 if self._finished else 0.2,
            download_rate=0,
            upload_rate=0,
            total_upload=0,
            total_download=0,
            num_peers=3,
            name=self._ti.name(),
            is_finished=self._finished,
            state=0,
        )

    def prioritize_files(self, priorities):
        self.last_priorities = list(priorities)

    def set_sequential_download(self, enabled):
        self.last_sequential = bool(enabled)


def test_tick_transitions_to_metadata_ready_without_destination(tmp_path):
    bridge = bridge_module.WebTorrentBridge()
    bridge._upsert_history = lambda _entry: None
    bridge._emit_updated = lambda: None

    metadata_events = []
    bridge.torrentMetadata.connect(lambda s: metadata_events.append(json.loads(s)))

    entry = bridge._create_entry({
        "id": "t1",
        "state": "resolving_metadata",
        "destinationRoot": "",
        "savePath": str(tmp_path),
    })
    handle = _FakeHandle(has_metadata=True, finished=False)
    bridge._active["t1"] = {"handle": handle, "entry": entry}

    bridge._tick()

    assert entry["metadataReady"] is True
    assert entry["state"] == "metadata_ready"
    assert entry["files"] and all(f.get("selected") is False for f in entry["files"])
    assert handle.last_priorities == [0, 0]
    assert metadata_events


def test_tick_transitions_to_completed_pending_without_destination(tmp_path):
    bridge = bridge_module.WebTorrentBridge()
    bridge._upsert_history = lambda _entry: None
    bridge._emit_updated = lambda: None

    entry = bridge._create_entry({
        "id": "t2",
        "state": "downloading",
        "destinationRoot": "",
        "savePath": str(tmp_path),
        "metadataReady": True,
        "files": [{"index": 0, "path": "Pack/file1.mkv", "selected": True, "priority": "normal"}],
    })
    handle = _FakeHandle(has_metadata=True, finished=True, ti=_FakeTi(rows=[("Pack/file1.mkv", 100)]))
    bridge._active["t2"] = {"handle": handle, "entry": entry}

    bridge._tick()

    assert entry["state"] == "completed_pending"
    assert entry["progress"] == 1.0
    assert isinstance(entry.get("finishedAt"), int)


def test_start_resolve_and_get_status_are_non_blocking(monkeypatch):
    bridge = bridge_module.WebTorrentBridge()

    class _FakeLT:
        @staticmethod
        def parse_magnet_uri(uri):
            return SimpleNamespace(save_path="", magnet=uri)

    class _FakeSession:
        def __init__(self, h):
            self._h = h

        def add_torrent(self, _params):
            return self._h

    handle = _FakeHandle(has_metadata=False, finished=False)
    monkeypatch.setattr(bridge, "_try_import", lambda: _FakeLT())
    monkeypatch.setattr(bridge, "_ensure_session", lambda: _FakeSession(handle))

    started = json.loads(bridge.startResolve(json.dumps({"source": "magnet:?xt=urn:btih:abc"})))
    assert started["ok"] is True
    assert started["done"] is False
    rid = started["resolveId"]

    pending = json.loads(bridge.getResolveStatus(json.dumps({"resolveId": rid})))
    assert pending["ok"] is True
    assert pending["done"] is False
    assert pending["metadataReady"] is False
