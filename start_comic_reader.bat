@echo off
setlocal

cd /d "%~dp0"

set "PYTHON_EXE="
if exist ".venv\Scripts\python.exe" set "PYTHON_EXE=.venv\Scripts\python.exe"
if not defined PYTHON_EXE if exist "venv\Scripts\python.exe" set "PYTHON_EXE=venv\Scripts\python.exe"

if defined PYTHON_EXE goto :run_python

where py >nul 2>nul && (
  py -3 "comicbookreaderQT\launcher.py" %*
  exit /b
)

where python >nul 2>nul && (
  python "comicbookreaderQT\launcher.py" %*
  exit /b
)

echo [comic-reader] Python was not found. Install Python 3 or create a local venv.
exit /b 1

:run_python
"%PYTHON_EXE%" "comicbookreaderQT\launcher.py" %*
exit /b
