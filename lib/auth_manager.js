// lib/auth_manager.js - Gestionnaire d'authentification cryptographique & Sessions Seb (07 78 24 65 67)
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

// PIN par défaut : 6567 (Derniers 4 chiffres du mobile 07 78 24 65 67)
const DEFAULT_PIN = process.env.SEB_PIN || '6567';
const SESSION_TTL_MS = 24 * 60 * 60 * 1000; // 24 heures

// Jeton d'appairage dynamique unique généré à chaque démarrage du serveur
export const PAIRING_TOKEN = crypto.randomBytes(16).toString('hex');

// Clé secrète HMAC pour la signature de session
const HMAC_SECRET = crypto.randomBytes(32).toString('hex');

// Table des sessions actives en mémoire
const activeSessions = new Map();

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
 * Crée une nouvelle session cryptographique pour le smartphone
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

  activeSessions.set(sessionToken, {
    token: sessionToken,
    ip,
    userAgent,
    createdAt: now,
    expiresAt: now + SESSION_TTL_MS
  });

  return sessionToken;
}

/**
 * Valide un jeton de session
 * @param {string} token 
 * @returns {boolean}
 */
export function validateSession(token) {
  if (!token || typeof token !== 'string') return false;
  
  const session = activeSessions.get(token);
  if (!session) return false;

  if (Date.now() > session.expiresAt) {
    activeSessions.delete(token);
    return false;
  }

  return true;
}

/**
 * Révocation de session (Déconnexion)
 * @param {string} token 
 * @returns {boolean}
 */
export function revokeSession(token) {
  if (!token) return false;
  return activeSessions.delete(token);
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
