"""Shared constants and helpers for Qt library route domains."""

from __future__ import annotations

import base64
import hashlib
import os


DEFAULT_SCAN_IGNORE_DIRNAMES = frozenset({
    "__macosx", "node_modules", ".git", ".svn", ".hg",
    "@eadir", "$recycle.bin", "system volume information",
})

COMIC_EXTENSIONS = frozenset({".cbz", ".cbr", ".pdf", ".zip", ".rar", ".cb7", ".7z"})
BOOK_EXTENSIONS = frozenset({".epub", ".pdf", ".txt", ".mobi", ".fb2"})
VIDEO_EXTENSIONS = frozenset({".mp4", ".mkv", ".avi", ".mov", ".webm", ".m4v", ".mpg", ".mpeg", ".ts"})

LIBRARY_CONFIG_FILE = "library_state.json"
LIBRARY_INDEX_FILE = "library_index.json"
BOOKS_CONFIG_FILE = "books_library_state.json"
BOOKS_INDEX_FILE = "books_library_index.json"
VIDEO_INDEX_FILE = "video_index.json"


def path_key(p: str) -> str:
    return os.path.normpath(os.path.abspath(str(p or ""))).lower()


def uniq_paths(paths):
    seen = set()
    out = []
    for p in paths or []:
        if not p:
            continue
        k = path_key(p)
        if k in seen:
            continue
        seen.add(k)
        out.append(str(p).strip())
    return out


def sanitize_ignore(patterns, max_count: int = 200):
    if not isinstance(patterns, list):
        return []
    seen = set()
    out = []
    for p in patterns:
        s = str(p or "").strip().lower()
        if not s or s in seen:
            continue
        seen.add(s)
        out.append(s)
        if len(out) >= max_count:
            break
    return out


def b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).decode("ascii").rstrip("=")


def safe_b64_decode(s: str) -> str:
    try:
        padded = s + "=" * (4 - len(s) % 4) if len(s) % 4 else s
        return base64.urlsafe_b64decode(padded).decode("utf-8", errors="replace")
    except Exception:
        return ""


def series_id_for_folder(folder_path: str) -> str:
    return b64url(str(folder_path or "").encode("utf-8"))


def book_id_for_path(file_path: str, size: int, mtime_ms: int) -> str:
    raw = "{}::{}::{}".format(str(file_path or ""), int(size or 0), int(mtime_ms or 0))
    return b64url(raw.encode("utf-8"))


def sha1_b64url(raw: str) -> str:
    return b64url(hashlib.sha1(raw.encode("utf-8")).digest())


def video_root_id(path: str) -> str:
    return b64url(str(path or "").encode("utf-8"))


def _js_num_str(val: float) -> str:
    if val == int(val):
        return str(int(val))
    return repr(val)


def video_episode_id(file_path: str, size: int, mtime_ms: float) -> str:
    raw = "{}::{}::{}".format(str(file_path or ""), int(size or 0), _js_num_str(float(mtime_ms or 0)))
    return sha1_b64url(raw)


def video_folder_key(show_id: str, folder_rel_path: str) -> str:
    return sha1_b64url("{}::{}".format(str(show_id or ""), str(folder_rel_path or "")))


def loose_show_id(root_path: str) -> str:
    return sha1_b64url("{}::LOOSE_FILES".format(str(root_path or "")))


def list_immediate_subdirs(root_folder: str):
    try:
        entries = os.listdir(root_folder)
    except OSError:
        return []
    out = []
    for e in sorted(entries):
        if e.startswith("."):
            continue
        fp = os.path.join(root_folder, e)
        try:
            if os.path.isdir(fp):
                out.append(fp)
        except OSError:
            continue
    return out


def should_ignore_dir(dirname: str, ignore_dirnames, ignore_substrings):
    lower = str(dirname or "").lower()
    if lower in ignore_dirnames:
        return True
    for sub in ignore_substrings or []:
        if sub in lower:
            return True
    return False


def is_path_within(parent: str, target: str):
    try:
        p = os.path.normpath(os.path.abspath(str(parent or ""))).lower()
        t = os.path.normpath(os.path.abspath(str(target or ""))).lower()
        return t.startswith(p + os.sep) or t == p
    except Exception:
        return False

