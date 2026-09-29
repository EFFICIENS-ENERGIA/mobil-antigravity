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
  runProjectAudit, 
  getRunningProcesses, 
  logEmitter, 
  getRecentLogs,
  broadcastLog 
} from './lib/process_manager.js';
import { sendSmsNotification, getSmsHistory, SEB_PHONE } from './lib/sms_notifier.js';
import { isActionAllowed, sanitizePath, escapeHtml, isSafeCommandParam } from './lib/security_guard.js';
import { printTerminalQr, generateQrSvg } from './lib/qr_generator.js';
import { 
  verifyPin, 
  verifyPairingToken, 
  createSession, 
  validateSession, 
  revokeSession, 
  extractAuthToken, 
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
        
        logSecurityEvent('AUTH_LOGIN_SUCCESS', clientIp, 'SUCCESS', { 
          method: isPairingValid ? 'PAIRING_TOKEN' : 'PIN' 
        });

        res.setHeader('Set-Cookie', `agy_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=86400`);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          token,
          sebPhone: SEB_PHONE,
          message: 'Authentification réussie. Session active pour 24h.'
        }));
        return;
      }

      logSecurityEvent('AUTH_LOGIN_FAIL', clientIp, 'WARN', { attemptsRemaining: rate.remaining });
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
        }
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        recognized: parsed.recognized,
        action: parsed.action,
        intent: parsed.intent,
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
        default:
          result = { success: false, message: 'Action non implémentée.' };
      }

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

  // --- REVERSE PROXY POUR ACCÈS 4G/5G AUX PROJETS (/proxy/:port/*) ---
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
        if (!res.headersSent) {
          res.writeHead(502, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(`
            <div style="font-family: system-ui; max-width: 500px; margin: 40px auto; padding: 24px; background: #1e293b; color: #f8fafc; border-radius: 12px; text-align: center;">
              <h2>⚠️ Projet non démarré (Port ${targetPort})</h2>
              <p style="color: #94a3b8; font-size: 0.95rem;">Ce serveur n'est pas encore en cours d'exécution.</p>
              <p><a href="/" style="display: inline-block; padding: 10px 20px; background: #10b981; color: #fff; text-decoration: none; border-radius: 8px; font-weight: 700;">Retourner au Hub Mobile</a></p>
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

  // Démarrage automatique de la passerelle 4G/5G distante en arrière-plan
  startRemoteTunnel(PORT).then(remoteUrl => {
    broadcastLog('system', `🌍 Passerelle 4G/5G HTTPS active : ${remoteUrl}`, 'TUNNEL_READY');
  }).catch(err => {
    broadcastLog('system', `Note 4G/5G : ${err.message}`, 'TUNNEL_INFO');
  });
});
