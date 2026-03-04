@echo off
setlocal
cd /d "%~dp0\..\.."
if not exist "node_modules" (
  echo [electron_legacy] Installing npm dependencies...
  call npm.cmd install
  if errorlevel 1 exit /b 1
)
call npx electron runtime/electron_legacy/main.js %*
endlocal
