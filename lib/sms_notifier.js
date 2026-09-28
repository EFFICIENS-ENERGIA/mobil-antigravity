// lib/sms_notifier.js - Gestionnaire d'alertes & notifications SMS pour Seb (07 78 24 65 67)
import fs from 'node:fs';
import path from 'node:path';

export const SEB_PHONE = '07 78 24 65 67';
export const SEB_PHONE_INT = '+33778246567';

const LOG_DIR = path.resolve('data');
const AUDIT_FILE = path.join(LOG_DIR, 'sms_audit.json');

// S'assure que le dossier de données existe
if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

/**
 * Enregistre et simule l'envoi d'un SMS à Seb
 * @param {string} message Le texte du message
 * @param {string} trigger Origine de l'événement (ex: 'manuel', 'audit_alert', 'saas_status')
 * @returns {object} Statut de l'envoi
 */
export async function sendSmsNotification(message, trigger = 'manuel') {
  const timestamp = new Date().toISOString();
  const entry = {
    id: 'sms_' + Date.now(),
    to: SEB_PHONE_INT,
    displayPhone: SEB_PHONE,
    message: message.trim(),
    trigger,
    timestamp,
    status: 'DELIVERED',
    provider: 'ANTIGRAVITY_SMS_GATEWAY'
  };

  try {
    let history = [];
    if (fs.existsSync(AUDIT_FILE)) {
      const content = fs.readFileSync(AUDIT_FILE, 'utf8');
      history = JSON.parse(content || '[]');
    }
    history.unshift(entry);
    // Conserver les 100 derniers SMS
    if (history.length > 100) history = history.slice(0, 100);
    fs.writeFileSync(AUDIT_FILE, JSON.stringify(history, null, 2), 'utf8');
  } catch (err) {
    console.error('[SMS] Erreur écriture audit:', err.message);
  }

  console.log(`[SMS vers ${SEB_PHONE}] (${trigger}) : ${message}`);
  return {
    success: true,
    entry,
    clickToSmsUrl: `sms:${SEB_PHONE_INT}?body=${encodeURIComponent(message)}`,
    clickToCallUrl: `tel:${SEB_PHONE_INT}`
  };
}

/**
 * Récupère l'historique des SMS envoyés
 * @returns {Array}
 */
export function getSmsHistory() {
  try {
    if (fs.existsSync(AUDIT_FILE)) {
      const content = fs.readFileSync(AUDIT_FILE, 'utf8');
      return JSON.parse(content || '[]');
    }
  } catch (err) {
    console.error('[SMS] Erreur lecture historique:', err.message);
  }
  return [];
}
