"""
Standalone CEF host process for TankoBrowser.

Requires `cefpython3` installed in the Python environment.
"""

from __future__ import annotations

import argparse
import ctypes
import os
import sys


def _set_app_id(app_id: str) -> None:
    if sys.platform != "win32":
        return
    try:
        ctypes.windll.shell32.SetCurrentProcessExplicitAppUserModelID(str(app_id))
    except Exception:
        pass


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--url", default="https://yandex.com")
    parser.add_argument("--profile-dir", default="")
    parser.add_argument("--title", default="TankoBrowser")
    parser.add_argument("--icon", default="")
    args = parser.parse_args()

    _set_app_id("Tankoban.TankoBrowser")

    try:
        from cefpython3 import cefpython as cef
    except Exception as e:
        print(f"[chromium-host] cefpython3 unavailable: {e}", file=sys.stderr)
        return 42

    settings = {
        "persist_session_cookies": True,
        "persist_user_preferences": True,
    }
    profile_dir = str(args.profile_dir or "").strip()
    if profile_dir:
        try:
            os.makedirs(profile_dir, exist_ok=True)
            settings["cache_path"] = profile_dir
        except Exception:
            pass

    switches = {
        "disable-features": "RendererCodeIntegrity",
    }

    try:
        cef.Initialize(settings=settings, switches=switches)
        cef.CreateBrowserSync(
            url=str(args.url or "https://yandex.com"),
            window_title=str(args.title or "TankoBrowser"),
        )
        cef.MessageLoop()
        cef.Shutdown()
        return 0
    except Exception as e:
        try:
            cef.Shutdown()
        except Exception:
            pass
        print(f"[chromium-host] runtime error: {e}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
