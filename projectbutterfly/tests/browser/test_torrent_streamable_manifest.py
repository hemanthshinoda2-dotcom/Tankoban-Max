import json
import os
import sys
from pathlib import Path

from PySide6.QtCore import QObject

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
    def __init__(self, name="My Show", rows=None):
        self._name = name
        self._rows = rows or [
            ("My Show/S01E01.mkv", 1000),
            ("My Show/S01E02.mp4", 2000),
            ("My Show/readme.txt", 10),
        ]

    def name(self):
        return self._name

    def files(self):
        return _FakeFiles(self._rows)


class _FakeHandle:
    def __init__(self, ti):
        self._ti = ti
        self.priority_calls = []
        self.sequential_calls = []

    def has_metadata(self):
        return True

    def get_torrent_info(self):
        return self._ti

    def prioritize_files(self, priorities):
        self.priority_calls.append(list(priorities))

    def set_sequential_download(self, enabled):
        self.sequential_calls.append(bool(enabled))


class _FakeVideoDomain:
    def __init__(self):
        self.added = []

    def addShowFolderPath(self, payload):
        self.added.append(json.loads(payload))


class _FakeRoot(QObject):
    def __init__(self):
        super().__init__()
        self.video = _FakeVideoDomain()


def test_add_to_video_library_streamable_writes_manifest_and_placeholders(tmp_path):
    root = _FakeRoot()
    bridge = bridge_module.WebTorrentBridge(parent=root)
    bridge._upsert_history = lambda _entry: None
    bridge._emit_updated = lambda: None

    ti = _FakeTi()
    handle = _FakeHandle(ti)
    entry = bridge._create_entry({
        "id": "tor_stream_1",
        "name": "My Show",
        "infoHash": "abc123",
        "magnetUri": "magnet:?xt=urn:btih:abc123",
        "metadataReady": True,
        "files": bridge._build_file_list(ti),
        "state": "metadata_ready",
    })
    bridge._active["tor_stream_1"] = {"handle": handle, "entry": entry}

    out = json.loads(bridge.addToVideoLibrary(json.dumps({
        "id": "tor_stream_1",
        "destinationRoot": str(tmp_path / "video"),
        "streamable": True,
    })))

    assert out["ok"] is True
    assert out["streamable"] is True

    show_path = Path(out["showPath"])
    manifest_path = show_path / bridge_module._STREAMABLE_MANIFEST_FILE
    assert manifest_path.exists()

    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    assert manifest["streamable"] is True
    assert manifest["torrentId"] == "tor_stream_1"
    rels = {f["relativePath"] for f in manifest["files"]}
    assert rels == {"S01E01.mkv", "S01E02.mp4"}

    assert (show_path / "S01E01.mkv").exists()
    assert (show_path / "S01E02.mp4").exists()
    assert root.video.added
    assert os.path.abspath(root.video.added[-1]["path"]) == os.path.abspath(str(show_path))


def test_stream_file_returns_playback_cache_playlist_payload(tmp_path):
    bridge = bridge_module.WebTorrentBridge()
    bridge._upsert_history = lambda _entry: None
    bridge._emit_updated = lambda: None

    ti = _FakeTi(rows=[("My Show/S01E01.mkv", 1024)])
    handle = _FakeHandle(ti)
    save_root = tmp_path / "downloads"
    target_file = save_root / "My Show" / "S01E01.mkv"
    target_file.parent.mkdir(parents=True, exist_ok=True)
    target_file.write_bytes(b"x" * 1024)

    entry = bridge._create_entry({
        "id": "tor_stream_2",
        "name": "My Show",
        "metadataReady": True,
        "savePath": str(save_root),
        "destinationRoot": str(save_root),
        "state": "metadata_ready",
        "files": bridge._build_file_list(ti),
    })
    bridge._active["tor_stream_2"] = {"handle": handle, "entry": entry}

    out = json.loads(bridge.streamFile(json.dumps({
        "id": "tor_stream_2",
        "fileIndex": 0,
        "forPlaybackCache": True,
        "preferHttp": True,
        "awaitReady": True,
        "readyTimeoutMs": 2000,
    })))

    assert out["ok"] is True
    assert out["transport"] == "http_playlist"
    assert Path(out["path"]).exists()
    assert out["url"].startswith("file://")
    assert entry["state"] == "streaming"
    assert handle.priority_calls[-1] == [7]
    assert handle.sequential_calls[-1] is True
