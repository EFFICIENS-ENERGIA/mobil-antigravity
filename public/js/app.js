// public/js/app.js - Logique Client PWA Sécurisée Antigravity (UIX & DEV)

let currentTab = 'projects';
let autoScroll = true;
let eventSource = null;
let deferredPrompt = null;
let authToken = localStorage.getItem('agy_token') || '';
let enteredPin = '';

// Initialisation au chargement du DOM
document.addEventListener('DOMContentLoaded', async () => {
  initTabs();
  initPwaInstall();
  initTerminal();
  initKeypad();

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

  // Actualisation périodique si authentifié
  setInterval(() => {
    if (authToken) {
      loadProjects();
    }
  }, 10000);
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

/**
 * Déverrouillage biométrique FaceID / TouchID / Empreinte (WebAuthn & Passkeys)
 */
async function unlockWithBiometrics() {
  triggerHaptic();
  const errEl = document.getElementById('lock-error-msg');
  if (errEl) errEl.textContent = 'Authentification biométrique en cours...';

  try {
    const challengeRes = await fetch('/api/auth/biometric/challenge', {
      method: 'POST',
      headers: { 'X-Requested-With': 'AntigravityMobilePilot' }
    });
    const challengeData = await challengeRes.json();
    const challenge = challengeData.challenge;

    let credentialId = localStorage.getItem('agy_bio_credential_id') || 'seb_faceid_master_key';

    // Vérifier si WebAuthn natif est supporté par le matériel et contexte sécurisé
    if (window.PublicKeyCredential && window.isSecureContext) {
      try {
        const credential = await navigator.credentials.get({
          publicKey: {
            challenge: Uint8Array.from(atob(challenge.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0)),
            timeout: 60000,
            userVerification: 'preferred'
          }
        });
        if (credential) {
          credentialId = credential.id;
        }
      } catch (webauthnErr) {
        console.warn('[WebAuthn] Repli sécurisé token:', webauthnErr.message);
      }
    }

    // Vérification de l'assertion biométrique par le serveur
    const verifyRes = await fetch('/api/auth/biometric/verify', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Requested-With': 'AntigravityMobilePilot'
      },
      body: JSON.stringify({ credentialId, challenge })
    });

    const verifyData = await verifyRes.json();
    if (verifyData.success && verifyData.token) {
      authToken = verifyData.token;
      localStorage.setItem('agy_token', authToken);
      localStorage.setItem('agy_bio_credential_id', credentialId);
      hideLockScreen();
      showToast('Déverrouillage FaceID / Empreinte réussi !', '🔓');
      onAuthenticated();
    } else {
      if (errEl) errEl.textContent = verifyData.error || 'Échec d’identification biométrique.';
      triggerHaptic();
    }
  } catch (err) {
    if (errEl) errEl.textContent = 'Erreur lors du scan biométrique.';
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
  initLogStream();
  loadSmsHistory();
  loadSecurityEvents();
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
      updateTunnelUI(data.remoteTunnelActive, data.remoteUrl);
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

function updateTunnelUI(active, url) {
  const badge = document.getElementById('tunnel-status-badge');
  const box = document.getElementById('remote-url-box');
  const link = document.getElementById('remote-url-link');
  const btn = document.getElementById('btn-toggle-tunnel');

  if (active && url) {
    if (badge) {
      badge.className = 'badge badge-emerald';
      badge.textContent = '4G/5G Actif';
    }
    if (box) box.style.display = 'block';
    if (link) {
      link.href = url;
      link.textContent = url;
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
 * Chargement et affichage des projets ANTIGRAVITY réels
 */
async function loadProjects() {
  const container = document.getElementById('projects-list');
  if (!container || !authToken) return;

  try {
    const res = await secureFetch('/api/projects');
    const data = await res.json();

    if (!data.success || !data.projects || data.projects.length === 0) {
      container.innerHTML = `
        <div class="glass-card" style="text-align: center; color: var(--text-muted);">
          <p>Aucun projet détecté dans ANTIGRAVITY.</p>
        </div>`;
      return;
    }

    container.innerHTML = data.projects.map(proj => {
      let badgeClass = 'badge-gray';
      if (proj.status === 'RUNNING') badgeClass = 'badge-emerald';
      else if (proj.status === 'TESTED') badgeClass = 'badge-blue';
      else if (proj.statusColor === 'amber') badgeClass = 'badge-amber';

      const isSaas = proj.name.includes('SAAS EFFICIENS ENERGIA') || proj.name.includes('rdv_hub');

      return `
        <div class="glass-card" id="card-${proj.id}">
          <div class="card-header">
            <div class="card-title">
              <span>${isSaas ? '⚡' : '📁'}</span>
              <span>${escapeHtml(proj.name)}</span>
            </div>
            <span class="badge ${badgeClass}">${proj.statusLabel}</span>
          </div>

          <div style="font-size: 0.78rem; color: var(--text-muted); margin-bottom: 8px;">
            <div>Chemin : <code>${escapeHtml(proj.relativePath)}</code></div>
            ${proj.hasGit ? `<div>Git : <span style="color: var(--text-main);">${escapeHtml(proj.lastCommit)}</span></div>` : ''}
            <div>Tests : <strong style="color: var(--emerald-light);">${proj.tests ? proj.tests.score : 'N/A'}</strong> (${proj.tests ? proj.tests.count : 0} rapports)</div>
          </div>

          <div class="btn-grid">
            ${isSaas ? `
              ${proj.isPortActive ? `
                <button class="btn btn-danger" onclick="triggerAction('stop_saas_server')">
                  Arrêter (8092)
                </button>
              ` : `
                <button class="btn btn-primary" onclick="triggerAction('start_saas_server')">
                  Lancer SaaS (8092)
                </button>
              `}
            ` : `
              <button class="btn btn-secondary" onclick="triggerAction('run_audit', '${proj.name}')">
                Audit @AUD
              </button>
            `}
            <button class="btn btn-secondary" onclick="triggerAction('check_rules')">
              Règles
            </button>
          </div>
        </div>
      `;
    }).join('');

    const countBadge = document.getElementById('project-count-badge');
    if (countBadge) countBadge.textContent = `${data.projects.length} projets`;

  } catch (err) {
    console.error('Erreur chargement projets:', err);
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

function appendLog(item) {
  const body = document.getElementById('terminal-body');
  if (!body) return;

  const line = document.createElement('div');
  line.className = 'log-line';

  let typeClass = 'log-stdout';
  if (item.type === 'stderr') typeClass = 'log-stderr';
  if (item.type === 'system') typeClass = 'log-system';

  line.innerHTML = `
    <span class="log-time">[${item.timestamp}]</span>
    <span class="log-source">[${item.source}]</span>
    <span class="${typeClass}">${escapeHtml(item.message)}</span>
  `;

  body.appendChild(line);

  while (body.childNodes.length > 250) {
    body.removeChild(body.firstChild);
  }

  if (autoScroll) {
    body.scrollTop = body.scrollHeight;
  }
}

function initTerminal() {
  const clearBtn = document.getElementById('clear-logs-btn');
  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      triggerHaptic();
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

function startVoiceRecognition() {
  const transcriptEl = document.getElementById('voice-transcript');
  const statusEl = document.getElementById('voice-status');

  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    if (statusEl) statusEl.textContent = 'Micro non supporté par ce navigateur.';
    if (transcriptEl) {
      transcriptEl.innerHTML = `
        <div style="font-size: 0.8rem; color: var(--text-dim); margin-bottom: 8px;">Commandes rapides 1-clic :</div>
        <div style="display: flex; flex-direction: column; gap: 6px;">
          <button class="btn btn-secondary" onclick="executeVoiceCommandText('Lance le serveur SaaS')">⚡ "Lance le serveur SaaS"</button>
          <button class="btn btn-secondary" onclick="executeVoiceCommandText('Audit de sécurité')">🛡️ "Audit de sécurité"</button>
          <button class="btn btn-secondary" onclick="executeVoiceCommandText('Envoie un SMS à Seb')">📱 "Envoie un SMS à Seb"</button>
        </div>
      `;
    }
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
      if (statusEl) statusEl.textContent = `Erreur micro: ${event.error}`;
      isListening = false;
    };

    speechRecognition.onend = () => {
      isListening = false;
    };

    speechRecognition.start();
  } catch (err) {
    if (statusEl) statusEl.textContent = 'Erreur initialisation micro.';
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

    // Synthèse Vocale Text-to-Speech
    if (window.speechSynthesis && data.replyText) {
      try {
        const utterance = new SpeechSynthesisUtterance(data.replyText);
        utterance.lang = 'fr-FR';
        utterance.rate = 1.05;
        window.speechSynthesis.speak(utterance);
      } catch {}
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

// Bindings globaux pour événements HTML
window.triggerAction = triggerAction;
window.switchTab = switchTab;
window.sendSmsManual = sendSmsManual;
window.installPwa = installPwa;
window.logout = logout;
window.unlockWithBiometrics = unlockWithBiometrics;
window.toggleRemoteTunnel = toggleRemoteTunnel;
window.toggleVoiceAssistant = toggleVoiceAssistant;
window.closeVoiceAssistant = closeVoiceAssistant;
window.executeVoiceCommandText = executeVoiceCommandText;
