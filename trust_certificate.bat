@echo off
title Install STEM Lab SSL Certificate to Windows Trusted Store
cd /d "%~dp0"
echo ================================================================================
echo   TEXAS TECH SHARE LAB — SSL Certificate Trust Installer
echo ================================================================================
echo.
echo Installing server\cert.pem into CurrentUser "Trusted Root Certification Authorities"...
echo.

if not exist "server\cert.pem" (
    echo [ERROR] server\cert.pem not found! Please run start_dashboard.bat first.
    pause
    exit /b 1
)

certutil -addstore -user Root "server\cert.pem"
echo.
if %errorlevel% equ 0 (
    echo ================================================================================
    echo [SUCCESS] Certificate installed into Windows Trusted Root Store!
    echo           Chrome and Edge will now recognize https://localhost:8443 as SECURE.
    echo           Please completely close and re-open Google Chrome to apply changes.
    echo ================================================================================
) else (
    echo [NOTICE] Certificate installation was canceled or requires approval.
)
echo.
pause
