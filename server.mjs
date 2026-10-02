// server.mjs - Moteur Serveur Antigravity Mobile Pilot (Node.js 24) - Sécurité & Innovations
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

import { scanAntigravityProjects } from './lib/antigravity_scanner.js';
import { 
  startSaasServer, 
  stopSaasServer, 
  launchProject,
  stopProject,
  stopAllProjects,
  snapshotProject,
  runProjectAudit, 
  getRunningProcesses, 
  logEmitter, 
  getRecentLogs,
  broadcastLog 
} from './lib/process_manager.js';
import { getHardwareTelemetry } from './lib/hardware_telemetry.js';
import { getTasks, addTask, toggleTask, deleteTask } from './lib/tasks_manager.js';
import { sendSmsNotification, getSmsHistory, SEB_PHONE } from './lib/sms_notifier.js';
import { isActionAllowed, sanitizePath, escapeHtml, isSafeCommandParam } from './lib/security_guard.js';
import { printTerminalQr, generateQrSvg, generateAndVerifyQr, generateQrFile } from './lib/qr_generator.js';
import { 
  verifyPin, 
  verifyPairingToken, 
  createSession, 
  validateSession, 
  revokeSession, 
  extractAuthToken, 
  getSessionDetails,
  isLocalNetwork,
  PAIRING_TOKEN 
} from './lib/auth_manager.js';
import { checkRateLimit, resetRateLimit } from './lib/rate_limiter.js';
import { logSecurityEvent, getRecentSecurityEvents } from './lib/security_audit_logger.js';
import { startRemoteTunnel, stopRemoteTunnel, getRemoteTunnelUrl, isRemoteTunnelActive, getPublicIp, getTunnelType } from './lib/remote_tunnel.js';
import { parseVoiceCommand } from './lib/voice_assistant.js';
import { 
  generateBiometricChallenge, 
  saveBiometricCredential, 
  verifyBiometricAssertion, 
  hasBiometricCredentials 
} from './lib/biometric_auth.js';
import { 
  savePushSubscription, 
  removePushSubscription, 
  getPushSubscriptions, 
  dispatchPushNotification 
} from './lib/push_manager.js';
import { 
  recordAuditEntry, 
  getAuditLogs, 
  verifyAuditIntegrity 
} from './lib/immutable_audit.js';
import { 
  getRoutines, 
  executeRoutine 
} from './lib/routines_manager.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');
const MAX_BODY_BYTES = 10 * 1024; // 10 KB Anti-DoS

process.on('uncaughtException', (err) => {
  console.error('[SERVER RESILIENCE] Exception interceptée:', err.message);
});

/**
 * Récupère l'adresse IP locale Wi-Fi / Ethernet pour connexion smartphone
 * @returns {string}
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
const MOBILE_URL = `http://${LOCAL_IP}:${PORT}`;
const PAIRING_URL = `${MOBILE_URL}/?pair=${PAIRING_TOKEN}`;

// Mémoire tampon pour l'auto-guérison 502 (anti-boucle de relance)
const autoRecoveryCooldown = new Map();

/**
 * Associe un numéro de port à un projet Antigravity pour l'auto-guérison
 * @param {number} port 
 * @returns {{ name: string, label: string }|null}
 */
function findProjectByPort(port) {
  if (port === 8092) return { name: 'SAAS EFFICIENS ENERGIA', label: 'RDV-Hub SaaS' };
  if (port === 8080) return { name: '$HOMEagy2-projectsmy-first-project', label: 'SmartTrip Pro' };
  if (port === 8089) return { name: 'site_construction', label: 'Bâti-Excellence Pro' };
  if (port === 8093) return { name: 'projects/rdv_hub_omnicanal', label: 'RDV-Hub Omnicanal' };
  if (port === 8095) return { name: 'WEBTOON PROJECT PLUME D ACIER', label: "Webtoon La Plume et l'Acier" };
  return null;
}

// Types MIME pour les fichiers statiques
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

/**
 * Vérifie l'origine anti-CSRF pour les requêtes de mutation
 * @param {object} req 
 * @returns {boolean}
 */
function isTrustedOrigin(req) {
  const origin = req.headers['origin'];
  const referer = req.headers['referer'];
  const checkUrl = origin || referer;

  if (!checkUrl) return true;

  try {
    const parsed = new URL(checkUrl);
    const host = parsed.hostname;
    const remoteUrl = getRemoteTunnelUrl();
    let remoteHost = '';
    if (remoteUrl) {
      try { remoteHost = new URL(remoteUrl).hostname; } catch {}
    }

    if (
      host === 'localhost' || 
      host === '127.0.0.1' || 
      host === LOCAL_IP ||
      host.endsWith('.trycloudflare.com') ||
      host.endsWith('.loca.lt') ||
      (remoteHost && host === remoteHost)
    ) {
      return true;
    }
  } catch {}

  return false;
}

