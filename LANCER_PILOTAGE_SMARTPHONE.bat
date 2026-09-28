@echo off
TITLE Antigravity Mobile Pilot - Controleur Smartphone Seb (07 78 24 65 67)
cd /d "%~dp0"

echo ======================================================================
echo    PILOTAGE ANTIGRAVITY SUR SMARTPHONE - SEB (07 78 24 65 67)
echo ======================================================================
echo.
echo [1/2] Detection de l'environnement Node.js 24...
node -v >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERREUR] Node.js n'est pas installe ou n'est pas dans le PATH.
    pause
    exit /b 1
)

echo [2/2] Demarrage du serveur Antigravity Mobile Pilot...
start http://localhost:3000
node server.mjs
pause
