# 📱 Guide Utilisateur : Antigravity Mobile Pilot (Version Sécurisée)

> **Destinataire** : Sébastien (Seb) — Manager & Product Owner  
> **Téléphone associé** : 07 78 24 65 67 (+33 7 78 24 65 67)  
> **Code PIN Maître** : **`6567`** (ou appairage direct par QR Code)  
> **Niveau de Sécurité** : Forteresse OWASP Top 10 (AES-HMAC, Anti-Brute-Force, Anti-CSRF)  
> **Version** : 1.2.0 Hardened Production Ready  

---

## 🚀 1. Démarrage en 1-Clic sur votre PC

Pour activer le serveur de pilotage mobile sécurisé sur votre machine :
1. Rendez-vous dans le dossier :
   `c:\Users\EFFICIENS ENERGIA\Desktop\ANTIGRAVITY\entrainement equipe agent\`
2. Double-cliquez sur :
   `LANCER_PILOTAGE_SMARTPHONE.bat`
3. Le terminal Windows affiche immédiatement :
   - Votre adresse mobile Wi-Fi : **`http://192.168.1.76:3000`**
   - Votre **Code PIN Maître : `6567`**
   - Le lien d'appairage direct 1-clic chiffré (avec jeton temporaire)
   - Le QR Code interactif s'ouvre sur votre navigateur PC.

---

## 📲 2. Connexion & Déverrouillage depuis votre Smartphone

### Option A : Déverrouillage Biométrique FaceID / TouchID / Empreinte (Le plus intuitif)
1. Ouvrez `http://192.168.1.76:3000` (ou votre URL 4G/5G HTTPS).
2. Touchez le bouton violet **« 🔓 Déverrouiller FaceID / Empreinte »** sous le clavier PIN.
3. Votre smartphone valide votre regard (FaceID) ou votre doigt (Empreinte) via le standard WebAuthn/Passkeys et déverrouille l'application instantanément !

### Option B : Déverrouillage 1-Clic par QR Code (Le plus rapide)
1. Ouvrez l'appareil photo de votre smartphone (connecté au Wi-Fi).
2. **Flashez le QR Code** affiché sur votre écran d'ordinateur.
3. Le smartphone s'authentifie automatiquement par jeton cryptographique sans saisir le PIN !

### Option C : Saisie du Code PIN sur le Clavier Tactile
1. Tapez `http://192.168.1.76:3000` dans Safari ou Chrome Mobile.
2. L'écran de verrouillage noir et émeraude apparaît : **« ANTIGRAVITY SÉCURISÉ »**.
3. Tapez votre code PIN : **`6567`** sur le pavé numérique.
4. L'application se déverrouille instantanément pour 24 heures !

---

## 🌐 3. Accès 4G/5G Hors Domicile (Piloter où que vous soyez)

Vous n'êtes pas chez vous ou loin de votre réseau Wi-Fi local ?
1. Rendez-vous dans l'onglet **Pilotage (⚡)** de votre smartphone.
2. Dans la section **« 🌐 Accès 4G/5G Hors Domicile »**, cliquez sur **« Activer Accès 4G/5G »**.
3. Une URL publique sécurisée HTTPS (ex: `https://agy-seb-*.loca.lt`) est immédiatement générée.
4. Vous pouvez désormais piloter tous vos projets Antigravity depuis n'importe où dans le monde, sur le réseau 4G ou 5G de votre téléphone portable, avec le même niveau d'isolation cryptographique qu'à domicile !

---

## 🎙️ 4. Module de Commandes Vocales Françaises (Micro)

Pilotez vos serveurs et vos projets Antigravity à la voix sans toucher l'écran :
1. Touchez le **bouton micro flottant (🎙️)** situé en bas à droite de votre écran.
2. Les ondes sonores s'animent en vert et le contrôleur écoute votre voix en français.
3. Énoncez naturellement l'un des ordres suivants :
   - ⚡ *"Lance le serveur SaaS"* (ou *"Démarre RDV-Hub"*) : Démarre le serveur sur le port 8092.
   - 🛑 *"Arrête le serveur"* : Interrompt le serveur SaaS.
   - 🛡️ *"Fais un audit de sécurité"* : Déclenche le banc d'essai @AUD Chromium.
   - 📱 *"Envoie un SMS à Seb"* : Transmet immédiatement le rapport sur votre 07 78 24 65 67.
   - ⚖️ *"Vérifie les 18 règles"* : Contrôle l'intégrité et la non-régression.
   - 📊 *"Quel est l'état du système"* : Vous indique vocalement la santé globale des projets.
4. Le contrôleur exécute l'action et vous **répond vocalement en français** par synthèse vocale (Text-to-Speech) pour confirmer la bonne exécution !

---

## 🛡️ 5. Nouvelles Fonctionnalités de Sécurité Avancée

1. **🔒 Verrouillage Immédiat 1-Clic** :
   - Un bouton cadenas rapide dans l'en-tête et dans l'onglet Seb permet de reverrouiller instantanément le contrôleur.
2. **🛡️ Protection Anti-Brute-Force** :
   - Au-delà de 5 tentatives erronées de code PIN, le smartphone est automatiquement verrouillé pendant 5 minutes (code HTTP 429).
3. **🌐 Protection Anti-CSRF & Isolation d'Origine** :
   - Aucune page web externe malveillante ne peut déclencher d'action sur votre contrôleur Antigravity.
4. **📊 Journal d'Audit de Sécurité en Direct (OWASP A09)** :
   - Dans l'onglet Seb, consultez en temps réel la liste des événements de sécurité (connexions, tentatives bloquées, IP sources).
5. **🚫 Barrière d'Authentification Totale** :
   - Aucune donnée de vos projets n'est transmise au navigateur sans validation du jeton de session cryptographique.

---

## 🎮 6. Pilotage de vos Projets Antigravity

- **Onglet 1 : Projets** : Surveillez l'état de santé de tous vos projets en temps réel.
- **Onglet 2 : Pilotage** : Lancez / Arrêtez le serveur RDV-Hub (Port 8092), contrôlez le tunnel 4G/5G, déclenchez les audits @AUD.
- **Onglet 3 : Console** : Suivez le terminal en streaming temps réel direct sur votre téléphone.
- **Onglet 4 : Seb & Alertes** : Appelez Seb, envoyez un SMS ou inspectez le journal de sécurité.
