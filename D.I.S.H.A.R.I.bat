@echo off
chcp 65001 >nul
title D.I.S.H.A.R.I - Sundarbans smart trip
color 0B
setlocal

REM ---- where the app is (Desktop\D.I.S.H.A.R.I\DISHARI_Trip, or next to this file)
set "APP=%USERPROFILE%\Desktop\D.I.S.H.A.R.I\DISHARI_Trip"
if not exist "%APP%\package.json" set "APP=%USERPROFILE%\OneDrive\Desktop\D.I.S.H.A.R.I\DISHARI_Trip"
if not exist "%APP%\package.json" set "APP=%~dp0DISHARI_Trip"
if not exist "%APP%\package.json" set "APP=%~dp0D.I.S.H.A.R.I\DISHARI_Trip"
if not exist "%APP%\package.json" set "APP=%~dp0"
if not exist "%APP%\package.json" (
  echo  Could not find the DISHARI_Trip folder.
  echo  Expected: %USERPROFILE%\Desktop\D.I.S.H.A.R.I\DISHARI_Trip
  pause
  exit /b 1
)
cd /d "%APP%"

echo.
echo   ==========================================
echo            D . I . S . H . A . R . I
echo   ==========================================
echo   Sundarbans smart trip
echo.

REM ---- Node.js needed
where node >nul 2>nul
if errorlevel 1 (
  echo  Node.js is not installed. Opening the download page - install the LTS version, then double-click again.
  start "" https://nodejs.org/en/download
  pause
  exit /b 1
)

REM ---- already running? just open it
netstat -ano | findstr ":3100" | findstr "LISTENING" >nul
if not errorlevel 1 (
  echo  Already running - opening the browser...
  start "" http://localhost:3100
  timeout /t 2 >nul
  exit /b 0
)

REM ---- the AI key file (put GEMINI_API_KEY=... in .env once)
if not exist ".env" if exist ".env.example" copy ".env.example" ".env" >nul

REM ---- first time: install
if not exist "node_modules\next" goto install
if not exist "node_modules\fflate" goto install
goto installed
:install
echo  Installing - this takes a few minutes, only the first time...
call npm install
if errorlevel 1 goto installfail
goto installed
:installfail
echo  Install failed - check the internet connection.
pause
exit /b 1
:installed

REM ---- build when there is no build yet, or the code changed after the last build
set "NEED=0"
if not exist "out\index.html" goto build
for /f %%R in ('powershell -NoProfile -Command "$o=(Get-Item 'out\index.html').LastWriteTime; $n=Get-ChildItem -Path 'src','public','server.mjs' -Recurse -File -ErrorAction SilentlyContinue | Where-Object { $_.LastWriteTime -gt $o } | Select-Object -First 1; if ($n) { 1 } else { 0 }"') do set "NEED=%%R"
if "%NEED%"=="1" goto build
goto run

:build
echo  Building the site - about a minute...
call npm run build
if errorlevel 1 goto buildfail
goto run

:buildfail
echo  Build failed.
pause
exit /b 1

:run
REM ---- open the browser in 2 seconds, then run the server (close this window to stop D.I.S.H.A.R.I)
start "" powershell -NoProfile -WindowStyle Hidden -Command "Start-Sleep -Seconds 2; Start-Process 'http://localhost:3100'"
echo  D.I.S.H.A.R.I is starting at http://localhost:3100
echo  Keep this window open while you use it. Close it to stop.
echo.
node server.mjs
pause
