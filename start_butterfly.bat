@echo off
setlocal

cd /d "%~dp0"

set "PYTHON_EXE="
if exist ".venv\Scripts\python.exe" set "PYTHON_EXE=.venv\Scripts\python.exe"
if not defined PYTHON_EXE if exist "venv\Scripts\python.exe" set "PYTHON_EXE=venv\Scripts\python.exe"

if not defined PYTHON_EXE (
  where py >nul 2>nul
  if %ERRORLEVEL% EQU 0 (
    py -3 "projectbutterfly\app.py" %*
    exit /b %ERRORLEVEL%
  )

  where python >nul 2>nul
  if %ERRORLEVEL% EQU 0 (
    python "projectbutterfly\app.py" %*
    exit /b %ERRORLEVEL%
  )

  echo [butterfly] Python was not found. Install Python 3 or create a local venv.
  exit /b 1
)

"%PYTHON_EXE%" "projectbutterfly\app.py" %*
exit /b %ERRORLEVEL%
