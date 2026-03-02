@echo off
setlocal

cd /d "%~dp0"

:: Ensure torrent dependencies (qBittorrent + Prowlarr) are downloaded
set "NEED_TORRENT_DEPS=0"
if not exist "resources\qbittorrent\qbittorrent.exe" set "NEED_TORRENT_DEPS=1"
if not exist "resources\prowlarr\Prowlarr.exe" set "NEED_TORRENT_DEPS=1"
if "%NEED_TORRENT_DEPS%"=="1" (
  echo [butterfly] Downloading torrent dependencies...
  powershell -ExecutionPolicy Bypass -File "scripts\windows\ensure_torrent_deps.ps1" || echo [butterfly] Torrent deps download failed, continuing anyway...
)

:: Reset ERRORLEVEL so the powershell exit code doesn't pollute later checks
cmd /c "exit /b 0"

set "PYTHON_EXE="
if exist ".venv\Scripts\python.exe" set "PYTHON_EXE=.venv\Scripts\python.exe"
if not defined PYTHON_EXE if exist "venv\Scripts\python.exe" set "PYTHON_EXE=venv\Scripts\python.exe"

if defined PYTHON_EXE goto :run_python

:: No venv found — try system Python via 'py' or 'python'
where py >nul 2>nul && (
  py -3 "projectbutterfly\app.py" %*
  exit /b
)

where python >nul 2>nul && (
  python "projectbutterfly\app.py" %*
  exit /b
)

echo [butterfly] Python was not found. Install Python 3 or create a local venv.
exit /b 1

:run_python
"%PYTHON_EXE%" "projectbutterfly\app.py" %*
exit /b
