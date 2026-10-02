// lib/tasks_manager.js - Gestionnaire de Tâches pour l'Équipe Multi-Agents Antigravity
import fs from 'node:fs';
import path from 'node:path';

const TASKS_FILE = path.resolve('data/agent_tasks.json');

// Données initiales par défaut si le fichier n'existe pas
const INITIAL_TASKS = [
  {
    id: 'task_001',
    title: 'Surveillance et audit de sécurité continu OWASP Top 10',
    assignee: '@AUD',
    project: 'mobil antigravity',
    status: 'DONE',
    createdAt: new Date(Date.now() - 3600000).toISOString(),
    completedAt: new Date().toISOString(),
    source: 'system'
  },
  {
    id: 'task_002',
    title: 'Optimisation de la vitesse de chargement et réactivité 4G/5G',
    assignee: '@DEV',
    project: 'SAAS EFFICIENS ENERGIA',
    status: 'TODO',
    createdAt: new Date().toISOString(),
    source: 'Seb'
  },
  {
    id: 'task_003',
    title: 'Harmonisation du contraste d’accessibilité WCAG AA',
    assignee: '@UIX',
    project: 'SmartTrip Pro',
    status: 'TODO',
    createdAt: new Date().toISOString(),
    source: 'Seb'
  }
];

function ensureTasksFile() {
  const dir = path.dirname(TASKS_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  if (!fs.existsSync(TASKS_FILE)) {
    fs.writeFileSync(TASKS_FILE, JSON.stringify(INITIAL_TASKS, null, 2), 'utf8');
  }
}

/**
 * Récupère la liste de toutes les tâches
 * @returns {Array}
 */
export function getTasks() {
  ensureTasksFile();
  try {
    const raw = fs.readFileSync(TASKS_FILE, 'utf8');
    return JSON.parse(raw || '[]');
  } catch {
    return [...INITIAL_TASKS];
  }
}

/**
 * Ajoute une nouvelle tâche dictée par Seb ou créée via UI
 * @param {object} taskData { title, assignee, project, source }
 * @returns {object} La tâche créée
 */
export function addTask({ title, assignee = '@CE', project = 'Global', source = 'Seb' }) {
  ensureTasksFile();
  const tasks = getTasks();

  const newTask = {
    id: 'task_' + Date.now() + '_' + Math.random().toString(36).substring(2, 5),
    title: String(title).trim(),
    assignee: String(assignee).trim(),
    project: String(project).trim(),
    status: 'TODO',
    createdAt: new Date().toISOString(),
    source
  };

  tasks.unshift(newTask);
  fs.writeFileSync(TASKS_FILE, JSON.stringify(tasks, null, 2), 'utf8');
  return newTask;
}

/**
 * Bascule le statut d'une tâche (TODO <-> DONE)
 * @param {string} taskId 
 * @returns {object|null}
 */
export function toggleTask(taskId) {
  ensureTasksFile();
  const tasks = getTasks();
  const task = tasks.find(t => t.id === taskId);
  if (!task) return null;

  task.status = task.status === 'DONE' ? 'TODO' : 'DONE';
  if (task.status === 'DONE') {
    task.completedAt = new Date().toISOString();
  } else {
    delete task.completedAt;
  }

  fs.writeFileSync(TASKS_FILE, JSON.stringify(tasks, null, 2), 'utf8');
  return task;
}

/**
 * Supprime une tâche
 * @param {string} taskId 
 * @returns {boolean}
 */
export function deleteTask(taskId) {
  ensureTasksFile();
  let tasks = getTasks();
  const initialLen = tasks.length;
  tasks = tasks.filter(t => t.id !== taskId);
  if (tasks.length !== initialLen) {
    fs.writeFileSync(TASKS_FILE, JSON.stringify(tasks, null, 2), 'utf8');
    return true;
  }
  return false;
}
