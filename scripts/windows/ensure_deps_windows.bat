@echo off
setlocal

REM === ensure_deps_windows.bat ===
REM Ensures all runtime dependencies are present before app launch or build.
REM Called by npm prestart / predist / prepack hooks.

set "ROOT=%~dp0..\.."

REM --- Step 1: MPV runtime (required — core video playback) ---
echo [deps] Checking MPV runtime...
call "%~dp0ensure_mpv_windows.bat"
if errorlevel 1 (
    echo [deps] ERROR: MPV setup failed.
    exit /b 1
)

REM --- Step 2: Tor runtime (optional — privacy-routed browsing) ---
echo [deps] Checking Tor runtime...
set "TOR_EXE=%ROOT%\resources\tor\windows\tor.exe"
if exist "%TOR_EXE%" (
    echo [deps] Tor runtime already present.
) else (
    echo [deps] Downloading Tor runtime...
    node "%ROOT%\tools\fetch_tor.js"
    if errorlevel 1 (
        echo [deps] WARNING: Tor download failed. Tor features will be unavailable.
        echo [deps] You can retry manually: node tools/fetch_tor.js
    )
)

echo [deps] All dependency checks complete.
endlocal
exit /b 0
