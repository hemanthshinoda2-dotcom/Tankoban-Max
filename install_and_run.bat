@echo off
setlocal EnableExtensions
cd /d "%~dp0"

set "NO_RUN=0"
if /I "%~1"=="--no-run" set "NO_RUN=1"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed or not on PATH.
  exit /b 1
)

where npm >nul 2>nul
if errorlevel 1 (
  echo npm is not installed or not on PATH.
  exit /b 1
)

if not exist "node_modules" (
  echo Installing dependencies...
  if exist package-lock.json (
    call npm.cmd ci
    if errorlevel 1 (
      echo npm ci failed. Falling back to npm install...
      call npm.cmd install
    )
  ) else (
    call npm.cmd install
  )
  if errorlevel 1 (
    echo Dependency install failed.
    exit /b 1
  )
) else (
  echo Dependencies already installed. Skipping npm install.
)

if "%NO_RUN%"=="1" (
  echo Setup complete.
  endlocal & exit /b 0
)

echo Launching Tankoban Max...
call npm.cmd start
set "EXIT_CODE=%ERRORLEVEL%"
endlocal & exit /b %EXIT_CODE%
