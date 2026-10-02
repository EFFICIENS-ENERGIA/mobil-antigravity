// lib/security_guard.js - Garde-fou de sécurité OWASP (Règle 07 & 16)
import path from 'node:path';
import fs from 'node:fs';

const ALLOWED_ROOTS = [
  path.resolve('C:/Users/EFFICIENS ENERGIA/Desktop/ANTIGRAVITY'),
  path.resolve('C:/Users/EFFICIENS ENERGIA/Documents/antigravity')
];

export const ALLOWED_ACTIONS = new Set([
  'list_projects',
  'get_status',
  'start_saas_server',
  'stop_saas_server',
  'launch_project',
  'stop_project',
  'run_audit',
  'git_status',
  'backup_project',
  'send_sms_status',
  'ping',
  'check_rules',
  'kill_switch',
  'snapshot_project',
  'get_hardware',
  'get_tasks',
  'add_task',
  'toggle_task',
  'delete_task',
  'morning_briefing'
]);

/**
 * Valide et confine un chemin aux répertoires racines ANTIGRAVITY (Anti-Path Traversal)
 * @param {string} targetPath 
 * @returns {string|null} Le chemin absolu sécurisé ou null si illégal
 */
export function sanitizePath(targetPath) {
  if (!targetPath) return ALLOWED_ROOTS[0];
  const resolved = path.resolve(ALLOWED_ROOTS[0], targetPath);
  const normalized = path.normalize(resolved);
  
  const isAllowed = ALLOWED_ROOTS.some(root => 
    normalized.toLowerCase().startsWith(root.toLowerCase())
  );

  if (!isAllowed) {
    return null; // Détection de path traversal (ex: ../../Windows)
  }
  return normalized;
}

/**
 * Valide si une action fait partie de la liste blanche
 * @param {string} action 
 * @returns {boolean}
 */
export function isActionAllowed(action) {
  return ALLOWED_ACTIONS.has(action);
}

/**
 * Échappe le HTML pour prévenir les injections XSS
 * @param {string} str 
 * @returns {string}
 */
export function escapeHtml(str) {
  if (typeof str !== 'string') return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Vérifie l'absence de métacaractères d'injection shell dans un paramètre texte
 * @param {string} input 
 * @returns {boolean}
 */
export function isSafeCommandParam(input) {
  if (typeof input !== 'string') return false;
  // Interdiction stricte de |, &, ;, `, $, >, <, \r, \n
  const forbiddenChars = /[;&`$><|\r\n]/;
  return !forbiddenChars.test(input);
}
