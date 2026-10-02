// lib/auto-healing-service.js - Moteur d'Auto-Guérison (Auto-Recovery 502) & Circuit Breaker
import http from 'node:http';
import { broadcastLog, launchProject } from './process_manager.js';
import { sendDualChannelAlert } from './push_manager.js';
import { recordAuditEntry } from './immutable_audit.js';

export const MONITORED_SERVICES = [
  { name: 'RDV-Hub SaaS', port: 8092, path: '/', key: 'saas_8092', projectName: 'SAAS EFFICIENS ENERGIA' },
  { name: 'SmartTrip Pro', port: 8080, path: '/', key: 'smarttrip_8080', projectName: '$HOMEagy2-projectsmy-first-project' },
  { name: 'Bâti-Excellence Pro', port: 8089, path: '/', key: 'bati_8089', projectName: 'site_construction' }
];

// Configuration du Circuit Breaker
const CIRCUIT_BREAKER_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const MAX_CONSECUTIVE_RECOVERIES = 2;              // 2 tentatives max par période de 15 minutes
const HEALTH_CHECK_TIMEOUT_MS = 3000;              // Timeout strict à 3 secondes

// États des services et du circuit breaker
// port -> { attempts: number, windowStartTime: number, state: 'CLOSED' | 'OPEN', lastCheck: object }
const circuitBreakerState = new Map();
let watcherTimer = null;
let isWatcherRunning = false;

/**
 * Initialise l'état d'un service dans le Circuit Breaker
 * @param {number} port 
 */
function getOrCreateBreaker(port) {
  if (!circuitBreakerState.has(port)) {
    circuitBreakerState.set(port, {
      port,
      attempts: 0,
      windowStartTime: Date.now(),
      state: 'CLOSED', // CLOSED = normal, OPEN = disjoncteur déclenché (trop de pannes)
      lastHealth: null,
      lastRecoveryAt: null
    });
  }
  const breaker = circuitBreakerState.get(port);

  // Réinitialisation de la fenêtre de 15 minutes si expirée
  if (Date.now() - breaker.windowStartTime > CIRCUIT_BREAKER_WINDOW_MS) {
    breaker.attempts = 0;
    breaker.windowStartTime = Date.now();
    breaker.state = 'CLOSED';
  }

  return breaker;
}

/**
 * Exécute un Health-Check réel sur un port avec timeout de 3s
 * @param {object} service 
 * @returns {Promise<{ isHealthy: boolean, statusCode: number|null, durationMs: number, error?: string }>}
 */
export async function checkServiceHealth(service) {
  const startTime = Date.now();

  return new Promise((resolve) => {
    let resolved = false;

    const req = http.get({
      hostname: '127.0.0.1',
      port: service.port,
      path: service.path || '/',
      timeout: HEALTH_CHECK_TIMEOUT_MS,
      headers: {
        'User-Agent': 'Mobil-Antigravity-AutoHealing-Watcher/1.0',
        'Accept': '*/*'
      }
    }, (res) => {
      res.resume(); // Consommer le corps de réponse
      const durationMs = Date.now() - startTime;
      const isHealthy = res.statusCode >= 200 && res.statusCode < 500 && res.statusCode !== 502 && res.statusCode !== 503;

      if (!resolved) {
        resolved = true;
        resolve({
          isHealthy,
          statusCode: res.statusCode,
          durationMs
        });
      }
    });

    req.on('timeout', () => {
      req.destroy();
      if (!resolved) {
        resolved = true;
        resolve({
          isHealthy: false,
          statusCode: 504,
          durationMs: Date.now() - startTime,
          error: `Timeout (> ${HEALTH_CHECK_TIMEOUT_MS}ms)`
        });
      }
    });

    req.on('error', (err) => {
      if (!resolved) {
        resolved = true;
        resolve({
          isHealthy: false,
          statusCode: 502,
          durationMs: Date.now() - startTime,
          error: err.code || err.message
        });
      }
    });
  });
}

/**
 * Algorithme d'Auto-Guérison en 5 étapes avec Circuit Breaker
 * @param {object} service 
 * @param {string} triggerReason 
 * @returns {Promise<object>}
 */
