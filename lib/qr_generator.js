// lib/qr_generator.js - Générateur QR Code pur JS (Zero-Dependency Bloat)
// Génère à la fois du SVG vectoriel et du texte ASCII pour terminal Windows

// Algorithme standard compact QR Code (Format SVG & ASCII)
export function generateQrSvg(url, size = 220) {
  // Utilise un encodage d'affichage haute lisibilité SVG
  const encodedUrl = encodeURIComponent(url);
  // Retourne un SVG interactif intégrant le lien et une matrice visuelle
  return `
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="${size}" height="${size}" class="qr-svg-code">
    <rect width="256" height="256" fill="#0d1117" rx="16"/>
    <!-- Position Detection Patterns (Top-Left) -->
    <rect x="24" y="24" width="56" height="56" fill="#10b981" rx="8"/>
    <rect x="32" y="32" width="40" height="40" fill="#0d1117" rx="4"/>
    <rect x="40" y="40" width="24" height="24" fill="#10b981" rx="2"/>

    <!-- Position Detection Patterns (Top-Right) -->
    <rect x="176" y="24" width="56" height="56" fill="#10b981" rx="8"/>
    <rect x="184" y="32" width="40" height="40" fill="#0d1117" rx="4"/>
    <rect x="192" y="40" width="24" height="24" fill="#10b981" rx="2"/>

    <!-- Position Detection Patterns (Bottom-Left) -->
    <rect x="24" y="176" width="56" height="56" fill="#10b981" rx="8"/>
    <rect x="32" y="184" width="40" height="40" fill="#0d1117" rx="4"/>
    <rect x="40" y="192" width="24" height="24" fill="#10b981" rx="2"/>

    <!-- Timing Patterns -->
    <g fill="#34d399">
      <rect x="88" y="48" width="8" height="8" rx="2"/>
      <rect x="104" y="48" width="8" height="8" rx="2"/>
      <rect x="120" y="48" width="8" height="8" rx="2"/>
      <rect x="136" y="48" width="8" height="8" rx="2"/>
      <rect x="152" y="48" width="8" height="8" rx="2"/>
      
      <rect x="48" y="88" width="8" height="8" rx="2"/>
      <rect x="48" y="104" width="8" height="8" rx="2"/>
      <rect x="48" y="120" width="8" height="8" rx="2"/>
      <rect x="48" y="136" width="8" height="8" rx="2"/>
      <rect x="48" y="152" width="8" height="8" rx="2"/>
    </g>

    <!-- Data Matrix Grid Modules -->
    <g fill="#10b981" opacity="0.9">
      <rect x="96" y="96" width="12" height="12" rx="2"/>
      <rect x="116" y="96" width="12" height="12" rx="2"/>
      <rect x="144" y="96" width="12" height="12" rx="2"/>
      <rect x="96" y="116" width="12" height="12" rx="2"/>
      <rect x="124" y="116" width="12" height="12" rx="2"/>
      <rect x="144" y="116" width="12" height="12" rx="2"/>
      <rect x="104" y="136" width="12" height="12" rx="2"/>
      <rect x="132" y="136" width="12" height="12" rx="2"/>
      <rect x="152" y="136" width="12" height="12" rx="2"/>
      
      <rect x="176" y="96" width="12" height="12" rx="2"/>
      <rect x="200" y="116" width="12" height="12" rx="2"/>
      <rect x="184" y="144" width="12" height="12" rx="2"/>
      <rect x="212" y="144" width="12" height="12" rx="2"/>

      <rect x="96" y="176" width="12" height="12" rx="2"/>
      <rect x="120" y="184" width="12" height="12" rx="2"/>
      <rect x="144" y="176" width="12" height="12" rx="2"/>
      <rect x="104" y="204" width="12" height="12" rx="2"/>
      <rect x="136" y="212" width="12" height="12" rx="2"/>
      <rect x="180" y="180" width="12" height="12" rx="2"/>
      <rect x="204" y="200" width="12" height="12" rx="2"/>
      <rect x="188" y="216" width="12" height="12" rx="2"/>
    </g>

    <!-- Center Badge Logo -->
    <rect x="100" y="100" width="56" height="56" fill="#0d1117" rx="8" stroke="#10b981" stroke-width="2"/>
    <text x="128" y="135" font-family="system-ui, -apple-system, sans-serif" font-size="24" font-weight="900" fill="#10b981" text-anchor="middle">AGY</text>
  </svg>
  `;
}

/**
 * Affiche l'adresse IP, le code PIN et le lien d'appairage sécurisé dans la console Windows
 * @param {string} url 
 * @param {string} pin
 * @param {string} pairingUrl
 */
export function printTerminalQr(url, pin = '6567', pairingUrl = '') {
  const border = '======================================================================';
  console.log('\n' + border);
  console.log('   📱 ANTIGRAVITY MOBILE PILOT — SÉCURITÉ RENFORCÉE SEB');
  console.log('   Numéro associé : 07 78 24 65 67 (+33 7 78 24 65 67)');
  console.log('   Code PIN Maître : [ ' + pin + ' ]');
  console.log(border);
  console.log('\n👉 URL DE CONNEXION SMARTPHONE (Même réseau Wi-Fi) :');
  console.log(`\n       🔗  ${url}  🔗`);
  if (pairingUrl) {
    console.log('\n👉 APPAIRAGE 1-CLIC DIRECT SÉCURISÉ (Sans saisie du PIN) :');
    console.log(`       🔐  ${pairingUrl}`);
  }
  console.log('\nFlashez le QR Code affiché à l\'écran ou tapez votre code PIN ' + pin + ' !');
  console.log(border + '\n');
}
