# 📱 Mobil Antigravity — Centre de Gestion & Pilotage Mobile Sécurisé

> **Propriétaire** : Sébastien (Seb) — Manager & Product Owner (`07 78 24 65 67`)  
> **Organisation GitHub** : [EFFICIENS-ENERGIA/mobil-antigravity](https://github.com/EFFICIENS-ENERGIA/mobil-antigravity)  
> **Architecture** : Node.js 24 + PWA Offline-First + Supabase SSR + Passerelle 4G/5G  
> **Sécurité** : Defense-in-Depth (OWASP Top 10, WebAuthn FaceID, Sessions HMAC-SHA256)  
> **Score Qualité** : **15/15 PASS Certifié par @AUD**  

---

## 🌟 Présentation
**Mobil Antigravity** est l'application mobile officielle et souveraine permettant à Sébastien de superviser, piloter et administrer l'ensemble de ses projets Antigravity, ses serveurs SaaS (RDV-Hub, SaaS Efficiens Energia), et ses agents autonomes depuis son smartphone (`07 78 24 65 67`), que ce soit sur son réseau local Wi-Fi ou à l'extérieur via la 4G/5G.

---

## ⚡ Fonctionnalités Clés
1. **🌐 Accès 4G/5G Hors Domicile** : Passerelle chiffrée HTTPS Zero-Config pour piloter partout sans ouvrir de port box.
2. **🔓 Déverrouillage Biométrique FaceID / Empreinte** : Authentification standard W3C WebAuthn & Passkeys + Code PIN maître `6567`.
3. **🎙️ Commandes Vocales Françaises (Micro)** : Assistant vocal NLP natif en français avec synthèse vocale audio de confirmation.
4. **⚡ Pilotage 1-Tap des Projets & SaaS** : Démarrage / Arrêt des serveurs (ex: RDV-Hub port 8092), déclenchement d'audits @AUD.
5. **📱 Alertes SMS Protégées** : Transmission instantanée de rapports de santé système vers le 07 78 24 65 67.
6. **🖥️ Streaming Terminal Temps Réel** : Suivi des logs machine par Server-Sent Events (SSE).
7. **🛡️ Forteresse OWASP** : Protection anti-brute-force (HTTP 429), anti-CSRF, anti-DoS (limite 10 Ko), anti-path-traversal.

---

## 🚀 Démarrage Rapide

### Sur votre PC :
Double-cliquez sur :
```bash
LANCER_MOBIL_ANTIGRAVITY.bat
```

### Sur votre Smartphone :
- **Wi-Fi** : Connectez-vous à `http://192.168.1.76:3000` ou flashez le QR code.
- **4G/5G** : Activez l'accès distant dans l'onglet Pilotage pour obtenir votre URL publique sécurisée.
