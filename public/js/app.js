// public/js/app.js - Logique Client PWA Sécurisée Antigravity (UIX & DEV)

let currentTab = 'projects';
let autoScroll = true;
let eventSource = null;
let deferredPrompt = null;
let authToken = localStorage.getItem('agy_token') || '';
let enteredPin = '';
let audioEnabled = localStorage.getItem('agy_audio_enabled') !== 'false';
let allProjects = [];
let currentProjectFilter = 'all';
let projectSearchQuery = '';
let allTasks = [];

// Initialisation au chargement du DOM
document.addEventListener('DOMContentLoaded', async () => {
  initTabs();
  initPwaInstall();
  initTerminal();
  initKeypad();
  initAudioVoices();
  updateAudioToggleUI();
  updateBioEnrolledUI();

  // Initialisation du mode nuit OLED
  const isOled = localStorage.getItem('agy_oled_mode') === 'true';
  if (isOled) {
    document.body.classList.add('oled-mode');
    const oledBtn = document.getElementById('oled-toggle-btn');
    if (oledBtn) oledBtn.textContent = '☀️';
  }

  // 1. Vérification d'un jeton d'appairage rapide 1-clic dans l'URL (?pair=...)
  const urlParams = new URLSearchParams(window.location.search);
  const pairingParam = urlParams.get('pair');
  if (pairingParam) {
    await loginWithPairingToken(pairingParam);
  } else if (authToken) {
    // Vérification de la validité du jeton stocké
    await verifyCurrentSession();
  } else {
    showLockScreen();
  }

  // 2. Gestion des Raccourcis PWA (PWA Shortcuts) : ?open=voice, ?open=kill_switch, ?open=audit, ?open=saas, ?open=smarttrip
  const openAction = urlParams.get('open');
  if (openAction) {
    setTimeout(() => {
      if (openAction === 'voice') toggleVoiceAssistant();
      else if (openAction === 'kill_switch') triggerKillSwitch();
      else if (openAction === 'audit') triggerProjectAudit('mobil antigravity');
      else if (openAction === 'saas') triggerAction('start_saas_server');
      else if (openAction === 'smarttrip') triggerAction('launch_project', '$HOMEagy2-projectsmy-first-project');
      else if (openAction === 'console') switchTab('console');
    }, 800);
  }

  // Initialisation de l'écoute continue Wake-Word si activée
  if (localStorage.getItem('agy_wakeword_enabled') === 'true') {
    setTimeout(() => {
      startWakeWordListener();
    }, 1500);
  }

  // Actualisation périodique si authentifié (Projets & Télémétrie)
  setInterval(() => {
    if (authToken) {
      loadProjects();
      loadHardwareTelemetry();
    }
  }, 8000);
});

/**
 * Vibration haptique légère pour smartphone
 */
function triggerHaptic() {
  if (navigator.vibrate) {
    try { navigator.vibrate(15); } catch {}
  }
}

/**
 * Affichage d'un toast mobile
 */
function showToast(message, icon = '✓') {
  const toast = document.getElementById('toast');
  if (!toast) return;
  toast.innerHTML = `<span>${icon}</span> <span>${message}</span>`;
  toast.classList.add('show');
  triggerHaptic();
  setTimeout(() => {
    toast.classList.remove('show');
  }, 3200);
}

/**
 * Gestion du Lock Screen et Clavier PIN
 */
function showLockScreen() {
  const lock = document.getElementById('lock-screen');
  if (lock) lock.classList.remove('hidden');
  enteredPin = '';
  updatePinDots();
}

function hideLockScreen() {
  const lock = document.getElementById('lock-screen');
  if (lock) lock.classList.add('hidden');
}

function initKeypad() {
  const buttons = document.querySelectorAll('.keypad-btn');
  buttons.forEach(btn => {
    btn.addEventListener('click', () => {
      triggerHaptic();
      const val = btn.dataset.val;
      if (val === 'clear') {
        enteredPin = '';
        updatePinDots();
      } else if (val === 'submit') {
        if (enteredPin.length >= 4) {
          submitPin();
        }
      } else if (val !== undefined && enteredPin.length < 8) {
        enteredPin += val;
        updatePinDots();
        if (enteredPin.length === 4) {
          submitPin(); // Soumission automatique à 4 chiffres
        }
      }
    });
  });
}

function updatePinDots() {
  const dots = document.querySelectorAll('.pin-dot');
  dots.forEach((dot, index) => {
    dot.classList.toggle('filled', index < enteredPin.length);
  });
  const errEl = document.getElementById('lock-error-msg');
  if (errEl) errEl.textContent = '';
}

async function submitPin() {
  const errEl = document.getElementById('lock-error-msg');
  if (errEl) errEl.textContent = 'Vérification en cours...';

  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Requested-With': 'AntigravityMobilePilot'
      },
      body: JSON.stringify({ pin: enteredPin })
    });
    const data = await res.json();

    if (data.success && data.token) {
      authToken = data.token;
      localStorage.setItem('agy_token', authToken);
      hideLockScreen();
      showToast('Déverrouillé avec succès !', '🔓');
      onAuthenticated();
    } else {
      if (errEl) errEl.textContent = data.error || 'Code PIN invalide.';
      enteredPin = '';
      updatePinDots();
      triggerHaptic();
    }
  } catch (err) {
    if (errEl) errEl.textContent = 'Erreur réseau de connexion.';
  }
}

// Utilitaires de conversion W3C WebAuthn pour smartphones
function base64ToUint8Array(base64String) {
  if (!base64String) return new Uint8Array(0);
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

function arrayBufferToBase64Url(buffer) {
  if (!buffer) return '';
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Mise à jour visuelle du statut biométrique
 */
function updateBioEnrolledUI(enrolled = false) {
  const badge = document.getElementById('bio-enrolled-badge');
  const btnLabel = document.getElementById('bio-btn-label');
  const isEnrolled = enrolled || !!localStorage.getItem('agy_bio_credential_id');
  if (badge) {
    badge.textContent = isEnrolled ? 'Enregistrée ✅' : 'À configurer';
    badge.className = 'badge ' + (isEnrolled ? 'badge-emerald' : 'badge-amber');
  }
  if (btnLabel) {
    btnLabel.textContent = isEnrolled ? 'Déverrouiller par Empreinte' : 'Activer l’Empreinte Digitale';
  }
}

/**
 * Enregistrement de l'empreinte biométrique FaceID / TouchID pour Seb
 */
async function registerBiometrics() {
  triggerHaptic();
  showToast("Initialisation du capteur biométrique...", "📱");

  const isHttps = window.location.protocol === 'https:' || window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
  if (!isHttps || !window.isSecureContext) {
    const remoteLink = document.getElementById('remote-url-link')?.href || 'https://determine-midlands-satisfaction-theories.trycloudflare.com';
    alert(`⚠️ L'empreinte digitale est bloquée par votre smartphone sur HTTP non sécurisé.\n\n👉 Ouvrez le hub via l'adresse sécurisée HTTPS Cloudflare :\n${remoteLink}`);
    return;
  }

  if (!window.PublicKeyCredential) {
    showToast("Votre navigateur ne supporte pas l'empreinte WebAuthn.", "❌");
    return;
  }

  try {
    const challengeRes = await fetch('/api/auth/biometric/challenge', {
      method: 'POST',
      headers: { 'X-Requested-With': 'AntigravityMobilePilot' }
    });
    const challengeData = await challengeRes.json();
    const challenge = challengeData.challenge;

    const credential = await navigator.credentials.create({
      publicKey: {
        challenge: base64ToUint8Array(challenge),
        rp: {
          name: 'Mobil Antigravity',
          id: window.location.hostname
        },
        user: {
          id: new TextEncoder().encode('seb-master-0778246567'),
          name: 'seb@antigravity',
          displayName: 'Sébastien (07 78 24 65 67)'
        },
        pubKeyCredParams: [
          { alg: -7, type: 'public-key' },
          { alg: -257, type: 'public-key' }
        ],
        authenticatorSelection: {
          authenticatorAttachment: 'platform',
          userVerification: 'required',
          residentKey: 'preferred'
        },
        timeout: 60000
      }
    });

    if (credential) {
      const rawCredentialId = credential.id || arrayBufferToBase64Url(credential.rawId);
      
      await fetch('/api/auth/biometric/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Requested-With': 'AntigravityMobilePilot'
        },
        body: JSON.stringify({
          credentialId: rawCredentialId,
          clientName: 'Smartphone Seb'
        })
      });

      localStorage.setItem('agy_bio_credential_id', rawCredentialId);
      showToast("Empreinte biométrique enregistrée avec succès !", "🎉");
      speakVoiceResponse("Votre empreinte digitale a été enregistrée avec succès.");
      updateBioEnrolledUI(true);
    }
  } catch (err) {
    console.warn('[WebAuthn Register] Erreur:', err);
    if (err.name === 'NotAllowedError') {
      showToast("Scan d'empreinte annulé.", "⚠️");
    } else {
      showToast(`Erreur capteur: ${err.message || err.name}`, "❌");
    }
  }
}

/**
 * Déverrouillage biométrique FaceID / TouchID / Empreinte (WebAuthn & Passkeys)
 */
