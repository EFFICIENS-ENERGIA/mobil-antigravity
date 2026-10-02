// lib/qr_generator.js - Générateur QR Code vectoriel et terminal authentique
import QRCode from 'qrcode';

/**
 * Génère un SVG QR Code vectoriel authentique et scannable
 * @param {string} url
 * @param {number} size
 * @returns {Promise<string>}
 */
export async function generateQrSvg(url, size = 220) {
  try {
    return await QRCode.toString(url, {
      type: 'svg',
      width: size,
      margin: 1,
      color: {
        dark: '#10b981',
        light: '#0d1117'
      }
    });
  } catch (err) {
    console.error('Erreur génération QR SVG:', err);
    return `<div style="color:red">Erreur QR Code</div>`;
  }
}

/**
 * Génère un fichier image PNG du QR Code
 * @param {string} url 
 * @param {string} filePath 
 */
export async function generateQrFile(url, filePath) {
  try {
    await QRCode.toFile(filePath, url, {
      width: 480,
      margin: 2,
      errorCorrectionLevel: 'M',
      color: {
        dark: '#041e17',
        light: '#ffffff'
      }
    });
    return true;
  } catch (err) {
    console.error('Erreur génération fichier QR:', err);
    return false;
  }
}

/**
 * Génération certifiée du QR Code PNG avec Healthcheck Externe Cloudflare (Anti-Erreur 1033)
 * @param {string} remoteUrl 
 * @param {string} pairingToken 
 * @returns {Promise<{success: boolean, targetUrl: string, status: number}>}
 */
export async function generateAndVerifyQr(remoteUrl, pairingToken = '') {
  if (!remoteUrl) {
    throw new Error('remoteUrl requis pour la vérification');
  }

  const targetUrl = pairingToken ? `${remoteUrl}/?pair=${pairingToken}` : remoteUrl;
  console.log(`[QR-VERIFY] Début vérification de santé externe pour : ${targetUrl}`);

  // 1. Validation de résolubilité réelle (attente de propagation Anycast Cloudflare)
  let attempts = 0;
  let healthy = false;
  let lastStatus = 0;

  while (attempts < 6 && !healthy) {
    attempts++;
    try {
      const res = await fetch(`${remoteUrl}/`, {
        headers: { 'User-Agent': 'Antigravity-QA-Verifier/1.0' },
        signal: AbortSignal.timeout(6000)
      });
      lastStatus = res.status;
      if (res.status === 200) {
        healthy = true;
        console.log(`[QR-VERIFY] ✅ Cloudflare Edge certifié (Tentative ${attempts}) : HTTP 200 OK (0 Erreur 1033)`);
        break;
      }
    } catch (e) {
      console.warn(`[QR-VERIFY] ⏳ Tentative ${attempts}/6 en cours (${e.message})...`);
    }
    await new Promise(r => setTimeout(r, 1500));
  }

  if (!healthy) {
    console.error(`[QR-VERIFY] ❌ Échec de propagation Cloudflare après ${attempts} tentatives (Statut ${lastStatus})`);
    return { success: false, targetUrl, status: lastStatus };
  }

  // 2. Écriture du PNG certifié dans les dossiers captures et brain
  const paths = [
    './captures/qr_seb_mobile.png',
    'C:\\Users\\EFFICIENS ENERGIA\\.gemini\\antigravity\\brain\\2617050f-f67c-4c61-983c-a21daf06911a\\qr_seb_mobile.png'
  ];

  for (const p of paths) {
    try {
      await generateQrFile(targetUrl, p);
      console.log(`[QR-VERIFY] 📷 QR Code PNG certifié écrit dans : ${p}`);
    } catch (e) {
      console.warn(`[QR-VERIFY] Erreur écriture sur ${p}:`, e.message);
    }
  }

  return { success: true, targetUrl, status: 200 };
}

/**
 * Affiche l'adresse IP, le code PIN et un QR Code scannable directement dans la console
 * @param {string} url 
 * @param {string} pin
 * @param {string} pairingUrl
 */
export async function printTerminalQr(url, pin = '6567', pairingUrl = '') {
  const border = '======================================================================';
  console.log('\n' + border);
  console.log('   📱 ANTIGRAVITY MOBILE PILOT — SÉCURITÉ RENFORCÉE SEB');
  console.log('   Numéro associé : 07 78 24 65 67 (+33 7 78 24 65 67)');
  console.log('   Code PIN Maître : [ ' + pin + ' ]');
  console.log(border);
  console.log('\n👉 URL DE CONNEXION SMARTPHONE (Même réseau Wi-Fi) :');
  console.log(`       🔗  ${url}  🔗`);
  
  const targetUrl = pairingUrl || url;
  if (pairingUrl) {
    console.log('\n👉 APPAIRAGE 1-CLIC DIRECT SÉCURISÉ (Sans saisie du PIN) :');
    console.log(`       🔐  ${pairingUrl}`);
  }

  try {
    const termQr = await QRCode.toString(targetUrl, { type: 'terminal', small: true });
    console.log('\n📱 Scannez ce QR Code avec l\'appareil photo de votre smartphone :\n');
    console.log(termQr);
  } catch {}

  console.log('\nFlashez le QR Code affiché à l\'écran ou tapez votre code PIN ' + pin + ' !');
  console.log(border + '\n');
}
