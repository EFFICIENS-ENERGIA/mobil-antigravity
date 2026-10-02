// lib/remote_tunnel.js - Passerelle d'Accès Distant 4G/5G Sécurisée (Cloudflare High-Speed & Localtunnel Fallback)
import localtunnel from 'localtunnel';
import { EventEmitter } from 'node:events';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CLOUDFLARED_BIN = path.join(__dirname, '..', 'bin', 'cloudflared.exe');

export const tunnelEmitter = new EventEmitter();

let activeTunnel = null;
let tunnelChild = null;
let tunnelType = null; // 'cloudflare' | 'localtunnel'
let currentTunnelUrl = null;
let isStarting = false;
let retryTimer = null;

/**
 * Lance le tunnel Cloudflare Quick Tunnel (Zero-config, zéro mot de passe/IP, vitesse maximale)
 * @param {number} port
 * @returns {Promise<string>}
 */
function startCloudflareTunnel(port) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const timeout = setTimeout(() => {
      if (!settled) {
        settled = true;
        reject(new Error('Cloudflare Tunnel timeout après 30s'));
      }
    }, 30000);

    const cp = spawn(CLOUDFLARED_BIN, ['tunnel', '--url', `http://127.0.0.1:${port}`], {
      stdio: ['ignore', 'pipe', 'pipe']
    });

    tunnelChild = cp;

    let candidateUrl = null;
    let probing = false;

    async function probeCandidate(url) {
      if (probing || settled) return;
      probing = true;
      for (let i = 1; i <= 15; i++) {
        if (settled) break;
        try {
          const res = await fetch(`${url}/`, {
            headers: { 'User-Agent': 'Antigravity-Probe/1.0' },
            signal: AbortSignal.timeout(2500)
          });
          if (res.status === 200 && !settled) {
            settled = true;
            clearTimeout(timeout);
            console.log(`[TUNNEL 4G/5G] ✅ Cloudflare Edge certifié joignable mondialement (HTTP 200 OK) : ${url}`);
            resolve(url);
            return;
          }
        } catch {}
        await new Promise(r => setTimeout(r, 1200));
      }
      probing = false;
    }

    const onData = (chunk) => {
      const text = chunk.toString();
      const match = text.match(/https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com/);
      if (match && !candidateUrl) {
        candidateUrl = match[0];
        console.log(`[TUNNEL 4G/5G] Détection candidat Cloudflare : ${candidateUrl}. Vérification de propagation réseau...`);
        probeCandidate(candidateUrl);
      }
    };

    cp.stdout.on('data', onData);
    cp.stderr.on('data', onData);

    cp.on('exit', (code) => {
      tunnelChild = null;
      currentTunnelUrl = null;
      if (!settled) {
        settled = true;
        clearTimeout(timeout);
        reject(new Error(`Cloudflare process exited with code ${code}`));
      } else {
        console.warn(`[TUNNEL 4G/5G] Processus Cloudflare interrompu (${code}). Reconnexion...`);
        clearTimeout(retryTimer);
        retryTimer = setTimeout(() => {
          startRemoteTunnel(port).catch(() => {});
        }, 3000);
      }
    });

    cp.on('error', (err) => {
      tunnelChild = null;
      if (!settled) {
        settled = true;
        clearTimeout(timeout);
        reject(err);
      }
    });
  });
}

/**
 * Démarre le tunnel sécurisé pour accès distant 4G/5G avec résilience et auto-reconnexion
 * @param {number} port 
 * @returns {Promise<string>} L'URL HTTPS publique
 */
export async function startRemoteTunnel(port = 3000) {
  if (currentTunnelUrl && (activeTunnel || tunnelChild)) {
    return currentTunnelUrl;
  }
  if (isStarting) {
    return new Promise(resolve => tunnelEmitter.once('ready', resolve));
  }

  isStarting = true;

  // 1. Essai prioritaire : Cloudflare Quick Tunnel (Haute vitesse, 0 saisie d'IP, 0 timeout 408)
  if (fs.existsSync(CLOUDFLARED_BIN)) {
    console.log('[TUNNEL 4G/5G] Démarrage de la passerelle Cloudflare Edge sécurisée...');
    try {
      const url = await startCloudflareTunnel(port);
      if (url) {
        currentTunnelUrl = url;
        tunnelType = 'cloudflare';
        isStarting = false;
        console.log(`[TUNNEL 4G/5G] 🌍 URL Publique Cloudflare active (0 configuration) : ${currentTunnelUrl}`);
        tunnelEmitter.emit('ready', currentTunnelUrl);
        return currentTunnelUrl;
      }
    } catch (cfErr) {
      console.warn('[TUNNEL 4G/5G] Erreur Cloudflare, repli sur passerelle alternative:', cfErr.message);
    }
  }

  // 2. Repli : Passerelle native Localtunnel
  console.log('[TUNNEL 4G/5G] Initialisation passerelle alternative (Localtunnel)...');
  const sub = process.env.TUNNEL_SUBDOMAIN || 'agy-seb-pilot';

  try {
    const tunnel = await localtunnel({ port, subdomain: sub });
    activeTunnel = tunnel;
    tunnelType = 'localtunnel';
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

    try {
      const tunnel = await localtunnel({ port });
      activeTunnel = tunnel;
      tunnelType = 'localtunnel';
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
  if (tunnelChild) {
    try { tunnelChild.kill(); } catch {}
    tunnelChild = null;
  }
  if (activeTunnel) {
    try { activeTunnel.close(); } catch {}
    activeTunnel = null;
  }
  currentTunnelUrl = null;
  tunnelType = null;
}

export function getRemoteTunnelUrl() {
  return currentTunnelUrl;
}

export function getTunnelType() {
  return tunnelType;
}

let cachedPublicIp = null;

/**
 * Récupère l'adresse IP publique de la machine hôte pour déverrouiller Localtunnel si actif
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
  return !!currentTunnelUrl && (!!activeTunnel || !!tunnelChild);
}
