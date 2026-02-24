@echo off
setlocal

REM Holy Grail native addon build script.
REM The project path may contain apostrophes, so we build in a safe path.

set "ROOT=%~dp0.."
set "SRC=%ROOT%\native\holy_grail"
set "BUILD=D:\hg-build\holy_grail"
set "ELECTRON_VER="

pushd "%ROOT%" >nul 2>&1
for /f "delims=" %%i in ('node -e "const p=require('./node_modules/electron/package.json');console.log(p.version)"') do set "ELECTRON_VER=%%i"
popd >nul 2>&1

if "%ELECTRON_VER%"=="" (
    echo ERROR: Could not determine Electron version
    exit /b 1
)

echo Electron version: %ELECTRON_VER%

if exist "%BUILD%" rmdir /s /q "%BUILD%"
mkdir "%BUILD%"
xcopy /s /e /i /q "%SRC%\*" "%BUILD%\" >nul

cd /d "%BUILD%"
call npm install --ignore-scripts --no-audit --no-fund

echo Building native addon for Electron %ELECTRON_VER%...
call npx @electron/rebuild -v %ELECTRON_VER% -m .
if errorlevel 1 (
    echo BUILD FAILED
    exit /b 1
)

if not exist "%BUILD%\build\Release\holy_grail.node" (
    echo ERROR: build output missing: %BUILD%\build\Release\holy_grail.node
    exit /b 1
)

if not exist "%SRC%\build\Release" mkdir "%SRC%\build\Release"
copy /y "%BUILD%\build\Release\holy_grail.node" "%SRC%\build\Release\holy_grail.node" >nul

echo.
echo BUILD SUCCEEDED: %SRC%\build\Release\holy_grail.node
