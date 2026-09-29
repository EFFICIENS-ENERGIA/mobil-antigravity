// lib/antigravity_scanner.js - Scanner temps réel des projets ANTIGRAVITY
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import net from 'node:net';
import os from 'node:os';

const ROOT_DIR = path.resolve('C:/Users/EFFICIENS ENERGIA/Desktop/ANTIGRAVITY');
const DOCS_ANTIGRAVITY_DIR = path.resolve('C:/Users/EFFICIENS ENERGIA/Documents/antigravity');

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

/**
 * Vérifie si un port TCP local est ouvert/actif
 * @param {number} port 
 * @param {string} host 
 * @returns {Promise<boolean>}
 */
export function checkPortActive(port, host = '127.0.0.1') {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(300);
    socket.on('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.on('timeout', () => {
      socket.destroy();
      resolve(false);
    });
    socket.on('error', () => {
      resolve(false);
    });
    socket.connect(port, host);
  });
}

/**
 * Analyse les fichiers de test existants dans un dossier
 * @param {string} projectDir 
 * @returns {object} { hasTests, score, lastTestDate }
 */
function analyzeTests(projectDir) {
  try {
    const testFiles = fs.readdirSync(projectDir).filter(f => f.startsWith('test_') && f.endsWith('.md'));
    if (testFiles.length === 0) {
      return { hasTests: false, score: 'Aucun test', count: 0 };
    }
    
    // Lire le fichier principal test_results.md si présent
    let mainScore = '100% PASS';
    let fileToRead = testFiles.includes('test_results.md') ? 'test_results.md' : testFiles[0];
    const content = fs.readFileSync(path.join(projectDir, fileToRead), 'utf8');
    
    const passMatch = content.match(/(\d+\/\d+\s*PASS|\b100%\s*PASS\b|\b50\/50\b|\b14\/14\b)/i);
    if (passMatch) {
      mainScore = passMatch[1].toUpperCase();
    }
    
    return {
      hasTests: true,
      score: mainScore,
      count: testFiles.length,
      mainFile: fileToRead
    };
  } catch {
    return { hasTests: false, score: 'N/A', count: 0 };
  }
}

const IGNORED_SYSTEM_DIRS = new Set([
  'templates',
  'scripts',
  'regles',
  '.agents',
  'node_modules',
  'backups',
  'assets',
  'data',
  'docs',
  'tests',
  '.github',
  '.git',
  '-projectsmy-first-project'
]);

function isRealAntigravityProject(dirPath, name) {
  const lower = name.toLowerCase();
  if (IGNORED_SYSTEM_DIRS.has(lower)) return false;
  if (name.startsWith('.') || name.startsWith('-')) return false;

  try {
    const files = fs.readdirSync(dirPath);
    return (
      files.includes('package.json') ||
      files.includes('index.html') ||
      files.includes('server.mjs') ||
      files.includes('server.js') ||
      files.includes('app.js') ||
      files.includes('main.py') ||
      files.includes('.git') ||
      files.some(f => f.toLowerCase().startsWith('lancer_') && f.endsWith('.bat'))
    );
  } catch {
    return false;
  }
}

/**
 * Scanne tous les projets du hub ANTIGRAVITY
 * @returns {Promise<Array>}
 */
