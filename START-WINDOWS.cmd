@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Install Node.js 22 LTS or newer, then reopen this file.
  pause
  exit /b 1
)
set "HOST=127.0.0.1"
set "PORT=4173"
echo Open http://127.0.0.1:4173/ in your browser once the server starts.
node scripts\serve.mjs
if errorlevel 1 pause
