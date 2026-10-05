import { useEffect, useState } from 'react'
import { db } from './db'
import { dueReminders } from './logic'
import type { Task } from './types'

export interface Alert {
  task: Task
  at: number
}

function beep() {
  try {
    const ctx = new AudioContext()
    const o = ctx.createOscillator()
    const g = ctx.createGain()
    o.frequency.value = 880
    g.gain.setValueAtTime(0.15, ctx.currentTime)
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6)
    o.connect(g).connect(ctx.destination)
    o.start()
    o.stop(ctx.currentTime + 0.6)
  } catch {
    /* le son est un bonus */
  }
}

function systemNotify(t: Task) {
  try {
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification(t.title, { body: t.time ? `Prévu à ${t.time}` : 'Rappel', tag: t.id })
    }
  } catch {
    /* certains navigateurs refusent hors service worker */
  }
}

export async function requestNotifications(): Promise<NotificationPermission | 'unsupported'> {
  if (!('Notification' in window)) return 'unsupported'
  try {
    return await Notification.requestPermission()
  } catch {
    return 'denied'
  }
}

/** Vérifie les rappels toutes les 15 s et renvoie les alertes à afficher dans l'app. */
export function useReminders() {
  const [alerts, setAlerts] = useState<Alert[]>([])
  useEffect(() => {
    let alive = true
    const tick = async () => {
      const now = Date.now()
      const due = dueReminders(await db.tasks.toArray(), now)
      if (!alive || !due.length) return
      for (const t of due) {
        await db.tasks.update(t.id, { notifiedAt: now, snoozeUntil: undefined })
        systemNotify(t)
      }
      beep()
      setAlerts((a) => [...a.filter((x) => !due.some((t) => t.id === x.task.id)), ...due.map((task) => ({ task, at: now }))])
    }
    tick()
    const id = setInterval(tick, 15_000)
    return () => {
      alive = false
      clearInterval(id)
    }
  }, [])
  const dismiss = (taskId: string) => setAlerts((a) => a.filter((x) => x.task.id !== taskId))
  return { alerts, dismiss }
}
