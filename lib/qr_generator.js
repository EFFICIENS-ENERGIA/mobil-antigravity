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
      width: 400,
      margin: 2,
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
