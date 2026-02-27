"""
Project Butterfly — Storage Library

Faithful port of main/lib/storage.js.
Centralized JSON persistence with atomic writes, .bak fallback, and debounced writes.

Rules (inherited from Build 78A):
- File names, paths, merge logic, debounce timing MUST match the JS version exactly
- All behavior preserved: .tmp+rename atomic writes, .bak last-known-good, 3x retry
"""

import json
import os
import time
import threading
from pathlib import Path
from typing import Any

# ========== DATA PATH ==========

_user_data_dir: str | None = None


def init_data_dir(path: str):
    """
    Set the userData directory. Must be called once at app startup.
    Qt equivalent of Electron's app.getPath('userData').
    Typically: QStandardPaths.writableLocation(QStandardPaths.AppDataLocation)
    """
    global _user_data_dir
    _user_data_dir = path
    os.makedirs(path, exist_ok=True)


def data_path(file: str) -> str:
    """Build file path in app's userData directory."""
    if _user_data_dir is None:
        raise RuntimeError("storage.init_data_dir() must be called before data_path()")
    return os.path.join(_user_data_dir, file)


# ========== JSON I/O ==========


def read_json(p: str, fallback: Any = None) -> Any:
    """
    Read JSON file safely with fallback.
    On failure, attempts .bak restore (last-known-good backup).
    """
    bak_path = f"{p}.bak"
    try:
        with open(p, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        # Attempt last-known-good backup restore
        try:
            with open(bak_path, "r", encoding="utf-8") as f:
                bak = json.load(f)
            try:
                write_json_sync(p, bak)
            except Exception:
                pass
            return bak
        except Exception:
            return fallback


async def read_json_async(p: str, fallback: Any = None) -> Any:
    """
    Async version of read_json. Runs file I/O in a thread to avoid blocking.
    Mirrors read_json semantics: primary file first, then .bak fallback.
    """
    import asyncio
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, read_json, p, fallback)


def write_json_sync(p: str, obj: Any):
    """
    Synchronous atomic JSON write with retry logic.
    Used internally by read_json for .bak restore, and by debounce flush.
    """
    start = time.monotonic()
    os.makedirs(os.path.dirname(p), exist_ok=True)

    json_str = json.dumps(obj, indent=2, ensure_ascii=False)
    dir_name = os.path.dirname(p)
    base_name = os.path.basename(p)
    tmp = os.path.join(dir_name, f".{base_name}.{os.getpid()}.{int(time.time() * 1000)}.tmp")
    bak_path = f"{p}.bak"

    retries = 3
    while retries > 0:
        try:
            # Write temp file
            with open(tmp, "w", encoding="utf-8") as f:
                f.write(json_str)

            # Replace target (prefer atomic rename)
            try:
                os.replace(tmp, p)
            except OSError:
                # Fallback: copy + unlink
                try:
                    import shutil
                    shutil.copy2(tmp, p)
                except Exception:
                    pass
                try:
                    os.unlink(tmp)
                except Exception:
                    pass

            # Update last-known-good backup
            try:
                import shutil
                shutil.copy2(p, bak_path)
            except Exception:
                pass

            # Log slow writes
            duration_ms = (time.monotonic() - start) * 1000
            if duration_ms > 10:
                print(f"[PERF] write_json({base_name}): {duration_ms:.0f}ms")

            return  # Success
        except Exception as error:
            retries -= 1
            if retries == 0:
                raise error
            time.sleep(0.05)


async def write_json(p: str, obj: Any):
    """
    Async atomic JSON write. Runs the sync version in a thread.
    """
    import asyncio
    loop = asyncio.get_event_loop()
    await loop.run_in_executor(None, write_json_sync, p, obj)


# ========== DEBOUNCED WRITES ==========

_debounced_lock = threading.Lock()
_debounced_writes: dict[str, dict] = {}


def write_json_debounced(p: str, obj: Any, delay_ms: int = 150):
    """
    Write JSON with debounce to reduce disk churn.
    Preserves exact delay and flush behavior from Build 77.
    """
    with _debounced_lock:
        prev = _debounced_writes.get(p)
        if prev and prev.get("timer"):
            prev["timer"].cancel()

        timer = threading.Timer(delay_ms / 1000.0, _flush_single, args=(p,))
        _debounced_writes[p] = {"latest_obj": obj, "timer": timer}
        timer.start()


def _flush_single(p: str):
    """Flush a single debounced write."""
    with _debounced_lock:
        entry = _debounced_writes.pop(p, None)
    if entry is None:
        return
    try:
        write_json_sync(p, entry["latest_obj"])
    except Exception:
        pass


def flush_all_writes():
    """
    Flush all pending debounced writes immediately.
    Used during app shutdown or critical save points.
    """
    with _debounced_lock:
        entries = dict(_debounced_writes)
        for entry in entries.values():
            timer = entry.get("timer")
            if timer:
                timer.cancel()
        _debounced_writes.clear()

    for p, entry in entries.items():
        try:
            write_json_sync(p, entry["latest_obj"])
        except Exception:
            pass
