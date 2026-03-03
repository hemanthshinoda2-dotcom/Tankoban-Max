"""
Capture Phase 1 baseline fixtures for QTRoute migration parity.

This script:
1. Creates deterministic fixture media trees (comics/books/video).
2. Initializes projectbutterfly storage in an isolated temp userData dir.
3. Exercises LibraryBridge/BooksBridge/VideoBridge methods.
4. Captures states, scan lifecycle events, key mutations, and lookup/query results.
5. Writes normalized golden snapshots to QTRoute/fixtures/phase1.
"""

from __future__ import annotations

import json
import os
import shutil
import sys
import tempfile
import time
import types
from pathlib import Path
from typing import Any, Dict


ROOT = Path(__file__).resolve().parents[3]
PROJECT_BUTTERFLY = ROOT / "projectbutterfly"
FIXTURES_DIR = ROOT / "projectbutterfly" / "QTRoute" / "fixtures" / "phase1"
WORKSPACE = FIXTURES_DIR / "_workspace"

if str(PROJECT_BUTTERFLY) not in sys.path:
    sys.path.insert(0, str(PROJECT_BUTTERFLY))

import storage  # type: ignore
import bridge as bridge_module  # type: ignore


def _write_file(path: Path, payload: bytes, mtime: int):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(payload)
    os.utime(path, (mtime, mtime))


def _build_workspace() -> Dict[str, Path]:
    if WORKSPACE.exists():
        shutil.rmtree(WORKSPACE, ignore_errors=True)
    WORKSPACE.mkdir(parents=True, exist_ok=True)

    ts = 1_700_000_000
    comics_root = WORKSPACE / "comics_root"
    comics_series = comics_root / "SeriesOne"
    comics_file_1 = comics_series / "chapter-001.cbz"
    comics_file_2 = comics_series / "chapter-002.cbr"

    books_root = WORKSPACE / "books_root"
    books_series = books_root / "BookSeriesA"
    books_file_1 = books_series / "book-001.epub"
    books_file_2 = books_series / "book-002.pdf"
    books_single = WORKSPACE / "single-book.txt"
    books_single_added = WORKSPACE / "single-book-added.mobi"

    video_root = WORKSPACE / "video_root"
    video_show = video_root / "ShowA"
    video_file_1 = video_show / "ep-001.mp4"
    video_file_2 = video_show / "ep-002.mkv"
    video_loose = video_root / "loose-video.avi"
    video_single_added = WORKSPACE / "video-added.webm"
    video_show_folder = WORKSPACE / "video_show_folder"
    video_show_folder_ep = video_show_folder / "special-001.mp4"

    _write_file(comics_file_1, b"cbz-fixture-001", ts + 1)
    _write_file(comics_file_2, b"cbr-fixture-002", ts + 2)

    _write_file(books_file_1, b"epub-fixture-001", ts + 3)
    _write_file(books_file_2, b"pdf-fixture-002", ts + 4)
    _write_file(books_single, b"txt-single-fixture", ts + 5)
    _write_file(books_single_added, b"mobi-single-added", ts + 6)

    _write_file(video_file_1, b"video-fixture-001", ts + 7)
    _write_file(video_file_2, b"video-fixture-002", ts + 8)
    _write_file(video_loose, b"video-loose-fixture", ts + 9)
    _write_file(video_single_added, b"video-single-added", ts + 10)
    _write_file(video_show_folder_ep, b"video-show-folder-ep", ts + 11)

    return {
        "comics_root": comics_root,
        "comics_series": comics_series,
        "comics_file_1": comics_file_1,
        "books_root": books_root,
        "books_series": books_series,
        "books_file_1": books_file_1,
        "books_single": books_single,
        "books_single_added": books_single_added,
        "video_root": video_root,
        "video_show_folder": video_show_folder,
        "video_file_1": video_file_1,
        "video_single_added": video_single_added,
    }


def _call_json(obj, method_name: str, *args):
    method = getattr(obj, method_name)
    raw = method(*args)
    if isinstance(raw, str):
        return json.loads(raw)
    return raw


