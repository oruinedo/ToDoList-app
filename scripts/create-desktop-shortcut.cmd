@echo off
setlocal
set "TODO_HOME=%~dp0"
if not exist "%TODO_HOME%TodoDesktop.exe" (
  echo Run this script inside the packaged folder beside TodoDesktop.exe.
  pause
  exit /b 1
)
powershell.exe -NoProfile -Command "$w=New-Object -ComObject WScript.Shell; $s=$w.CreateShortcut((Join-Path ([Environment]::GetFolderPath('Desktop')) 'TodoDesktop.lnk')); $s.TargetPath=(Join-Path $env:TODO_HOME 'TodoDesktop.exe'); $s.WorkingDirectory=$env:TODO_HOME; $s.IconLocation=(Join-Path $env:TODO_HOME 'resources\app\assets\icon.ico'); $s.Save()"
if errorlevel 1 (
  echo The shortcut could not be created. You can create a shortcut to TodoDesktop.exe manually.
) else (
  echo Desktop shortcut created. Keep the application folder in its current location.
)
pause
