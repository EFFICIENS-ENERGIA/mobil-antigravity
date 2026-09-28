// lib/security_audit_logger.js - Journalisation d'audit de sécurité inviolable (OWASP A09:2021)
import fs from 'node:fs';
import path from 'node:path';

const LOG_DIR = path.resolve('data');
const AUDIT_LOG_FILE = path.join(LOG_DIR, 'security_audit.log');
const EVENTS_JSON_FILE = path.join(LOG_DIR, 'security_events.json');

if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

/**
 * Enregistre un événement de sécurité
 * @param {string} eventType 
 * @param {string} ip 
 * @param {string} status 'SUCCESS'|'BLOCKED'|'WARN'|'INFO'
 * @param {object} details 
 */
export function logSecurityEvent(eventType, ip = 'unknown', status = 'INFO', details = {}) {
  const timestamp = new Date().toISOString();
  const event = {
    id: `sec_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
    timestamp,
    eventType,
    ip,
    status,
    details
  };

  // 1. Écriture dans le journal texte brut horodaté
  const logLine = `[${timestamp}] [${status}] [${eventType}] IP=${ip} Details=${JSON.stringify(details)}\n`;
  try {
    fs.appendFileSync(AUDIT_LOG_FILE, logLine, 'utf8');
  } catch (err) {
    console.error('[SECURITY_LOGGER] Erreur append file:', err.message);
  }

  // 2. Écriture dans le tampon JSON pour consultation mobile
  try {
    let events = [];
    if (fs.existsSync(EVENTS_JSON_FILE)) {
      const content = fs.readFileSync(EVENTS_JSON_FILE, 'utf8');
      events = JSON.parse(content || '[]');
    }
    events.unshift(event);
    if (events.length > 100) events = events.slice(0, 100);
    fs.writeFileSync(EVENTS_JSON_FILE, JSON.stringify(events, null, 2), 'utf8');
  } catch (err) {
    console.error('[SECURITY_LOGGER] Erreur JSON audit:', err.message);
  }

  if (status === 'BLOCKED' || status === 'WARN') {
    console.warn(`🛡️ [ALERTE SÉCURITÉ] ${eventType} depuis ${ip} : ${JSON.stringify(details)}`);
  }
}

/**
 * Récupère les événements récents de sécurité
 * @returns {Array}
 */
export function getRecentSecurityEvents() {
  try {
    if (fs.existsSync(EVENTS_JSON_FILE)) {
      const content = fs.readFileSync(EVENTS_JSON_FILE, 'utf8');
      return JSON.parse(content || '[]');
    }
  } catch {}
  return [];
}
