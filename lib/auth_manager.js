// lib/auth_manager.js - Gestionnaire d'authentification cryptographique & Sessions Dynamiques Seb (07 78 24 65 67)
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

// PIN par défaut : 6567 (Derniers 4 chiffres du mobile 07 78 24 65 67)
const DEFAULT_PIN = process.env.SEB_PIN || '6567';

// Durées de session dynamiques selon le contexte réseau
export const LOCAL_SESSION_TTL_MS = 24 * 60 * 60 * 1000; // 24 heures (Wi-Fi local 192.168.1.76 / LAN)
export const REMOTE_SESSION_TTL_MS = 1 * 60 * 60 * 1000;  // 1 heure (Accès distant 4G/5G / WAN)

// Jeton d'appairage dynamique unique généré à chaque démarrage du serveur
export const PAIRING_TOKEN = crypto.randomBytes(16).toString('hex');

// Clé secrète HMAC pour la signature de session
const HMAC_SECRET = crypto.randomBytes(32).toString('hex');

// Table des sessions actives en mémoire et persistance dans data/active_sessions.json
const DATA_DIR = path.resolve('data');
const SESSIONS_FILE = path.join(DATA_DIR, 'active_sessions.json');
const activeSessions = new Map();

function saveActiveSessions() {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    const now = Date.now();
    const data = {};
    for (const [token, sess] of activeSessions.entries()) {
      if (sess && sess.expiresAt > now) {
        data[token] = sess;
      }
    }
    fs.writeFileSync(SESSIONS_FILE, JSON.stringify(data, null, 2), 'utf8');
  } catch {}
}

function loadActiveSessions() {
  try {
    if (fs.existsSync(SESSIONS_FILE)) {
      const content = fs.readFileSync(SESSIONS_FILE, 'utf8');
      const data = JSON.parse(content || '{}');
      const now = Date.now();
      for (const [token, sess] of Object.entries(data)) {
        if (sess && sess.expiresAt > now) {
          activeSessions.set(token, sess);
        }
      }
    }
  } catch {}
}

// Chargement immédiat des sessions existantes
loadActiveSessions();

/**
 * Détermine si l'adresse IP correspond au réseau local privé (Wi-Fi / Ethernet / Loopback)
 * @param {string} ip 
 * @returns {boolean}
 */
export function isLocalNetwork(ip = '') {
  if (!ip || typeof ip !== 'string') return true;
  const cleanIp = ip.replace(/^::ffff:/, '').trim();

  if (
    cleanIp === '127.0.0.1' ||
    cleanIp === '::1' ||
    cleanIp === 'localhost' ||
    cleanIp.startsWith('192.168.') ||
    cleanIp.startsWith('10.') ||
    cleanIp.startsWith('172.16.') ||
    cleanIp.startsWith('172.17.') ||
    cleanIp.startsWith('172.18.') ||
    cleanIp.startsWith('172.19.') ||
    cleanIp.startsWith('172.20.') ||
    cleanIp.startsWith('172.21.') ||
    cleanIp.startsWith('172.22.') ||
    cleanIp.startsWith('172.23.') ||
    cleanIp.startsWith('172.24.') ||
    cleanIp.startsWith('172.25.') ||
    cleanIp.startsWith('172.26.') ||
    cleanIp.startsWith('172.27.') ||
    cleanIp.startsWith('172.28.') ||
    cleanIp.startsWith('172.29.') ||
    cleanIp.startsWith('172.30.') ||
    cleanIp.startsWith('172.31.')
  ) {
    return true;
  }

  return false;
}

/**
 * Vérifie le code PIN de Seb
 * @param {string} pin 
 * @returns {boolean}
 */
export function verifyPin(pin) {
  if (!pin || typeof pin !== 'string') return false;
  // Comparaison en temps constant pour éviter les attaques temporelles (Timing Attacks)
  const pinBuffer = Buffer.from(pin.trim());
  const expectedBuffer = Buffer.from(DEFAULT_PIN);
  if (pinBuffer.length !== expectedBuffer.length) return false;
  return crypto.timingSafeEqual(pinBuffer, expectedBuffer);
}

/**
 * Vérifie un jeton d'appairage rapide 1-clic (ex: flash QR Code)
 * @param {string} token 
 * @returns {boolean}
 */
