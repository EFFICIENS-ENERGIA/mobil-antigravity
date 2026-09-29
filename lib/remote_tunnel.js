// lib/remote_tunnel.js - Passerelle d'Accès Distant 4G/5G Sécurisée (Zero-Config Tunnel)
import localtunnel from 'localtunnel';
import { EventEmitter } from 'node:events';
import crypto from 'node:crypto';

export const tunnelEmitter = new EventEmitter();

let activeTunnel = null;
let currentTunnelUrl = null;
let isStarting = false;
let retryTimer = null;

/**
 * Démarre le tunnel sécurisé pour accès distant 4G/5G avec résilience et auto-reconnexion
 * @param {number} port 
 * @returns {Promise<string>} L'URL HTTPS publique
 */
export async function startRemoteTunnel(port = 3000) {
  if (currentTunnelUrl && activeTunnel) {
    return currentTunnelUrl;
  }
  if (isStarting) {
    return new Promise(resolve => tunnelEmitter.once('ready', resolve));
  }

  isStarting = true;
  console.log('[TUNNEL 4G/5G] Initialisation native de la passerelle...');

  // Sous-domaine permanent et stable pour Seb
  const sub = process.env.TUNNEL_SUBDOMAIN || 'agy-seb-pilot';

  try {
    const tunnel = await localtunnel({ port, subdomain: sub });
    activeTunnel = tunnel;
    currentTunnelUrl = tunnel.url;
    isStarting = false;

    console.log(`[TUNNEL 4G/5G] 🌍 URL Publique HTTPS active : ${currentTunnelUrl}`);
    tunnelEmitter.emit('ready', currentTunnelUrl);

    tunnel.on('close', () => {
      console.warn('[TUNNEL 4G/5G] Tunnel fermé. Reconnexion automatique programmée...');
      activeTunnel = null;
      currentTunnelUrl = null;
      isStarting = false;
      tunnelEmitter.emit('closed');

      clearTimeout(retryTimer);
      retryTimer = setTimeout(() => {
        startRemoteTunnel(port).catch(() => {});
      }, 3000);
    });

    tunnel.on('error', (err) => {
      console.warn('[TUNNEL 4G/5G] Avertissement socket:', err.message);
    });

    return currentTunnelUrl;
  } catch (err) {
    isStarting = false;
    console.warn('[TUNNEL 4G/5G] Tentative de connexion avec fallback:', err.message);

    // Tentative de connexion sans sous-domaine fixe si collision
    try {
      const tunnel = await localtunnel({ port });
      activeTunnel = tunnel;
      currentTunnelUrl = tunnel.url;
      console.log(`[TUNNEL 4G/5G] 🌍 URL Publique HTTPS active (alt) : ${currentTunnelUrl}`);
      tunnelEmitter.emit('ready', currentTunnelUrl);
      return currentTunnelUrl;
    } catch (e2) {
      clearTimeout(retryTimer);
      retryTimer = setTimeout(() => {
        startRemoteTunnel(port).catch(() => {});
      }, 5000);
      throw e2;
    }
  }
}

/**
 * Arrête le tunnel
 */
export function stopRemoteTunnel() {
  clearTimeout(retryTimer);
  if (activeTunnel) {
    try { activeTunnel.close(); } catch {}
    activeTunnel = null;
    currentTunnelUrl = null;
  }
}

export function getRemoteTunnelUrl() {
  return currentTunnelUrl;
}

let cachedPublicIp = null;

/**
 * Récupère l'adresse IP publique de la machine hôte pour déverrouiller Localtunnel
 * @returns {Promise<string>}
 */
export async function getPublicIp() {
  if (cachedPublicIp) return cachedPublicIp;
  try {
    const res = await fetch('https://loca.lt/mytunnelpassword');
    const ip = await res.text();
    if (ip && ip.trim()) {
      cachedPublicIp = ip.trim();
      return cachedPublicIp;
    }
  } catch {}

  try {
    const res = await fetch('https://api.ipify.org');
    const ip = await res.text();
    if (ip && ip.trim()) {
      cachedPublicIp = ip.trim();
      return cachedPublicIp;
    }
  } catch {}

  return '78.243.98.219';
}

export function isRemoteTunnelActive() {
  return !!currentTunnelUrl && !!activeTunnel;
}