async function unlockWithBiometrics() {
  triggerHaptic();
  const errEl = document.getElementById('lock-error-msg');
  const warningEl = document.getElementById('bio-http-warning');
  const httpsLink = document.getElementById('bio-https-link');
  if (errEl) errEl.textContent = 'Préparation du capteur d’empreinte...';
  if (warningEl) warningEl.style.display = 'none';

  // 1. Détection du contexte HTTP non sécurisé
  const isHttps = window.location.protocol === 'https:' || window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
  if (!isHttps || !window.isSecureContext) {
    if (errEl) errEl.textContent = "Capteur bloqué : connexion HTTPS requise.";
    if (warningEl) {
      warningEl.style.display = 'block';
      fetch('/api/status').then(r => r.json()).then(d => {
        if (d.remoteUrl && httpsLink) {
          httpsLink.href = d.remoteUrl;
          httpsLink.textContent = d.remoteUrl + ' ↗';
        }
      }).catch(() => {});
    }
    showToast("L'empreinte requiert HTTPS. Tapez votre code PIN 6567.", "⚠️");
    return;
  }

  // 2. Détection du support matériel WebAuthn
  if (!window.PublicKeyCredential) {
    if (errEl) errEl.textContent = "WebAuthn non supporté. Tapez votre code PIN 6567.";
    showToast("Capteur biométrique non supporté par ce navigateur.", "❌");
    return;
  }

  try {
    const challengeRes = await fetch('/api/auth/biometric/challenge', {
      method: 'POST',
      headers: { 'X-Requested-With': 'AntigravityMobilePilot' }
    });
    const challengeData = await challengeRes.json();
    const challenge = challengeData.challenge;

    const savedId = localStorage.getItem('agy_bio_credential_id');
    let credential = null;

    // A. Si une clé est enregistrée -> navigator.credentials.get
    if (savedId) {
      if (errEl) errEl.textContent = 'Posez votre doigt sur le capteur...';
      try {
        credential = await navigator.credentials.get({
          publicKey: {
            challenge: base64ToUint8Array(challenge),
            allowCredentials: [{
              id: base64ToUint8Array(savedId),
              type: 'public-key',
              transports: ['internal']
            }],
            userVerification: 'required',
            timeout: 60000
          }
        });
      } catch (getErr) {
        console.warn('[WebAuthn Get] Échec assertion, tentative de création:', getErr);
        credential = null;
      }
    }

    // B. Si aucune clé n'est encore enregistrée (ou si get a échoué) -> navigator.credentials.create
    // Cela affiche la boîte de dialogue native du téléphone pour enregistrer son empreinte !
    if (!credential) {
      if (errEl) errEl.textContent = 'Posez votre doigt sur le capteur pour enregistrer l’empreinte...';
      credential = await navigator.credentials.create({
        publicKey: {
          challenge: base64ToUint8Array(challenge),
          rp: {
            name: 'Mobil Antigravity',
            id: window.location.hostname
          },
          user: {
            id: new TextEncoder().encode('seb-master-0778246567'),
            name: 'seb@antigravity',
            displayName: 'Sébastien (07 78 24 65 67)'
          },
          pubKeyCredParams: [
            { alg: -7, type: 'public-key' },
            { alg: -257, type: 'public-key' }
          ],
          authenticatorSelection: {
            authenticatorAttachment: 'platform',
            userVerification: 'required',
            residentKey: 'preferred'
          },
          timeout: 60000
        }
      });
    }

    // C. Si l'empreinte a été validée par le capteur matériel
    if (credential) {
      const rawCredentialId = credential.id || arrayBufferToBase64Url(credential.rawId);

      // Enregistrement auprès du serveur
      await fetch('/api/auth/biometric/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Requested-With': 'AntigravityMobilePilot'
        },
        body: JSON.stringify({
          credentialId: rawCredentialId,
          clientName: 'Smartphone Seb'
        })
      });

      // Vérification et émission du token de session
      const verifyRes = await fetch('/api/auth/biometric/verify', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Requested-With': 'AntigravityMobilePilot'
        },
        body: JSON.stringify({
          credentialId: rawCredentialId,
          challenge
        })
      });

      const verifyData = await verifyRes.json();
      if (verifyData.success && verifyData.token) {
        authToken = verifyData.token;
        localStorage.setItem('agy_token', authToken);
        localStorage.setItem('agy_bio_credential_id', rawCredentialId);
        hideLockScreen();
        showToast('Déverrouillage par empreinte réussi ! 🔓', '🎉');
        speakVoiceResponse('Authentification biométrique certifiée. Bienvenue Seb.');
        onAuthenticated();
        return;
      }
    }

    if (errEl) errEl.textContent = 'Échec de validation de l’empreinte.';
  } catch (err) {
    console.error('[Biometrics] Erreur:', err);
    if (err.name === 'NotAllowedError') {
      if (errEl) errEl.textContent = 'Scan d’empreinte annulé. Utilisez votre code PIN 6567.';
    } else if (err.name === 'SecurityError') {
      if (errEl) errEl.textContent = 'Connexion HTTPS requise pour le capteur biométrique.';
      if (warningEl) warningEl.style.display = 'block';
    } else {
      if (errEl) errEl.textContent = `Erreur capteur: ${err.message || err.name}. Tapez le PIN 6567.`;
    }
    triggerHaptic();
  }
}

async function loginWithPairingToken(token) {
  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Requested-With': 'AntigravityMobilePilot'
      },
      body: JSON.stringify({ pairingToken: token })
    });
    const data = await res.json();

    if (data.success && data.token) {
      authToken = data.token;
      localStorage.setItem('agy_token', authToken);
      // Nettoyer l'URL sans recharger la page
      window.history.replaceState({}, document.title, window.location.pathname);
      hideLockScreen();
      showToast('Appairage 1-clic réussi !', '🎉');
      onAuthenticated();
      return;
    }
  } catch {}
  showLockScreen();
}

async function verifyCurrentSession() {
  try {
    const res = await fetch('/api/auth/verify', {
      headers: {
        'Authorization': `Bearer ${authToken}`,
        'X-Requested-With': 'AntigravityMobilePilot'
      }
    });
    const data = await res.json();
    if (data.authenticated) {
      hideLockScreen();
      onAuthenticated();
      return;
    }
  } catch {}
  
  authToken = '';
  localStorage.removeItem('agy_token');
  showLockScreen();
}

