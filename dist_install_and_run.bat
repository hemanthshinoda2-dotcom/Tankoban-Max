@echo off
setlocal EnableExtensions
cd /d "%~dp0"

call "%~dp0install_and_run.bat" --no-run
if errorlevel 1 exit /b 1

echo Building installer (slow path)...
call npm.cmd run dist
if errorlevel 1 (
  echo Installer build failed.
  exit /b 1
)

set "INSTALLER_PATH="
for /f "usebackq delims=" %%I in (`powershell -NoProfile -ExecutionPolicy Bypass -Command "(Get-ChildItem -Path 'dist' -Filter 'Tankoban Max-Setup-*.exe' | Sort-Object LastWriteTime -Descending | Select-Object -First 1 -ExpandProperty FullName)"`) do set "INSTALLER_PATH=%%I"

if not defined INSTALLER_PATH (
  echo Could not find installer in dist\.
  exit /b 1
)

echo Running installer:
echo %INSTALLER_PATH%
start /wait "" "%INSTALLER_PATH%"

if exist "%ProgramFiles%\Tankoban Max\Tankoban Max.exe" (
  start "" "%ProgramFiles%\Tankoban Max\Tankoban Max.exe"
  endlocal & exit /b 0
)
if exist "%ProgramFiles(x86)%\Tankoban Max\Tankoban Max.exe" (
  start "" "%ProgramFiles(x86)%\Tankoban Max\Tankoban Max.exe"
  endlocal & exit /b 0
)

echo Install completed. App path could not be auto-detected.
echo Open Tankoban Max from Start menu.
endlocal & exit /b 0
