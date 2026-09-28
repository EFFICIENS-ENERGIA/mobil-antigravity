// lib/process_manager.js - Gestionnaire de processus & streaming de logs
import { spawn } from 'node:child_process';
import { EventEmitter } from 'node:events';
import path from 'node:path';
import { sendSmsNotification } from './sms_notifier.js';

export const logEmitter = new EventEmitter();
const runningProcesses = new Map();
const logHistory = [];
const MAX_LOG_HISTORY = 300;

/**
 * Diffuse une ligne de log vers les abonnés SSE
 * @param {string} type 'stdout' | 'stderr' | 'system'
 * @param {string} message 
 * @param {string} source 
 */
export function broadcastLog(type, message, source = 'SYSTEM') {
  const entry = {
    id: Date.now() + '_' + Math.random().toString(36).substr(2, 4),
    timestamp: new Date().toLocaleTimeString('fr-FR'),
    type,
    message: message.trimEnd(),
    source
  };

  logHistory.push(entry);
  if (logHistory.length > MAX_LOG_HISTORY) logHistory.shift();
  logEmitter.emit('log', entry);
}

export function getRecentLogs() {
  return [...logHistory];
}

/**
 * Lance le serveur RDV-Hub SaaS (Port 8092)
 * @returns {Promise<object>}
 */
export async function startSaasServer() {
  const saasDir = 'C:/Users/EFFICIENS ENERGIA/Desktop/ANTIGRAVITY/SAAS EFFICIENS ENERGIA';
  
  if (runningProcesses.has('saas_server')) {
    return { success: false, message: 'Le serveur SaaS est déjà en cours d’exécution.' };
  }

  broadcastLog('system', 'Démarrage du serveur RDV-Hub SaaS sur http://localhost:8092...', 'PROCESS_MGR');

  try {
    const proc = spawn('python', ['-m', 'http.server', '8092'], {
      cwd: saasDir,
      shell: false
    });

    runningProcesses.set('saas_server', {
      id: 'saas_server',
      name: 'RDV-Hub SaaS (Port 8092)',
      pid: proc.pid,
      startTime: new Date().toISOString()
    });

    proc.stdout.on('data', (data) => {
      broadcastLog('stdout', data.toString(), 'SAAS_8092');
    });

    proc.stderr.on('data', (data) => {
      broadcastLog('stderr', data.toString(), 'SAAS_8092');
    });

    proc.on('close', (code) => {
      broadcastLog('system', `Serveur SaaS arrêté (code de sortie: ${code}).`, 'PROCESS_MGR');
      runningProcesses.delete('saas_server');
    });

    await sendSmsNotification(
      '🟢 [ANTIGRAVITY] Serveur RDV-Hub lancé avec succès sur le port 8092 via votre smartphone.',
      'saas_launch'
    );

    return { success: true, message: 'Serveur RDV-Hub lancé avec succès (PID ' + proc.pid + ')' };
  } catch (err) {
    broadcastLog('stderr', 'Erreur de lancement SaaS: ' + err.message, 'PROCESS_MGR');
    return { success: false, message: err.message };
  }
}

/**
 * Arrête le serveur SaaS
 * @returns {Promise<object>}
 */
export async function stopSaasServer() {
  const procInfo = runningProcesses.get('saas_server');
  if (!procInfo) {
    return { success: false, message: 'Aucun serveur SaaS actif à arrêter.' };
  }

  try {
    process.kill(procInfo.pid);
    runningProcesses.delete('saas_server');
    broadcastLog('system', 'Arrêt forcé du serveur SaaS (PID ' + procInfo.pid + ').', 'PROCESS_MGR');
    
    await sendSmsNotification(
      '🔴 [ANTIGRAVITY] Serveur RDV-Hub arrêté depuis votre smartphone.',
      'saas_stop'
    );

    return { success: true, message: 'Serveur arrêté.' };
  } catch (err) {
    return { success: false, message: err.message };
  }
}

/**
 * Déclenche un banc d'essai ou un audit autonome
 * @param {string} projectName 
 */
export async function runProjectAudit(projectName = 'entrainement equipe agent') {
  broadcastLog('system', `Déclenchement du banc d'essai @AUD pour "${projectName}"...`, 'AUD_ENGINE');

  const testScript = path.resolve('tests/audit_mobile_controller.js');
  
  const proc = spawn('node', [testScript], {
    cwd: process.cwd(),
    shell: false
  });

  proc.stdout.on('data', (data) => {
    broadcastLog('stdout', data.toString(), 'AUD_RUNNER');
  });

  proc.stderr.on('data', (data) => {
    broadcastLog('stderr', data.toString(), 'AUD_RUNNER');
  });

  proc.on('close', async (code) => {
    const statusText = code === 0 ? '✅ 100% PASS' : '❌ Échec (code ' + code + ')';
    broadcastLog('system', `Banc d'essai terminé : ${statusText}`, 'AUD_ENGINE');
    
    await sendSmsNotification(
      `🛡️ [ANTIGRAVITY AUD] Résultat du banc d'essai : ${statusText}`,
      'audit_completion'
    );
  });

  return { success: true, message: 'Banc d’essai lancé en arrière-plan.' };
}

/**
 * Retourne la liste des processus actuellement managés
 */
export function getRunningProcesses() {
  return Array.from(runningProcesses.values());
}
