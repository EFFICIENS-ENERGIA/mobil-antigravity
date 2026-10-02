@echo off
TITLE Mobil Antigravity — Serveur Hôte & Reverse Proxy Universel
echo ============================================================
echo   INITIALISATION MOBIL ANTIGRAVITY (Wi-Fi & 4G/5G)
echo ============================================================

cd /d "%~dp0"

:: Vérification et installation automatique du proxy si absent
IF NOT EXIST "node_modules\http-proxy-middleware" (
    echo [INFO] Installation de la dépendance http-proxy-middleware...
    call npm install http-proxy-middleware --save
)

echo.
echo [INFO] Démarrage du serveur central sur le port 3000...
echo [INFO] Accès local : http://192.168.1.76:3000
echo.

node server.js
pause
