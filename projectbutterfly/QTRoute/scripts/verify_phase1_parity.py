"""
Verify current bridge outputs match stored Phase 1 baseline fixtures.

This script is non-destructive:
1. Captures current normalized snapshots in memory.
2. Loads committed fixture files.
3. Compares payload equality and prints compact diffs on mismatch.
"""

from __future__ import annotations

import difflib
import json
import shutil
from typing import Any, Dict, List, Tuple

import capture_phase1_baseline as capture


def _split_payload(data: Dict[str, Any]) -> Dict[str, Dict[str, Any]]:
    return {
        "comics_baseline.json": {"meta": data["meta"], "comics": data["comics"]},
        "books_baseline.json": {"meta": data["meta"], "books": data["books"]},
        "video_baseline.json": {"meta": data["meta"], "video": data["video"]},
    }


def _render_diff(expected: Dict[str, Any], actual: Dict[str, Any], max_lines: int = 140) -> str:
    expected_text = json.dumps(expected, indent=2, sort_keys=True, ensure_ascii=False).splitlines()
    actual_text = json.dumps(actual, indent=2, sort_keys=True, ensure_ascii=False).splitlines()
    lines = list(difflib.unified_diff(expected_text, actual_text, fromfile="fixture", tofile="captured", lineterm=""))
    if len(lines) > max_lines:
        lines = lines[:max_lines] + ["... (diff truncated)"]
    return "\n".join(lines)


def _load_fixture(path: Path) -> Dict[str, Any] | None:
    if not path.exists():
        return None
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return None


def _compare() -> Tuple[bool, List[str]]:
    captured = capture._capture()
    expected_by_file = _split_payload(captured)
    errors: List[str] = []

    for file_name, current_payload in expected_by_file.items():
        fixture_path = capture.FIXTURES_DIR / file_name
        fixture_payload = _load_fixture(fixture_path)
        if fixture_payload is None:
            errors.append(f"[missing-or-invalid] {fixture_path}")
            continue
        if fixture_payload != current_payload:
            diff = _render_diff(fixture_payload, current_payload)
            errors.append(f"[mismatch] {fixture_path}\n{diff}")

    return (len(errors) == 0, errors)


def main() -> int:
    ok, errors = _compare()
    try:
        if capture.WORKSPACE.exists():
            shutil.rmtree(capture.WORKSPACE, ignore_errors=True)
    except Exception:
        pass

    if not ok:
        print("Phase 1 parity check failed.")
        for e in errors:
            print("")
            print(e)
        return 1

    print("Phase 1 parity check passed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
