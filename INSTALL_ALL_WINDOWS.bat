@echo off
setlocal
cd /d "%~dp0"
if not exist ".venv-depthport\Scripts\python.exe" (
  py -3.11 -m venv .venv-depthport
  if errorlevel 1 py -3.12 -m venv .venv-depthport
  if errorlevel 1 goto error
)
if not exist ".env" copy /y ".env.example" ".env" >nul
".venv-depthport\Scripts\python.exe" install.py %*
if errorlevel 1 goto error
exit /b 0
:error
echo [ERROR] Installation failed. Use Python 3.11/3.12 and read README.md.
exit /b 1
