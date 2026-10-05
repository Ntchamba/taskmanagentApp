import { useEffect, useState } from 'react'
import type { Project, Task } from './types'
import { formatDay, isOverdue } from './logic'
import { deleteTask, updateTask } from './db'

interface Props {
  task: Task
  project?: Project
  blocked?: boolean
  resourceCount?: number
  now: Date
  selected: boolean
  showDay?: boolean
  onOpen: () => void
}

export function TaskRow({ task, project, blocked, resourceCount, now, selected, showDay, onOpen }: Props) {
  const done = task.status === 'done'
  const late = isOverdue(task, now)
  // Premier clic : demande de confirmation, qui s'annule seule après 4 s.
  const [confirming, setConfirming] = useState(false)
  useEffect(() => {
    if (!confirming) return
    const id = setTimeout(() => setConfirming(false), 4000)
    return () => clearTimeout(id)
  }, [confirming])
  return (
    <li className={`row${selected ? ' is-selected' : ''}${done ? ' is-done' : ''}`}>
      <input
        id={`check-${task.id}`}
        type="checkbox"
        className="check"
        checked={done}
        aria-label={done ? `Rouvrir ${task.title}` : `Terminer ${task.title}`}
        onChange={() => updateTask(task.id, { status: done ? 'todo' : 'done' })}
      />
      <button className="row-main" onClick={onOpen}>
        <span className="row-time">{task.time ?? '··:··'}</span>
        <span className="row-title">{task.title}</span>
        <span className="row-meta">
          {showDay && task.date && <span className={`chip${late ? ' chip-late' : ''}`}>{formatDay(task.date, now)}</span>}
          {!showDay && late && <span className="chip chip-late">En retard</span>}
          {task.status === 'doing' && <span className="chip chip-doing">En cours</span>}
          {blocked && <span className="chip" title="Un prérequis n'est pas terminé">Bloquée</span>}
          {!!resourceCount && <span className="chip">{resourceCount} ressource{resourceCount > 1 ? 's' : ''}</span>}
          {project && <span className="chip chip-project">{project.name}</span>}
        </span>
      </button>
      <button
        className={`row-delete${confirming ? ' is-confirming' : ''}`}
        aria-label={confirming ? `Confirmer la suppression de ${task.title}` : `Supprimer ${task.title}`}
        title="Supprimer"
        onClick={() => (confirming ? deleteTask(task.id) : setConfirming(true))}
      >
        {confirming ? 'Supprimer ?' : (
          <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3" />
          </svg>
        )}
      </button>
    </li>
  )
}
