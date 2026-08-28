@echo off
setlocal EnableExtensions
cd /d "%~dp0"
set "DEV_PORT="

for /f %%P in ('powershell -NoProfile -Command "$ports=5173..5190; foreach($p in $ports){ if(-not (Get-NetTCPConnection -LocalPort $p -State Listen -ErrorAction SilentlyContinue)){ $p; break } }"') do set "DEV_PORT=%%P"
if not defined DEV_PORT set "DEV_PORT=5173"

set "APP_URL=http://localhost:%DEV_PORT%"

where node >nul 2>&1
if errorlevel 1 (
  echo Node.js den vrethike. Egkatastase to apo https://nodejs.org
  pause
  exit /b 1
)

where npm >nul 2>&1
if errorlevel 1 (
  echo npm den vrethike. Egkatastase to Node.js LTS apo https://nodejs.org
  pause
  exit /b 1
)

if not exist "node_modules\" (
  echo Egkatastasi dependencies...
  call npm install
  if errorlevel 1 (
    echo To npm install apektixe.
    pause
    exit /b 1
  )
)

echo Ekkinisi SportSuite360...
start "SportSuite360 Dev Server" cmd /k "cd /d ""%~dp0"" && npm run dev -- --host localhost --port %DEV_PORT% --strictPort"
if errorlevel 1 (
  echo Apetyxe i ekkinisi tou dev server.
  pause
  exit /b 1
)

echo Anoigma efarmogis sto %APP_URL%...
timeout /t 3 /nobreak >nul
start "" "%APP_URL%"

endlocal
exit /b 0