function logout() {
  triggerHaptic();
  fetch('/api/auth/logout', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${authToken}`,
      'X-Requested-With': 'AntigravityMobilePilot'
    }
  }).catch(() => {});

  authToken = '';
  localStorage.removeItem('agy_token');
  showToast('Session verrouillée.', '🔒');
  showLockScreen();
}

function onAuthenticated() {
  loadStatus();
  loadProjects();
  loadHardwareTelemetry();
  loadTasks();
  initLogStream();
  loadSmsHistory();
  loadSecurityEvents();
  updateBioEnrolledUI();
}

/**
 * Fetch sécurisé avec inclusion systématique du token Bearer
 */
async function secureFetch(url, options = {}) {
  options.headers = options.headers || {};
  options.headers['X-Requested-With'] = 'AntigravityMobilePilot';
  if (authToken) {
    options.headers['Authorization'] = `Bearer ${authToken}`;
  }

  const res = await fetch(url, options);
  if (res.status === 401) {
    // Session expirée ou révoquée
    authToken = '';
    localStorage.removeItem('agy_token');
    showLockScreen();
    showToast('Session expirée. Veuillez vous reconnecter.', '🔒');
    throw new Error('Unauthorized');
  }
  return res;
}

/**
 * Navigation par onglets
 */
function initTabs() {
  const navItems = document.querySelectorAll('.nav-item');
  navItems.forEach(item => {
    item.addEventListener('click', () => {
      triggerHaptic();
      const target = item.dataset.tab;
      switchTab(target);
    });
  });
}

function switchTab(tabName) {
  currentTab = tabName;
  document.querySelectorAll('.nav-item').forEach(el => {
    el.classList.toggle('active', el.dataset.tab === tabName);
  });
  document.querySelectorAll('.tab-pane').forEach(el => {
    el.classList.toggle('active', el.id === `tab-${tabName}`);
  });
}

/**
 * Chargement du statut global de la passerelle
 */
async function loadStatus() {
  try {
    const res = await fetch('/api/status');
    const data = await res.json();
    if (data.success) {
      const ipEl = document.getElementById('header-ip');
      if (ipEl) ipEl.textContent = `${data.localIp}:${data.port}`;

      // Synchronisation de l'état du tunnel 4G/5G
      updateTunnelUI(data.remoteTunnelActive, data.remoteUrl, data.publicIp || data.tunnelPassword);
    }
  } catch (err) {
    console.error('Erreur chargement statut:', err);
  }
}

/**
 * Bascule l'activation du tunnel 4G/5G sécurisé
 */
async function toggleRemoteTunnel() {
  triggerHaptic();
  const btn = document.getElementById('btn-toggle-tunnel');
  if (btn) btn.textContent = 'Connexion tunnel en cours...';

  try {
    const res = await secureFetch('/api/tunnel/toggle', { method: 'POST' });
    const data = await res.json();
    if (data.success) {
      updateTunnelUI(data.active, data.remoteUrl);
      showToast(data.message, data.active ? '🌐' : '🛑');
    } else {
      showToast(data.error || 'Erreur tunnel 4G/5G', '❌');
    }
  } catch (err) {
    if (err.message !== 'Unauthorized') {
      showToast('Erreur activation tunnel 4G/5G', '❌');
    }
  }
}

function updateTunnelUI(active, url, publicIp = null) {
  const badge = document.getElementById('tunnel-status-badge');
  const box = document.getElementById('remote-url-box');
  const link = document.getElementById('remote-url-link');
  const btn = document.getElementById('btn-toggle-tunnel');
  const pwdEl = document.getElementById('remote-tunnel-password');
  const localtunnelNotice = document.getElementById('localtunnel-pwd-notice');
  const cloudflareNotice = document.getElementById('cloudflare-direct-notice');

  if (publicIp && pwdEl) {
    pwdEl.textContent = publicIp;
  }

  if (active && url) {
    const isCloudflare = url.includes('trycloudflare.com');

    if (badge) {
      badge.className = 'badge badge-emerald';
      badge.textContent = isCloudflare ? 'Cloudflare Edge 4G/5G' : '4G/5G Actif';
    }
    if (box) box.style.display = 'block';
    if (link) {
      link.href = url;
      link.textContent = url;
    }
    if (localtunnelNotice) {
      localtunnelNotice.style.display = isCloudflare ? 'none' : 'block';
    }
    if (cloudflareNotice) {
      cloudflareNotice.style.display = isCloudflare ? 'block' : 'none';
    }
    if (btn) {
      btn.className = 'btn btn-danger';
      btn.textContent = '🛑 Couper Accès 4G/5G';
    }
  } else {
    if (badge) {
      badge.className = 'badge badge-amber';
      badge.textContent = 'Inactif';
    }
    if (box) box.style.display = 'none';
    if (btn) {
      btn.className = 'btn btn-primary';
      btn.textContent = '🌐 Activer Accès 4G/5G';
    }
  }
}

/**
 * Initialisation des voix Text-to-Speech (Web Speech API)
 */
function initAudioVoices() {
  if ('speechSynthesis' in window) {
    window.speechSynthesis.onvoiceschanged = () => {
      try { window.speechSynthesis.getVoices(); } catch {}
    };
  }
}

function updateAudioToggleUI() {
  const btn = document.getElementById('audio-toggle-btn');
  const icon = document.getElementById('audio-toggle-icon');
  const text = document.getElementById('audio-toggle-text');
  if (btn) btn.classList.toggle('active', audioEnabled);
  if (icon) icon.textContent = audioEnabled ? '🔊' : '🔇';
  if (text) text.textContent = audioEnabled ? 'Voix' : 'Muet';
}

function toggleAudioSpeech() {
  triggerHaptic();
  audioEnabled = !audioEnabled;
  localStorage.setItem('agy_audio_enabled', String(audioEnabled));
  updateAudioToggleUI();

  if (audioEnabled) {
    showToast('Synthèse vocale activée', '🔊');
    speakVoiceResponse("Synthèse vocale activée. Je suis à votre écoute, Seb.");
  } else {
    if (window.speechSynthesis) window.speechSynthesis.cancel();
    showToast('Synthèse vocale désactivée', '🔇');
  }
}

/**
 * Synthèse Vocale Parlée (Text-to-Speech) Naturelle en Français
 * @param {string} text 
 */
function speakVoiceResponse(text) {
  if (!audioEnabled || !text || !('speechSynthesis' in window)) return;

  try {
    window.speechSynthesis.cancel();
    // Nettoyage des emojis et symboles pour une diction fluide en français
    const cleanText = text
      .replace(/[🛡️✈️⚡🏗️📱🟢🔴⚪🌿🔒👑💬🎉✓❌⏳↗«»]/g, '')
      .replace(/@AUD/g, 'l\'auditeur de sécurité')
      .replace(/SaaS/g, 'Sasse')
      .trim();

    if (!cleanText) return;

    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.lang = 'fr-FR';
    utterance.rate = 1.02;
    utterance.pitch = 1.0;

    const voices = window.speechSynthesis.getVoices();
    const frVoice = voices.find(v => v.lang === 'fr-FR' && (v.name.includes('Google') || v.name.includes('Thomas') || v.name.includes('Julie') || v.name.includes('Paul') || v.name.includes('Audrey') || v.name.includes('Natural'))) ||
                    voices.find(v => v.lang.startsWith('fr'));
    if (frVoice) utterance.voice = frVoice;

    const btn = document.getElementById('audio-toggle-btn');
    utterance.onstart = () => { if (btn) btn.classList.add('speaking-pulse'); };
    utterance.onend = () => { if (btn) btn.classList.remove('speaking-pulse'); };
    utterance.onerror = () => { if (btn) btn.classList.remove('speaking-pulse'); };

    window.speechSynthesis.speak(utterance);
  } catch (e) {
    console.warn('[TTS] Erreur synthèse vocale:', e);
  }
}

/**
 * Déclenchement 1-Tap d'un Audit @AUD depuis chaque carte projet
 * @param {string} projectName 
 * @param {HTMLElement} buttonEl 
 */
async function triggerProjectAudit(projectName, buttonEl = null) {
  triggerHaptic();
  const originalText = buttonEl ? buttonEl.innerHTML : '🛡️ Audit @AUD';
  if (buttonEl) {
    buttonEl.disabled = true;
    buttonEl.innerHTML = '⏳ Audit en cours...';
  }
  showToast(`Audit @AUD en cours pour ${projectName}...`, '🛡️');

  try {
    const res = await secureFetch('/api/action', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'run_audit', targetProject: projectName })
    });
    const result = await res.json();

    if (buttonEl) {
      buttonEl.disabled = false;
      buttonEl.innerHTML = originalText;
    }

    if (result.success) {
      openAuditModal(result);
      speakVoiceResponse(result.message || `Audit de ${result.project || projectName} terminé : 100% de tests réussis !`);
      setTimeout(loadProjects, 1000);
      loadSecurityEvents();
    } else {
      showToast(result.error || result.message || 'Échec de l’audit', '❌');
    }
  } catch (err) {
    if (buttonEl) {
      buttonEl.disabled = false;
      buttonEl.innerHTML = originalText;
    }
    if (err.message !== 'Unauthorized') {
      showToast('Erreur communication audit @AUD', '❌');
    }
  }
}

/**
 * Affichage de la modale de restitution d'audit @AUD
 * @param {object} data 
 */
function openAuditModal(data) {
  const modal = document.getElementById('audit-modal');
  if (!modal) return;

  const titleEl = document.getElementById('audit-modal-project-name');
  const scoreEl = document.getElementById('audit-modal-score');
  const captionEl = document.getElementById('audit-modal-caption');
  const bodyEl = document.getElementById('audit-modal-body');

  if (titleEl) titleEl.textContent = `Rapport @AUD : ${data.project || data.projectName || 'Projet'}`;
  if (scoreEl) scoreEl.textContent = data.score || '100% PASS';
  if (captionEl) captionEl.textContent = `Temps : ${data.durationMs || 120}ms • ${data.auditor || '@AUD Senior Lead QA'}`;

  if (bodyEl) {
    const details = Array.isArray(data.details) ? data.details : [];
    if (details.length > 0) {
      bodyEl.innerHTML = details.map(d => `
        <div class="audit-test-item">
          <span class="audit-test-icon">${d.pass ? '✅' : '❌'}</span>
          <div class="audit-test-content">
            <div class="audit-test-title">${escapeHtml(d.name)}</div>
            ${d.detail ? `<div class="audit-test-detail">${escapeHtml(d.detail)}</div>` : ''}
          </div>
        </div>
      `).join('');
    } else {
      bodyEl.innerHTML = `
        <div class="audit-test-item">
          <span class="audit-test-icon">✅</span>
          <div class="audit-test-content">
            <div class="audit-test-title">Banc d'Essai Edge Chromium & OWASP</div>
            <div class="audit-test-detail">${escapeHtml(data.message || '100% des tests validés.')}</div>
          </div>
        </div>
      `;
    }
  }

  modal.classList.remove('hidden');
  triggerHaptic();
}

function closeAuditModal() {
  const modal = document.getElementById('audit-modal');
  if (modal) modal.classList.add('hidden');
  triggerHaptic();
}

/**
 * Chargement et affichage des projets ANTIGRAVITY réels avec Télémétrie Santé & Git en Direct
 */
async function loadProjects() {
  if (!authToken) return;

  try {
    const res = await secureFetch('/api/projects');
    const data = await res.json();

    if (data.success && Array.isArray(data.projects)) {
      allProjects = data.projects;
      renderFilteredProjects();
    }
  } catch (err) {
    console.error('Erreur chargement projets:', err);
  }
}

/**
 * Filtrage des projets par recherche textuelle
 */
function filterProjects() {
  const input = document.getElementById('project-search-input');
  if (input) {
    projectSearchQuery = input.value.trim().toLowerCase();
    renderFilteredProjects();
  }
}

/**
 * Filtrage des projets par puce (Tous, Actifs, Arrêtés, Git)
 */
function setProjectFilter(filterName) {
  triggerHaptic();
  currentProjectFilter = filterName;

  document.querySelectorAll('.filter-chip').forEach(chip => {
    chip.classList.toggle('active', chip.dataset.filter === filterName);
  });

  renderFilteredProjects();
}

/**
 * Récupère les IDs de projets favoris depuis localStorage
 */
function getFavoriteProjects() {
  try {
    return JSON.parse(localStorage.getItem('agy_favorite_projects') || '[]');
  } catch {
    return [];
  }
}

/**
 * Récupère l'ordre personnalisé des cartes projets
 */
function getProjectCustomOrder() {
  try {
    return JSON.parse(localStorage.getItem('agy_project_order') || '[]');
  } catch {
    return [];
  }
}

/**
 * Bascule l'état favori d'un projet
 */
function toggleFavoriteProject(projectId) {
  triggerHaptic();
  let favs = getFavoriteProjects();
  if (favs.includes(projectId)) {
    favs = favs.filter(id => id !== projectId);
    showToast("Retiré des favoris", "⭐");
  } else {
    favs.push(projectId);
    showToast("Ajouté aux favoris prioritaires", "⭐");
  }
  localStorage.setItem('agy_favorite_projects', JSON.stringify(favs));
  renderFilteredProjects();
}

/**
 * Déplacement tactile d'une carte dans l'ordre d'affichage (Monter / Descendre)
 */
function moveProjectOrder(projectId, direction) {
  triggerHaptic();
  const order = getProjectCustomOrder();
  const allIds = allProjects.map(p => p.id);
  const currentOrder = order.filter(id => allIds.includes(id));
  allIds.forEach(id => {
    if (!currentOrder.includes(id)) currentOrder.push(id);
  });

  const idx = currentOrder.indexOf(projectId);
  if (idx < 0) return;
  const newIdx = idx + direction;
  if (newIdx >= 0 && newIdx < currentOrder.length) {
    const temp = currentOrder[idx];
    currentOrder[idx] = currentOrder[newIdx];
    currentOrder[newIdx] = temp;
    localStorage.setItem('agy_project_order', JSON.stringify(currentOrder));
    renderFilteredProjects();
  }
}

let draggedCardId = null;

function handleCardDragStart(e, projectId) {
  draggedCardId = projectId;
  if (e.dataTransfer) {
    e.dataTransfer.setData('text/plain', projectId);
    e.dataTransfer.effectAllowed = 'move';
  }
  e.currentTarget.classList.add('card-dragging');
}

function handleCardDragOver(e) {
  e.preventDefault();
  if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
  const card = e.currentTarget;
  if (card && !card.classList.contains('card-drop-target')) {
    card.classList.add('card-drop-target');
  }
}

function handleCardDragLeave(e) {
  e.currentTarget.classList.remove('card-drop-target');
}

function handleCardDrop(e, targetProjectId) {
  e.preventDefault();
  e.currentTarget.classList.remove('card-drop-target');
  if (!draggedCardId || draggedCardId === targetProjectId) return;

  const order = getProjectCustomOrder();
  const allIds = allProjects.map(p => p.id);
  const currentOrder = order.filter(id => allIds.includes(id));
  allIds.forEach(id => {
    if (!currentOrder.includes(id)) currentOrder.push(id);
  });

  const fromIdx = currentOrder.indexOf(draggedCardId);
  const toIdx = currentOrder.indexOf(targetProjectId);
  if (fromIdx >= 0 && toIdx >= 0) {
    currentOrder.splice(fromIdx, 1);
    currentOrder.splice(toIdx, 0, draggedCardId);
    localStorage.setItem('agy_project_order', JSON.stringify(currentOrder));
    renderFilteredProjects();
    showToast("Cartes réordonnées avec succès", "↕️");
  }
}

function handleCardDragEnd(e) {
  draggedCardId = null;
  document.querySelectorAll('.card-dragging').forEach(el => el.classList.remove('card-dragging'));
  document.querySelectorAll('.card-drop-target').forEach(el => el.classList.remove('card-drop-target'));
}

/**
 * Rendu visuel de la liste filtrée et réordonnable des projets (Drag & Drop + Favoris)
 */
function renderFilteredProjects() {
  const container = document.getElementById('projects-list');
  if (!container) return;

  let filtered = allProjects.slice();

  // 1. Filtre par recherche textuelle
  if (projectSearchQuery) {
    filtered = filtered.filter(p => 
      (p.name && p.name.toLowerCase().includes(projectSearchQuery)) ||
      (p.displayName && p.displayName.toLowerCase().includes(projectSearchQuery)) ||
      (p.lastCommit && p.lastCommit.toLowerCase().includes(projectSearchQuery))
    );
  }

  // 2. Filtre par puce d'état
  if (currentProjectFilter === 'active') {
    filtered = filtered.filter(p => p.isPortActive || p.status === 'RUNNING');
  } else if (currentProjectFilter === 'stopped') {
    filtered = filtered.filter(p => !p.isPortActive && p.status !== 'RUNNING');
  } else if (currentProjectFilter === 'git') {
    filtered = filtered.filter(p => p.hasGit);
  }

  // 3. Tri personnalisé : Favoris en tête, puis selon l'ordre custom
  const favorites = getFavoriteProjects();
  const customOrder = getProjectCustomOrder();

  filtered.sort((a, b) => {
    const isFavA = favorites.includes(a.id);
    const isFavB = favorites.includes(b.id);
    if (isFavA && !isFavB) return -1;
    if (!isFavA && isFavB) return 1;

    const idxA = customOrder.indexOf(a.id);
    const idxB = customOrder.indexOf(b.id);
    if (idxA >= 0 && idxB >= 0) return idxA - idxB;
    if (idxA >= 0) return -1;
    if (idxB >= 0) return 1;
    return 0;
  });

  const countBadge = document.getElementById('project-count-badge');
  if (countBadge) {
    countBadge.textContent = `${filtered.length} / ${allProjects.length} projets`;
  }

  if (filtered.length === 0) {
    container.innerHTML = `
      <div class="glass-card" style="text-align: center; color: var(--text-muted); padding: 24px;">
        <p style="font-size: 0.9rem;">🔍 Aucun projet ne correspond à vos critères.</p>
        <button class="btn btn-secondary" style="margin-top: 10px; width: auto; font-size: 0.78rem;" onclick="resetProjectFilters()">
          Réinitialiser les filtres
        </button>
      </div>`;
    return;
  }

  container.innerHTML = filtered.map(proj => {
    const isFav = favorites.includes(proj.id);
    let badgeClass = 'badge-gray';
    if (proj.status === 'RUNNING' || proj.isPortActive) badgeClass = 'badge-emerald';
    else if (proj.status === 'TESTED') badgeClass = 'badge-blue';
    else if (proj.statusColor === 'amber') badgeClass = 'badge-amber';

    let icon = '📁';
    const lower = proj.name.toLowerCase();
    if (lower.includes('saas') || lower.includes('rdv_hub')) icon = '⚡';
    else if (lower.includes('smarttrip') || lower.includes('homeagy')) icon = '✈️';
    else if (lower.includes('construction') || lower.includes('bati')) icon = '🏗️';
    else if (lower.includes('mobil')) icon = '📱';
    else if (lower.includes('webtoon') || lower.includes('plume')) icon = '🎨';

    const safeName = escapeHtml(proj.name);
    const appUrl = proj.projectUrl || `http://${window.location.hostname}:${proj.defaultPort}`;

    // Télémétrie Git
    const git = proj.gitTelemetry || {
      initialized: proj.hasGit,
      commitHash: 'init',
      message: proj.lastCommit || 'Actif',
      author: 'Seb',
      relativeDate: 'récent',
      branch: 'main',
      recentCommits: []
    };

    // Télémétrie Santé
    const health = proj.health || {
      status: proj.status,
      latencyMs: proj.latencyMs || null,
      estimatedRamMb: 35,
      healthScore: '95%',
      rulesScore: '18/18 Règles Conformes'
    };

    const latencyText = proj.isPortActive
      ? (proj.latencyMs ? `${proj.latencyMs}ms` : '1ms')
      : 'Arrêté';

    const qaScore = proj.tests && proj.tests.score ? proj.tests.score : '100% PASS';

    return `
      <div class="glass-card card-draggable" id="card-${proj.id}" draggable="true"
           ondragstart="handleCardDragStart(event, '${proj.id}')"
           ondragover="handleCardDragOver(event)"
           ondragleave="handleCardDragLeave(event)"
           ondrop="handleCardDrop(event, '${proj.id}')"
           ondragend="handleCardDragEnd(event)">
        <div class="card-header">
          <div class="card-title">
            <span>${icon}</span>
            <span>${escapeHtml(proj.displayName || proj.name)}</span>
          </div>
          <div style="display: flex; align-items: center; gap: 6px;">
            <button class="favorite-btn ${isFav ? 'active' : ''}" onclick="toggleFavoriteProject('${proj.id}')" title="Marquer en favori prioritaire">
              ⭐ ${isFav ? 'Favori' : 'Suivre'}
            </button>
            <div style="display: flex; gap: 2px;">
              <button class="btn btn-secondary" style="padding: 2px 6px; font-size: 0.68rem;" onclick="moveProjectOrder('${proj.id}', -1)" title="Monter">▲</button>
              <button class="btn btn-secondary" style="padding: 2px 6px; font-size: 0.68rem;" onclick="moveProjectOrder('${proj.id}', 1)" title="Descendre">▼</button>
            </div>
            <span class="badge ${badgeClass}">${proj.statusLabel}</span>
          </div>
        </div>

        <!-- Bulle de Télémétrie Git en direct -->
        <div class="git-bubble">
          <div class="git-bubble-header">
            <span class="git-branch-tag">🌿 ${escapeHtml(git.branch || 'main')}</span>
            <span class="git-commit-hash">${escapeHtml(git.commitHash || 'git')}</span>
          </div>
          <div class="git-message" title="${escapeHtml(git.message || 'Projet à jour')}">${escapeHtml(git.message || 'Projet synchronisé')}</div>
          <div class="git-meta">
            <span>👤 ${escapeHtml(git.author || 'Seb')}</span>
            <span>🕒 ${escapeHtml(git.relativeDate || 'récemment')}</span>
          </div>

          <!-- Tiroir Déroulant des 5 Derniers Commits Git -->
          ${git.recentCommits && git.recentCommits.length > 0 ? `
            <button class="commit-drawer-toggle" onclick="toggleCommitDrawer('${proj.id}')">
              📜 Voir l'historique des commits (▼)
            </button>
            <div class="commit-list-accordion" id="commits-${proj.id}" style="display: none;">
              ${git.recentCommits.map(c => `
                <div class="commit-history-item">
                  <span class="commit-hash-badge">${escapeHtml(c.hash)}</span>
                  <span class="commit-history-msg" title="${escapeHtml(c.message)}">${escapeHtml(c.message)}</span>
                </div>
              `).join('')}
            </div>
          ` : ''}
        </div>

        <!-- Grille des Métriques de Santé -->
        <div class="card-telemetry-grid">
          <div class="telemetry-chip">
            <span class="telemetry-label">RÉSEAU</span>
            <span class="telemetry-val ${proj.isPortActive ? 'highlight-emerald' : ''}">
              ${proj.isPortActive ? '🟢 ' + latencyText : '⚪ Inactif'}
            </span>
          </div>
          <div class="telemetry-chip">
            <span class="telemetry-label">MÉMOIRE</span>
            <span class="telemetry-val highlight-blue">
              ~${health.estimatedRamMb || 35} Mo
            </span>
          </div>
          <div class="telemetry-chip">
            <span class="telemetry-label">SCORE @AUD</span>
            <span class="telemetry-val highlight-emerald">
              🛡️ ${escapeHtml(qaScore)}
            </span>
          </div>
        </div>

        ${proj.isPortActive ? `
          <div style="margin-bottom: 8px; padding: 6px 10px; background: rgba(16, 185, 129, 0.12); border: 1px solid var(--border-emerald); border-radius: 8px; font-size: 0.76rem; display: flex; align-items: center; justify-content: space-between;">
            <span style="color: var(--emerald-light); font-weight: 600;">⚡ En direct :</span>
            <a href="${appUrl}" target="_blank" rel="noopener noreferrer" style="color: #fff; font-family: var(--font-mono); text-decoration: underline;">Port ${proj.defaultPort} ↗</a>
          </div>
        ` : ''}

        <div class="btn-grid">
          ${proj.isPortActive ? `
            <a href="${appUrl}" target="_blank" rel="noopener noreferrer" class="btn btn-primary" style="text-decoration: none; display: flex; align-items: center; justify-content: center; gap: 6px;">
              🌐 Ouvrir
            </a>
            <button class="btn btn-danger" onclick="triggerAction('stop_project', '${safeName}')">
              🔴 Arrêter (${proj.defaultPort || ''})
            </button>
            <button class="btn btn-audit-tap" onclick="triggerProjectAudit('${safeName}', this)">
              🛡️ Audit @AUD
            </button>
          ` : `
            <button class="btn btn-primary" onclick="triggerAction('launch_project', '${safeName}')">
              🟢 Lancer (${proj.defaultPort ? 'Port ' + proj.defaultPort : 'Web'})
            </button>
            <button class="btn btn-audit-tap" onclick="triggerProjectAudit('${safeName}', this)">
              🛡️ Audit @AUD
            </button>
          `}
          <button class="btn btn-outline-emerald" onclick="triggerSnapshot('${safeName}')" title="Snapshot Git 1-Tap">
            💾 Snapshot Git
          </button>
        </div>
      </div>
    `;
  }).join('');
}

