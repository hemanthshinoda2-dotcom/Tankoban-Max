"""
Chromium host manager for TankoBrowser.

Engine order:
1) CEF host process (cefpython3) for true Chromium host runtime.
2) Native Chromium-family executable fallback (Chrome/Chromium/Edge).
"""

from __future__ import annotations

import os
import subprocess
import sys
import threading
from pathlib import Path


class ChromiumHostManager:
    def __init__(self, project_root: Path, icon_path: Path | None = None):
        self._project_root = Path(project_root)
        self._icon_path = Path(icon_path) if icon_path else None
        self._proc: subprocess.Popen | None = None
        self._lock = threading.Lock()

    def launch(self, start_url: str, profile_dir: str, title: str = "TankoBrowser") -> dict:
        with self._lock:
            if self._proc is not None:
                try:
                    if self._proc.poll() is None:
                        return {"ok": True, "alreadyRunning": True}
                except Exception:
                    pass
                self._proc = None

            engine = str(os.environ.get("TANKO_BROWSER_ENGINE", "cef") or "cef").strip().lower()
            if engine not in ("cef", "chromium"):
                engine = "cef"

            if engine == "cef":
                out = self._launch_cef(start_url=start_url, profile_dir=profile_dir, title=title)
                if out.get("ok"):
                    return out
                if os.environ.get("TANKO_BROWSER_CEF_STRICT", "").strip() == "1":
                    return out

            return self._launch_native_chromium(start_url=start_url, profile_dir=profile_dir)

    def _spawn_detached(self, argv: list[str], cwd: Path | None = None) -> subprocess.Popen:
        kwargs = {
            "stdin": subprocess.DEVNULL,
            "stdout": subprocess.DEVNULL,
            "stderr": subprocess.DEVNULL,
            "cwd": str(cwd) if cwd else None,
        }
        if sys.platform == "win32":
            flags = getattr(subprocess, "DETACHED_PROCESS", 0) | getattr(subprocess, "CREATE_NEW_PROCESS_GROUP", 0)
            kwargs["creationflags"] = flags
        return subprocess.Popen(argv, **kwargs)

    def _launch_cef(self, start_url: str, profile_dir: str, title: str) -> dict:
        runner = self._project_root / "projectbutterfly" / "chromium_host_process.py"
        if not runner.is_file():
            return {"ok": False, "error": f"CEF runner missing: {runner}"}

        argv = [
            sys.executable,
            str(runner),
            "--url",
            str(start_url or "https://yandex.com"),
            "--profile-dir",
            str(profile_dir or ""),
            "--title",
            str(title or "TankoBrowser"),
        ]
        if self._icon_path and self._icon_path.is_file():
            argv.extend(["--icon", str(self._icon_path)])

        try:
            self._proc = self._spawn_detached(argv, cwd=self._project_root)
            return {
                "ok": True,
                "launcher": "cef_host",
                "path": str(runner),
                "url": str(start_url or ""),
            }
        except Exception as e:
            return {"ok": False, "error": f"Failed to launch CEF host: {e}"}

    def _launch_native_chromium(self, start_url: str, profile_dir: str) -> dict:
        chromium_exe = self._resolve_chromium_executable()
        if not chromium_exe:
            return {"ok": False, "error": "Chromium executable not found. Set TANKO_CHROMIUM_EXE."}

        argv = [
            chromium_exe,
            f"--user-data-dir={profile_dir}",
            "--profile-directory=Default",
            "--new-window",
            "--start-maximized",
            "--no-first-run",
            "--no-default-browser-check",
            str(start_url or "https://yandex.com"),
        ]
        try:
            self._proc = self._spawn_detached(argv, cwd=Path(chromium_exe).parent)
            return {
                "ok": True,
                "launcher": "chromium",
                "path": chromium_exe,
                "url": str(start_url or ""),
            }
        except Exception as e:
            return {"ok": False, "error": f"Failed to launch Chromium: {e}"}

    @staticmethod
    def _resolve_chromium_executable() -> str | None:
        env_exe = str(os.environ.get("TANKO_CHROMIUM_EXE", "") or "").strip()
        candidates: list[str] = []
        if env_exe:
            candidates.append(env_exe)
        pf = str(os.environ.get("ProgramFiles", "") or "").strip()
        pfx86 = str(os.environ.get("ProgramFiles(x86)", "") or "").strip()
        local_app = str(os.environ.get("LOCALAPPDATA", "") or "").strip()
        if pf:
            candidates.extend([
                os.path.join(pf, "Chromium", "Application", "chrome.exe"),
                os.path.join(pf, "Google", "Chrome", "Application", "chrome.exe"),
                os.path.join(pf, "Microsoft", "Edge", "Application", "msedge.exe"),
            ])
        if pfx86:
            candidates.extend([
                os.path.join(pfx86, "Chromium", "Application", "chrome.exe"),
                os.path.join(pfx86, "Google", "Chrome", "Application", "chrome.exe"),
                os.path.join(pfx86, "Microsoft", "Edge", "Application", "msedge.exe"),
            ])
        if local_app:
            candidates.extend([
                os.path.join(local_app, "Chromium", "Application", "chrome.exe"),
                os.path.join(local_app, "Google", "Chrome", "Application", "chrome.exe"),
                os.path.join(local_app, "Microsoft", "Edge", "Application", "msedge.exe"),
            ])

        for c in candidates:
            try:
                if c and Path(c).is_file():
                    return c
            except Exception:
                continue
        return None
