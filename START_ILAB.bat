@echo off
title i Lab Gampaha - Production Server
color 0A

echo ================================================
echo   i Lab Gampaha Production Tracking System
echo   Starting all services... please wait
echo ================================================
echo.

echo [1/3] Starting Backend API on port 8000...
start "iLab-Backend" cmd /k "cd /d C:\ilab-server\backend && venv\Scripts\python.exe -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload"
timeout /t 5 /nobreak >nul

echo [2/3] Starting ngrok tunnel...
start "iLab-ngrok" cmd /k "ngrok http --domain=hunger-unfounded-trimness.ngrok-free.dev 8000"
timeout /t 5 /nobreak >nul

echo [3/3] Starting Frontend on port 3000...
start "iLab-Frontend" cmd /k "cd /d C:\ilab-server\frontend && npx serve -s dist -l 3000"
timeout /t 2 /nobreak >nul

echo.
echo ================================================
echo  ALL SERVICES STARTED!
echo.
echo  This PC (Entry/Dashboard): http://localhost:3000
echo  External Access:           https://hunger-unfounded-trimness.ngrok-free.dev
echo ================================================
pause