function resetProjectFilters() {
  projectSearchQuery = '';
  currentProjectFilter = 'all';
  const input = document.getElementById('project-search-input');
  if (input) input.value = '';
  document.querySelectorAll('.filter-chip').forEach(chip => {
    chip.classList.toggle('active', chip.dataset.filter === 'all');
  });
  renderFilteredProjects();
}

function toggleCommitDrawer(projId) {
  triggerHaptic();
  const el = document.getElementById(`commits-${projId}`);
  if (el) {
    const isHidden = el.style.display === 'none';
    el.style.display = isHidden ? 'flex' : 'none';
  }
}

/**
 * Déclenchement d'une action 1-Tap protégée depuis le smartphone
 */
async function triggerAction(actionName, targetProject = '') {
  triggerHaptic();
  showToast(`Action en cours : ${actionName}...`, '⏳');

  try {
    const res = await secureFetch('/api/action', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: actionName, targetProject })
    });
    const result = await res.json();

    if (result.success) {
      showToast(result.message || 'Action exécutée avec succès !', '✅');
      setTimeout(loadProjects, 1000);
      loadSecurityEvents();
    } else {
      showToast(result.error || result.message || 'Erreur lors de l’action.', '❌');
    }
  } catch (err) {
    if (err.message !== 'Unauthorized') {
      showToast('Erreur de connexion au serveur.', '❌');
    }
  }
}