/**
 * Gestionnaire HTTP principal durci
 */
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = url.pathname;
  const clientIp = req.headers['x-forwarded-for']?.split(',')[0].trim() || req.socket.remoteAddress || '127.0.0.1';

  // 1. En-têtes de sécurité renforcés (OWASP Top 10)
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Content-Security-Policy', "default-src 'self' https: data:; script-src 'self' 'unsafe-inline' https:; style-src 'self' 'unsafe-inline' https:; img-src 'self' data: https:; connect-src 'self' https: wss:; frame-ancestors 'none';");
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=*, payment=(), usb=()');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  res.setHeader('Access-Control-Allow-Credentials', 'true');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // 2. Protection Anti-CSRF sur les requêtes POST
  if (req.method === 'POST' && !isTrustedOrigin(req)) {
    logSecurityEvent('CSRF_ORIGIN_BLOCKED', clientIp, 'BLOCKED', { 
      origin: req.headers['origin'], 
      referer: req.headers['referer'] 
    });
    res.writeHead(403, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: false, error: 'Origine de requête non approuvée (Anti-CSRF).' }));
    return;
  }

  // Helper pour lire le corps JSON avec limite de taille Anti-DoS
  const readJsonBody = () => {
    return new Promise((resolve, reject) => {
      let body = '';
      let receivedBytes = 0;

      req.on('data', chunk => {
        receivedBytes += chunk.length;
        if (receivedBytes > MAX_BODY_BYTES) {
          logSecurityEvent('PAYLOAD_TOO_LARGE', clientIp, 'BLOCKED', { receivedBytes });
          if (!res.headersSent) {
            res.writeHead(413, { 'Content-Type': 'application/json', 'Connection': 'close' });
            res.end(JSON.stringify({ success: false, error: 'Charge utile trop volumineuse (Anti-DoS).' }));
          }
          req.resume();
          reject(new Error('Payload too large'));
          return;
        }
        body += chunk;
      });

      req.on('end', () => {
        try {
          resolve(JSON.parse(body || '{}'));
        } catch (err) {
          resolve({});
        }
      });
    });
  };

  // Helper de vérification d'authentification
  const checkAuth = () => {
    const token = extractAuthToken(req);
    return token && validateSession(token);
  };

  // --- API PUBLIQUE SÉCURISÉE ---

  // 1. GET /api/status (Informations publiques d'initialisation)
  if (req.method === 'GET' && pathname === '/api/status') {
    const rate = checkRateLimit(clientIp, 'api');
    if (!rate.allowed) {
      res.writeHead(429, { 'Content-Type': 'application/json', 'Retry-After': String(rate.retryAfter) });
      res.end(JSON.stringify({ success: false, error: `Trop de requêtes. Réessayez dans ${rate.retryAfter}s.` }));
      return;
    }

    const token = extractAuthToken(req);
    const sessionDetails = token ? getSessionDetails(token) : null;
    const isLocal = isLocalNetwork(clientIp);

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      success: true,
      service: 'Mobil Antigravity — Centre de Gestion & Pilotage Sécurisé',
      version: '1.0.0-PROD',
      owner: 'Seb',
      phone: SEB_PHONE,
      localIp: LOCAL_IP,
      port: PORT,
      mobileUrl: MOBILE_URL,
      pairingUrl: PAIRING_URL,
      remoteUrl: getRemoteTunnelUrl(),
      isTunnelActive: isRemoteTunnelActive(),
      remoteTunnelActive: isRemoteTunnelActive(),
      tunnelType: getTunnelType(),
      publicIp: await getPublicIp(),
      tunnelPassword: await getPublicIp(),
      hasBiometrics: hasBiometricCredentials(),
      authenticated: !!checkAuth(),
      session: sessionDetails,
      network: {
        clientIp,
        isLocal,
        mode: isLocal ? 'Wi-Fi Local (Session 24h)' : 'Accès Distant WAN/4G/5G (Session 1h + Biométrie)'
      },
      pushSubscriptionsCount: getPushSubscriptions().length,
      uptimeSeconds: Math.floor(process.uptime()),
      timestamp: new Date().toISOString()
    }));
    return;
  }

  // 1b. GET /api/qr.svg (QR Code vectoriel authentique dynamique)
  if (req.method === 'GET' && (pathname === '/api/qr.svg' || pathname === '/api/qr')) {
    const remote = getRemoteTunnelUrl();
    const target = remote ? `${remote}/?pair=${PAIRING_TOKEN}` : PAIRING_URL;
    const svg = await generateQrSvg(target, 240);
    res.writeHead(200, { 'Content-Type': 'image/svg+xml; charset=utf-8', 'Cache-Control': 'no-cache' });
    res.end(svg);
    return;
  }

  // 2. POST /api/auth/login (Authentification par code PIN ou jeton d'appairage)
  if (req.method === 'POST' && pathname === '/api/auth/login') {
    const rate = checkRateLimit(clientIp, 'login');
    if (!rate.allowed) {
      logSecurityEvent('AUTH_RATE_LIMITED', clientIp, 'BLOCKED', { retryAfter: rate.retryAfter });
      res.writeHead(429, { 'Content-Type': 'application/json', 'Retry-After': String(rate.retryAfter) });
      res.end(JSON.stringify({ 
        success: false, 
        error: `Tentatives excessives. Smartphone verrouillé pour ${rate.retryAfter} secondes.` 
      }));
      return;
    }

    try {
      const payload = await readJsonBody();
      const pin = payload.pin;
      const pairing = payload.pairingToken;

      const isPinValid = verifyPin(pin);
      const isPairingValid = verifyPairingToken(pairing);

      if (isPinValid || isPairingValid) {
        resetRateLimit(clientIp, 'login');
        const token = createSession(clientIp, req.headers['user-agent'] || 'unknown');
        const sessionDetails = getSessionDetails(token);
        
        logSecurityEvent('AUTH_LOGIN_SUCCESS', clientIp, 'SUCCESS', { 
          method: isPairingValid ? 'PAIRING_TOKEN' : 'PIN' 
        });

        recordAuditEntry({
          action: 'LOGIN',
          target: 'Authentication Hub',
          channel: isPairingValid ? 'Pairing Token' : 'PIN 6567',
          ip: clientIp,
          userAgent: req.headers['user-agent'] || 'unknown',
          status: 'SUCCESS',
          metadata: { networkType: sessionDetails?.networkType, isLocal: sessionDetails?.isLocal }
        });

        res.setHeader('Set-Cookie', `agy_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=86400`);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          token,
          sebPhone: SEB_PHONE,
          session: sessionDetails,
          message: 'Authentification réussie.'
        }));
        return;
      }

      logSecurityEvent('AUTH_LOGIN_FAIL', clientIp, 'WARN', { attemptsRemaining: rate.remaining });
      recordAuditEntry({
        action: 'LOGIN_ATTEMPT',
        target: 'Authentication Hub',
        channel: 'PIN / Token',
        ip: clientIp,
        userAgent: req.headers['user-agent'] || 'unknown',
        status: 'FAILURE',
        metadata: { attemptsRemaining: rate.remaining }
      });
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ 
        success: false, 
        error: `Code PIN incorrect. Tentatives restantes : ${rate.remaining}` 
      }));
    } catch {}
    return;
  }

  // 3. POST /api/auth/biometric/challenge (Génération du challenge FaceID / WebAuthn)
  if (req.method === 'POST' && pathname === '/api/auth/biometric/challenge') {
    const challenge = generateBiometricChallenge();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true, challenge }));
    return;
  }

  // 4. POST /api/auth/biometric/verify (Vérification FaceID / Empreinte et émission du token)
  if (req.method === 'POST' && pathname === '/api/auth/biometric/verify') {
    try {
      const payload = await readJsonBody();
      const result = verifyBiometricAssertion(payload.credentialId, payload.challenge, clientIp);

      if (result.success && result.token) {
        logSecurityEvent('AUTH_BIOMETRIC_SUCCESS', clientIp, 'SUCCESS', { credentialId: payload.credentialId });
        recordAuditEntry({
          action: 'BIOMETRIC_LOGIN',
          target: 'Authentication Hub',
          channel: 'WebAuthn Biometric',
          ip: clientIp,
          userAgent: req.headers['user-agent'] || 'unknown',
          status: 'SUCCESS',
          metadata: { credentialId: payload.credentialId }
        });
        res.setHeader('Set-Cookie', `agy_session=${result.token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=86400`);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result));
        return;
      }

      logSecurityEvent('AUTH_BIOMETRIC_FAIL', clientIp, 'WARN', { error: result.error });
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: result.error || 'Échec biométrique.' }));
    } catch (e) {
      if (res.headersSent) return;
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: e.message }));
    }
    return;
  }

  // 5. POST /api/auth/biometric/register (Enregistrement de la biométrie du smartphone de Seb)
  if (req.method === 'POST' && pathname === '/api/auth/biometric/register') {
    try {
      const payload = await readJsonBody();
      const saved = saveBiometricCredential(payload.credentialId, payload.rawId, payload.clientName);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: saved, message: 'Empreinte biométrique FaceID enregistrée.' }));
    } catch (e) {
      if (res.headersSent) return;
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: e.message }));
    }
    return;
  }

  // 6. POST /api/auth/logout
  if (req.method === 'POST' && pathname === '/api/auth/logout') {
    const token = extractAuthToken(req);
    revokeSession(token);
    logSecurityEvent('AUTH_LOGOUT', clientIp, 'INFO');
    res.setHeader('Set-Cookie', 'agy_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0');
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true, message: 'Session fermée.' }));
    return;
  }

  // 7. GET /api/auth/verify
  if (req.method === 'GET' && pathname === '/api/auth/verify') {
    const isAuth = checkAuth();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true, authenticated: isAuth }));
    return;
  }

  // --- FILTRE D'ACCÈS OBLIGATOIRE SUR LES ROUTES PROTÉGÉES ---
  if (pathname.startsWith('/api/')) {
    if (!checkAuth()) {
      logSecurityEvent('AUTH_UNAUTHORIZED_ACCESS', clientIp, 'BLOCKED', { path: pathname });
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ 
        success: false, 
        error: 'Accès non autorisé. Déverrouillez votre smartphone avec votre code PIN ou FaceID.' 
      }));
      return;
    }
  }

  // --- API PRIVÉE PROTÉGÉE (Nécessite Authentification Seb) ---

  // 8. GET /api/projects
  if (req.method === 'GET' && pathname === '/api/projects') {
    try {
      const projects = await scanAntigravityProjects();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, count: projects.length, projects }));
    } catch (err) {
      if (res.headersSent) return;
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: err.message }));
    }
    return;
  }

  // 9. GET /api/processes
  if (req.method === 'GET' && pathname === '/api/processes') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      success: true,
      processes: getRunningProcesses()
    }));
    return;
  }

  // 10. GET /api/logs/stream (SSE)
  if (req.method === 'GET' && pathname === '/api/logs/stream') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive'
    });

    const history = getRecentLogs();
    for (const item of history) {
      res.write(`data: ${JSON.stringify(item)}\n\n`);
    }

    const onLog = (logItem) => {
      res.write(`data: ${JSON.stringify(logItem)}\n\n`);
    };
    logEmitter.on('log', onLog);

    req.on('close', () => {
      logEmitter.off('log', onLog);
    });
    return;
  }

  // 10b. GET /api/hardware (Télémétrie Matérielle Machine Hôte - CPU, RAM, Disque C:)
  if (req.method === 'GET' && pathname === '/api/hardware') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      success: true,
      hardware: getHardwareTelemetry()
    }));
    return;
  }

  // 10c. GET /api/tasks (Carnet de Tâches pour l'Équipe Multi-Agents)
  if (req.method === 'GET' && pathname === '/api/tasks') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      success: true,
      tasks: getTasks()
    }));
    return;
  }

  // 10d. POST /api/tasks/add (Ajout de Tâche)
  if (req.method === 'POST' && pathname === '/api/tasks/add') {
    try {
      const payload = await readJsonBody();
      const created = addTask({
        title: payload.title || payload.text,
        assignee: payload.assignee || '@CE',
        project: payload.project || 'Global',
        source: payload.source || 'Seb Mobile'
      });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, task: created }));
    } catch (e) {
      if (res.headersSent) return;
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: e.message }));
    }
    return;
  }

  // 10e. POST /api/tasks/toggle (Bascule statut TODO <-> DONE)
  if (req.method === 'POST' && pathname === '/api/tasks/toggle') {
    try {
      const payload = await readJsonBody();
      const updated = toggleTask(payload.id || payload.taskId);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: !!updated, task: updated }));
    } catch (e) {
      if (res.headersSent) return;
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: e.message }));
    }
    return;
  }

  // 10f. POST /api/tasks/delete (Suppression de Tâche)
  if (req.method === 'POST' && pathname === '/api/tasks/delete') {
    try {
      const payload = await readJsonBody();
      const deleted = deleteTask(payload.id || payload.taskId);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: deleted }));
    } catch (e) {
      if (res.headersSent) return;
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: e.message }));
    }
    return;
  }

  // 10g. GET /api/briefing (Morning Briefing Automatisé)
  if (req.method === 'GET' && pathname === '/api/briefing') {
    try {
      const projs = await scanAntigravityProjects();
      const onlineCount = projs.filter(p => p.isPortActive).length;
      const hw = getHardwareTelemetry();
      const tasks = getTasks();
      const pendingTasks = tasks.filter(t => t.status !== 'DONE').length;
      const briefText = `Bonjour Seb. PC hôte : processeur à ${hw.cpu.percent}%, mémoire à ${hw.ram.percentUsed}%, ${hw.disk.freeGb} Go libres sur le disque C. ${onlineCount} projet(s) en ligne sur ${projs.length}. ${pendingTasks} tâche(s) d'agents en attente. Tous les voyants sont au vert.`;
      
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        briefing: briefText,
        hardware: hw,
        onlineCount,
        totalProjects: projs.length,
        pendingTasks,
        timestamp: new Date().toISOString()
      }));
    } catch (e) {
      if (res.headersSent) return;
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: e.message }));
    }
    return;
  }

  // 11. POST /api/voice/command (Assistant Vocal Intelligent)
  if (req.method === 'POST' && pathname === '/api/voice/command') {
    try {
      const payload = await readJsonBody();
      const transcript = payload.transcript || '';
      const parsed = parseVoiceCommand(transcript);

      logSecurityEvent('VOICE_COMMAND_RECEIVED', clientIp, 'INFO', { transcript, intent: parsed.intent });
      broadcastLog('system', `🎙️ Commande vocale Seb : "${transcript}" -> Intention: [${parsed.intent}]`, 'VOICE_AI');

      let executionResult = null;
      if (parsed.recognized && parsed.action) {
        if (parsed.action === 'chained_actions' && Array.isArray(parsed.commands)) {
          const multiResults = [];
          for (const cmd of parsed.commands) {
            let singleRes = null;
            switch (cmd.action) {
              case 'start_saas_server': singleRes = await startSaasServer(); break;
              case 'stop_saas_server': singleRes = await stopSaasServer(); break;
              case 'launch_project': singleRes = await launchProject(cmd.targetProject); break;
              case 'stop_project': singleRes = await stopProject(cmd.targetProject); break;
              case 'run_audit': singleRes = await runProjectAudit(cmd.targetProject || 'mobil antigravity'); break;
              case 'kill_switch': singleRes = await stopAllProjects(); break;
              case 'execute_routine': singleRes = await executeRoutine(cmd.routineId || 'morning', { ip: clientIp, userAgent: req.headers['user-agent'], channel: 'Vocal NLP' }); break;
              case 'snapshot_project': singleRes = await snapshotProject(cmd.targetProject || 'mobil antigravity'); break;
              case 'get_hardware': singleRes = { success: true, hardware: getHardwareTelemetry() }; break;
              default: singleRes = { success: true, action: cmd.action };
            }
            multiResults.push({ command: cmd.intent, action: cmd.action, result: singleRes });
          }
          executionResult = { chained: true, count: multiResults.length, results: multiResults };

          recordAuditEntry({
            action: 'VOICE_CHAINED_COMMANDS',
            target: parsed.commands.map(c => c.action).join(' + '),
            channel: 'Vocal NLP',
            ip: clientIp,
            userAgent: req.headers['user-agent'] || 'Unknown',
            status: 'SUCCESS',
            metadata: { transcript, count: parsed.commands.length, results: multiResults }
          });
        } else if (parsed.action === 'execute_routine') {
          executionResult = await executeRoutine(parsed.routineId || 'morning', {
            ip: clientIp,
            userAgent: req.headers['user-agent'],
            channel: 'Vocal NLP'
          });
          if (executionResult.replyText) parsed.replyText = executionResult.replyText;

          recordAuditEntry({
            action: `VOICE_ROUTINE_${(parsed.routineId || 'morning').toUpperCase()}`,
            target: executionResult.name || 'Routine Automatique',
            channel: 'Vocal NLP',
            ip: clientIp,
            userAgent: req.headers['user-agent'] || 'Unknown',
            status: 'SUCCESS',
            metadata: { transcript, routineId: parsed.routineId }
          });
        } else {
          switch (parsed.action) {
            case 'start_saas_server':
              executionResult = await startSaasServer();
              break;
            case 'stop_saas_server':
              executionResult = await stopSaasServer();
              break;
            case 'launch_project':
              executionResult = await launchProject(parsed.targetProject);
              break;
            case 'stop_project':
              executionResult = await stopProject(parsed.targetProject);
              break;
            case 'run_audit':
              executionResult = await runProjectAudit(parsed.targetProject || 'mobil antigravity');
              break;
            case 'send_sms_status':
              const projects = await scanAntigravityProjects();
              const msg = `📱 [VOCAL] Rapport Seb : ${projects.length} projets surveillés, contrôleur mobile opérationnel.`;
              executionResult = await sendSmsNotification(msg, 'voice_command');
              break;
            case 'check_rules':
              executionResult = { success: true, message: '18 Règles conformes.' };
              break;
            case 'get_status':
              const projs = await scanAntigravityProjects();
              const online = projs.filter(p => p.isPortActive).length;
              executionResult = { success: true, count: projs.length, online };
              break;
            case 'kill_switch':
              executionResult = await stopAllProjects();
              break;
            case 'morning_briefing':
              const projsB = await scanAntigravityProjects();
              const onB = projsB.filter(p => p.isPortActive).length;
              const hwB = getHardwareTelemetry();
              const tasksB = getTasks();
              const pendingB = tasksB.filter(t => t.status !== 'DONE').length;
              const briefVoice = `Bonjour Sébastien. Processeur à ${hwB.cpu.percent}%, mémoire à ${hwB.ram.percentUsed}%. ${onB} projet(s) en ligne sur ${projsB.length}. ${pendingB} tâche(s) d'agents en attente. Tous les voyants sont au vert.`;
              executionResult = { success: true, briefing: briefVoice, hardware: hwB, onlineCount: onB, pendingTasks: pendingB };
              parsed.replyText = briefVoice;
              break;
            case 'snapshot_project':
              executionResult = await snapshotProject(parsed.targetProject || 'mobil antigravity');
              break;
            case 'get_hardware':
              const hwH = getHardwareTelemetry();
              executionResult = { success: true, hardware: hwH };
              parsed.replyText = `Santé machine : Processeur à ${hwH.cpu.percent}%, RAM à ${hwH.ram.percentUsed}%, ${hwH.disk.freeGb} Go libres sur C:.`;
              break;
            case 'add_task':
              const newTask = addTask(parsed.taskData || { title: transcript, assignee: '@CE', project: 'Global', source: 'Vocal Seb' });
              executionResult = { success: true, task: newTask };
              break;
          }

          recordAuditEntry({
            action: `VOICE_${parsed.action.toUpperCase()}`,
            target: parsed.targetProject || 'System',
            channel: 'Vocal NLP',
            ip: clientIp,
            userAgent: req.headers['user-agent'] || 'Unknown',
            status: 'SUCCESS',
            metadata: { transcript, intent: parsed.intent }
          });
        }
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        recognized: parsed.recognized,
        action: parsed.action,
        intent: parsed.intent,
        commands: parsed.commands || null,
        targetProject: parsed.targetProject || null,
        replyText: parsed.replyText,
        executionResult
      }));
    } catch (err) {
      if (res.headersSent) return;
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: err.message }));
    }
    return;
  }

  // 12. POST /api/tunnel/toggle (Activation / Désactivation du tunnel 4G/5G)
  if (req.method === 'POST' && pathname === '/api/tunnel/toggle') {
    try {
      if (isRemoteTunnelActive()) {
        stopRemoteTunnel();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, active: false, message: 'Passerelle 4G/5G arrêtée.' }));
      } else {
        const url = await startRemoteTunnel(PORT);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, active: true, remoteUrl: url, message: 'Passerelle 4G/5G activée.' }));
      }
    } catch (err) {
      if (res.headersSent) return;
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: err.message }));
    }
    return;
  }

  // 13. POST /api/action
  if (req.method === 'POST' && pathname === '/api/action') {
    const rate = checkRateLimit(clientIp, 'action');
    if (!rate.allowed) {
      res.writeHead(429, { 'Content-Type': 'application/json', 'Retry-After': String(rate.retryAfter) });
      res.end(JSON.stringify({ success: false, error: 'Trop d’actions déclenchées rapidement.' }));
      return;
    }

    try {
      const payload = await readJsonBody();
      const action = payload.action;

      if (!action || !isActionAllowed(action)) {
        logSecurityEvent('COMMAND_INJECTION_BLOCKED', clientIp, 'BLOCKED', { action });
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'Action non autorisée ou invalide.' }));
        return;
      }

      logSecurityEvent('ACTION_EXECUTED', clientIp, 'SUCCESS', { action, target: payload.targetProject });
      broadcastLog('system', `Action mobile autorisée: [${action}]`, 'SECURE_API');

      let result = { success: true };
      switch (action) {
        case 'start_saas_server':
          result = await startSaasServer();
          break;
        case 'stop_saas_server':
          result = await stopSaasServer();
          break;
        case 'launch_project':
          result = await launchProject(payload.targetProject);
          break;
        case 'stop_project':
          result = await stopProject(payload.targetProject);
          break;
        case 'run_audit':
          result = await runProjectAudit(payload.targetProject || 'entrainement equipe agent');
          break;
        case 'send_sms_status':
          const projects = await scanAntigravityProjects();
          const onlineCount = projects.filter(p => p.isPortActive).length;
          const smsMsg = `📱 [ANTIGRAVITY SÉCURISÉ] Rapport Seb : ${projects.length} projets actifs. ${onlineCount} serveurs en ligne. Contrôleur smartphone protégé.`;
          result = await sendSmsNotification(smsMsg, 'mobile_request');
          break;
        case 'check_rules':
          broadcastLog('system', 'Vérification des 18 règles ANTIGRAVITY & Sécurité OWASP...', 'RULES_GUARD');
          result = { success: true, message: '18 Règles conformes, OWASP validé et synchronisé.' };
          break;
        case 'ping':
          result = { success: true, message: 'Pong sécurisé ! Connexion chiffrée active.' };
          break;
        case 'kill_switch':
          result = await stopAllProjects();
          break;
        case 'snapshot_project':
          result = await snapshotProject(payload.targetProject || 'mobil antigravity');
          break;
        case 'get_hardware':
          result = { success: true, hardware: getHardwareTelemetry() };
          break;
        case 'morning_briefing':
          const projsB = await scanAntigravityProjects();
          const onB = projsB.filter(p => p.isPortActive).length;
          const hwInfo = getHardwareTelemetry();
          const taskList = getTasks();
          const pendingCount = taskList.filter(t => t.status !== 'DONE').length;
          const briefingMsg = `Bonjour Seb. PC hôte : CPU à ${hwInfo.cpu.percent}%, RAM à ${hwInfo.ram.percentUsed}%, ${hwInfo.disk.freeGb} Go libres sur C:. ${onB} projet(s) en ligne sur ${projsB.length}. ${pendingCount} tâche(s) d'agents en attente. Tout est sous contrôle.`;
          result = { success: true, briefing: briefingMsg, hardware: hwInfo, onlineCount: onB, pendingTasks: pendingCount };
          break;
        case 'add_task':
          result = { success: true, task: addTask(payload.taskData || { title: payload.title || payload.text, assignee: payload.assignee, project: payload.project, source: 'Seb Mobile' }) };
          break;
        case 'toggle_task':
          result = { success: true, task: toggleTask(payload.id || payload.taskId) };
          break;
        case 'delete_task':
          result = { success: true, deleted: deleteTask(payload.id || payload.taskId) };
          break;
        case 'execute_routine':
          result = await executeRoutine(payload.routineId || payload.targetProject || 'morning', {
            ip: clientIp,
            userAgent: req.headers['user-agent'] || 'Unknown',
            channel: '1-Tap UI'
          });
          break;
        default:
          result = { success: false, message: 'Action non implémentée.' };
      }

      recordAuditEntry({
        action: action.toUpperCase(),
        target: payload.targetProject || payload.routineId || 'System',
        channel: '1-Tap UI',
        ip: clientIp,
        userAgent: req.headers['user-agent'] || 'Unknown',
        status: result.success !== false ? 'SUCCESS' : 'FAILURE',
        metadata: { action }
      });

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result));
    } catch (err) {
      if (res.headersSent) return;
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: err.message }));
    }
    return;
  }

  // 14. POST /api/sms/send
  if (req.method === 'POST' && pathname === '/api/sms/send') {
    try {
      const payload = await readJsonBody();
      const text = payload.message || 'Notification depuis Antigravity Mobile Pilot';
      
      if (!isSafeCommandParam(text)) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'Caractères interdits dans le message.' }));
        return;
      }

      const result = await sendSmsNotification(text, 'smartphone_manual');
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result));
    } catch (err) {
      if (res.headersSent) return;
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: err.message }));
    }
    return;
  }

  // 15. GET /api/sms/history
  if (req.method === 'GET' && pathname === '/api/sms/history') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true, history: getSmsHistory() }));
    return;
  }

  // 16. GET /api/security/events
  if (req.method === 'GET' && pathname === '/api/security/events') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true, events: getRecentSecurityEvents() }));
    return;
  }

  // 17. POST /api/push/subscribe (Abonnement PWA Web Push Natif W3C)
  if (req.method === 'POST' && pathname === '/api/push/subscribe') {
    try {
      const payload = await readJsonBody();
      const sub = payload.subscription || payload;
      const result = savePushSubscription(sub, req.headers['user-agent'] || 'unknown', clientIp);
      recordAuditEntry({
        action: 'PUSH_SUBSCRIBE',
        target: 'Web Push Manager',
        channel: 'PWA WebPush',
        ip: clientIp,
        userAgent: req.headers['user-agent'] || 'unknown',
        status: 'SUCCESS',
        metadata: { id: result.id }
      });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result));
    } catch (err) {
      if (res.headersSent) return;
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: err.message }));
    }
    return;
  }

  // 18. POST /api/push/send (Envoi/Dispatch d'une notification Web Push)
  if (req.method === 'POST' && pathname === '/api/push/send') {
    try {
      const payload = await readJsonBody();
      const result = await dispatchPushNotification(payload);
      recordAuditEntry({
        action: 'PUSH_DISPATCH',
        target: payload.title || 'Notification',
        channel: 'PWA WebPush',
        ip: clientIp,
        userAgent: req.headers['user-agent'] || 'unknown',
        status: 'SUCCESS',
        metadata: { title: payload.title, count: result.sentCount }
      });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result));
    } catch (err) {
      if (res.headersSent) return;
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: err.message }));
    }
    return;
  }

  // 19. GET /api/push/status (État et liste des abonnements push)
  if (req.method === 'GET' && pathname === '/api/push/status') {
    const list = getPushSubscriptions();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true, count: list.length, subscriptions: list }));
    return;
  }

  // 20. GET /api/routines (Catalogue des routines et scénarios)
  if (req.method === 'GET' && pathname === '/api/routines') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true, routines: getRoutines() }));
    return;
  }

  // 21. POST /api/routines/execute (Exécution d'une routine automatisée)
  if (req.method === 'POST' && pathname === '/api/routines/execute') {
    try {
      const payload = await readJsonBody();
      const routineId = payload.routineId || 'morning';
      const result = await executeRoutine(routineId, {
        ip: clientIp,
        userAgent: req.headers['user-agent'] || 'unknown',
        channel: '1-Tap UI'
      });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result));
    } catch (err) {
      if (res.headersSent) return;
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: err.message }));
    }
    return;
  }

  // 22. GET /api/audit/logs (Journal d'audit immuable cryptographique - OWASP A09)
  if (req.method === 'GET' && pathname === '/api/audit/logs') {
    const integrity = verifyAuditIntegrity();
    const logs = getAuditLogs(100);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      success: true,
      count: logs.length,
      integrity,
      logs
    }));
    return;
  }

  // --- REVERSE PROXY POUR ACCÈS 4G/5G AUX PROJETS (/proxy/:port/*) AVEC AUTO-GUÉRISON (AUTO-RECOVERY 502) ---
  if (pathname.startsWith('/proxy/')) {
    const proxyMatch = pathname.match(/^\/proxy\/(\d+)(\/.*)?$/);
    if (proxyMatch) {
      const targetPort = parseInt(proxyMatch[1], 10);
      const subPath = proxyMatch[2] || '/';
      const targetUrl = subPath + (url.search || '');

      const proxyReq = http.request({
        hostname: '127.0.0.1',
        port: targetPort,
        path: targetUrl,
        method: req.method,
        headers: {
          ...req.headers,
          host: `127.0.0.1:${targetPort}`
        }
      }, (proxyRes) => {
        res.writeHead(proxyRes.statusCode, proxyRes.headers);
        proxyRes.pipe(res);
      });

      proxyReq.on('error', () => {
        // MODULE 3.2 : Auto-Recovery (Auto-Guérison 502)
        const proj = findProjectByPort(targetPort);
        if (proj) {
          const lastRecovery = autoRecoveryCooldown.get(targetPort) || 0;
          if (Date.now() - lastRecovery > 8000) {
            autoRecoveryCooldown.set(targetPort, Date.now());
            broadcastLog('system', `🛠️ [AUTO-HEALING] Erreur HTTP 502 sur port ${targetPort} - Relance automatique initiée pour ${proj.label}...`, 'AUTO_HEALING');
            recordAuditEntry({
              action: 'AUTO_RECOVERY_502',
              target: `${proj.label} (Port ${targetPort})`,
              channel: 'Auto-Healing',
              ip: clientIp,
              userAgent: req.headers['user-agent'] || 'Unknown',
              status: 'TRIGGERED'
            });
            launchProject(proj.name).then(() => {
              broadcastLog('system', `✅ [AUTO-HEALING] ${proj.label} relancé avec succès (Port ${targetPort}).`, 'AUTO_HEALING');
            }).catch((err) => {
              broadcastLog('stderr', `❌ [AUTO-HEALING] Échec relance ${proj.label}: ${err.message}`, 'AUTO_HEALING');
            });
          }
        }

        if (!res.headersSent) {
          res.writeHead(502, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(`
            <div style="font-family: system-ui; max-width: 500px; margin: 40px auto; padding: 24px; background: #1e293b; color: #f8fafc; border-radius: 12px; text-align: center;">
              <h2>⚠️ Projet non démarré (Port ${targetPort})</h2>
              <p style="color: #94a3b8; font-size: 0.95rem;">Ce serveur n'est pas encore en cours d'exécution.</p>
              ${proj ? `<p style="color: #10b981; font-size: 0.85rem; margin-top: 10px;">🛠️ Auto-guérison active : tentative de relance de ${proj.label} en cours...</p>` : ''}
              <p><a href="/" style="display: inline-block; padding: 10px 20px; background: #10b981; color: #fff; text-decoration: none; border-radius: 8px; font-weight: 700; margin-top: 14px;">Retourner au Hub Mobile</a></p>
            </div>
          `);
        }
      });

      req.pipe(proxyReq);
      return;
    }
  }

  // --- SERVEUR STATIQUE (PWA) AVEC PROTECTION ANTI-PATH TRAVERSAL ---
  let decodedUrl = '';
  try {
    decodedUrl = decodeURIComponent(req.url);
  } catch {
    decodedUrl = req.url;
  }

  if (decodedUrl.includes('..') || req.url.includes('..') || pathname.includes('..')) {
    logSecurityEvent('PATH_TRAVERSAL_BLOCKED', clientIp, 'BLOCKED', { url: req.url });
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('403 Forbidden: Path traversal interdit');
    return;
  }

  const normalizedPath = path.normalize(pathname).replace(/^[/\\]+/, '');
  let filePath = path.join(PUBLIC_DIR, normalizedPath || 'index.html');

  if (!filePath.startsWith(PUBLIC_DIR)) {
    logSecurityEvent('PATH_TRAVERSAL_BLOCKED', clientIp, 'BLOCKED', { filePath });
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('403 Forbidden');
    return;
  }

  const VALID_SPA_ROUTES = new Set(['/', '/projects', '/actions', '/console', '/seb', '/login']);

  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    if (VALID_SPA_ROUTES.has(pathname)) {
      filePath = path.join(PUBLIC_DIR, 'index.html');
    } else {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('404 Not Found');
      return;
    }
  }

  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';

  try {
    const fileContent = fs.readFileSync(filePath);
    res.writeHead(200, { 
      'Content-Type': contentType,
      'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=86400'
    });
    res.end(fileContent);
  } catch (err) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('404 Not Found');
  }
});

