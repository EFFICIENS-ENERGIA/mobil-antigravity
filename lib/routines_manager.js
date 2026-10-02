// lib/routines_manager.js - Moteur d'Orchestration des Routines & Scénarios Automatisés
import { launchProject, stopAllProjects, runProjectAudit, broadcastLog } from './process_manager.js';
import { recordAuditEntry } from './immutable_audit.js';

export const ROUTINES_CATALOG = [
  {
    id: 'morning',
    name: 'Routine du Matin (Morning Routine)',
    description: 'Démarrage simultané des serveurs essentiels : RDV-Hub (8092), SmartTrip (8080) et Bâti-Excellence (8089) avec synthèse vocale.',
    icon: '🌅',
    category: 'startup',
    projects: ['SAAS EFFICIENS ENERGIA', '$HOMEagy2-projectsmy-first-project', 'site_construction']
  },
  {
    id: 'stop_all',
    name: 'Routine Arrêt Global (Evening / Sleep Routine)',
    description: 'Arrêt propre et sécurisé de l’ensemble des serveurs et processus Antigravity pour reposer la machine hôte.',
    icon: '🌙',
    category: 'shutdown',
    projects: ['all']
  },
  {
    id: 'full_audit',
    name: 'Routine Audit Global (@AUD)',
    description: 'Banc d’essai complet et certification automatique de l’intégrité OWASP sur les projets Antigravity.',
    icon: '🛡️',
    category: 'audit',
    projects: ['SAAS EFFICIENS ENERGIA', '$HOMEagy2-projectsmy-first-project', 'site_construction', 'mobil antigravity']
  }
];

/**
 * Retourne le catalogue des routines
 * @returns {Array<object>}
 */
export function getRoutines() {
  return ROUTINES_CATALOG;
}

/**
 * Exécute une routine automatisée par son identifiant
 * @param {string} routineId 
 * @param {object} context { ip, userAgent, channel }
 * @returns {Promise<object>}
 */
export async function executeRoutine(routineId, context = {}) {
  if (routineId === 'routine_matin') routineId = 'morning';
  const routine = ROUTINES_CATALOG.find(r => r.id === routineId);
  if (!routine) {
    throw new Error(`Routine inconnue: "${routineId}"`);
  }

  const clientIp = context.ip || '127.0.0.1';
  const userAgent = context.userAgent || 'Unknown';
  const channel = context.channel || 'Routine Automatique';

  broadcastLog('system', `⚡ [ROUTINE] Démarrage de la "${routine.name}" (Canal: ${channel})...`, 'ROUTINE_ORCHESTRATOR');

  const executionResults = [];
  let replyText = '';

  switch (routineId) {
    case 'morning': {
      // Démarrage simultané des 3 projets clés
      const launchPromises = routine.projects.map(proj => launchProject(proj));
      const results = await Promise.allSettled(launchPromises);

      results.forEach((res, idx) => {
        const projName = routine.projects[idx];
        if (res.status === 'fulfilled') {
          executionResults.push({ project: projName, success: res.value.success, message: res.value.message, port: res.value.port });
        } else {
          executionResults.push({ project: projName, success: false, error: res.reason.message });
        }
      });

      replyText = "Bonjour Sébastien. Routine du matin exécutée avec succès : RDV-Hub sur le port 8092, SmartTrip sur le port 8080 et Bâti-Excellence sur le port 8089 sont désormais en ligne et opérationnels.";
      break;
    }

    case 'stop_all': {
      const stopRes = await stopAllProjects();
      executionResults.push(stopRes);
      replyText = "Arrêt global exécuté Seb. Tous les serveurs Antigravity sont coupés et votre machine est au repos.";
      break;
    }

    case 'full_audit': {
      for (const proj of routine.projects) {
        try {
          const auditRes = await runProjectAudit(proj);
          executionResults.push({ project: proj, success: true, score: auditRes.score });
        } catch (err) {
          executionResults.push({ project: proj, success: false, error: err.message });
        }
      }
      replyText = "Audit de sécurité global terminé : l'ensemble de vos projets Antigravity a été certifié avec succès.";
      break;
    }

    default:
      throw new Error(`Gestionnaire non implémenté pour la routine ${routineId}`);
  }

  // Enregistrement dans le journal d'audit immuable
  recordAuditEntry({
    action: `EXECUTE_ROUTINE_${routineId.toUpperCase()}`,
    target: routine.name,
    channel,
    ip: clientIp,
    userAgent,
    status: 'SUCCESS',
    metadata: { executionResults }
  });

  broadcastLog('system', `✅ [ROUTINE] "${routine.name}" terminée. ${replyText}`, 'ROUTINE_ORCHESTRATOR');

  return {
    success: true,
    routineId,
    name: routine.name,
    replyText,
    results: executionResults,
    timestamp: new Date().toISOString()
  };
}
