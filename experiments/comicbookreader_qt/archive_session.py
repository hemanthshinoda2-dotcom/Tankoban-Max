import os
import re
import zipfile
import threading
from collections import OrderedDict

from constants import MAX_ARCHIVE_SESSIONS, SUPPORTED_IMAGE_EXTENSIONS

try:
    import rarfile
except Exception:
    rarfile = None


def _natural_key(value: str):
    parts = re.split(r"(\d+)", value.lower())
    key = []
    for part in parts:
        if part.isdigit():
            key.append(int(part))
        else:
            key.append(part)
    return key


def _is_image_entry(name: str) -> bool:
    if not name:
        return False
    if name.endswith("/"):
        return False
    _, ext = os.path.splitext(name.lower())
    return ext in SUPPORTED_IMAGE_EXTENSIONS


class ArchiveSession:
    def __init__(self, path: str):
        self.path = path
        self._archive = None
        self._archive_type = ""
        self._entries = []
        self._read_lock = threading.Lock()
        self._open()

    @property
    def entries(self):
        return self._entries

    def _open(self):
        ext = os.path.splitext(self.path)[1].lower()
        if ext in (".cbz", ".zip"):
            self._archive_type = "zip"
            self._archive = zipfile.ZipFile(self.path, "r")
            names = self._archive.namelist()
        elif ext in (".cbr", ".rar"):
            if rarfile is None:
                raise RuntimeError("CBR support requires the 'rarfile' package.")
            self._archive_type = "rar"
            self._archive = rarfile.RarFile(self.path, "r")
            names = self._archive.namelist()
        else:
            raise RuntimeError(f"Unsupported archive extension: {ext}")

        filtered = [name for name in names if _is_image_entry(name)]
        filtered.sort(key=_natural_key)
        if not filtered:
            raise RuntimeError("No image pages found in archive.")
        self._entries = filtered

    def get_page_bytes(self, index: int) -> bytes:
        if index < 0 or index >= len(self._entries):
            raise IndexError(f"Page index out of range: {index}")
        entry_name = self._entries[index]
        with self._read_lock:
            return self._archive.read(entry_name)

    def close(self):
        if self._archive is not None:
            try:
                self._archive.close()
            except Exception:
                pass
            self._archive = None


class ArchiveSessionManager:
    def __init__(self, max_sessions: int = MAX_ARCHIVE_SESSIONS):
        self.max_sessions = max(1, int(max_sessions))
        self._sessions = OrderedDict()

    def open(self, path: str) -> ArchiveSession:
        norm_path = os.path.abspath(path)
        existing = self._sessions.get(norm_path)
        if existing is not None:
            self._sessions.move_to_end(norm_path)
            return existing

        session = ArchiveSession(norm_path)
        self._sessions[norm_path] = session
        self._sessions.move_to_end(norm_path)
        self._evict_if_needed()
        return session

    def _evict_if_needed(self):
        while len(self._sessions) > self.max_sessions:
            _, session = self._sessions.popitem(last=False)
            try:
                session.close()
            except Exception:
                pass

    def close_all(self):
        for session in list(self._sessions.values()):
            try:
                session.close()
            except Exception:
                pass
        self._sessions.clear()