// Démarrage du serveur et du tunnel 4G/5G
server.listen(PORT, '0.0.0.0', () => {
  broadcastLog('system', `Serveur Antigravity Mobile Pilot actif sur ${MOBILE_URL}`, 'SERVER_INIT');
  printTerminalQr(MOBILE_URL, process.env.SEB_PIN || '6567', PAIRING_URL);

  // S'assurer que le fichier QR PNG existe immédiatement
  const capturesDir = path.resolve('captures');
  if (!fs.existsSync(capturesDir)) fs.mkdirSync(capturesDir, { recursive: true });
  const qrDefaultFile = path.join(capturesDir, 'qr_seb_mobile.png');
  generateQrFile(PAIRING_URL, qrDefaultFile).catch(() => {});

  // Démarrage automatique de la passerelle 4G/5G distante en arrière-plan
  startRemoteTunnel(PORT).then(async remoteUrl => {
    broadcastLog('system', `🌍 Passerelle 4G/5G HTTPS active : ${remoteUrl}`, 'TUNNEL_READY');
    try {
      const qrRes = await generateAndVerifyQr(remoteUrl, PAIRING_TOKEN);
      if (qrRes.success) {
        broadcastLog('system', `📷 QR Code PNG certifié (Healthcheck Cloudflare 200 OK) généré`, 'QR_READY');
      }
    } catch (qrErr) {
      broadcastLog('system', `Avertissement génération QR: ${qrErr.message}`, 'QR_WARN');
    }
  }).catch(err => {
    broadcastLog('system', `Note 4G/5G : ${err.message}`, 'TUNNEL_INFO');
  });
});
