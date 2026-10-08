@echo off
setlocal
cd /d "%~dp0"
where node.exe >nul 2>nul
if errorlevel 1 goto missing_node
node.exe -e "const [major,minor]=process.versions.node.split('.').map(Number); if(major<22 || (major===22 && minor<12)) process.exit(1)"
if errorlevel 1 goto missing_node
if not exist "node_modules\electron\dist\electron.exe" (
  echo Installing Electron. Internet access is required on the first run.
  call npm.cmd install --include=dev --no-audit --no-fund
  if errorlevel 1 goto failed
)
if not exist "node_modules\electron\dist\electron.exe" goto failed
start "" "%~dp0node_modules\electron\dist\electron.exe" "%~dp0."
exit /b 0
:missing_node
echo Node.js 22.12 or newer is required for the source launcher. Install Node.js LTS, then retry.
pause
exit /b 1
:failed
echo Installation did not finish. No task data was removed. Keep this error output for troubleshooting.
pause
exit /b 1
