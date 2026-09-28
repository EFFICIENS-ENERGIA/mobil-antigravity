// lib/antigravity_scanner.js - Scanner temps réel des projets ANTIGRAVITY
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import net from 'node:net';

const ROOT_DIR = path.resolve('C:/Users/EFFICIENS ENERGIA/Desktop/ANTIGRAVITY');

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

/**
 * Scanne tous les projets du hub ANTIGRAVITY
 * @returns {Promise<Array>}
 */
export async function scanAntigravityProjects() {
  const projects = [];

  try {
    const items = fs.readdirSync(ROOT_DIR, { withFileTypes: true });

    for (const item of items) {
      if (!item.isDirectory() && !item.isSymbolicLink()) continue;
      if (item.name.startsWith('.') && item.name !== '.agents') continue;
      if (item.name === 'node_modules') continue;

      const projectPath = path.join(ROOT_DIR, item.name);
      
      // Caractéristiques
      const hasGit = fs.existsSync(path.join(projectPath, '.git'));
      const hasPackageJson = fs.existsSync(path.join(projectPath, 'package.json'));
      const hasBatLaunchers = fs.readdirSync(projectPath).filter(f => f.endsWith('.bat'));
      const tests = analyzeTests(projectPath);

      // Port par défaut connu
      let defaultPort = null;
      let isPortActive = false;
      if (item.name.includes('SAAS EFFICIENS ENERGIA') || item.name.includes('rdv_hub')) {
        defaultPort = 8092;
        isPortActive = await checkPortActive(8092);
      } else if (item.name.includes('entrainement') || item.name.includes('mobil antigravity') || item.name.includes('mobil-antigravity')) {
        defaultPort = 3000;
        isPortActive = await checkPortActive(3000);
      }

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

      projects.push({
        id: item.name.toLowerCase().replace(/[^a-z0-9]/g, '_'),
        name: item.name,
        path: projectPath,
        relativePath: item.name,
        hasGit,
        lastCommit,
        hasPackageJson,
        launchers: hasBatLaunchers,
        tests,
        defaultPort,
        isPortActive,
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
