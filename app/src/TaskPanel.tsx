import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { addResource, db, deleteTask, updateTask } from './db'
import { createsCycle } from './logic'
import { KIND_LABEL, STATUS_LABEL, type Project, type ResourceKind, type Status, type Task } from './types'

interface Props {
  task: Task
  projects: Project[]
  siblings: Task[]
  onClose: () => void
  onError: (msg: string) => void
}

const REMIND: [number, string][] = [
  [0, 'À l’heure exacte'], [5, '5 min avant'], [15, '15 min avant'], [60, '1 h avant'], [1440, '1 jour avant'],
]

export function TaskPanel({ task, projects, siblings, onClose, onError }: Props) {
  const resources = useLiveQuery(() => db.resources.where('taskId').equals(task.id).toArray(), [task.id]) ?? []
  const [resTitle, setResTitle] = useState('')
  const [resUrl, setResUrl] = useState('')
  const [resKind, setResKind] = useState<ResourceKind>('article')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const others = siblings.filter((t) => t.id !== task.id)

  const toggleDep = (id: string, on: boolean) => {
    if (on && createsCycle(siblings, task.id, id)) {
      onError('Impossible : cette étape dépend déjà de celle-ci, ça créerait une boucle.')
      return
    }
    updateTask(task.id, { deps: on ? [...task.deps, id] : task.deps.filter((d) => d !== id) })
  }

  return (
    <aside className="panel" aria-label="Détail de la tâche">
      <div className="panel-head">
        <span className="eyebrow">{task.projectId ? 'Étape' : 'Tâche'}</span>
        <button className="btn btn-ghost" onClick={onClose} aria-label="Fermer le panneau">Fermer</button>
      </div>

      <input
        id="panel-title"
        key={`t-${task.id}`}
        className="panel-title"
        defaultValue={task.title}
        aria-label="Titre"
        onBlur={(e) => e.target.value.trim() && updateTask(task.id, { title: e.target.value.trim() })}
      />

      <div className="seg" role="radiogroup" aria-label="Statut">
        {(Object.keys(STATUS_LABEL) as Status[]).map((s) => (
          <button key={s} role="radio" aria-checked={task.status === s} className={`seg-btn seg-${s}`} onClick={() => updateTask(task.id, { status: s })}>
            {STATUS_LABEL[s]}
          </button>
        ))}
      </div>

      <section className="panel-sec">
        <h3>Quand</h3>
        <div className="when">
          <label>Date<input id="panel-date" type="date" value={task.date ?? ''} onChange={(e) => updateTask(task.id, { date: e.target.value || undefined })} /></label>
          <label>Heure<input id="panel-time" type="time" value={task.time ?? ''} onChange={(e) => updateTask(task.id, { time: e.target.value || undefined })} /></label>
          <label>Rappel
            <select id="panel-remind" value={task.remindBefore} onChange={(e) => updateTask(task.id, { remindBefore: Number(e.target.value) })}>
              {REMIND.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </label>
        </div>
        {task.date && !task.time && <p className="hint">Ajoute une heure pour recevoir une notification.</p>}
      </section>

      <section className="panel-sec">
        <h3>Ressources</h3>
        {resources.length === 0 && <p className="hint">Aucune ressource. Ajoute les cours, vidéos ou docs que tu vas utiliser.</p>}
        <ul className="res-list">
          {resources.map((r) => (
            <li key={r.id} className={`res${r.done ? ' res-done' : ''}`}>
              <input id={`res-${r.id}`} type="checkbox" checked={r.done} aria-label={`Marquer ${r.title} comme vu`} onChange={() => db.resources.update(r.id, { done: !r.done })} />
              <span className={`kind kind-${r.kind}`}>{KIND_LABEL[r.kind]}</span>
              {r.url ? <a href={r.url} target="_blank" rel="noreferrer">{r.title}</a> : <span>{r.title}</span>}
              <button className="btn-x" aria-label={`Supprimer ${r.title}`} onClick={() => db.resources.delete(r.id)}>×</button>
            </li>
          ))}
        </ul>
        <form
          className="res-add"
          onSubmit={async (e) => {
            e.preventDefault()
            if (!resTitle.trim()) return
            let url = resUrl.trim()
            if (url && !/^https?:\/\//.test(url)) url = `https://${url}`
            await addResource(task.id, { title: resTitle.trim(), url, kind: resKind })
            setResTitle('')
            setResUrl('')
          }}
        >
          <input id="res-title" value={resTitle} onChange={(e) => setResTitle(e.target.value)} placeholder="Titre de la ressource" aria-label="Titre de la ressource" />
          <input id="res-url" value={resUrl} onChange={(e) => setResUrl(e.target.value)} placeholder="Lien (facultatif)" aria-label="Lien" />
          <select id="res-kind" value={resKind} onChange={(e) => setResKind(e.target.value as ResourceKind)} aria-label="Type">
            {(Object.keys(KIND_LABEL) as ResourceKind[]).map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
          </select>
          <button className="btn" type="submit" disabled={!resTitle.trim()}>Ajouter</button>
        </form>
      </section>

      {task.projectId && (
        <section className="panel-sec">
          <h3>À faire avant</h3>
          {others.length === 0 && <p className="hint">C’est la seule étape du projet.</p>}
          <ul className="deps">
            {others.map((o) => (
              <li key={o.id}>
                <label>
                  <input id={`dep-${o.id}`} type="checkbox" checked={task.deps.includes(o.id)} onChange={(e) => toggleDep(o.id, e.target.checked)} />
                  {o.title}
                </label>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="panel-sec">
        <h3>Notes</h3>
        <textarea id="panel-desc" key={`d-${task.id}`} defaultValue={task.description} rows={4} aria-label="Notes"
          onBlur={(e) => updateTask(task.id, { description: e.target.value })} />
        <label className="move">Projet
          <select id="panel-project" value={task.projectId ?? ''} onChange={(e) => updateTask(task.id, { projectId: e.target.value || null, deps: [] })}>
            <option value="">Boîte de réception</option>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>
      </section>

      <div className="panel-foot">
        {confirmDelete ? (
          <>
            <span>Supprimer cette tâche ?</span>
            <button className="btn btn-danger" onClick={() => { deleteTask(task.id); onClose() }}>Supprimer</button>
            <button className="btn" onClick={() => setConfirmDelete(false)}>Annuler</button>
          </>
        ) : (
          <button className="btn btn-ghost danger" onClick={() => setConfirmDelete(true)}>Supprimer la tâche</button>
        )}
      </div>
    </aside>
  )
}
