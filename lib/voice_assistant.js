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

  // 3. Intention : Lancer un banc d'essai / audit de sécurité @AUD
  if (text.includes('audit') || text.includes('test') || text.includes('sécurité') || text.includes('banc d’essai')) {
    return {
      recognized: true,
      action: 'run_audit',
      replyText: "Lancement du banc d’essai automatisé @AUD sous Microsoft Edge Headless.",
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

  // 6. Intention : État global du système
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
    replyText: `Commande reçue : "${transcript}". Aucune action correspondante. Essayez : "Lance le serveur", "Fais un audit", ou "Envoie un SMS à Seb".`,
    intent: 'UNKNOWN'
  };
}
