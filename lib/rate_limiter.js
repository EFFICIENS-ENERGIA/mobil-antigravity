// lib/rate_limiter.js - Protection Anti-Brute-Force & Limitation de Débit (OWASP A07:2021)

const limits = {
  login: { maxAttempts: 5, windowMs: 60 * 1000, lockoutMs: 5 * 60 * 1000 },
  api: { maxAttempts: 120, windowMs: 60 * 1000, lockoutMs: 60 * 1000 },
  action: { maxAttempts: 25, windowMs: 60 * 1000, lockoutMs: 60 * 1000 }
};

// Structures en mémoire : ip -> { count, firstAttempt, lockedUntil }
const buckets = new Map();

/**
 * Nettoyage périodique des entrées expirées
 */
setInterval(() => {
  const now = Date.now();
  for (const [key, record] of buckets.entries()) {
    if (record.lockedUntil && record.lockedUntil > now) continue;
    if (now - record.firstAttempt > 10 * 60 * 1000) {
      buckets.delete(key);
    }
  }
}, 60 * 1000);

/**
 * Vérifie et applique la limitation de débit pour une IP et une catégorie
 * @param {string} ip 
 * @param {'login'|'api'|'action'} category 
 * @returns {{ allowed: boolean, remaining: number, retryAfter: number }}
 */
export function checkRateLimit(ip = 'unknown', category = 'api') {
  const now = Date.now();
  const config = limits[category] || limits.api;
  const key = `${category}:${ip}`;

  let record = buckets.get(key);

  if (!record) {
    record = { count: 1, firstAttempt: now, lockedUntil: 0 };
    buckets.set(key, record);
    return { allowed: true, remaining: config.maxAttempts - 1, retryAfter: 0 };
  }

  // Vérifier si actuellement bloqué
  if (record.lockedUntil && record.lockedUntil > now) {
    const retryAfter = Math.ceil((record.lockedUntil - now) / 1000);
    return { allowed: false, remaining: 0, retryAfter };
  }

  // Si la fenêtre de temps est dépassée, réinitialiser
  if (now - record.firstAttempt > config.windowMs) {
    record.count = 1;
    record.firstAttempt = now;
    record.lockedUntil = 0;
    return { allowed: true, remaining: config.maxAttempts - 1, retryAfter: 0 };
  }

  // Incrémenter le compteur
  record.count++;

  if (record.count > config.maxAttempts) {
    record.lockedUntil = now + config.lockoutMs;
    const retryAfter = Math.ceil(config.lockoutMs / 1000);
    return { allowed: false, remaining: 0, retryAfter };
  }

  return { 
    allowed: true, 
    remaining: config.maxAttempts - record.count, 
    retryAfter: 0 
  };
}

/**
 * Réinitialise le compteur d'une IP après un succès (ex: login réussi)
 * @param {string} ip 
 * @param {string} category 
 */
export function resetRateLimit(ip = 'unknown', category = 'login') {
  const key = `${category}:${ip}`;
  buckets.delete(key);
}
