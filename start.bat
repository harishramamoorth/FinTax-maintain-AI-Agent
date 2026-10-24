@echo off
rem One-command local start for Windows 11: installs dependencies on first run, then starts API + UI.
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js 18.18+ is required. Install it from https://nodejs.org/ and run this file again.
  pause
  exit /b 1
)
node scripts\dev.mjs %*
if errorlevel 1 pause
