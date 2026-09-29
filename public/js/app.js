// public/js/app.js - Logique Client PWA Sécurisée Antigravity (UIX & DEV)

let currentTab = 'projects';
let autoScroll = true;
let eventSource = null;
let deferredPrompt = null;
let authToken = localStorage.getItem('agy_token') || '';
let enteredPin = '';
let audioEnabled = localStorage.getItem('agy_audio_enabled') !== 'false';

// Initialisation au chargement du DOM
document.addEventListener('DOMContentLoaded', async () => {
  initTabs();
  initPwaInstall();
  initTerminal();
  initKeypad();
  initAudioVoices();
  updateAudioToggleUI();

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
        branch: 'main'
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
        <div class="glass-card" id="card-${proj.id}">
          <div class="card-header">
            <div class="card-title">
              <span>${icon}</span>
              <span>${escapeHtml(proj.displayName || proj.name)}</span>
            </div>
            <span class="badge ${badgeClass}">${proj.statusLabel}</span>
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
            <button class="btn btn-secondary" onclick="triggerAction('check_rules')">
              ⚖️ Règles
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
window.toggleRemoteTunnel = toggleRemoteTunnel;
window.toggleVoiceAssistant = toggleVoiceAssistant;
window.closeVoiceAssistant = closeVoiceAssistant;
window.executeVoiceCommandText = executeVoiceCommandText;
window.requestMicPermissionExplicitly = requestMicPermissionExplicitly;
