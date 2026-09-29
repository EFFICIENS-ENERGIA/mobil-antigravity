// lib/process_manager.js - Gestionnaire universel de processus & streaming de logs (ANTIGRAVITY)
import { spawn, exec } from 'node:child_process';
import { EventEmitter } from 'node:events';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { sendSmsNotification } from './sms_notifier.js';
import { checkPortActive } from './antigravity_scanner.js';

export const logEmitter = new EventEmitter();
const runningProcesses = new Map();
const logHistory = [];
const MAX_LOG_HISTORY = 300;

const ROOT_DIR = path.resolve('C:/Users/EFFICIENS ENERGIA/Desktop/ANTIGRAVITY');

/**
 * Récupère l'IP locale pour les URLs de redirection smartphone
 */
function getLocalIp() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const netInfo of interfaces[name]) {
      if (netInfo.family === 'IPv4' && !netInfo.internal) {
        return netInfo.address;
      }
    }
  }
  return '127.0.0.1';
}

const LOCAL_IP = getLocalIp();

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
    message: String(message).trimEnd(),
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
 * Résout le dossier cible, le port d'écoute et le nom d'affichage d'un projet
 * @param {string} projectName 
 * @returns {{ targetDir: string, port: number, label: string, key: string }}
 */
export function resolveProjectInfo(projectName = '') {
  const lower = projectName.toLowerCase();
  let targetDir = path.join(ROOT_DIR, projectName);
  let port = 8090;
  let label = projectName || 'Projet Inconnu';
  let key = projectName.toLowerCase().replace(/[^a-z0-9]/g, '_');

  if (lower.includes('saas') || (lower.includes('rdv_hub') && !lower.includes('omnicanal'))) {
    targetDir = path.join(ROOT_DIR, 'SAAS EFFICIENS ENERGIA');
    port = 8092;
    label = 'RDV-Hub SaaS';
    key = 'saas_8092';
  } else if (lower.includes('smarttrip') || lower.includes('homeagy') || lower.includes('my-first-project')) {
    targetDir = path.join(ROOT_DIR, '$HOMEagy2-projectsmy-first-project');
    port = 8080;
    label = 'SmartTrip Pro';
    key = 'smarttrip_8080';
  } else if (lower.includes('site_construction') || lower.includes('construction') || lower.includes('bati')) {
    const innerDir = path.join(ROOT_DIR, 'site_construction/projet training site internet/site_construction');
    const netlifyDir = path.join(ROOT_DIR, 'site_construction/DOSSIER_A_GLISSER_SUR_NETLIFY');
    if (fs.existsSync(path.join(innerDir, 'index.html'))) {
      targetDir = innerDir;
    } else if (fs.existsSync(path.join(netlifyDir, 'index.html'))) {
      targetDir = netlifyDir;
    } else {
      targetDir = path.join(ROOT_DIR, 'site_construction');
    }
    port = 8089;
    label = 'Bâti-Excellence Pro';
    key = 'bati_8089';
  } else if (lower.includes('omnicanal')) {
    targetDir = path.join(ROOT_DIR, 'projects/rdv_hub_omnicanal');
    port = 8093;
    label = 'RDV-Hub Omnicanal';
    key = 'omnicanal_8093';
  } else if (lower.includes('webtoon') || lower.includes('plume')) {
    const webtoonDir = path.resolve('C:/Users/EFFICIENS ENERGIA/Documents/antigravity/WEBTOON PROJECT PLUME D ACIER');
    const altDir = path.resolve('C:/Users/EFFICIENS ENERGIA/Documents/antigravity');
    targetDir = fs.existsSync(webtoonDir) ? webtoonDir : altDir;
    port = 8095;
    label = "Webtoon Infrastructure — La Plume et l'Acier";
    key = 'webtoon_8095';
  } else if (lower.includes('mobil')) {
    targetDir = path.join(ROOT_DIR, 'mobil antigravity');
    port = 3000;
    label = 'Mobil Antigravity';
    key = 'mobil_3000';
  } else {
    // Vérifier si le répertoire existe dans ROOT_DIR ou projects/
    if (!fs.existsSync(targetDir)) {
      const alt = path.join(ROOT_DIR, 'projects', projectName);
      if (fs.existsSync(alt)) {
        targetDir = alt;
      }
    }
    const charSum = projectName.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
    port = 8100 + (charSum % 30);
    key = `proj_${port}`;
  }

  return { targetDir, port, label, key };
}

/**
 * Lance universellement un projet Antigravity sur son port dédié avec écoute sur 0.0.0.0
 * Accessible immédiatement depuis le smartphone de Seb
 * @param {string} projectName 
 * @returns {Promise<object>}
 */
