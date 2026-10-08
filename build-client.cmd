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
node.exe scripts\package-win.cjs
if errorlevel 1 goto failed
echo.
echo Build finished. Open the release folder and run TodoDesktop.exe.
pause
exit /b 0
:missing_node
echo Node.js 22.12 or newer is required for packaging. Install Node.js LTS, then retry.
pause
exit /b 1
:failed
echo Build failed. Keep the complete error output for troubleshooting.
pause
exit /b 1
