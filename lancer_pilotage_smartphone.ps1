# lancer_pilotage_smartphone.ps1 - Lanceur PowerShell avec détection IP et bannière
$ErrorActionPreference = "Stop"
Set-Location -Path $PSScriptRoot

Write-Host "======================================================================" -ForegroundColor Cyan
Write-Host "   📱 ANTIGRAVITY MOBILE PILOT — CONTRÔLEUR SMARTPHONE SEB" -ForegroundColor Green
Write-Host "   Numéro associé : 07 78 24 65 67 (+33 7 78 24 65 67)" -ForegroundColor Yellow
Write-Host "======================================================================" -ForegroundColor Cyan

# Récupération IP LAN
$ip = (Get-NetIPAddress -AddressFamily IPv4 -InterfaceAlias "*Ethernet*", "*Wi-Fi*" -ErrorAction SilentlyContinue | Where-Object { $_.IPAddress -notlike "127.*" -and $_.IPAddress -notlike "169.254.*" } | Select-Object -First 1).IPAddress
if (-not $ip) { $ip = "192.168.1.76" }

$url = "http://${ip}:3000"

Write-Host "`n👉 ACCÈS SMARTPHONE (Connecté au même Wi-Fi) :" -ForegroundColor White
Write-Host "   🔗  $url`n" -ForegroundColor Green
Write-Host "Ouverture du navigateur local pour afficher le QR Code..." -ForegroundColor Gray
Start-Process $url

Write-Host "Démarrage du serveur Node.js..." -ForegroundColor Cyan
node server.mjs
