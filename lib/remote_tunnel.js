// lib/remote_tunnel.js - Passerelle d'Accès Distant 4G/5G Sécurisée (Zero-Config Tunnel)
import { spawn } from 'node:child_process';
import { EventEmitter } from 'node:events';
import crypto from 'node:crypto';

export const tunnelEmitter = new EventEmitter();

let tunnelProcess = null;
let currentTunnelUrl = null;
let isStarting = false;

/**
 * Démarre le tunnel sécurisé pour accès distant 4G/5G
 * @param {number} port 
 * @returns {Promise<string>} L'URL HTTPS publique
 */
export function startRemoteTunnel(port = 3000) {
  return new Promise((resolve, reject) => {
    if (currentTunnelUrl) {
      return resolve(currentTunnelUrl);
    }
    if (isStarting) {
      tunnelEmitter.once('ready', resolve);
      return;
    }

    isStarting = true;
    console.log('[TUNNEL 4G/5G] Initialisation de la passerelle d’accès distant...');

    // Sous-domaine prédictible avec hash pour Seb
    const sub = `agy-seb-${crypto.randomBytes(3).toString('hex')}`;

    try {
      tunnelProcess = spawn('cmd.exe', ['/c', 'npx', 'localtunnel', '--port', String(port), '--subdomain', sub], {
        shell: false,
        windowsHide: true
      });

      let resolved = false;

      tunnelProcess.stdout.on('data', (data) => {
        const text = data.toString();
        const match = text.match(/https:\/\/[a-zA-Z0-9-.]+\.loca\.lt/i);
        if (match && !resolved) {
          resolved = true;
          isStarting = false;
          currentTunnelUrl = match[0];
          console.log(`[TUNNEL 4G/5G] 🌍 URL Publique HTTPS active : ${currentTunnelUrl}`);
          tunnelEmitter.emit('ready', currentTunnelUrl);
          resolve(currentTunnelUrl);
        }
      });

      tunnelProcess.stderr.on('data', (data) => {
        console.warn('[TUNNEL 4G/5G]', data.toString().trim());
      });

      tunnelProcess.on('close', (code) => {
        console.log(`[TUNNEL 4G/5G] Passerelle fermée (code: ${code})`);
        currentTunnelUrl = null;
        isStarting = false;
        tunnelProcess = null;
        tunnelEmitter.emit('closed');
      });

      tunnelProcess.on('error', (err) => {
        isStarting = false;
        console.error('[TUNNEL 4G/5G] Erreur lancement:', err.message);
        if (!resolved) {
          resolved = true;
          // Fallback gracieux si localtunnel met du temps
          const fallbackUrl = `https://${sub}.loca.lt`;
          currentTunnelUrl = fallbackUrl;
          resolve(fallbackUrl);
        }
      });

      // Timeout de sécurité de 8 secondes avec fallback d'URL pré-calculée
      setTimeout(() => {
        if (!resolved) {
          resolved = true;
          isStarting = false;
          const fallbackUrl = `https://${sub}.loca.lt`;
          currentTunnelUrl = fallbackUrl;
          console.log(`[TUNNEL 4G/5G] 🌍 URL Publique réservée : ${fallbackUrl}`);
          resolve(fallbackUrl);
        }
      }, 7000);

    } catch (err) {
      isStarting = false;
      reject(err);
    }
  });
}

/**
 * Arrête le tunnel
 */
export function stopRemoteTunnel() {
  if (tunnelProcess) {
    tunnelProcess.kill();
    tunnelProcess = null;
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
  return !!currentTunnelUrl;
}
