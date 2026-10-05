import Dexie, { type Table } from 'dexie'
import type { Project, Resource, ResourceKind, Task } from './types'
import { addDays, isoDate, pad } from './logic'

class TaskDB extends Dexie {
  projects!: Table<Project, string>
  tasks!: Table<Task, string>
  resources!: Table<Resource, string>
  meta!: Table<{ key: string; value: unknown }, string>
  constructor() {
    super('taskmanager')
    this.version(1).stores({
      projects: 'id, createdAt',
      tasks: 'id, projectId, date, status',
      resources: 'id, taskId',
      meta: 'key',
    })
  }
}

export const db = new TaskDB()
const uid = () => crypto.randomUUID()

export async function addProject(name: string): Promise<string> {
  const id = uid()
  await db.projects.add({ id, name, createdAt: Date.now() })
  return id
}

export async function deleteProject(id: string) {
  await db.transaction('rw', db.projects, db.tasks, db.resources, async () => {
    const ids = (await db.tasks.where('projectId').equals(id).toArray()).map((t) => t.id)
    await db.resources.where('taskId').anyOf(ids).delete()
    await db.tasks.bulkDelete(ids)
    await db.projects.delete(id)
  })
}

export async function addTask(partial: Partial<Task> & { title: string }): Promise<string> {
  const id = uid()
  const order = (await db.tasks.count()) + 1
  await db.tasks.add({
    id,
    projectId: null,
    description: '',
    status: 'todo',
    remindBefore: 0,
    deps: [],
    order,
    createdAt: Date.now(),
    ...partial,
  })
  return id
}

export async function updateTask(id: string, changes: Partial<Task>) {
  // Changer la date, l'heure ou l'avance replanifie le rappel.
  if ('date' in changes || 'time' in changes || 'remindBefore' in changes) {
    changes = { ...changes, notifiedAt: undefined, snoozeUntil: undefined }
  }
  await db.tasks.update(id, changes)
}

export async function deleteTask(id: string) {
  await db.transaction('rw', db.tasks, db.resources, async () => {
    await db.resources.where('taskId').equals(id).delete()
    await db.tasks.delete(id)
    // Retire la tâche des prérequis des autres.
    await db.tasks.toCollection().modify((t) => {
      t.deps = t.deps.filter((d) => d !== id)
    })
  })
}

export async function addResource(taskId: string, r: Omit<Resource, 'id' | 'taskId' | 'done'>) {
  await db.resources.add({ id: uid(), taskId, done: false, ...r })
}

let seeding: Promise<void> | null = null
/** Exemple chargé au premier lancement pour montrer la vue roadmap. */
export function seedIfEmpty(now = new Date()) {
  seeding ??= seed(now)
  return seeding
}

async function seed(now: Date) {
  if (await db.meta.get('seeded')) return
  await db.meta.put({ key: 'seeded', value: true })
  if ((await db.tasks.count()) > 0) return

  const today = isoDate(now)
  const inHour = (h: number) => {
    const d = new Date(now.getTime() + h * 3600_000)
    return `${pad(d.getHours())}:${pad(d.getMinutes())}`
  }
  const pid = await addProject('Devenir développeur web (exemple)')
  type R = [string, string, ResourceKind]
  const steps: { key: string; title: string; deps: string[]; status?: Task['status']; date?: string; time?: string; desc: string; res: R[] }[] = [
    { key: 'html', title: 'HTML', deps: [], status: 'done', desc: 'Structure d’une page, balises sémantiques, formulaires.',
      res: [['MDN : Apprendre le HTML', 'https://developer.mozilla.org/fr/docs/Learn/HTML', 'cours'], ['roadmap.sh Frontend', 'https://roadmap.sh/frontend', 'article']] },
    { key: 'css', title: 'CSS', deps: ['html'], status: 'done', desc: 'Sélecteurs, flexbox, grid, responsive.',
      res: [['MDN : Apprendre le CSS', 'https://developer.mozilla.org/fr/docs/Learn/CSS', 'cours'], ['Flexbox Froggy', 'https://flexboxfroggy.com/#fr', 'cours']] },
    { key: 'js', title: 'JavaScript', deps: ['html'], status: 'doing', date: today, time: inHour(1), desc: 'Variables, fonctions, DOM, promesses, fetch.',
      res: [['javascript.info (FR)', 'https://fr.javascript.info/', 'cours'], ['MDN : Guide JavaScript', 'https://developer.mozilla.org/fr/docs/Web/JavaScript/Guide', 'doc']] },
    { key: 'git', title: 'Git et GitHub', deps: [], date: today, time: inHour(3), desc: 'Commits, branches, pull requests.',
      res: [['Pro Git (livre en français)', 'https://git-scm.com/book/fr/v2', 'doc'], ['Learn Git Branching', 'https://learngitbranching.js.org/?locale=fr_FR', 'cours']] },
    { key: 'ts', title: 'TypeScript', deps: ['js'], date: addDays(today, 2), time: '18:30', desc: 'Types, interfaces, génériques.',
      res: [['Handbook TypeScript', 'https://www.typescriptlang.org/docs/handbook/intro.html', 'doc']] },
    { key: 'react', title: 'React', deps: ['js', 'css'], date: addDays(today, 4), time: '18:30', desc: 'Composants, état, hooks.',
      res: [['react.dev : Apprendre', 'https://fr.react.dev/learn', 'cours']] },
    { key: 'node', title: 'Node.js', deps: ['js'], date: addDays(today, 6), time: '19:00', desc: 'Serveur HTTP, modules, npm.',
      res: [['Node.js : Learn', 'https://nodejs.org/en/learn', 'doc']] },
    { key: 'sql', title: 'Bases de données SQL', deps: ['node'], desc: 'Requêtes, jointures, PostgreSQL.',
      res: [['SQLBolt', 'https://sqlbolt.com/', 'cours']] },
    { key: 'final', title: 'Projet final : mon gestionnaire de tâches', deps: ['react', 'ts', 'sql', 'git'], desc: 'Tout assembler dans une vraie application.',
      res: [['Mes notes de projet', '', 'note']] },
  ]
  const ids: Record<string, string> = {}
  for (const [i, s] of steps.entries()) {
    ids[s.key] = await addTask({ projectId: pid, title: s.title, description: s.desc, status: s.status ?? 'todo',
      date: s.date, time: s.time, deps: s.deps.map((d) => ids[d]), order: i })
    for (const [title, url, kind] of s.res) await addResource(ids[s.key], { title, url, kind })
  }
  // Les rappels déjà passés de l'exemple ne doivent pas sonner à l'ouverture.
  const past = now.getHours() >= 9 ? Date.now() : undefined
  await addTask({ title: 'Payer le loyer', date: today, time: '09:00', notifiedAt: past })
  await addTask({ title: 'Appeler le dentiste', date: today, time: inHour(5), remindBefore: 15 })
  await addTask({ title: 'Faire les courses', date: today })
}