export function verifyPairingToken(token) {
  if (!token || typeof token !== 'string') return false;
  const tokenBuf = Buffer.from(token);
  const expectedBuf = Buffer.from(PAIRING_TOKEN);
  if (tokenBuf.length !== expectedBuf.length) return false;
  return crypto.timingSafeEqual(tokenBuf, expectedBuf);
}

/**
 * Crée une nouvelle session cryptographique pour le smartphone avec TTL dynamique selon le réseau
 * - Réseau local Wi-Fi (192.168.1.*) : 24h
 * - Accès distant WAN / 4G / 5G : 1h + exiger biométrie WebAuthn
 * @param {string} ip 
 * @param {string} userAgent 
 * @returns {string} Le token de session Bearer
 */
export function createSession(ip = 'unknown', userAgent = 'unknown') {
  const randomId = crypto.randomBytes(24).toString('hex');
  const signature = crypto.createHmac('sha256', HMAC_SECRET)
    .update(`${randomId}:${ip}:${Date.now()}`)
    .digest('hex');
  
  const sessionToken = `${randomId}.${signature}`;
  const now = Date.now();
  const isLocal = isLocalNetwork(ip);
  const ttl = isLocal ? LOCAL_SESSION_TTL_MS : REMOTE_SESSION_TTL_MS;
  const networkType = isLocal ? 'LOCAL_LAN' : 'REMOTE_WAN_4G_5G';
  const requiresBiometricReauth = !isLocal;

  activeSessions.set(sessionToken, {
    token: sessionToken,
    ip,
    userAgent,
    isLocal,
    networkType,
    requiresBiometricReauth,
    createdAt: now,
    expiresAt: now + ttl
  });

  saveActiveSessions();

  return sessionToken;
}

/**
 * Valide un jeton de session
 * @param {string} token 
 * @returns {boolean}
 */
export function validateSession(token) {
  if (!token || typeof token !== 'string') return false;
  
  if (!activeSessions.has(token)) {
    loadActiveSessions();
  }

  const session = activeSessions.get(token);
  if (!session) return false;

  if (Date.now() > session.expiresAt) {
    activeSessions.delete(token);
    saveActiveSessions();
    return false;
  }

  return true;
}

/**
 * Retourne les détails et métriques d'une session active
 * @param {string} token 
 * @returns {object|null}
 */
export function getSessionDetails(token) {
  if (!token || typeof token !== 'string') return null;

  if (!activeSessions.has(token)) {
    loadActiveSessions();
  }

  const session = activeSessions.get(token);
  if (!session) return null;

  const now = Date.now();
  if (now > session.expiresAt) {
    activeSessions.delete(token);
    saveActiveSessions();
    return null;
  }

  return {
    token,
    ip: session.ip,
    isLocal: session.isLocal,
    networkType: session.networkType,
    requiresBiometricReauth: session.requiresBiometricReauth,
    createdAt: new Date(session.createdAt).toISOString(),
    expiresAt: new Date(session.expiresAt).toISOString(),
    ttlRemainingSeconds: Math.floor(Math.max(0, session.expiresAt - now) / 1000)
  };
}

/**
 * Révocation de session (Déconnexion)
 * @param {string} token 
 * @returns {boolean}
 */
export function revokeSession(token) {
  if (!token) return false;
  const res = activeSessions.delete(token);
  saveActiveSessions();
  return res;
}

/**
 * Extrait le token d'authentification depuis la requête HTTP
 * (Header Authorization: Bearer <token> ou Cookie agy_session)
 * @param {object} req 
 * @returns {string|null}
 */
export function extractAuthToken(req) {
  const authHeader = req.headers['authorization'];
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7).trim();
  }

  // Vérifier également dans les cookies
  const cookieHeader = req.headers['cookie'];
  if (cookieHeader) {
    const match = cookieHeader.match(/agy_session=([^;]+)/);
    if (match) return match[1];
  }

  // Vérifier le paramètre d'URL token si présent
  try {
    const url = new URL(req.url, 'http://localhost');
    const queryToken = url.searchParams.get('token');
    if (queryToken) return queryToken;
  } catch {}

  return null;
}
