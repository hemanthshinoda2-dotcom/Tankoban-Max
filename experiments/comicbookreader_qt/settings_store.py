import json
import os
import time
from pathlib import Path
from threading import Lock, Timer


_write_lock = Lock()
_debounced = {}


def _atomic_write_json(path: str, data: dict):
    payload = json.dumps(data, indent=2, ensure_ascii=False)
    p = Path(path)
    p.parent.mkdir(parents=True, exist_ok=True)
    tmp = p.parent / f".{p.name}.{os.getpid()}.{int(time.time() * 1000)}.tmp"
    bak = Path(f"{path}.bak")

    with open(tmp, "w", encoding="utf-8") as f:
        f.write(payload)
    os.replace(str(tmp), str(p))
    try:
        import shutil
        shutil.copy2(str(p), str(bak))
    except Exception:
        pass


def read_json(path: str, fallback=None):
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        try:
            with open(f"{path}.bak", "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            return fallback


def write_json(path: str, data: dict):
    with _write_lock:
        _atomic_write_json(path, data)


def write_json_debounced(path: str, data: dict, delay_ms: int = 150):
    with _write_lock:
        old = _debounced.get(path)
        if old and old.get("timer"):
            old["timer"].cancel()

        def _flush():
            with _write_lock:
                item = _debounced.pop(path, None)
            if item is None:
                return
            try:
                _atomic_write_json(path, item["data"])
            except Exception:
                pass

        timer = Timer(delay_ms / 1000.0, _flush)
        _debounced[path] = {"data": data, "timer": timer}
        timer.start()


def flush_all():
    with _write_lock:
        items = dict(_debounced)
        _debounced.clear()
    for path, value in items.items():
        timer = value.get("timer")
        if timer:
            timer.cancel()
        try:
            _atomic_write_json(path, value["data"])
        except Exception:
            pass
