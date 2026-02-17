@echo off
setlocal
cd /d "%~dp0"

REM Legacy alias. Use run_portable.bat for build+run.
call "%~dp0run_portable.bat"
set "EXIT_CODE=%ERRORLEVEL%"
endlocal & exit /b %EXIT_CODE%
