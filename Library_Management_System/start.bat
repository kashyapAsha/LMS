@echo off
title Athena - Library Management System
echo ========================================================
echo    ATHENA LIBRARY MANAGEMENT SYSTEM (LMS)
echo    Tech Stack: HTML, CSS, JavaScript, Python, MySQL
echo ========================================================
echo.

REM Check and use Virtual Environment if present
if exist "%~dp0.venv\Scripts\python.exe" (
    set PYTHON_EXE=%~dp0.venv\Scripts\python.exe
) else (
    set PYTHON_EXE=C:\Users\IRIEEN\AppData\Local\Programs\Python\Python312\python.exe
    if not exist "%PYTHON_EXE%" (
        set PYTHON_EXE=python
    )
)

cd /d "%~dp0"

echo [1/2] Initializing MySQL Database & Seeding Schema...
"%PYTHON_EXE%" init_db.py
if %ERRORLEVEL% NEQ 0 (
    echo [Warning] Database initialization returned an error or database already configured.
)

echo.
echo [2/2] Launching Flask Web Server...
echo Application URL: http://localhost:5000
echo.
"%PYTHON_EXE%" app.py

pause
