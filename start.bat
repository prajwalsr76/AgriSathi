@echo off
cd /d "%~dp0"
echo.
echo   AgriSathi is running at  http://localhost:8080
echo   Keep this window open. Press Ctrl+C to stop.
echo.
start "" http://localhost:8080
where python >nul 2>nul && (python -m http.server 8080) || (py -m http.server 8080)
pause
