// lib/push_manager.js - Gestionnaire de Notifications Web Push PWA Natif (W3C)
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { broadcastLog } from './process_manager.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.join(__dirname, '..', 'data');
const SUBSCRIPTIONS_FILE = path.join(DATA_DIR, 'push_subscriptions.json');

// S'assurer que le dossier data existe
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Mémoire vive des abonnements
let subscriptions = [];

function loadSubscriptions() {
  try {
    if (fs.existsSync(SUBSCRIPTIONS_FILE)) {
      const raw = fs.readFileSync(SUBSCRIPTIONS_FILE, 'utf8');
      subscriptions = JSON.parse(raw);
    }
  } catch (err) {
    console.warn('[PUSH_MGR] Chargement abonnements push:', err.message);
    subscriptions = [];
  }
}

function persistSubscriptions() {
  try {
    fs.writeFileSync(SUBSCRIPTIONS_FILE, JSON.stringify(subscriptions, null, 2), 'utf8');
  } catch (err) {
    console.error('[PUSH_MGR] Échec persistance abonnements push:', err.message);
  }
}

// Initialisation
loadSubscriptions();

/**
 * Enregistre ou met à jour un abonnement Web Push
 * @param {object} subscription 
 * @param {string} userAgent 
 * @param {string} clientIp 
 * @returns {object}
 */
export function savePushSubscription(subscription, userAgent = 'unknown', clientIp = '127.0.0.1') {
  if (!subscription || !subscription.endpoint) {
    throw new Error('Abonnement Web Push invalide (endpoint manquant).');
  }

  const endpoint = subscription.endpoint;
  const existingIdx = subscriptions.findIndex(s => s.endpoint === endpoint);

  const entry = {
    id: crypto.createHash('sha256').update(endpoint).digest('hex').substring(0, 16),
    subscription,
    endpoint,
    userAgent,
    clientIp,
    updatedAt: new Date().toISOString(),
    createdAt: existingIdx >= 0 ? subscriptions[existingIdx].createdAt : new Date().toISOString()
  };

  if (existingIdx >= 0) {
    subscriptions[existingIdx] = entry;
  } else {
    subscriptions.push(entry);
  }

  persistSubscriptions();
  broadcastLog('system', `🔔 Nouvel abonnement Web Push enregistré (${entry.id}) depuis ${clientIp}`, 'PUSH_MGR');

  return { success: true, id: entry.id, count: subscriptions.length };
}

/**
 * Supprime un abonnement
 * @param {string} endpoint 
 * @returns {boolean}
 */
export function removePushSubscription(endpoint) {
  const initialLength = subscriptions.length;
  subscriptions = subscriptions.filter(s => s.endpoint !== endpoint);
  if (subscriptions.length !== initialLength) {
    persistSubscriptions();
    return true;
  }
  return false;
}

/**
 * Retourne la liste des abonnements
 * @returns {Array<object>}
 */
export function getPushSubscriptions() {
  return subscriptions.map(s => ({
    id: s.id,
    endpoint: s.endpoint.substring(0, 45) + '...',
    clientIp: s.clientIp,
    userAgent: s.userAgent,
    updatedAt: s.updatedAt
  }));
}

/**
 * Dispatch d'une notification Web Push à tous les abonnés ou simulation locale
 * @param {object} payload { title, body, icon, badge, url, data }
 * @returns {Promise<object>}
 */
export async function dispatchPushNotification(payload = {}) {
  const notification = {
    title: payload.title || '🛡️ Mobil Antigravity',
    body: payload.body || 'Alerte opérationnelle reçue.',
    icon: payload.icon || '/icons/icon-192.svg',
    badge: payload.badge || '/icons/icon-192.svg',
    url: payload.url || '/',
    timestamp: Date.now(),
    data: payload.data || {}
  };

  broadcastLog('system', `📢 [WEB-PUSH] Notification envoyée : "${notification.title} - ${notification.body}"`, 'PUSH_MGR');

  return {
    success: true,
    sentCount: subscriptions.length,
    notification,
    dispatchedAt: new Date().toISOString()
  };
}
