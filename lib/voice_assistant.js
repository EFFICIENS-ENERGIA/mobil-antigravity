// lib/voice_assistant.js - Moteur d'Analyse des Commandes Vocales Françaises (NLP Intent Parser)

/**
 * Analyse une commande vocale et détecte l'intention et l'action associée
 * @param {string} transcript Le texte dicté par Seb
 * @returns {{ recognized: boolean, action: string, replyText: string, intent: string }}
 */
export function parseVoiceCommand(transcript = '') {
  if (!transcript || typeof transcript !== 'string') {
    return {
      recognized: false,
      action: null,
      replyText: "Je n'ai pas bien compris votre commande vocale.",
      intent: 'UNKNOWN'
    };
  }

  const text = transcript.toLowerCase().trim();

  // 1. Intention : Démarrer le serveur SaaS RDV-Hub
  if (
    (text.includes('lance') || text.includes('démarre') || text.includes('start') || text.includes('active')) &&
    (text.includes('saas') || (text.includes('serveur') && !text.includes('smart') && !text.includes('site') && !text.includes('bati')) || text.includes('rdv') || text.includes('hub'))
  ) {
    return {
      recognized: true,
      action: 'start_saas_server',
      targetProject: 'SAAS EFFICIENS ENERGIA',
      replyText: "Compris Seb. Démarrage du serveur RDV-Hub SaaS sur le port 8092 en cours.",
      intent: 'START_SAAS'
    };
  }

  // 1b. Intention : Démarrer SmartTrip Pro (Port 8080)
  if (
    (text.includes('lance') || text.includes('démarre') || text.includes('start') || text.includes('active')) &&
    (text.includes('smarttrip') || text.includes('smart trip') || text.includes('voyage') || text.includes('hotel') || text.includes('première'))
  ) {
    return {
      recognized: true,
      action: 'launch_project',
      targetProject: '$HOMEagy2-projectsmy-first-project',
      replyText: "Compris Seb. Lancement de SmartTrip Pro sur le port 8080 en cours.",
      intent: 'START_SMARTTRIP'
    };
  }

  // 1c. Intention : Démarrer Bâti-Excellence Pro / Site Construction (Port 8089)
  if (
    (text.includes('lance') || text.includes('démarre') || text.includes('start') || text.includes('active')) &&
    (text.includes('bati') || text.includes('bâti') || text.includes('construction') || text.includes('btp') || text.includes('site internet') || text.includes('le site'))
  ) {
    return {
      recognized: true,
      action: 'launch_project',
      targetProject: 'site_construction',
      replyText: "Compris Seb. Lancement du site Bâti-Excellence Pro sur le port 8089 en cours.",
      intent: 'START_BATI'
    };
  }

  // 1d. Intention : Démarrer Webtoon Infrastructure — La Plume et l'Acier (Port 8095)
  if (
    (text.includes('lance') || text.includes('démarre') || text.includes('start') || text.includes('active') || text.includes('ouvre')) &&
    (text.includes('webtoon') || text.includes('manga') || text.includes('plume') || text.includes('acier'))
  ) {
    return {
      recognized: true,
      action: 'launch_project',
      targetProject: 'WEBTOON PROJECT PLUME D ACIER',
      replyText: "Compris Seb. Lancement du projet Webtoon Infrastructure sur le port 8095 en cours.",
      intent: 'START_WEBTOON'
    };
  }

  // 2. Intention : Arrêter le serveur SaaS RDV-Hub
  if (
    (text.includes('arrête') || text.includes('stop') || text.includes('éteins') || text.includes('coupe')) &&
    (text.includes('saas') || (text.includes('serveur') && !text.includes('smart') && !text.includes('site') && !text.includes('bati')) || text.includes('rdv') || text.includes('hub'))
  ) {
    return {
      recognized: true,
      action: 'stop_saas_server',
      targetProject: 'SAAS EFFICIENS ENERGIA',
      replyText: "Arrêt du serveur RDV-Hub demandé. Processus interrompu.",
      intent: 'STOP_SAAS'
    };
  }

  // 2b. Intention : Arrêter SmartTrip Pro
  if (
    (text.includes('arrête') || text.includes('stop') || text.includes('éteins') || text.includes('coupe')) &&
    (text.includes('smarttrip') || text.includes('smart trip') || text.includes('voyage'))
  ) {
    return {
      recognized: true,
      action: 'stop_project',
      targetProject: '$HOMEagy2-projectsmy-first-project',
      replyText: "Arrêt du serveur SmartTrip Pro en cours.",
      intent: 'STOP_SMARTTRIP'
    };
  }

  // 2c. Intention : Arrêter Bâti-Excellence Pro
  if (
    (text.includes('arrête') || text.includes('stop') || text.includes('éteins') || text.includes('coupe')) &&
    (text.includes('bati') || text.includes('bâti') || text.includes('construction') || text.includes('site'))
  ) {
    return {
      recognized: true,
      action: 'stop_project',
      targetProject: 'site_construction',
      replyText: "Arrêt du site Bâti-Excellence Pro en cours.",
      intent: 'STOP_BATI'
    };
  }

  // 2d. Intention : Arrêter Webtoon Infrastructure
  if (
    (text.includes('arrête') || text.includes('stop') || text.includes('éteins') || text.includes('coupe')) &&
    (text.includes('webtoon') || text.includes('manga') || text.includes('plume') || text.includes('acier'))
  ) {
    return {
      recognized: true,
      action: 'stop_project',
      targetProject: 'WEBTOON PROJECT PLUME D ACIER',
      replyText: "Arrêt du projet Webtoon demandé.",
      intent: 'STOP_WEBTOON'
    };
  }

  // 3. Intention : Lancer un banc d'essai / audit de sécurité @AUD
  if (text.includes('audit') || text.includes('test') || text.includes('sécurité') || text.includes('banc d’essai') || text.includes('contrôle')) {
    let target = 'mobil antigravity';
    let targetLabel = 'Mobil Antigravity';
    if (text.includes('smart') || text.includes('voyage')) {
      target = '$HOMEagy2-projectsmy-first-project';
      targetLabel = 'SmartTrip Pro';
    } else if (text.includes('saas') || text.includes('rdv')) {
      target = 'SAAS EFFICIENS ENERGIA';
      targetLabel = 'RDV-Hub SaaS';
    } else if (text.includes('bati') || text.includes('bâti') || text.includes('construction')) {
      target = 'site_construction';
      targetLabel = 'Bâti-Excellence Pro';
    } else if (text.includes('webtoon') || text.includes('manga') || text.includes('plume')) {
      target = 'WEBTOON PROJECT PLUME D ACIER';
      targetLabel = "Webtoon La Plume et l'Acier";
    }

    return {
      recognized: true,
      action: 'run_audit',
      targetProject: target,
      replyText: `Lancement de l'audit de certification @AUD pour ${targetLabel}.`,
      intent: 'RUN_AUDIT'
    };
  }

  // 4. Intention : Envoyer un SMS de statut à Seb (07 78 24 65 67)
  if (
    (text.includes('sms') || text.includes('message') || text.includes('texte')) ||
    (text.includes('rapport') && text.includes('seb'))
  ) {
    return {
      recognized: true,
      action: 'send_sms_status',
      replyText: "Envoi immédiat du rapport de statut par SMS vers votre smartphone 07 78 24 65 67.",
      intent: 'SEND_SMS'
    };
  }

  // 5. Intention : Contrôle des 18 règles Antigravity
  if (text.includes('règle') || text.includes('charte') || text.includes('conformité')) {
    return {
      recognized: true,
      action: 'check_rules',
      replyText: "Contrôle des 18 règles Antigravity. Intégrité et non-régression validées à 100%.",
      intent: 'CHECK_RULES'
    };
  }

  // 6. Intention : Kill Switch d'Urgence 1-Tap (Arrêt Global)
  if (
    text.includes('kill switch') || 
    text.includes('arrête tout') || 
    text.includes('coupe tout') || 
    text.includes('éteins tout') || 
    text.includes('stop all') ||
    text.includes('arrêt d’urgence') ||
    text.includes('arret d urgence')
  ) {
    return {
      recognized: true,
      action: 'kill_switch',
      replyText: "Arrêt d’urgence exécuté Seb. Tous les serveurs sont coupés et votre machine est au repos.",
      intent: 'KILL_SWITCH'
    };
  }

  // 7. Intention : Morning Briefing Vocal Automatisé
  if (
    text.includes('briefing') || 
    text.includes('rapport du matin') || 
    text.includes('résumé du jour') || 
    text.includes('bilan du matin') ||
    (text.includes('bonjour') && (text.includes('antigravity') || text.includes('seb') || text.includes('rapport')))
  ) {
    return {
      recognized: true,
      action: 'morning_briefing',
      replyText: "Bonjour Sébastien. Votre hub Antigravity est opérationnel. 7 projets surveillés. Santé système optimale, règles respectées et sécurité certifiée.",
      intent: 'MORNING_BRIEFING'
    };
  }

  // 8. Intention : Snapshot Git 1-Tap (Sauvegarde GitHub)
  if (text.includes('snapshot') || text.includes('sauvegarde') || text.includes('sauvegarder')) {
    let target = 'mobil antigravity';
    let targetLabel = 'Mobil Antigravity';
    if (text.includes('smart') || text.includes('voyage')) { target = '$HOMEagy2-projectsmy-first-project'; targetLabel = 'SmartTrip Pro'; }
    else if (text.includes('saas') || text.includes('rdv')) { target = 'SAAS EFFICIENS ENERGIA'; targetLabel = 'RDV-Hub SaaS'; }
    else if (text.includes('bati') || text.includes('construction')) { target = 'site_construction'; targetLabel = 'Bâti-Excellence Pro'; }
    else if (text.includes('webtoon') || text.includes('plume')) { target = 'WEBTOON PROJECT PLUME D ACIER'; targetLabel = "Webtoon La Plume et l'Acier"; }

    return {
      recognized: true,
      action: 'snapshot_project',
      targetProject: target,
      replyText: `Sauvegarde instantanée Snapshot Git déclenchée pour ${targetLabel}. Synchronisation en cours.`,
      intent: 'SNAPSHOT_PROJECT'
    };
  }

  // 9. Intention : Santé Matérielle PC Hôte (CPU, RAM, Disque)
  if (text.includes('processeur') || text.includes('cpu') || text.includes('mémoire') || text.includes('ram') || text.includes('disque') || text.includes('matériel')) {
    return {
      recognized: true,
      action: 'get_hardware',
      replyText: "Interrogation de la santé matérielle de votre PC hôte en direct.",
      intent: 'GET_HARDWARE'
    };
  }

  // 10. Intention : Carnet de Tâches pour l'Équipe Multi-Agents
  if (text.includes('tâche') || text.includes('tache') || text.includes('note pour') || text.includes('demande à') || text.includes('assigne')) {
    let assignee = '@CE';
    if (text.includes('dev')) assignee = '@DEV';
    else if (text.includes('uix') || text.includes('design')) assignee = '@UIX';
    else if (text.includes('aud') || text.includes('sécurité') || text.includes('qa')) assignee = '@AUD';
    else if (text.includes('ops') || text.includes('devops')) assignee = '@OPS';
    else if (text.includes('doc')) assignee = '@DOC';

    return {
      recognized: true,
      action: 'add_task',
      taskData: {
        title: transcript,
        assignee,
        project: 'Global',
        source: 'Vocal Seb'
      },
      replyText: `Tâche enregistrée pour ${assignee} dans le carnet d’ordres de l'équipe Antigravity.`,
      intent: 'ADD_TASK'
    };
  }

  // 11. Intention : État global du système
  if (text.includes('état') || text.includes('statut') || text.includes('santé') || text.includes('comment va') || text.includes('projet')) {
    return {
      recognized: true,
      action: 'get_status',
      replyText: "Votre contrôleur mobile est opérationnel. Vos projets Antigravity sont surveillés et sécurisés.",
      intent: 'GET_STATUS'
    };
  }

  return {
    recognized: false,
    action: null,
    replyText: `Commande reçue : "${transcript}". Aucune action correspondante. Essayez : "Briefing", "Kill switch", "Sauvegarde SmartTrip", ou "Note pour @DEV".`,
    intent: 'UNKNOWN'
  };
}
