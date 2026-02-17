@echo off
setlocal EnableExtensions
cd /d "%~dp0"

call "%~dp0install_and_run.bat" --no-run
if errorlevel 1 exit /b 1

echo Building portable folder...
call npm.cmd run pack:folder
if errorlevel 1 (
  echo Portable folder build failed.
  exit /b 1
)

set "EXE_PATH=dist\Tankoban Max-win32-x64\Tankoban Max.exe"
if not exist "%EXE_PATH%" (
  echo Portable executable not found: %EXE_PATH%
  exit /b 1
)

echo Launching portable build...
start "" "%CD%\%EXE_PATH%"
endlocal & exit /b 0
