@echo off
rem Start JollyOS.cmd - double-click this. Plain cmd on purpose: no PowerShell,
rem so no execution-policy prompt, and the bundled Node runtime is the only one
rem used (nothing is installed on this machine).
setlocal
title JollyOS
cd /d "%~dp0"

if not exist "runtime\node.exe" goto :no_runtime
if not exist "app\launcher.mjs" goto :no_app

echo Starting JollyOS. A browser window will open in a moment.
echo Leave this window open while you use JollyOS.
echo.
"runtime\node.exe" "app\launcher.mjs"
set "EXITCODE=%ERRORLEVEL%"
if not "%EXITCODE%"=="0" goto :failed
exit /b 0

:no_runtime
echo Could not find runtime\node.exe next to this file.
echo Extract the whole ZIP first (right-click the ZIP ^> Extract All), then run
echo "Start JollyOS" from the extracted folder - not from inside the ZIP.
goto :pause_exit

:no_app
echo Could not find app\launcher.mjs next to this file.
echo Extract the whole ZIP again and keep every file together.
goto :pause_exit

:failed
echo.
echo JollyOS stopped with an error (code %EXITCODE%).
echo Details are in: data\server.log
goto :pause_exit

:pause_exit
echo.
pause
exit /b 1