def _stable_mutation_result(payload: Dict[str, Any]) -> Dict[str, Any]:
    if not isinstance(payload, dict):
        return payload
    out = dict(payload)
    drop_dynamic_keys = (
        "autoSeriesFolders", "effectiveSeriesFolders",
        "series", "books", "folders", "roots", "shows", "episodes",
        "scanning", "lastScanAt",
    )
    for k in drop_dynamic_keys:
        out.pop(k, None)
    state = out.get("state")
    if isinstance(state, dict):
        keep_keys = (
            "seriesFolders", "rootFolders", "ignoredSeries", "scanIgnore",
            "bookRootFolders", "bookSeriesFolders", "bookSingleFiles",
            "videoFolders", "videoShowFolders", "videoHiddenShowIds", "videoFiles",
            "error",
        )
        out["state"] = {k: state.get(k) for k in keep_keys if k in state}
    return out


def _wait_scan_done(obj, is_video: bool = False, timeout_s: float = 30.0):
    start = time.time()
    while (time.time() - start) < timeout_s:
        state = _call_json(obj, "getState", "{}") if is_video else _call_json(obj, "getState")
        if not state.get("scanning"):
            return state
        time.sleep(0.05)
    raise TimeoutError("scan wait timed out")


def _instrument_events(obj, has_phase: bool):
    log = []

    orig_scan = obj._emit_scan_status
    orig_updated = obj._emit_updated

    if has_phase:
        def scan_wrap(self, scanning, progress=None, canceled=False, phase="scan"):
            payload = {"scanning": bool(scanning), "phase": phase, "progress": progress}
            if canceled:
                payload["canceled"] = True
            log.append({"type": "scanStatus", "payload": payload})
            return orig_scan(scanning, progress, canceled, phase)
    else:
        def scan_wrap(self, scanning, progress=None, canceled=False):
            payload = {"scanning": bool(scanning), "progress": progress}
            if canceled:
                payload["canceled"] = True
            log.append({"type": "scanStatus", "payload": payload})
            return orig_scan(scanning, progress, canceled)

    def updated_wrap(self, *args, **kwargs):
        log.append({"type": "updated", "payload": {"args": list(args), "kwargs": kwargs}})
        return orig_updated(*args, **kwargs)

    obj._emit_scan_status = types.MethodType(scan_wrap, obj)
    obj._emit_updated = types.MethodType(updated_wrap, obj)
    return log


class _DialogPatch:
    def __init__(self, workspace_paths: Dict[str, Path]):
        self.workspace_paths = workspace_paths
        self._orig = {}
        self._open_name_queue = []
        self._open_names_queue = []
        self._dir_queue = []

    def queue_existing_directory(self, path: Path):
        self._dir_queue.append(str(path))

    def queue_open_filename(self, path: Path):
        self._open_name_queue.append(str(path))

    def queue_open_filenames(self, paths):
        self._open_names_queue.append(([str(p) for p in paths], ""))

    def __enter__(self):
        from PySide6.QtWidgets import QFileDialog  # type: ignore

        self._orig["getExistingDirectory"] = QFileDialog.getExistingDirectory
        self._orig["getOpenFileName"] = QFileDialog.getOpenFileName
        self._orig["getOpenFileNames"] = QFileDialog.getOpenFileNames

        def fake_get_existing_directory(*_args, **_kwargs):
            if self._dir_queue:
                return self._dir_queue.pop(0)
            return ""

        def fake_get_open_file_name(*_args, **_kwargs):
            if self._open_name_queue:
                return (self._open_name_queue.pop(0), "")
            return ("", "")

        def fake_get_open_file_names(*_args, **_kwargs):
            if self._open_names_queue:
                return self._open_names_queue.pop(0)
            return ([], "")

        QFileDialog.getExistingDirectory = staticmethod(fake_get_existing_directory)
        QFileDialog.getOpenFileName = staticmethod(fake_get_open_file_name)
        QFileDialog.getOpenFileNames = staticmethod(fake_get_open_file_names)
        return self

    def __exit__(self, exc_type, exc, tb):
        from PySide6.QtWidgets import QFileDialog  # type: ignore

        QFileDialog.getExistingDirectory = self._orig["getExistingDirectory"]
        QFileDialog.getOpenFileName = self._orig["getOpenFileName"]
        QFileDialog.getOpenFileNames = self._orig["getOpenFileNames"]


def _normalize(obj: Any, workspace: Path, user_data: Path):
    if isinstance(obj, dict):
        out = {}
        for k, v in obj.items():
            if k in {"capturedAt", "generatedAtMs", "lastScanAt", "updatedAt", "finishedAt", "completedAtMs", "lastActionAtMs"}:
                out[k] = 0
            else:
                out[k] = _normalize(v, workspace, user_data)
        return out

    if isinstance(obj, list):
        return [_normalize(x, workspace, user_data) for x in obj]

    if isinstance(obj, str):
        s = obj.replace(str(workspace), "<WORKSPACE>")
        s = s.replace(str(user_data), "<USER_DATA>")
        return s

    return obj


