import type { Project, Task } from './types'
import { formatDay, isOverdue } from './logic'
import { updateTask } from './db'

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
    </li>
  )
}
