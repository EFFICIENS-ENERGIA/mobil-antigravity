// lib/immutable_audit.js - Journal d'Audit Immuable Cryptographique (OWASP A09:2021)
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.join(__dirname, '..', 'data');
const AUDIT_JSON_FILE = path.join(DATA_DIR, 'immutable_audit.json');
const AUDIT_LOG_FILE = path.join(DATA_DIR, 'immutable_audit.log');

const GENESIS_HASH = '0'.repeat(64);

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

let auditChain = [];

function computeBlockHash(block) {
  const content = `${block.prevHash}:${block.id}:${block.timestamp}:${block.action}:${block.target}:${block.channel}:${block.ip}:${block.userAgent}:${block.status}:${JSON.stringify(block.metadata || {})}`;
  return crypto.createHash('sha256').update(content).digest('hex');
}

function loadAuditChain() {
  try {
    if (fs.existsSync(AUDIT_JSON_FILE)) {
      const raw = fs.readFileSync(AUDIT_JSON_FILE, 'utf8');
      auditChain = JSON.parse(raw);
    }
  } catch (err) {
    console.warn('[IMMUTABLE_AUDIT] Erreur lecture fichier audit:', err.message);
    auditChain = [];
  }
}

function persistAuditChain(newBlock) {
  try {
    fs.writeFileSync(AUDIT_JSON_FILE, JSON.stringify(auditChain, null, 2), 'utf8');
    const logLine = `[${newBlock.timestamp}] [${newBlock.channel}] [${newBlock.status}] ${newBlock.action} (Target: ${newBlock.target}) IP: ${newBlock.ip} HASH: ${newBlock.hash}\n`;
    fs.appendFileSync(AUDIT_LOG_FILE, logLine, 'utf8');
  } catch (err) {
    console.error('[IMMUTABLE_AUDIT] Erreur écriture audit:', err.message);
  }
}

loadAuditChain();

/**
 * Enregistre une entrée immuable dans la chaîne de blocs d'audit
 * @param {object} params
 * @param {string} params.action - Action exécutée
 * @param {string} params.target - Cible de l'action
 * @param {string} params.channel - Canal ('1-Tap UI', 'Vocal NLP', 'PIN 6567', 'WebAuthn Biometric', 'Routine Automatique', 'Auto-Healing')
 * @param {string} params.ip - Adresse IP cliente
 * @param {string} params.userAgent - Client User-Agent
 * @param {string} [params.status='SUCCESS'] - Statut de l'action
 * @param {object} [params.metadata={}] - Données additionnelles
 * @returns {object} Le bloc enregistré
 */
export function recordAuditEntry({
  action,
  target = 'System',
  channel = '1-Tap UI',
  ip = '127.0.0.1',
  userAgent = 'Unknown',
  status = 'SUCCESS',
  metadata = {}
}) {
  const prevHash = auditChain.length > 0 
    ? auditChain[auditChain.length - 1].hash 
    : GENESIS_HASH;

  const id = auditChain.length + 1;
  const timestamp = new Date().toISOString();

  const block = {
    id,
    timestamp,
    action,
    target,
    channel,
    ip,
    userAgent,
    status,
    metadata,
    prevHash,
    hash: ''
  };

  block.hash = computeBlockHash(block);
  auditChain.push(block);
  persistAuditChain(block);

  return block;
}

/**
 * Vérifie l'intégrité cryptographique complète de la chaîne d'audit
 * @returns {{ valid: boolean, verifiedCount: number, errorIndex?: number, reason?: string }}
 */
export function verifyAuditIntegrity() {
  for (let i = 0; i < auditChain.length; i++) {
    const block = auditChain[i];
    const expectedPrevHash = i === 0 ? GENESIS_HASH : auditChain[i - 1].hash;

    if (block.prevHash !== expectedPrevHash) {
      return {
        valid: false,
        verifiedCount: i,
        errorIndex: i,
        reason: `Rupture de chaîne : prevHash invalide au bloc ${block.id}`
      };
    }

    const calculatedHash = computeBlockHash(block);
    if (block.hash !== calculatedHash) {
      return {
        valid: false,
        verifiedCount: i,
        errorIndex: i,
        reason: `Altération détectée : le hash du bloc ${block.id} ne correspond pas aux données.`
      };
    }
  }

  return {
    valid: true,
    verifiedCount: auditChain.length,
    lastHash: auditChain.length > 0 ? auditChain[auditChain.length - 1].hash : GENESIS_HASH
  };
}

/**
 * Récupère les logs d'audit avec filtrage optionnel
 * @param {number} [limit=100]
 * @param {string} [channelFilter=null]
 * @returns {Array<object>}
 */
export function getAuditLogs(limit = 100, channelFilter = null) {
  let list = [...auditChain];
  if (channelFilter) {
    list = list.filter(b => b.channel === channelFilter);
  }
  return list.slice(-limit).reverse();
}