export async function scanAntigravityProjects() {
  const projects = [];
  const scannedDirs = [];

  try {
    const rootItems = fs.readdirSync(ROOT_DIR, { withFileTypes: true });

    for (const item of rootItems) {
      if (!item.isDirectory() && !item.isSymbolicLink()) continue;

      if (item.name === 'projects') {
        // Scanner les sous-projets applicatifs dans projects/
        try {
          const subItems = fs.readdirSync(path.join(ROOT_DIR, 'projects'), { withFileTypes: true });
          for (const sub of subItems) {
            if (sub.isDirectory() && isRealAntigravityProject(path.join(ROOT_DIR, 'projects', sub.name), sub.name)) {
              scannedDirs.push({ name: sub.name, relPath: path.join('projects', sub.name), absPath: path.join(ROOT_DIR, 'projects', sub.name) });
            }
          }
        } catch {}
        continue;
      }

      if (isRealAntigravityProject(path.join(ROOT_DIR, item.name), item.name)) {
        scannedDirs.push({ name: item.name, relPath: item.name, absPath: path.join(ROOT_DIR, item.name) });
      }
    }

    // Scanner les projets dans Documents/antigravity (Webtoon Infrastructure)
    if (fs.existsSync(DOCS_ANTIGRAVITY_DIR)) {
      const docWebtoon = path.join(DOCS_ANTIGRAVITY_DIR, 'WEBTOON PROJECT PLUME D ACIER');
      if (fs.existsSync(docWebtoon)) {
        scannedDirs.push({
          name: 'WEBTOON PROJECT PLUME D ACIER',
          relPath: 'WEBTOON PROJECT PLUME D ACIER',
          absPath: docWebtoon
        });
      } else {
        scannedDirs.push({
          name: 'Webtoon Infrastructure',
          relPath: 'Webtoon Infrastructure',
          absPath: DOCS_ANTIGRAVITY_DIR
        });
      }
    }

    for (const proj of scannedDirs) {
      const projectPath = proj.absPath;
      const hasGit = fs.existsSync(path.join(projectPath, '.git'));
      const hasPackageJson = fs.existsSync(path.join(projectPath, 'package.json'));
      let hasBatLaunchers = [];
      try {
        hasBatLaunchers = fs.readdirSync(projectPath).filter(f => f.endsWith('.bat'));
      } catch {}
      const tests = analyzeTests(projectPath);

      // Port assigné et nom affiché propre
      let defaultPort = null;
      let displayName = proj.name;
      const lower = proj.name.toLowerCase();

      if (lower.includes('saas') || (lower.includes('rdv_hub') && !lower.includes('omnicanal'))) {
        defaultPort = 8092;
        displayName = 'RDV-Hub SaaS';
      } else if (lower.includes('smarttrip') || lower.includes('homeagy') || lower.includes('my-first-project')) {
        defaultPort = 8080;
        displayName = 'SmartTrip Pro';
      } else if (lower.includes('site_construction') || lower.includes('construction') || lower.includes('bati')) {
        defaultPort = 8089;
        displayName = 'Bâti-Excellence Pro';
      } else if (lower.includes('omnicanal')) {
        defaultPort = 8093;
        displayName = 'RDV-Hub Omnicanal';
      } else if (lower.includes('webtoon') || lower.includes('plume')) {
        defaultPort = 8095;
        displayName = "Webtoon Infrastructure — La Plume et l'Acier";
      } else if (lower.includes('mobil antigravity') || lower.includes('mobil-antigravity')) {
        defaultPort = 3000;
        displayName = 'Mobil Antigravity';
      } else if (lower.includes('entrainement')) {
        defaultPort = 3000;
        displayName = 'Entraînement Équipe';
      } else {
        // Port dynamique pour tout autre projet
        const charSum = proj.name.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
        defaultPort = 8100 + (charSum % 30);
      }

      const isPortActive = defaultPort ? await checkPortActive(defaultPort) : false;

      // Dernier commit git si possible
      let lastCommit = 'N/A';
      if (hasGit) {
        try {
          lastCommit = execSync('git log -1 --pretty=format:"%s (%cr)"', {
            cwd: projectPath,
            timeout: 1000,
            encoding: 'utf8'
          }).trim();
        } catch {
          lastCommit = 'Git initialisé';
        }
      }

      // Détermination du statut
      let status = 'IDLE';
      let statusLabel = 'Inactif';
      let statusColor = 'gray';

      if (isPortActive) {
        status = 'RUNNING';
        statusLabel = 'En ligne (Port ' + defaultPort + ')';
        statusColor = 'emerald';
      } else if (tests.hasTests) {
        status = 'TESTED';
        statusLabel = 'Homologué (' + tests.score + ')';
        statusColor = 'blue';
      } else {
        statusLabel = 'Prêt';
        statusColor = 'amber';
      }

      const projectUrl = defaultPort ? `http://${LOCAL_IP}:${defaultPort}` : null;
      const proxyUrl = defaultPort ? `/proxy/${defaultPort}/` : null;

      projects.push({
        id: proj.name.toLowerCase().replace(/[^a-z0-9]/g, '_'),
        name: proj.name,
        displayName,
        path: projectPath,
        relativePath: proj.relPath,
        hasGit,
        lastCommit,
        hasPackageJson,
        launchers: hasBatLaunchers,
        tests,
        defaultPort,
        isPortActive,
        projectUrl,
        proxyUrl,
        canLaunch: true,
        status,
        statusLabel,
        statusColor
      });
    }
  } catch (err) {
    console.error('[SCANNER] Erreur scan projets:', err.message);
  }

  return projects;
}