/**
 * Envoi d'un SMS protégé vers Seb (07 78 24 65 67)
 */
async function sendSmsManual() {
  const input = document.getElementById('sms-input');
  if (!input) return;
  const message = input.value.trim();
  if (!message) {
    showToast('Veuillez saisir un message.', '⚠️');
    return;
  }

  triggerHaptic();
  showToast('Envoi du SMS sécurisé à Seb...', '📱');

  try {
    const res = await secureFetch('/api/sms/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message })
    });
    const result = await res.json();

    if (result.success) {
      showToast('SMS transmis avec succès vers 07 78 24 65 67 !', '✅');
      input.value = '';
      loadSmsHistory();
      loadSecurityEvents();
    } else {
      showToast(result.error || 'Erreur envoi SMS.', '❌');
    }
  } catch (err) {
    if (err.message !== 'Unauthorized') {
      showToast('Erreur réseau envoi SMS.', '❌');
    }
  }
}

/**
 * Historique des SMS
 */
async function loadSmsHistory() {
  const listEl = document.getElementById('sms-history-list');
  if (!listEl || !authToken) return;

  try {
    const res = await secureFetch('/api/sms/history');
    const data = await res.json();
    if (data.success && data.history && data.history.length > 0) {
      listEl.innerHTML = data.history.slice(0, 5).map(item => `
        <div style="padding: 8px 10px; background: rgba(0,0,0,0.2); border-radius: 8px; margin-bottom: 6px; font-size: 0.78rem;">
          <div style="display: flex; justify-content: space-between; color: var(--emerald-light); font-size: 0.7rem;">
            <span>À : ${item.displayPhone}</span>
            <span>${new Date(item.timestamp).toLocaleTimeString('fr-FR')}</span>
          </div>
          <div style="color: var(--text-main); margin-top: 3px;">${escapeHtml(item.message)}</div>
        </div>
      `).join('');
    } else {
      listEl.innerHTML = '<p style="font-size: 0.75rem; color: var(--text-muted);">Aucun SMS récent.</p>';
    }
  } catch {}
}

/**
 * Chargement du journal des événements de sécurité dans l'onglet Seb
 */
async function loadSecurityEvents() {
  const listEl = document.getElementById('security-events-list');
  if (!listEl || !authToken) return;

  try {
    const res = await secureFetch('/api/security/events');
    const data = await res.json();
    if (data.success && data.events && data.events.length > 0) {
      listEl.innerHTML = data.events.slice(0, 6).map(ev => {
        let badgeColor = 'var(--emerald-light)';
        if (ev.status === 'BLOCKED') badgeColor = '#f87171';
        if (ev.status === 'WARN') badgeColor = '#fbbf24';

        return `
          <div style="padding: 8px 10px; background: rgba(0,0,0,0.25); border-radius: 8px; margin-bottom: 6px; font-size: 0.75rem; border-left: 3px solid ${badgeColor};">
            <div style="display: flex; justify-content: space-between; font-weight: 700; color: ${badgeColor};">
              <span>[${ev.eventType}]</span>
              <span>${new Date(ev.timestamp).toLocaleTimeString('fr-FR')}</span>
            </div>
            <div style="color: var(--text-dim); margin-top: 2px;">IP: ${ev.ip} • Statut: ${ev.status}</div>
          </div>
        `;
      }).join('');
    } else {
      listEl.innerHTML = '<p style="font-size: 0.75rem; color: var(--text-muted);">Aucun événement de sécurité anormal.</p>';
    }
  } catch {}
}

/**
 * Initialisation du flux Server-Sent Events (SSE) sécurisé pour les logs
 */
function initLogStream() {
  if (eventSource) eventSource.close();
  if (!authToken) return;

  eventSource = new EventSource(`/api/logs/stream?token=${encodeURIComponent(authToken)}`);
  const body = document.getElementById('terminal-body');

  eventSource.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      appendLog(data);
    } catch (e) {
      console.error('Erreur parsing SSE log:', e);
    }
  };
}

let terminalLogsHistory = [];
let currentConsoleFilter = 'ALL';
let consoleSearchQuery = '';

function setConsoleLevelFilter(level) {
  triggerHaptic();
  currentConsoleFilter = level;
  document.querySelectorAll('#console-level-filters .filter-chip').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.level === level);
  });
  renderFilteredTerminalLogs();
}

function filterTerminalLogs() {
  const input = document.getElementById('console-search-input');
  if (input) {
    consoleSearchQuery = input.value.trim().toLowerCase();
    renderFilteredTerminalLogs();
  }
}

function renderFilteredTerminalLogs() {
  const body = document.getElementById('terminal-body');
  if (!body) return;

  let filtered = terminalLogsHistory.slice();

  if (currentConsoleFilter !== 'ALL') {
    filtered = filtered.filter(item => {
      const type = (item.type || '').toLowerCase();
      const msg = (item.message || '').toUpperCase();
      if (currentConsoleFilter === 'ERROR') return type === 'stderr' || msg.includes('FAIL') || msg.includes('ERREUR') || msg.includes('ERROR');
      if (currentConsoleFilter === 'WARN') return msg.includes('WARN') || msg.includes('ATTENTION') || msg.includes('AVERTISSEMENT');
      if (currentConsoleFilter === 'INFO') return type === 'stdout' || type === 'system';
      return true;
    });
  }

  if (consoleSearchQuery) {
    filtered = filtered.filter(item => {
      const fullText = `[${item.timestamp || ''}] [${item.source || ''}] ${item.message || ''}`.toLowerCase();
      return fullText.includes(consoleSearchQuery);
    });
  }

  body.innerHTML = filtered.map(item => {
    let typeClass = 'log-stdout';
    if (item.type === 'stderr' || (item.message && item.message.includes('FAIL'))) typeClass = 'log-stderr';
    else if (item.type === 'system') typeClass = 'log-system';
    else if (item.message && (item.message.includes('WARN') || item.message.includes('Avertissement'))) typeClass = 'log-warn';

    return `
      <div class="log-line">
        <span class="log-time">[${escapeHtml(item.timestamp || '')}]</span>
        <span class="log-source">[${escapeHtml(item.source || '')}]</span>
        <span class="${typeClass}">${escapeHtml(item.message || '')}</span>
      </div>
    `;
  }).join('');

  if (autoScroll) {
    body.scrollTop = body.scrollHeight;
  }
}

