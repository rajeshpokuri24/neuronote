@echo off
echo Starting NeuroNote...
echo.
echo [1/2] Starting Backend (port 5000)...
start cmd /k "cd /d %~dp0backend && npm.cmd run dev"
timeout /t 3 /nobreak > nul
echo [2/2] Starting Frontend (port 5173)...
start cmd /k "cd /d %~dp0frontend && npm.cmd run dev"
timeout /t 3 /nobreak > nul
echo.
echo NeuroNote is starting!
echo Frontend: http://localhost:5173
echo Backend:  http://localhost:5000
echo.
pause