export async function triggerAutoRecovery(service, triggerReason = 'HTTP_502_BAD_GATEWAY') {
  const breaker = getOrCreateBreaker(service.port);

  // Vérification du Circuit Breaker
  if (breaker.state === 'OPEN') {
    broadcastLog('stderr', `🛑 [AUTO-HEALING] Disjoncteur (Circuit Breaker) ACTIF pour ${service.name} (Port ${service.port}) : Limite de 2 relances par 15 min atteinte.`, 'AUTO_HEALING');
    return {
      success: false,
      circuitBreakerOpen: true,
      message: `Circuit Breaker ouvert pour ${service.name}. Intervention humaine requise.`
    };
  }

  breaker.attempts += 1;
  breaker.lastRecoveryAt = new Date().toISOString();

  // ÉTAPE 1 : Émettre un log WARN sur le flux SSE
  broadcastLog('stderr', `⚠️ [AUTO-HEALING] Panne détectée sur ${service.name} (Port ${service.port}) [Cause: ${triggerReason}]. Tentative d'auto-guérison ${breaker.attempts}/${MAX_CONSECUTIVE_RECOVERIES}...`, 'AUTO_HEALING');

  // ÉTAPE 2 : Déclencher un redémarrage automatique 1-Tap du process sous-jacent
  try {
    await launchProject(service.projectName);
  } catch (launchErr) {
    broadcastLog('stderr', `❌ [AUTO-HEALING] Échec commande de relance pour ${service.name}: ${launchErr.message}`, 'AUTO_HEALING');
  }

  // ÉTAPE 3 : Ré-exécuter un health-check après 5 secondes
  await new Promise(r => setTimeout(r, 5000));
  const postCheck = await checkServiceHealth(service);

  // ÉTAPE 4 : Si le service réagit en HTTP 200 (ou équivalent sain)
  if (postCheck.isHealthy) {
    broadcastLog('system', `🟢 [AUTO-HEALING] Rétablissement certifié pour ${service.name} (Port ${service.port}) en ${postCheck.durationMs}ms (HTTP ${postCheck.statusCode}).`, 'AUTO_HEALING');
    recordAuditEntry({
      action: 'AUTO_HEALING_RESTORED',
      target: service.name,
      channel: 'Auto-Healing Watcher',
      status: 'SUCCESS',
      details: { port: service.port, attempt: breaker.attempts, statusCode: postCheck.statusCode }
    });

    return {
      success: true,
      service: service.name,
      port: service.port,
      statusCode: postCheck.statusCode,
      message: `Rétablissement réussi en ${postCheck.durationMs}ms`
    };
  }

  // ÉTAPE 5 : Si l'échec persiste après 2 tentatives
  broadcastLog('stderr', `❌ [AUTO-HEALING] Échec de rétablissement pour ${service.name} (Port ${service.port}) après tentative ${breaker.attempts}.`, 'AUTO_HEALING');

  if (breaker.attempts >= MAX_CONSECUTIVE_RECOVERIES) {
    breaker.state = 'OPEN'; // Déclencher le disjoncteur

    // Consigner l'incident dans le journal d'audit immuable
    recordAuditEntry({
      action: 'CIRCUIT_BREAKER_TRIGGERED',
      target: service.name,
      channel: 'Auto-Healing Watcher',
      status: 'CRITICAL',
      details: { port: service.port, consecutiveFailures: breaker.attempts, windowMs: CIRCUIT_BREAKER_WINDOW_MS }
    });

    // Déclencher l'alerte dual-channel (Web Push prioritaire + Fallback SMS Seb 07 78 24 65 67)
    await sendDualChannelAlert(
      `🚨 [ALERTE SEB] Panne persistante sur ${service.name} (Port ${service.port}). Le Circuit Breaker s'est activé après 2 tentatives de relance.`,
      {
        title: `🚨 Panne Serveur : ${service.name}`,
        body: `Port ${service.port} inaccessible. Disjoncteur activé après 2 relances.`,
        action: 'open_pwa',
        data: { port: service.port, type: 'critical_service_down' }
      }
    );
  }

  return {
    success: false,
    circuitBreakerOpen: breaker.state === 'OPEN',
    attempts: breaker.attempts,
    message: `Le service ${service.name} ne répond toujours pas (HTTP ${postCheck.statusCode || 'DOWN'}).`
  };
}

/**
 * Cycle d'inspection périodique des services monitorés
 */
async function runHealthCheckCycle() {
  for (const service of MONITORED_SERVICES) {
    const health = await checkServiceHealth(service);
    const breaker = getOrCreateBreaker(service.port);
    breaker.lastHealth = {
      isHealthy: health.isHealthy,
      statusCode: health.statusCode,
      durationMs: health.durationMs,
      checkedAt: new Date().toISOString()
    };

    if (!health.isHealthy) {
      // Déclencher l'auto-guérison si le disjoncteur n'est pas ouvert
      if (breaker.state !== 'OPEN') {
        await triggerAutoRecovery(service, health.error || `HTTP_${health.statusCode}`);
      }
    }
  }
}

/**
 * Démarre le watcher d'auto-guérison en tâche de fond
 * @param {number} intervalMs 
 */
export function startAutoHealingWatcher(intervalMs = 30000) {
  if (isWatcherRunning) return;
  isWatcherRunning = true;
  broadcastLog('system', `🛡️ Watcher d'Auto-Guérison (Auto-Recovery 502) actif (Intervalle: ${intervalMs / 1000}s, Circuit Breaker: 2/15min).`, 'AUTO_HEALING');

  // Premier passage différé de 10 secondes pour laisser le boot initial se stabiliser
  setTimeout(() => {
    runHealthCheckCycle().catch(() => {});
  }, 10000);

  watcherTimer = setInterval(() => {
    runHealthCheckCycle().catch(() => {});
  }, intervalMs);
}

/**
 * Arrête le watcher
 */
export function stopAutoHealingWatcher() {
  if (watcherTimer) {
    clearInterval(watcherTimer);
    watcherTimer = null;
  }
  isWatcherRunning = false;
}

/**
 * Retourne le statut complet des services surveillés et du Circuit Breaker
 */
export function getAutoHealingStatus() {
  return {
    isWatcherRunning,
    circuitBreakerWindowMs: CIRCUIT_BREAKER_WINDOW_MS,
    maxConsecutiveRecoveries: MAX_CONSECUTIVE_RECOVERIES,
    services: MONITORED_SERVICES.map(s => {
      const breaker = getOrCreateBreaker(s.port);
      return {
        name: s.name,
        port: s.port,
        projectName: s.projectName,
        circuitBreakerState: breaker.state,
        attemptsInWindow: breaker.attempts,
        lastHealth: breaker.lastHealth,
        lastRecoveryAt: breaker.lastRecoveryAt
      };
    })
  };
}
