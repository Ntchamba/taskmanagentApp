import { useState } from 'react'
import { addTask } from './db'

interface Props {
  projectId: string | null
  defaultDate?: string
  deps?: string[]
  placeholder?: string
  onAdded?: (id: string) => void
}

export function QuickAdd({ projectId, defaultDate, deps, placeholder, onAdded }: Props) {
  const [title, setTitle] = useState('')
  const [date, setDate] = useState(defaultDate ?? '')
  const [time, setTime] = useState('')
  const key = projectId ?? 'inbox'
  return (
    <form
      className="quickadd"
      onSubmit={async (e) => {
        e.preventDefault()
        if (!title.trim()) return
        const id = await addTask({ title: title.trim(), projectId, date: date || undefined, time: time || undefined, deps: deps ?? [] })
        setTitle('')
        setTime('')
        onAdded?.(id)
      }}
    >
      <input id={`qa-title-${key}`} className="qa-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={placeholder ?? 'Nouvelle tâche'} aria-label="Titre de la tâche" />
      <input id={`qa-date-${key}`} type="date" value={date} onChange={(e) => setDate(e.target.value)} aria-label="Date" />
      <input id={`qa-time-${key}`} type="time" value={time} onChange={(e) => setTime(e.target.value)} aria-label="Heure" />
      <button type="submit" className="btn btn-primary" disabled={!title.trim()}>Ajouter</button>
    </form>
  )
}
