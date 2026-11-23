@echo off
setlocal
cd /d "%~dp0"
if not exist "dist\index.html" (
  echo Use the prebuilt release ZIP, or run npm ci and npm run build from this source checkout.
  pause
  exit /b 1
)
if exist "delivery\dockcheck-windows-amd64.exe" (
  echo DockCheck will open at http://127.0.0.1:4173/ . Close this window to stop it.
  "delivery\dockcheck-windows-amd64.exe" -listen 127.0.0.1:4173 -root "dist" -open
) else (
  set "HOST=127.0.0.1"
  set "PORT=4173"
  node scripts\serve.mjs
)
if errorlevel 1 pause
