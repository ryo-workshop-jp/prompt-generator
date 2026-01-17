@echo off
echo Starting Prompt Generator...
cd /d "%~dp0"

:: Start the browser (waits a bit for server to likely be ready, or refreshes)
start "" "http://localhost:5173"

:: Start the development server
cmd /c "npm run dev"

pause
