import type { Task } from './types'

export const pad = (n: number) => String(n).padStart(2, '0')

export function isoDate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number)
  return isoDate(new Date(y, m - 1, d + days))
}

/** Date et heure locales de la tâche, ou null si elle n'en a pas. */
export function dueAt(t: Pick<Task, 'date' | 'time'>): Date | null {
  if (!t.date) return null
  const [y, m, d] = t.date.split('-').map(Number)
  const [hh, mm] = (t.time ?? '23:59').split(':').map(Number)
  return new Date(y, m - 1, d, hh, mm)
}

export const isOpen = (t: Task) => t.status === 'todo' || t.status === 'doing'

export function isOverdue(t: Task, now: Date): boolean {
  const due = dueAt(t)
  return !!due && isOpen(t) && due.getTime() < now.getTime()
}

/** Moment où le rappel doit partir, ou null si la tâche n'a pas d'heure. */
export function reminderAt(t: Task): number | null {
  if (t.snoozeUntil) return t.snoozeUntil
  if (!t.time) return null
  const due = dueAt(t)
  return due ? due.getTime() - t.remindBefore * 60_000 : null
}

/** Tâches dont le rappel est à envoyer maintenant (fenêtre de 12 h pour ne pas réveiller les vieux retards). */
export function dueReminders(tasks: Task[], now: number): Task[] {
  return tasks.filter((t) => {
    if (!isOpen(t) || t.notifiedAt) return false
    const at = reminderAt(t)
    return at !== null && at <= now && now - at < 12 * 3600_000
  })
}

/** Vue « Tâches du jour » : retards d'abord, puis tri par heure, les tâches sans heure à la fin. */
export function todayTasks(tasks: Task[], now: Date) {
  const today = isoDate(now)
  const overdue = tasks
    .filter((t) => t.date && t.date < today && isOpen(t))
    .sort((a, b) => (dueAt(a)!.getTime() - dueAt(b)!.getTime()))
  const todays = tasks
    .filter((t) => t.date === today)
    .sort((a, b) => (a.time ?? '99:99').localeCompare(b.time ?? '99:99') || a.order - b.order)
  return { overdue, todays }
}

/** Vrai si ajouter « from doit précéder to » créerait une boucle. */
export function createsCycle(tasks: Task[], from: string, to: string): boolean {
  if (from === to) return true
  const byId = new Map(tasks.map((t) => [t.id, t]))
  // Une boucle existe si `to` est déjà un prérequis (direct ou indirect) de `from`.
  const stack = [from]
  const seen = new Set<string>()
  while (stack.length) {
    const id = stack.pop()!
    if (id === to) return true
    if (seen.has(id)) continue
    seen.add(id)
    stack.push(...(byId.get(id)?.deps ?? []))
  }
  return false
}

/** Ordre de réalisation : chaque tâche après ses prérequis, puis par `order`. */
export function topoOrder(tasks: Task[]): Task[] {
  const ids = new Set(tasks.map((t) => t.id))
  const indeg = new Map(tasks.map((t) => [t.id, t.deps.filter((d) => ids.has(d)).length]))
  const next = (list: Task[]) => list.sort((a, b) => a.order - b.order)
  let ready = next(tasks.filter((t) => indeg.get(t.id) === 0))
  const out: Task[] = []
  while (ready.length) {
    const t = ready.shift()!
    out.push(t)
    for (const u of tasks) {
      if (u.deps.includes(t.id)) {
        indeg.set(u.id, indeg.get(u.id)! - 1)
        if (indeg.get(u.id) === 0) ready = next([...ready, u])
      }
    }
  }
  // Sécurité : une boucle éventuelle ne fait pas disparaître de tâches.
  return out.length === tasks.length ? out : [...out, ...tasks.filter((t) => !out.includes(t))]
}

/** Une tâche est bloquée si un de ses prérequis n'est ni terminé ni ignoré. */
export function isBlocked(t: Task, tasks: Task[]): boolean {
  return t.deps.some((d) => {
    const dep = tasks.find((x) => x.id === d)
    return dep && isOpen(dep)
  })
}

export function progress(tasks: Task[]) {
  const counted = tasks.filter((t) => t.status !== 'skipped')
  const done = counted.filter((t) => t.status === 'done').length
  return { done, total: counted.length, pct: counted.length ? Math.round((done / counted.length) * 100) : 0 }
}

export function formatDay(iso: string, now: Date): string {
  const today = isoDate(now)
  if (iso === today) return "Aujourd'hui"
  if (iso === addDays(today, 1)) return 'Demain'
  if (iso === addDays(today, -1)) return 'Hier'
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' })
}