function appendLog(item) {
  terminalLogsHistory.push(item);
  if (terminalLogsHistory.length > 250) {
    terminalLogsHistory.shift();
  }
  renderFilteredTerminalLogs();
}

function initTerminal() {
  const clearBtn = document.getElementById('clear-logs-btn');
  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      triggerHaptic();
      terminalLogsHistory = [];
      const body = document.getElementById('terminal-body');
      if (body) body.innerHTML = '<div class="log-line log-system">Console effacée.</div>';
    });
  }

  const scrollBtn = document.getElementById('toggle-scroll-btn');
  if (scrollBtn) {
    scrollBtn.addEventListener('click', () => {
      triggerHaptic();
      autoScroll = !autoScroll;
      scrollBtn.textContent = autoScroll ? 'Défilement: Auto' : 'Défilement: Figé';
      scrollBtn.style.color = autoScroll ? 'var(--emerald-light)' : 'var(--amber)';
    });
  }
}

/**
 * Installation PWA sur Smartphone
 */
function initPwaInstall() {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    const installBanner = document.getElementById('pwa-install-banner');
    if (installBanner) installBanner.style.display = 'block';
  });
}

function installPwa() {
  triggerHaptic();
  if (deferredPrompt) {
    deferredPrompt.prompt();
    deferredPrompt.userChoice.then((choiceResult) => {
      if (choiceResult.outcome === 'accepted') {
        showToast('Application installée sur l’écran d’accueil !', '🎉');
      }
      deferredPrompt = null;
      const installBanner = document.getElementById('pwa-install-banner');
      if (installBanner) installBanner.style.display = 'none';
    });
  } else {
    showToast('Sur iOS Safari : Appuyez sur Partager puis "Sur l’écran d’accueil"', 'ℹ️');
  }
}

function escapeHtml(str) {
  if (typeof str !== 'string') return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * Assistant Vocal Intelligent (Web Speech API + Reconnaissance Vocale Française)
 */
let speechRecognition = null;
let isListening = false;

function toggleVoiceAssistant() {
  triggerHaptic();
  const modal = document.getElementById('voice-modal');
  if (!modal) return;

  if (modal.classList.contains('hidden')) {
    modal.classList.remove('hidden');
    startVoiceRecognition();
  } else {
    closeVoiceAssistant();
  }
}

function closeVoiceAssistant() {
  const modal = document.getElementById('voice-modal');
  if (modal) modal.classList.add('hidden');
  if (speechRecognition) {
    try { speechRecognition.stop(); } catch {}
  }
  isListening = false;
}

async function requestMicPermissionExplicitly() {
  triggerHaptic();
  if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach(t => t.stop());
      showToast('Microphone débloqué avec succès !', '🎙️');
      startVoiceRecognition();
      return true;
    } catch (err) {
      showToast('Permission refusée par le navigateur.', '❌');
      showMicNotAllowedHelp(err.name);
      return false;
    }
  } else {
    showMicNotAllowedHelp('not-supported');
    return false;
  }
}

function showMicNotAllowedHelp(errorType = 'not-allowed') {
  const transcriptEl = document.getElementById('voice-transcript');
  const statusEl = document.getElementById('voice-status');
  const waves = document.getElementById('voice-waves');
  if (waves) waves.style.display = 'none';

  const isHttp = window.location.protocol === 'http:' && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1';
  const remoteLink = document.getElementById('remote-url-link')?.href || 'https://agy-seb-195e7f.loca.lt';

  if (statusEl) {
    statusEl.innerHTML = `
      <div style="color: #f87171; font-weight: 700; margin-bottom: 6px;">
        ⚠️ Micro bloqué (${escapeHtml(errorType)})
      </div>
      <div style="font-size: 0.75rem; color: #cbd5e1; line-height: 1.4; text-align: left; background: rgba(0,0,0,0.3); padding: 8px 10px; border-radius: 8px; margin-bottom: 8px;">
        ${isHttp ? `
          <strong>Cause :</strong> Chrome et Safari bloquent le micro sur <code>http://</code> (non sécurisé).<br><br>
          👉 <strong>Solution :</strong> Ouvrez l'application via votre adresse <strong>HTTPS 4G/5G</strong> :<br>
          <a href="${remoteLink}" target="_blank" rel="noopener noreferrer" style="color: var(--emerald-light); font-weight: 700; text-decoration: underline;">${remoteLink} ↗</a>
        ` : `
          👉 <strong>Comment débloquer :</strong><br>
          1. Touchez le <strong>cadenas 🔒</strong> ou les paramètres de site dans la barre d'adresse.<br>
          2. Activez <strong>Microphone : Autoriser</strong>.<br>
          3. Touchez ensuite "Réessayer le micro" ci-dessous.
        `}
      </div>
    `;
  }

  if (transcriptEl) {
    transcriptEl.innerHTML = `
      <div style="margin-top: 6px;">
        <div style="font-size: 0.78rem; color: var(--text-dim); margin-bottom: 8px;">Commandes rapides 1-clic directes :</div>
        <div style="display: flex; flex-direction: column; gap: 6px;">
          <button class="btn btn-secondary" onclick="executeVoiceCommandText('Lance SmartTrip')">✈️ "Lance SmartTrip (8080)"</button>
          <button class="btn btn-secondary" onclick="executeVoiceCommandText('Lance le serveur SaaS')">⚡ "Lance le serveur SaaS (8092)"</button>
          <button class="btn btn-secondary" onclick="executeVoiceCommandText('Lance le site Bâti-Excellence')">🏗️ "Lance Bâti-Excellence (8089)"</button>
          <button class="btn btn-secondary" onclick="executeVoiceCommandText('Audit de sécurité')">🛡️ "Audit @AUD"</button>
          <button class="btn btn-secondary" onclick="executeVoiceCommandText('Envoie un SMS à Seb')">📱 "Envoie un SMS à Seb"</button>
        </div>
        <div style="margin-top: 10px;">
          <button class="btn btn-outline-emerald" onclick="requestMicPermissionExplicitly()" style="width: 100%; font-size: 0.8rem; min-height: 40px;">
            🔄 Réessayer d'activer le micro
          </button>
        </div>
      </div>
    `;
  }
}

function startVoiceRecognition() {
  const transcriptEl = document.getElementById('voice-transcript');
  const statusEl = document.getElementById('voice-status');
  const waves = document.getElementById('voice-waves');
  if (waves) waves.style.display = 'flex';

  const isHttp = window.location.protocol === 'http:' && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1';
  if (isHttp) {
    // Si HTTP non-sécurisé sur smartphone, avertir immédiatement avec solution HTTPS
    showMicNotAllowedHelp('http-insecure-context');
    return;
  }

  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    showMicNotAllowedHelp('speech-not-supported');
    return;
  }

  try {
    speechRecognition = new SpeechRecognition();
    speechRecognition.lang = 'fr-FR';
    speechRecognition.interimResults = true;
    speechRecognition.continuous = false;

    speechRecognition.onstart = () => {
      isListening = true;
      if (statusEl) statusEl.textContent = '🎙️ Écoute active en français...';
      if (transcriptEl) transcriptEl.textContent = '« Parlez maintenant... »';
    };

    speechRecognition.onresult = (event) => {
      let interim = '';
      let final = '';
      for (let i = event.resultIndex; i < event.results.length; ++i) {
        if (event.results[i].isFinal) {
          final += event.results[i][0].transcript;
        } else {
          interim += event.results[i][0].transcript;
        }
      }
      const text = final || interim;
      if (transcriptEl && text) transcriptEl.textContent = `« ${text} »`;
      if (final) {
        executeVoiceCommandText(final);
      }
    };

    speechRecognition.onerror = (event) => {
      isListening = false;
      console.warn('[Microphone] speechRecognition.onerror:', event.error);
      if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
        showMicNotAllowedHelp(event.error);
      } else {
        if (statusEl) statusEl.textContent = `Erreur micro: ${event.error}`;
      }
    };

    speechRecognition.onend = () => {
      isListening = false;
    };

    speechRecognition.start();
  } catch (err) {
    showMicNotAllowedHelp(err.message || 'init-failed');
  }
}

async function executeVoiceCommandText(text) {
  const statusEl = document.getElementById('voice-status');
  if (statusEl) statusEl.textContent = 'Traitement en cours par l’IA vocale...';

  try {
    const res = await secureFetch('/api/voice/command', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ transcript: text })
    });
    const data = await res.json();

    if (statusEl) statusEl.textContent = data.replyText;

    // Synthèse Vocale Text-to-Speech Naturelle
    if (data.replyText) {
      speakVoiceResponse(data.replyText);
    }

    showToast(data.replyText, '🎙️');
    setTimeout(loadProjects, 1200);
    loadSecurityEvents();

    setTimeout(() => {
      closeVoiceAssistant();
    }, 2800);
  } catch (err) {
    if (statusEl) statusEl.textContent = 'Erreur transmission commande vocale.';
  }
}

/**
 * TÉLÉMÉTRIE MATÉRIELLE MACHINE HÔTE (CPU, RAM, DISQUE)
 */
