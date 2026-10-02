// lib/session-network-policy.js - Contrôleur de Session Dynamique selon le Réseau (Wi-Fi vs 4G/5G)
import crypto from 'node:crypto';
import { isLocalNetwork, createSession, validateSession, getSessionDetails } from './auth_manager.js';
import { logSecurityEvent } from './security_audit_logger.js';
import { broadcastLog } from './process_manager.js';

export const NETWORK_MODES = {
  LOCAL_WIFI: 'LOCAL_WIFI',
  REMOTE_WAN: 'REMOTE_WAN_4G_5G'
};

export const SESSION_DURATIONS = {
  LOCAL_WIFI: 24 * 60 * 60 * 1000, // 24 heures (Wi-Fi local 192.168.1.76 / LAN)
  REMOTE_WAN: 1 * 60 * 60 * 1000    // 1 heure max (Accès distant 4G/5G WAN)
};

// Actions critiques exigeant un re-challenge biométrique WebAuthn sur connexion distante
const CRITICAL_ACTIONS = new Set([
  'kill_switch',
  'stop_all_projects',
  'execute_shell',
  'wipe_data',
  'revoke_all_sessions'
]);

/**
 * Analyse la requête entrante et qualifie le contexte réseau
 * @param {object} req 
 * @returns {{ mode: string, clientIp: string, isLocal: boolean, ttlMs: number }}
 */
export function evaluateNetworkContext(req) {
  let clientIp = req.socket?.remoteAddress || '127.0.0.1';
  const xForwardedFor = req.headers['x-forwarded-for'];
  const cfConnectingIp = req.headers['cf-connecting-ip'];

  // Si derrière Cloudflare Quick Tunnel ou Reverse Proxy
  if (cfConnectingIp) {
    clientIp = cfConnectingIp;
  } else if (xForwardedFor) {
    clientIp = xForwardedFor.split(',')[0].trim();
  }

  const isLocal = isLocalNetwork(clientIp);
  const mode = isLocal ? NETWORK_MODES.LOCAL_WIFI : NETWORK_MODES.REMOTE_WAN;
  const ttlMs = isLocal ? SESSION_DURATIONS.LOCAL_WIFI : SESSION_DURATIONS.REMOTE_WAN;

  return {
    mode,
    clientIp,
    isLocal,
    ttlMs
  };
}

/**
 * Middleware d'inspection et d'application de la politique de session réseau
 * @param {object} req 
 * @param {string} token 
 * @param {string} actionName 
 * @returns {{ allowed: boolean, statusCode?: number, error?: string, session?: object, requiresBiometric?: boolean }}
 */
export function enforceSessionNetworkPolicy(req, token, actionName = '') {
  const context = evaluateNetworkContext(req);

  if (!token) {
    return {
      allowed: false,
      statusCode: 401,
      error: 'Session non authentifiée. Jeton d\'accès requis.'
    };
  }

  const isValid = validateSession(token);
  if (!isValid) {
    logSecurityEvent('SESSION_EXPIRED_OR_INVALID', context.clientIp, 'BLOCKED', {
      networkMode: context.mode,
      action: actionName
    });
    return {
      allowed: false,
      statusCode: 401,
      error: `Session expirée sur le réseau ${context.mode}. Veuillez vous réauthentifier.`
    };
  }

  const session = getSessionDetails(token);

  // Vérification de re-challenge biométrique pour actions critiques sur réseau WAN
  if (!context.isLocal && CRITICAL_ACTIONS.has(actionName)) {
    const lastBio = session?.lastBiometricAuthTime || 0;
    const now = Date.now();
    const isRecentlyBiometric = (now - lastBio) < (5 * 60 * 1000);

    if (!isRecentlyBiometric) {
      logSecurityEvent('BIOMETRIC_REAUTH_REQUIRED', context.clientIp, 'CHALLENGE', {
        action: actionName,
        networkMode: context.mode
      });
      broadcastLog('system', `⚠️ Action critique "${actionName}" en 4G/5G : Re-challenge WebAuthn FaceID exigé.`, 'SECURITY_GUARD');

      return {
        allowed: false,
        statusCode: 403,
        requiresBiometric: true,
        error: 'Re-validation biométrique WebAuthn (TouchID/FaceID) requise pour exécuter cette action critique à distance.'
      };
    }
  }

  return {
    allowed: true,
    session,
    context
  };
}
