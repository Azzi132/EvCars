@echo off
setlocal

set "ROOT=%~dp0"

echo Starting backend...
start "EvCars Backend" cmd /k "cd /d "%ROOT%backend" && npm start"

echo Starting frontend (Expo)...
start "EvCars Frontend" cmd /k "cd /d "%ROOT%" && npm start"

echo.
echo Both servers launched in separate windows.
echo Close those windows to stop the servers.
endlocal