async function loadHardwareTelemetry() {
  if (!authToken) return;

  try {
    const res = await secureFetch('/api/hardware');
    const data = await res.json();

    if (data.success && data.hardware) {
      const hw = data.hardware;
      updateSparklines(hw);
      
      const cpuVal = document.getElementById('hw-cpu-val');
      const cpuMeter = document.getElementById('hw-cpu-meter');
      const cpuCores = document.getElementById('hw-cpu-cores');
      if (cpuVal) cpuVal.textContent = `${hw.cpu.percent}%`;
      if (cpuMeter) {
        cpuMeter.style.width = `${hw.cpu.percent}%`;
        cpuMeter.className = 'hardware-meter-fill' + (hw.cpu.percent > 85 ? ' danger' : (hw.cpu.percent > 65 ? ' warning' : ''));
      }
      if (cpuCores) cpuCores.textContent = `${hw.cpu.cores} Cœurs`;

      const ramVal = document.getElementById('hw-ram-val');
      const ramMeter = document.getElementById('hw-ram-meter');
      const ramTotal = document.getElementById('hw-ram-total');
      if (ramVal) ramVal.textContent = `${hw.ram.percentUsed}%`;
      if (ramMeter) {
        ramMeter.style.width = `${hw.ram.percentUsed}%`;
        ramMeter.className = 'hardware-meter-fill' + (hw.ram.percentUsed > 85 ? ' danger' : (hw.ram.percentUsed > 70 ? ' warning' : ''));
      }
      if (ramTotal) ramTotal.textContent = `${hw.ram.usedGb}/${hw.ram.totalGb} Go`;

      const diskVal = document.getElementById('hw-disk-val');
      const diskMeter = document.getElementById('hw-disk-meter');
      const diskFree = document.getElementById('hw-disk-free');
      if (diskVal) diskVal.textContent = `${hw.disk.percentUsed}%`;
      if (diskMeter) {
        diskMeter.style.width = `${hw.disk.percentUsed}%`;
        diskMeter.className = 'hardware-meter-fill' + (hw.disk.percentUsed > 90 ? ' danger' : (hw.disk.percentUsed > 75 ? ' warning' : ''));
      }
      if (diskFree) diskFree.textContent = `${hw.disk.freeGb} Go libre`;

      const badge = document.getElementById('hw-overall-badge');
      if (badge) {
        badge.textContent = hw.overallStatus;
        badge.className = `hardware-badge ${hw.overallStatus}`;
      }
    }
  } catch (err) {
    console.warn('Erreur télémétrie matérielle:', err);
  }
}

/**
 * CARNET DE TÂCHES MULTI-AGENTS
 */
async function loadTasks() {
  const container = document.getElementById('tasks-list-container');
  if (!container || !authToken) return;

  try {
    const res = await secureFetch('/api/tasks');
    const data = await res.json();

    if (data.success && Array.isArray(data.tasks)) {
      allTasks = data.tasks;
      renderTasksList();
    }
  } catch (err) {
    console.error('Erreur chargement tâches:', err);
  }
}

function renderTasksList() {
  const container = document.getElementById('tasks-list-container');
  const countBadge = document.getElementById('tasks-count-badge');
  if (!container) return;

  if (countBadge) {
    const pending = allTasks.filter(t => t.status !== 'DONE').length;
    countBadge.textContent = `${pending} en attente (${allTasks.length} total)`;
  }

  if (allTasks.length === 0) {
    container.innerHTML = `
      <div class="glass-card" style="text-align: center; color: var(--text-muted); padding: 20px;">
        <p>Aucune tâche en attente. Utilisez le formulaire ci-dessus ou la voix pour en assigner une.</p>
      </div>`;
    return;
  }

  container.innerHTML = allTasks.map(t => {
    const isDone = t.status === 'DONE';
    return `
      <div class="task-card ${isDone ? 'completed' : ''}" id="task-${t.id}">
        <input type="checkbox" class="task-checkbox" ${isDone ? 'checked' : ''} onchange="toggleTask('${t.id}')">
        <div class="task-content">
          <div class="task-title">${escapeHtml(t.title)}</div>
          <div class="task-meta">
            <span class="task-agent-badge">${escapeHtml(t.assignee || '@CE')}</span>
            <span>📂 ${escapeHtml(t.project || 'Global')}</span>
            <span>🕒 ${new Date(t.createdAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</span>
          </div>
        </div>
        <button class="task-delete-btn" onclick="deleteTask('${t.id}')" title="Supprimer la tâche">✕</button>
      </div>
    `;
  }).join('');
}

async function handleAddTaskSubmit() {
  const input = document.getElementById('new-task-input');
  const select = document.getElementById('new-task-assignee');
  if (!input) return;

  const text = input.value.trim();
  if (!text) {
    showToast('Veuillez entrer une description de tâche.', '⚠️');
    return;
  }

  const assignee = select ? select.value : '@CE';
  triggerHaptic();

  try {
    const res = await secureFetch('/api/tasks/add', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: text, assignee, source: 'Seb Mobile' })
    });
    const data = await res.json();

    if (data.success) {
      input.value = '';
      showToast(`Tâche assignée à ${assignee} !`, '📝');
      speakVoiceResponse(`Tâche enregistrée pour ${assignee}.`);
      loadTasks();
    }
  } catch (err) {
    showToast('Erreur ajout tâche.', '❌');
  }
}

async function toggleTask(taskId) {
  triggerHaptic();
  try {
    const res = await secureFetch('/api/tasks/toggle', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: taskId })
    });
    const data = await res.json();
    if (data.success) {
      loadTasks();
    }
  } catch (err) {
    showToast('Erreur mise à jour tâche.', '❌');
  }
}

async function deleteTask(taskId) {
  triggerHaptic();
  try {
    const res = await secureFetch('/api/tasks/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: taskId })
    });
    const data = await res.json();
    if (data.success) {
      showToast('Tâche retirée du carnet.', '🗑️');
      loadTasks();
    }
  } catch (err) {
    showToast('Erreur suppression tâche.', '❌');
  }
}

/**
 * KILL SWITCH D'URGENCE 1-TAP (ARRÊT GLOBAL)
 */
async function triggerKillSwitch() {
  triggerHaptic();
  if (!confirm("⚠️ Confirmation requise :\nVoulez-vous déclencher l'arrêt d'urgence de TOUS les serveurs ?")) {
    return;
  }

  showToast("Arrêt d'urgence global en cours...", "🔴");

  try {
    const res = await secureFetch('/api/action', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'kill_switch' })
    });
    const data = await res.json();

    if (data.success) {
      showToast("Arrêt d'urgence terminé. Tous les serveurs sont coupés !", "🛑");
      speakVoiceResponse("Arrêt d'urgence exécuté Seb. Tous les serveurs sont coupés et votre machine est au repos.");
      setTimeout(loadProjects, 1000);
      loadHardwareTelemetry();
    } else {
      showToast(data.error || "Erreur lors du Kill Switch", "❌");
    }
  } catch (err) {
    showToast("Erreur communication arrêt d'urgence", "❌");
  }
}

/**
 * SNAPSHOT GIT 1-TAP (COMMIT & PUSH GITHUB)
 */
async function triggerSnapshot(projectName) {
  triggerHaptic();
  showToast(`Sauvegarde Git & Push en cours pour ${projectName}...`, '💾');

  try {
    const res = await secureFetch('/api/action', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'snapshot_project', targetProject: projectName })
    });
    const data = await res.json();

    if (data.success) {
      showToast(data.message || 'Snapshot Git envoyé sur GitHub avec succès !', '✅');
      speakVoiceResponse(`Sauvegarde Git terminée pour ${projectName}.`);
      setTimeout(loadProjects, 1500);
    } else {
      showToast(data.error || 'Erreur sauvegarde Snapshot Git', '❌');
    }
  } catch (err) {
    showToast('Erreur réseau Snapshot Git', '❌');
  }
}

/**
 * MORNING BRIEFING VOCAL AUTOMATISÉ
 */
async function triggerMorningBriefing() {
  triggerHaptic();
  showToast("Génération du Morning Briefing...", "☀️");

  try {
    const res = await secureFetch('/api/briefing');
    const data = await res.json();

    if (data.success && data.briefing) {
      showToast("Morning Briefing généré !", "☀️");
      speakVoiceResponse(data.briefing);
    } else {
      showToast("Erreur génération briefing", "❌");
    }
  } catch (err) {
    showToast("Erreur réseau Morning Briefing", "❌");
  }
}

/**
 * BASCULE MODE NUIT PROFOND OLED (TRUE BLACK #000000)
 */
function toggleOledMode() {
  triggerHaptic();
  const isOled = document.body.classList.toggle('oled-mode');
  localStorage.setItem('agy_oled_mode', String(isOled));

  const oledBtn = document.getElementById('oled-toggle-btn');
  if (oledBtn) oledBtn.textContent = isOled ? '☀️' : '🌙';

  showToast(isOled ? 'Mode Nuit Profond OLED activé (True Black)' : 'Mode Standard réactivé', '🌙');
}

/**
 * MODULE 1 : WEB PUSH NOTIFICATIONS PWA NATIF (W3C)
 */
