@echo off
title Fleet Command Launcher
echo ========================================================
echo   STARTING FLEET COMMAND (BACKEND + DASHBOARD)
echo ========================================================
echo.

:: Get current Local IP address
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /c:"IPv4 Address"') do (
    set IP=%%a
    goto :found_ip
)
:found_ip
:: Remove leading spaces
set IP=%IP: =%

echo Your Current PC IP Address is: %IP%
echo In your Android phone app, set the endpoint to:
echo    http://%IP%:3000/api/telemetry
echo ========================================================
echo.

:: Start Backend in a new window
start "Fleet Command - Backend API (:3000)" cmd /k "cd /d D:\Desktop\TRACER && node server.js"

:: Start Frontend in a new window
start "Fleet Command - Web Dashboard (:5175)" cmd /k "cd /d D:\Desktop\TRACER\frontend && npm run dev"

echo Both servers launched in separate windows!
echo Dashboard URL: http://localhost:5175
echo.
pause
