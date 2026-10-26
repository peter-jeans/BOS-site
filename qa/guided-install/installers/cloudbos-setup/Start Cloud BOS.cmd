@echo off
setlocal
where node >nul 2>nul
if errorlevel 1 (
  echo Cloud BOS needs Node.js 20 or later. Install the supported Node.js from https://nodejs.org/en/download, then open this launcher again.
  pause
  exit /b 1
)
node "%~dp0setup.mjs"
set "cloudbos_result=%errorlevel%"
pause
exit /b %cloudbos_result%