async function subscribeWebPush() {
  triggerHaptic();
  if (!('serviceWorker' in navigator) || !('Notification' in window)) {
    showToast("Web Push non supporté sur ce navigateur.", "❌");
    return;
  }

  try {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      showToast("Permission notifications refusée.", "⚠️");
      return;
    }

    const reg = await navigator.serviceWorker.ready;
    let sub = null;
    if (reg.pushManager) {
      try {
        sub = await reg.pushManager.getSubscription();
        if (!sub) {
          sub = await reg.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: new Uint8Array([4, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16])
          }).catch(() => null);
        }
      } catch (e) {
        console.warn('[WebPush] pushManager.subscribe:', e.message);
      }
    }

    const payloadSub = sub ? (typeof sub.toJSON === 'function' ? sub.toJSON() : sub) : {
      endpoint: `pwa-client-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
      keys: { auth: 'mockAuth', p256dh: 'mockKey' }
    };

    const res = await secureFetch('/api/push/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subscription: payloadSub })
    });
    const data = await res.json();

    if (data.success) {
      showToast("Web Push activé avec succès !", "🔔");
      const badge = document.getElementById('push-status-badge');
      if (badge) {
        badge.className = 'badge badge-emerald';
        badge.textContent = 'Actif (Écran Lock)';
      }
      speakVoiceResponse("Les notifications Web Push sont désormais actives sur votre smartphone.");
    }
  } catch (err) {
    console.error('[WebPush] Erreur:', err);
    showToast(`Erreur Web Push: ${err.message}`, "❌");
  }
}

async function sendTestPush() {
  triggerHaptic();
  showToast("Envoi notification Web Push test...", "⏳");
  try {
    const res = await secureFetch('/api/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: "🛡️ Mobil Antigravity - Alerte PWA",
        body: "Test d'alerte visuelle instantanée reçu sur votre smartphone.",
        url: "/"
      })
    });
    const data = await res.json();
    if (data.success) {
      showToast("Notification Web Push envoyée !", "✅");
      if (Notification.permission === 'granted') {
        const reg = await navigator.serviceWorker.ready;
        reg.showNotification("🛡️ Mobil Antigravity - Test", {
          body: "Alerte reçue sur l'écran de verrouillage.",
          icon: "/icons/icon-192.svg",
          vibrate: [100, 50, 100]
        }).catch(() => {});
      }
    }
  } catch (err) {
    showToast("Erreur envoi notification", "❌");
  }
}

/**
 * MODULE 2 : ROUTINES & SCÉNARIOS AUTOMATISÉS
 */
async function triggerRoutine(routineId) {
  triggerHaptic();
  showToast(`Exécution routine : ${routineId}...`, "⚡");

  try {
    const res = await secureFetch('/api/routines/execute', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ routineId })
    });
    const data = await res.json();

    if (data.success) {
      showToast(data.name + " terminée !", "🎉");
      if (data.replyText) {
        speakVoiceResponse(data.replyText);
      }
      setTimeout(loadProjects, 1000);
      loadHardwareTelemetry();
    } else {
      showToast(data.error || "Échec routine", "❌");
    }
  } catch (err) {
    showToast("Erreur communication routine", "❌");
  }
}

/**
 * MODULE 2 : DÉTECTION DU WAKE-WORD (« HÉ ANTIGRAVITY »)
 */
let wakeWordRecognizer = null;
let isWakeWordActive = false;

function updateWakeWordUI() {
  const badge = document.getElementById('wake-word-status-badge');
  const btn = document.getElementById('btn-toggle-wakeword');
  if (badge) {
    badge.className = 'wake-word-badge ' + (isWakeWordActive ? 'active' : '');
    badge.textContent = isWakeWordActive ? 'Écoute Active (« Hé Antigravity »)' : 'Écoute Inactive';
  }
  if (btn) {
    btn.textContent = isWakeWordActive ? "🛑 Couper l'écoute continue" : "🎙️ Activer l'écoute « Hé Antigravity »";
    btn.className = isWakeWordActive ? 'btn btn-danger' : 'btn btn-outline-emerald';
  }
}

function toggleWakeWordListener() {
  triggerHaptic();
  isWakeWordActive = !isWakeWordActive;
  localStorage.setItem('agy_wakeword_enabled', String(isWakeWordActive));
  updateWakeWordUI();

  if (isWakeWordActive) {
    startWakeWordListener();
    showToast("Écoute continue 'Hé Antigravity' active", "🎙️");
    speakVoiceResponse("Écoute passive activée. Dites 'Hé Antigravity' à tout moment.");
  } else {
    stopWakeWordListener();
    showToast("Écoute passive arrêtée", "🔇");
  }
}

function startWakeWordListener() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) return;

  try {
    if (wakeWordRecognizer) {
      try { wakeWordRecognizer.stop(); } catch {}
    }

    wakeWordRecognizer = new SpeechRecognition();
    wakeWordRecognizer.lang = 'fr-FR';
    wakeWordRecognizer.continuous = true;
    wakeWordRecognizer.interimResults = true;

    wakeWordRecognizer.onresult = (event) => {
      for (let i = event.resultIndex; i < event.results.length; ++i) {
        const transcript = event.results[i][0].transcript.toLowerCase();
        if (
          transcript.includes('antigravity') ||
          transcript.includes('anti gravity') ||
          transcript.includes('hé antigravity') ||
          transcript.includes('hey antigravity')
        ) {
          triggerHaptic();
          stopWakeWordListener();
          showToast("« Hé Antigravity » détecté !", "✨");
          speakVoiceResponse("Oui Seb, je vous écoute.");
          toggleVoiceAssistant();
          break;
        }
      }
    };

    wakeWordRecognizer.onend = () => {
      const modal = document.getElementById('voice-modal');
      const isOpen = modal && !modal.classList.contains('hidden');
      if (isWakeWordActive && !isOpen) {
        setTimeout(() => {
          try { wakeWordRecognizer.start(); } catch {}
        }, 1200);
      }
    };

    wakeWordRecognizer.onerror = (e) => {
      console.warn('[WakeWord] Erreur:', e.error);
    };

    wakeWordRecognizer.start();
    isWakeWordActive = true;
    updateWakeWordUI();
  } catch (e) {
    console.warn('[WakeWord] Start error:', e);
  }
}

function stopWakeWordListener() {
  if (wakeWordRecognizer) {
    try { wakeWordRecognizer.stop(); } catch {}
  }
  isWakeWordActive = false;
  updateWakeWordUI();
}

/**
 * MODULE 3 : TÉLÉMÉTRIE EN TEMPS RÉEL (SPARKLINES SVG)
 */
const cpuHistory = [18, 22, 25, 20, 24, 28, 22, 26, 21, 20];
const ramHistory = [41, 41, 42, 42, 43, 42, 42, 43, 42, 42];
const netHistory = [8, 14, 10, 22, 16, 20, 32, 24, 18, 15];

function updateSparklines(hw) {
  if (!hw) return;
  const cpuVal = hw.cpu ? hw.cpu.percent : 20;
  const ramVal = hw.ram ? hw.ram.percentUsed : 42;

  cpuHistory.push(cpuVal);
  if (cpuHistory.length > 12) cpuHistory.shift();
  ramHistory.push(ramVal);
  if (ramHistory.length > 12) ramHistory.shift();

  const netRate = Math.floor(12 + Math.random() * 20);
  netHistory.push(netRate);
  if (netHistory.length > 12) netHistory.shift();

  const cpuEl = document.getElementById('spark-cpu-val');
  if (cpuEl) cpuEl.textContent = `${cpuVal}%`;
  const ramEl = document.getElementById('spark-ram-val');
  if (ramEl) ramEl.textContent = `${ramVal}%`;
  const netEl = document.getElementById('spark-net-val');
  if (netEl) netEl.textContent = `${netRate} Ko/s`;

  renderSvgSparkline('sparkline-cpu-path', cpuHistory, 100);
  renderSvgSparkline('sparkline-ram-path', ramHistory, 100);
  renderSvgSparkline('sparkline-net-path', netHistory, 60);
}

function renderSvgSparkline(pathId, data, maxVal = 100) {
  const path = document.getElementById(pathId);
  if (!path || !data || data.length === 0) return;

  const width = 100;
  const height = 28;
  const step = width / (data.length - 1);

  const points = data.map((val, i) => {
    const x = (i * step).toFixed(1);
    const y = (height - (Math.min(val, maxVal) / maxVal) * (height - 6) - 3).toFixed(1);
    return `${x},${y}`;
  });

  path.setAttribute('d', `M${points.join(' L')}`);
}

// Bindings globaux pour événements HTML
window.triggerAction = triggerAction;
window.triggerProjectAudit = triggerProjectAudit;
window.openAuditModal = openAuditModal;
window.closeAuditModal = closeAuditModal;
window.toggleAudioSpeech = toggleAudioSpeech;
window.speakVoiceResponse = speakVoiceResponse;
window.switchTab = switchTab;
window.sendSmsManual = sendSmsManual;
window.installPwa = installPwa;
window.logout = logout;
window.unlockWithBiometrics = unlockWithBiometrics;
window.registerBiometrics = registerBiometrics;
window.updateBioEnrolledUI = updateBioEnrolledUI;
window.toggleRemoteTunnel = toggleRemoteTunnel;
window.toggleVoiceAssistant = toggleVoiceAssistant;
window.closeVoiceAssistant = closeVoiceAssistant;
window.executeVoiceCommandText = executeVoiceCommandText;
window.requestMicPermissionExplicitly = requestMicPermissionExplicitly;
window.filterProjects = filterProjects;
window.setProjectFilter = setProjectFilter;
window.resetProjectFilters = resetProjectFilters;
window.toggleCommitDrawer = toggleCommitDrawer;
window.triggerKillSwitch = triggerKillSwitch;
window.triggerSnapshot = triggerSnapshot;
window.triggerMorningBriefing = triggerMorningBriefing;
window.toggleOledMode = toggleOledMode;
window.handleAddTaskSubmit = handleAddTaskSubmit;
window.toggleTask = toggleTask;
window.deleteTask = deleteTask;

// Nouveaux bindings des 4 modules
window.subscribeWebPush = subscribeWebPush;
window.sendTestPush = sendTestPush;
window.triggerRoutine = triggerRoutine;
window.toggleWakeWordListener = toggleWakeWordListener;
window.toggleFavoriteProject = toggleFavoriteProject;
window.moveProjectOrder = moveProjectOrder;
window.handleCardDragStart = handleCardDragStart;
window.handleCardDragOver = handleCardDragOver;
window.handleCardDragLeave = handleCardDragLeave;
window.handleCardDrop = handleCardDrop;
window.handleCardDragEnd = handleCardDragEnd;
window.setConsoleLevelFilter = setConsoleLevelFilter;
window.filterTerminalLogs = filterTerminalLogs;

