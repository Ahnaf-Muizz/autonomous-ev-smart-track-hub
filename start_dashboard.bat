@echo off
setlocal EnableDelayedExpansion
title EV Rover Lab - Texas Tech SHARE Lab STEM Night Console
cd /d "%~dp0"
chcp 65001 >nul 2>&1

echo ================================================================================
echo   TEXAS TECH UNIVERSITY - SHARE LAB STEM NIGHT CONTROL SYSTEM
echo   Autonomous mBot Mega EV Rover and Smart Dual-Gate Track Hub
echo ================================================================================
echo.
echo [STAGE 1/4] SYSTEM ENVIRONMENT AND TOOLCHAIN AUDIT...
echo   ------------------------------------------------------------------------------

REM 1. Host Machine Information
echo   * Host Machine:       %COMPUTERNAME% (%PROCESSOR_ARCHITECTURE% / %OS%)
echo   * Working Directory:  %~dp0

REM 2. Check Python Runtime
set "PYTHON_CMD="

REM 2a. Try standard 'python' in PATH
python --version >nul 2>&1
if %errorlevel% equ 0 (
    set "PYTHON_CMD=python"
)

REM 2b. Try official Windows Python Launcher 'py'
if not defined PYTHON_CMD (
    py -0 >nul 2>&1
    if !errorlevel! equ 0 (
        set "PYTHON_CMD=py"
    )
)

REM 2c. Try user LocalAppData Programs directory
if not defined PYTHON_CMD (
    for /d %%d in ("%LOCALAPPDATA%\Programs\Python\Python3*") do (
        if exist "%%d\python.exe" (
            set "PYTHON_CMD=%%d\python.exe"
        )
    )
)

REM 2d. Try system ProgramFiles directory
if not defined PYTHON_CMD (
    for /d %%d in ("%ProgramFiles%\Python3*") do (
        if exist "%%d\python.exe" (
            set "PYTHON_CMD=%%d\python.exe"
        )
    )
)

if not defined PYTHON_CMD (
    echo   [ERROR] Python was not found in system PATH or standard install locations!
    echo           Please install Python 3.10+ [64-bit recommended] to run the simulation hub.
    echo.
    pause
    exit /b 1
)

for /f "delims=" %%v in ('!PYTHON_CMD! --version 2^>^&1') do (
    echo   * Python Interpreter: %%v
)
for /f "delims=" %%p in ('!PYTHON_CMD! -c "import sys; print(sys.executable)" 2^>nul') do (
    echo   * Executable Path:    %%p
)

REM 3. Check Node / npm (Frontend Toolchain)
call npm --version >nul 2>&1
if %errorlevel% equ 0 (
    for /f "delims=" %%v in ('npm --version') do (
        echo   * Node Package Tool:  npm v%%v [Frontend Toolchain Ready]
    )
) else (
    echo   * Node Package Tool:  Not in PATH [Serving pre-compiled React 19 distribution]
)

echo.
echo [STAGE 2/4] NETWORK AND PORT CONFLICT DIAGNOSTICS...
echo   ------------------------------------------------------------------------------
echo   * Inspecting TCP port 8080 (HTTP Dashboard Server)...
set "PORT_8080_CLEARED=0"
for /f "tokens=5" %%a in ('netstat -aon 2^>nul ^| findstr ":8080 " ^| findstr "LISTENING"') do (
    echo     [ACTION] Terminating previous process PID %%a on port 8080...
    taskkill /F /PID %%a >nul 2>&1
    set "PORT_8080_CLEARED=1"
)
if "!PORT_8080_CLEARED!"=="0" (
    echo     [STATUS] Port 8080 is clear and ready.
)

echo.
echo [STAGE 3/4] FRONTEND ASSET AND BUILD INTEGRITY VERIFICATION...
echo   ------------------------------------------------------------------------------
if not exist "dashboard\dist\index.html" (
    echo   [BUILD] Production webapp bundle missing. Compiling React 19 + TypeScript...
    call npm run build --prefix webapp
    echo   [BUILD] Compilation complete!
) else (
    echo   * Production Webapp:  dashboard\dist\index.html [React 19 + Vite + Tailwind]
    echo   * Static Assets:      Compiled JavaScript and CSS distribution bundles verified.
)

echo.
echo [STAGE 4/4] SUBSYSTEM INITIALIZATION MATRIX...
echo   ------------------------------------------------------------------------------
echo   [SYSTEM 1] Coupled Electro-Thermal Battery Physics Engine (server\battery_physics.py)
echo              - Coupled 2-State ECM + Dual Thermal Mass (Forward Euler Integration)
echo              - 2,300 mAh (8,280 C) Li-Ion cell model, 10,001-point SOC-OCV lookup
echo              - 60.0 C thermal protection cutoff, realistic 10s animation scaling
echo   [SYSTEM 2] Multi-PC Real-Time State Synchronization Hub (SSE /api/events)
echo              - Non-blocking thread-safe subscriber queues for Student Kiosks and Host
echo              - Instant push notifications for Car Count, Phase, and Lap Records
echo   [SYSTEM 3] Token-Protected ESP32 Dual-Gate Smart Controller Bridge (Track-01)
echo              - SoftAP Wi-Fi SSID: ESP32_Gate_Network (IP: 192.168.4.1:81)
echo              - Gate 1: Entry Station (Servo 1 Pin 14 + Ultrasonic Sensor Pin 13/12 + Tower)
echo              - Gate 2: Exit Station (Servo 2 Pin 27 + Buzzer Pin 32 + Tower)
echo   [SYSTEM 4] Makeblock mBot Mega Web Bluetooth Pinning and Auto-Reconnect Guard
echo              - Hardware UUID locking: Rover locks to specific device ID in room
echo              - Automatic exponential-backoff reconnect if Bluetooth drops
echo   [SYSTEM 5] Persistent High-Score Leaderboard and Trajectory Datastores
echo              - server\leaderboard.json (Student fastest lap times and thermal scores)
echo              - server\game_history.json (Full discrete physics trajectory curves)
echo.
echo ================================================================================
echo   STARTING HTTP MULTI-PC HUB SERVER (PORT 8080)...
echo   Press CTRL+C anytime in this window to stop the server safely.
echo ================================================================================
echo.

!PYTHON_CMD! server\server.py 8080
pause
