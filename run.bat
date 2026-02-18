@echo off
REM run.bat – Install dependencies and start the ZeroBloatEmulator backend
REM Run from the project root: .\run.bat

echo ============================================
echo  ZeroBloatEmulator – Backend Launcher
echo ============================================
echo.

REM Install / upgrade Python dependencies
echo [1/2] Installing Python dependencies...
python -m pip install -r requirements.txt
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: pip install failed. Make sure Python is installed and in PATH.
    pause
    exit /b 1
)

echo.
echo [2/2] Starting Flask API server on http://localhost:5000 ...
echo       Press Ctrl+C to stop.
echo.
python backend\app.py

pause