export async function launchProject(projectName) {
  const { targetDir, port, label, key } = resolveProjectInfo(projectName);

  if (!fs.existsSync(targetDir)) {
    broadcastLog('stderr', `Répertoire introuvable : ${targetDir}`, 'PROCESS_MGR');
    return { success: false, message: `Dossier introuvable pour "${projectName}"` };
  }

  // 1. Vérification si déjà enregistré comme processus actif
  if (runningProcesses.has(key)) {
    const existing = runningProcesses.get(key);
    broadcastLog('system', `${label} est déjà en cours d'exécution (PID ${existing.pid}).`, 'PROCESS_MGR');
    return { 
      success: true, 
      message: `${label} est déjà en ligne sur le port ${port}`, 
      port, 
      url: `http://${LOCAL_IP}:${port}` 
    };
  }

  // 2. Vérification si le port est déjà actif (ex: lancé hors contrôleur)
  const isPortUp = await checkPortActive(port);
  if (isPortUp) {
    runningProcesses.set(key, {
      id: key,
      projectName,
      name: `${label} (Port ${port})`,
      port,
      pid: 'EXTERNAL',
      startTime: new Date().toISOString(),
      targetDir,
      url: `http://${LOCAL_IP}:${port}`
    });
    broadcastLog('system', `Port ${port} déjà ouvert : ${label} rattaché avec succès.`, 'PROCESS_MGR');
    return {
      success: true,
      message: `${label} est déjà en écoute sur le port ${port}`,
      port,
      url: `http://${LOCAL_IP}:${port}`
    };
  }

  broadcastLog('system', `🚀 Démarrage de "${label}" sur http://0.0.0.0:${port} [${targetDir}]...`, 'PROCESS_MGR');

  try {
    // Lancement du serveur Python HTTP en écoute sur 0.0.0.0 (toutes interfaces pour smartphone)
    const proc = spawn('python', ['-m', 'http.server', String(port), '--bind', '0.0.0.0'], {
      cwd: targetDir,
      shell: false
    });

    const projectUrl = `http://${LOCAL_IP}:${port}`;

    runningProcesses.set(key, {
      id: key,
      projectName,
      name: `${label} (Port ${port})`,
      port,
      pid: proc.pid,
      startTime: new Date().toISOString(),
      targetDir,
      url: projectUrl,
      proc
    });

    proc.stdout.on('data', (data) => {
      broadcastLog('stdout', data.toString(), `PORT_${port}`);
    });

    proc.stderr.on('data', (data) => {
      broadcastLog('stderr', data.toString(), `PORT_${port}`);
    });

    proc.on('close', (code) => {
      broadcastLog('system', `Serveur "${label}" (Port ${port}) arrêté (code: ${code}).`, 'PROCESS_MGR');
      runningProcesses.delete(key);
    });

    // Notification SMS à Seb
    await sendSmsNotification(
      `🟢 [ANTIGRAVITY] Projet "${label}" lancé avec succès sur le port ${port} (${projectUrl}). Accessible depuis votre smartphone.`,
      'project_launch'
    );

    return {
      success: true,
      message: `Projet "${label}" lancé avec succès sur le port ${port} (PID ${proc.pid})`,
      port,
      url: projectUrl
    };
  } catch (err) {
    broadcastLog('stderr', `Erreur de lancement pour ${label}: ${err.message}`, 'PROCESS_MGR');
    return { success: false, message: `Échec de lancement : ${err.message}` };
  }
}

/**
 * Arrête universellement un projet Antigravity en cours d'exécution
 * @param {string} projectName 
 * @returns {Promise<object>}
 */
export async function stopProject(projectName) {
  const { port, label, key } = resolveProjectInfo(projectName);

  // Recherche dans les processus managés
  let procInfo = runningProcesses.get(key);
  if (!procInfo) {
    // Recherche par port ou nom
    for (const [k, p] of runningProcesses.entries()) {
      if (p.port === port || p.projectName === projectName) {
        procInfo = p;
        break;
      }
    }
  }

  if (procInfo && procInfo.proc) {
    try {
      procInfo.proc.kill('SIGTERM');
      try { process.kill(procInfo.pid); } catch {}
      runningProcesses.delete(procInfo.id);

      broadcastLog('system', `Arrêt du serveur "${label}" (Port ${port}, PID ${procInfo.pid}).`, 'PROCESS_MGR');

      await sendSmsNotification(
        `🔴 [ANTIGRAVITY] Serveur "${label}" (Port ${port}) arrêté depuis votre smartphone.`,
        'project_stop'
      );

      return { success: true, message: `Serveur "${label}" arrêté avec succès.` };
    } catch (err) {
      return { success: false, message: `Erreur d'arrêt : ${err.message}` };
    }
  }

  // Si le processus était externe ou non trouvé dans la Map mais le port est actif
  const isPortUp = await checkPortActive(port);
  if (isPortUp) {
    // Sous Windows, tenter de libérer le port via netstat & taskkill
    try {
      exec(`powershell -Command "Get-NetTCPConnection -LocalPort ${port} -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }"`);
      runningProcesses.delete(key);
      broadcastLog('system', `Port ${port} libéré avec succès via PowerShell.`, 'PROCESS_MGR');
      return { success: true, message: `Port ${port} libéré.` };
    } catch {}
  }

  return { success: false, message: `Aucun serveur actif trouvé pour "${label}" (Port ${port}).` };
}

/**
 * Wrappers rétro-compatibles pour le serveur SaaS
 */
export async function startSaasServer() {
  return launchProject('SAAS EFFICIENS ENERGIA');
}

export async function stopSaasServer() {
  return stopProject('SAAS EFFICIENS ENERGIA');
}

/**
 * Déclenche un banc d'essai ou un audit autonome @AUD
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
  return Array.from(runningProcesses.values()).map(p => ({
    id: p.id,
    name: p.name,
    projectName: p.projectName,
    port: p.port,
    pid: p.pid,
    url: p.url,
    startTime: p.startTime
  }));
}
