import { describe, expect, it } from 'vitest'
import { createsCycle, dueReminders, isBlocked, progress, todayTasks, topoOrder } from '../src/logic'
import type { Task } from '../src/types'

const t = (id: string, extra: Partial<Task> = {}): Task => ({
  id, projectId: 'p', title: id, description: '', status: 'todo', remindBefore: 0, deps: [], order: 0, createdAt: 0, ...extra,
})

describe('dépendances', () => {
  const tasks = [t('a'), t('b', { deps: ['a'] }), t('c', { deps: ['b'] })]
  it('refuse un lien qui crée une boucle', () => {
    expect(createsCycle(tasks, 'c', 'a')).toBe(true)
    expect(createsCycle(tasks, 'a', 'a')).toBe(true)
  })
  it('accepte un lien sans boucle', () => {
    expect(createsCycle(tasks, 'a', 'c')).toBe(false)
  })
  it('ordonne chaque tâche après ses prérequis', () => {
    const shuffled = [t('c', { deps: ['b'], order: 0 }), t('b', { deps: ['a'], order: 1 }), t('a', { order: 2 })]
    expect(topoOrder(shuffled).map((x) => x.id)).toEqual(['a', 'b', 'c'])
  })
  it('bloque une tâche tant qu’un prérequis est ouvert', () => {
    expect(isBlocked(tasks[1], tasks)).toBe(true)
    expect(isBlocked(tasks[1], [t('a', { status: 'done' }), tasks[1]])).toBe(false)
  })
})

describe('rappels', () => {
  const now = new Date(2026, 9, 5, 14, 5).getTime()
  it('déclenche à l’heure exacte', () => {
    expect(dueReminders([t('x', { date: '2026-10-05', time: '14:05' })], now)).toHaveLength(1)
    expect(dueReminders([t('x', { date: '2026-10-05', time: '14:06' })], now)).toHaveLength(0)
  })
  it('respecte le rappel anticipé', () => {
    expect(dueReminders([t('x', { date: '2026-10-05', time: '14:20', remindBefore: 15 })], now)).toHaveLength(1)
  })
  it('ignore les tâches déjà notifiées, terminées ou sans heure', () => {
    expect(dueReminders([
      t('a', { date: '2026-10-05', time: '14:00', notifiedAt: 1 }),
      t('b', { date: '2026-10-05', time: '14:00', status: 'done' }),
      t('c', { date: '2026-10-05' }),
    ], now)).toHaveLength(0)
  })
  it('relance un rappel reporté', () => {
    expect(dueReminders([t('a', { date: '2026-10-05', time: '13:00', snoozeUntil: now - 1000 })], now)).toHaveLength(1)
  })
})

describe('vue du jour', () => {
  it('trie par heure et met les retards à part', () => {
    const now = new Date(2026, 9, 5, 10, 0)
    const { overdue, todays } = todayTasks([
      t('soir', { date: '2026-10-05', time: '19:00' }),
      t('matin', { date: '2026-10-05', time: '08:00' }),
      t('sans', { date: '2026-10-05' }),
      t('hier', { date: '2026-10-04', time: '09:00' }),
    ], now)
    expect(overdue.map((x) => x.id)).toEqual(['hier'])
    expect(todays.map((x) => x.id)).toEqual(['matin', 'soir', 'sans'])
  })
  it('calcule la progression sans les étapes ignorées', () => {
    expect(progress([t('a', { status: 'done' }), t('b'), t('c', { status: 'skipped' })]).pct).toBe(50)
  })
})
