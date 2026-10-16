@echo off
setlocal
cd /d "%~dp0"
if /I not "%SKIP_INSTALL%"=="1" (
  if not exist ".installed-all.json" (
    call INSTALL_ALL_WINDOWS.bat
    if errorlevel 1 goto error
  )
)
if not exist ".venv-depthport\Scripts\python.exe" goto error
if not exist ".env" copy /y ".env.example" ".env" >nul
echo [DepthPort] http://127.0.0.1:8000/  -  one UI, four model presets
echo [DepthPort] The first use of each model downloads its weights.
echo [DepthPort] Relative or estimated-m depth is NOT measured safety distance.
".venv-depthport\Scripts\python.exe" app.py
if errorlevel 1 goto error
exit /b 0
:error
echo [ERROR] Setup or runtime failed. See the messages above and README.md.
pause
exit /b 1