def _capture():
    paths = _build_workspace()

    with tempfile.TemporaryDirectory(prefix="qtroute_phase1_userdata_") as user_data:
        user_data_path = Path(user_data).resolve()
        storage.init_data_dir(str(user_data_path))

        # Seed configs for deterministic baseline flows.
        storage.write_json_sync(storage.data_path("library_state.json"), {
            "seriesFolders": [str(paths["comics_series"])],
            "rootFolders": [str(paths["comics_root"])],
            "ignoredSeries": [],
            "scanIgnore": [],
            "videoFolders": [str(paths["video_root"])],
            "videoShowFolders": [str(paths["video_show_folder"])],
            "videoHiddenShowIds": [],
            "videoFiles": [str(paths["video_single_added"])],
        })
        storage.write_json_sync(storage.data_path("books_library_state.json"), {
            "bookRootFolders": [str(paths["books_root"])],
            "bookSeriesFolders": [str(paths["books_series"])],
            "bookSingleFiles": [str(paths["books_single"])],
            "scanIgnore": [],
        })

        comics = bridge_module.LibraryBridge()
        books = bridge_module.BooksBridge()
        video = bridge_module.VideoBridge()

        comics_events = _instrument_events(comics, has_phase=False)
        books_events = _instrument_events(books, has_phase=False)
        video_events = _instrument_events(video, has_phase=True)

        with _DialogPatch(paths) as dlg:
            # Queue dialog responses for add* methods.
            dlg.queue_existing_directory(paths["comics_root"])    # comics.addRootFolder
            dlg.queue_existing_directory(paths["books_root"])     # books.addRootFolder
            dlg.queue_open_filenames([paths["books_single_added"]])  # books.addFiles
            dlg.queue_existing_directory(paths["video_root"])     # video.addFolder
            dlg.queue_open_filenames([paths["video_single_added"]])  # video.addFiles

            comics_initial = _call_json(comics, "getState")
            books_initial = _call_json(books, "getState")
            video_initial = _call_json(video, "getState", "{}")

            # Let bootstrap auto-scans settle, then clear logs so fixtures only
            # include deterministic explicit phase operations below.
            _wait_scan_done(comics, is_video=False)
            _wait_scan_done(books, is_video=False)
            _wait_scan_done(video, is_video=True)
            comics_events[:] = []
            books_events[:] = []
            video_events[:] = []

            _call_json(comics, "scan", "{}")
            comics_after_scan = _wait_scan_done(comics, is_video=False)

            _call_json(books, "scan", "{}")
            books_after_scan = _wait_scan_done(books, is_video=False)

            _call_json(video, "scan", "{}")
            video_after_scan = _wait_scan_done(video, is_video=True)

            comics_mutations = {
                "setScanIgnore": _stable_mutation_result(_call_json(comics, "setScanIgnore", json.dumps(["tmp", "cache"]))),
            }
            _wait_scan_done(comics, is_video=False)
            comics_mutations["removeRootFolder"] = _stable_mutation_result(_call_json(comics, "removeRootFolder", str(paths["comics_root"])))
            _wait_scan_done(comics, is_video=False)
            comics_mutations["addRootFolder"] = _stable_mutation_result(_call_json(comics, "addRootFolder"))
            _wait_scan_done(comics, is_video=False)
            comics_lookup = _call_json(comics, "bookFromPath", str(paths["comics_file_1"]))

            books_mutations = {
                "setScanIgnore": _stable_mutation_result(_call_json(books, "setScanIgnore", json.dumps(["samples", "cache"]))),
            }
            _wait_scan_done(books, is_video=False)
            books_mutations["removeRootFolder"] = _stable_mutation_result(_call_json(books, "removeRootFolder", str(paths["books_root"])))
            _wait_scan_done(books, is_video=False)
            books_mutations["addRootFolder"] = _stable_mutation_result(_call_json(books, "addRootFolder"))
            _wait_scan_done(books, is_video=False)
            books_mutations["addFiles"] = _stable_mutation_result(_call_json(books, "addFiles"))
            _wait_scan_done(books, is_video=False)
            books_mutations["removeFile"] = _stable_mutation_result(_call_json(books, "removeFile", str(paths["books_single_added"])))
            _wait_scan_done(books, is_video=False)
            books_lookup = _call_json(books, "bookFromPath", str(paths["books_file_1"]))

            # Ensure we can query by IDs after a completed scan.
            refreshed_video = _call_json(video, "getState", "{}")
            first_show = ""
            first_root = ""
            first_ids = []
            if refreshed_video.get("shows"):
                first_show = str(refreshed_video["shows"][0].get("id") or "")
                first_root = str(refreshed_video["shows"][0].get("rootId") or "")
            if refreshed_video.get("episodes"):
                first_ids = [x.get("id") for x in refreshed_video["episodes"][:2] if x.get("id")]

            video_mutations = {
                "removeFolder": _stable_mutation_result(_call_json(video, "removeFolder", str(paths["video_root"]))),
            }
            _wait_scan_done(video, is_video=True)
            video_mutations["addFolder"] = _stable_mutation_result(_call_json(video, "addFolder"))
            _wait_scan_done(video, is_video=True)
            video_mutations["addShowFolderPath"] = _stable_mutation_result(_call_json(video, "addShowFolderPath", str(paths["video_show_folder"])))
            _wait_scan_done(video, is_video=True)
            video_mutations["addFiles"] = _stable_mutation_result(_call_json(video, "addFiles"))
            _wait_scan_done(video, is_video=True)
            video_mutations["removeFile"] = _stable_mutation_result(_call_json(video, "removeFile", str(paths["video_single_added"])))
            _wait_scan_done(video, is_video=True)

            video_queries = {
                "getEpisodesForShow": _call_json(video, "getEpisodesForShow", first_show) if first_show else {"ok": False, "error": "no_show"},
                "getEpisodesForRoot": _call_json(video, "getEpisodesForRoot", first_root) if first_root else {"ok": False, "error": "no_root"},
                "getEpisodesByIds": _call_json(video, "getEpisodesByIds", json.dumps(first_ids)),
            }

        payload = {
            "meta": {
                "capturedAt": int(time.time() * 1000),
                "workspace": str(WORKSPACE),
                "userData": str(user_data_path),
            },
            "comics": {
                "initialState": comics_initial,
                "afterScan": comics_after_scan,
                "events": comics_events,
                "mutations": comics_mutations,
                "lookup": comics_lookup,
            },
            "books": {
                "initialState": books_initial,
                "afterScan": books_after_scan,
                "events": books_events,
                "mutations": books_mutations,
                "lookup": books_lookup,
            },
            "video": {
                "initialState": video_initial,
                "afterScan": video_after_scan,
                "events": video_events,
                "mutations": video_mutations,
                "queries": video_queries,
            },
        }

        normalized = _normalize(payload, WORKSPACE.resolve(), user_data_path)
        try:
            storage.flush_all_writes()
        except Exception:
            pass
        return normalized


def _write_output(data: Dict[str, Any]):
    FIXTURES_DIR.mkdir(parents=True, exist_ok=True)

    comics = {"meta": data["meta"], "comics": data["comics"]}
    books = {"meta": data["meta"], "books": data["books"]}
    video = {"meta": data["meta"], "video": data["video"]}

    (FIXTURES_DIR / "comics_baseline.json").write_text(json.dumps(comics, indent=2, ensure_ascii=False), encoding="utf-8")
    (FIXTURES_DIR / "books_baseline.json").write_text(json.dumps(books, indent=2, ensure_ascii=False), encoding="utf-8")
    (FIXTURES_DIR / "video_baseline.json").write_text(json.dumps(video, indent=2, ensure_ascii=False), encoding="utf-8")

    manifest = {
        "generatedAtMs": 0,
        "files": [
            "comics_baseline.json",
            "books_baseline.json",
            "video_baseline.json",
        ],
        "notes": [
            "Timestamp-like fields are normalized to keep diffs stable.",
            "Workspace and userData absolute paths are tokenized.",
            "Scan event ordering is recorded through bridge emitter instrumentation.",
        ],
    }
    (FIXTURES_DIR / "baseline_manifest.json").write_text(json.dumps(manifest, indent=2, ensure_ascii=False), encoding="utf-8")


def main():
    data = _capture()
    _write_output(data)
    if WORKSPACE.exists():
        shutil.rmtree(WORKSPACE, ignore_errors=True)
    print("Phase 1 baseline fixtures written to:", FIXTURES_DIR)


if __name__ == "__main__":
    main()
