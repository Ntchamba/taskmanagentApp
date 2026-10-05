import { useEffect, useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { addProject, db, deleteProject, seedIfEmpty, updateTask } from './db'
import { createsCycle, isBlocked, isOpen, isoDate, progress, todayTasks, topoOrder } from './logic'
import type { Task } from './types'
import { TaskRow } from './TaskRow'
import { QuickAdd } from './QuickAdd'
import { Roadmap } from './Roadmap'
import { TaskPanel } from './TaskPanel'
import { requestNotifications, useReminders } from './reminders'

type View = { kind: 'today' } | { kind: 'upcoming' } | { kind: 'inbox' } | { kind: 'project'; id: string }

function useNow() {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000)
    return () => clearInterval(id)
  }, [])
  return now
}

export function App() {
  const now = useNow()
  const [view, setView] = useState<View>({ kind: 'today' })
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [mode, setMode] = useState<'roadmap' | 'list'>('roadmap')
  const [newProject, setNewProject] = useState('')
  const [flash, setFlash] = useState<string | null>(null)
  const [confirmDeleteProject, setConfirmDeleteProject] = useState(false)
  const [perm, setPerm] = useState<string>(() => ('Notification' in window ? Notification.permission : 'unsupported'))
  const { alerts, dismiss } = useReminders()

  useEffect(() => { seedIfEmpty() }, [])
  useEffect(() => {
    if (!flash) return
    const id = setTimeout(() => setFlash(null), 4000)
    return () => clearTimeout(id)
  }, [flash])

  const projects = useLiveQuery(() => db.projects.orderBy('createdAt').toArray(), []) ?? []
  const tasks = useLiveQuery(() => db.tasks.toArray(), []) ?? []
  const resources = useLiveQuery(() => db.resources.toArray(), []) ?? []
  const resourceCounts = useMemo(() => {
    const m = new Map<string, number>()
    for (const r of resources) m.set(r.taskId, (m.get(r.taskId) ?? 0) + 1)
    return m
  }, [resources])
  const projectById = useMemo(() => new Map(projects.map((p) => [p.id, p])), [projects])
  const selected = tasks.find((t) => t.id === selectedId) ?? null
  const today = isoDate(now)
  const { overdue, todays } = todayTasks(tasks, now)
  const todayOpen = overdue.length + todays.filter(isOpen).length

  const go = (v: View) => { setView(v); setSelectedId(null); setConfirmDeleteProject(false) }
  const isView = (v: View) => v.kind === view.kind && (v.kind !== 'project' || (view.kind === 'project' && v.id === view.id))

  const rows = (list: Task[], opts: { showDay?: boolean; numbered?: boolean } = {}) => (
    <ol className={`rows${opts.numbered ? ' rows-numbered' : ''}`}>
      {list.map((t) => (
        <TaskRow key={t.id} task={t} now={now} selected={t.id === selectedId} showDay={opts.showDay}
          project={t.projectId ? projectById.get(t.projectId) : undefined}
          blocked={isOpen(t) && isBlocked(t, tasks)} resourceCount={resourceCounts.get(t.id)}
          onOpen={() => setSelectedId(t.id)} />
      ))}
    </ol>
  )

  let main: React.ReactNode
  if (view.kind === 'today') {
    main = (
      <>
        <header className="main-head">
          <div>
            <span className="eyebrow">{now.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}</span>
            <h1>Tâches du jour</h1>
          </div>
          <span className="count">{todayOpen} à faire</span>
        </header>
        <QuickAdd projectId={null} defaultDate={today} placeholder="Ajouter une tâche pour aujourd’hui" />
        {overdue.length > 0 && (<><h2 className="group late">En retard</h2>{rows(overdue, { showDay: true })}</>)}
        <h2 className="group">Aujourd’hui</h2>
        {todays.length ? rows(todays) : <p className="empty">Rien de prévu aujourd’hui. Ajoute une tâche avec une heure pour être notifié.</p>}
      </>
    )
  } else if (view.kind === 'upcoming') {
    const up = tasks.filter((t) => t.date && t.date > today).sort((a, b) => (a.date! + (a.time ?? '99')).localeCompare(b.date! + (b.time ?? '99')))
    main = (
      <>
        <header className="main-head"><h1>À venir</h1><span className="count">{up.length} tâches</span></header>
        {up.length ? rows(up, { showDay: true }) : <p className="empty">Aucune tâche datée après aujourd’hui.</p>}
      </>
    )
  } else if (view.kind === 'inbox') {
    const inbox = tasks.filter((t) => !t.projectId).sort((a, b) => a.order - b.order)
    main = (
      <>
        <header className="main-head"><h1>Boîte de réception</h1><span className="count">{inbox.filter(isOpen).length} à faire</span></header>
        <QuickAdd projectId={null} placeholder="Ajouter une tâche" />
        {inbox.length ? rows(inbox, { showDay: true }) : <p className="empty">Boîte vide.</p>}
      </>
    )
  } else {
    const project = projectById.get(view.id)
    const list = tasks.filter((t) => t.projectId === view.id)
    const p = progress(list)
    const after = selected && selected.projectId === view.id ? selected : null
    main = project ? (
      <>
        <header className="main-head">
          <div>
            <span className="eyebrow">Projet · {p.done} sur {p.total} étapes</span>
            <h1>{project.name}</h1>
          </div>
          <div className="tabs" role="tablist" aria-label="Affichage">
            <button role="tab" aria-selected={mode === 'roadmap'} onClick={() => setMode('roadmap')}>Roadmap</button>
            <button role="tab" aria-selected={mode === 'list'} onClick={() => setMode('list')}>Liste</button>
          </div>
        </header>
        <div className="progress" aria-label={`Progression ${p.pct} %`}><span style={{ width: `${p.pct}%` }} /><b>{p.pct} %</b></div>
        <QuickAdd key={after?.id ?? 'none'} projectId={view.id} deps={after ? [after.id] : []}
          placeholder={after ? `Nouvelle étape après « ${after.title} »` : 'Nouvelle étape'} onAdded={(id) => setSelectedId(id)} />
        {mode === 'roadmap' ? (
          <>
            <p className="hint">Relie deux étapes en tirant du point bas de l’une vers le point haut de l’autre. Sélectionne un lien et appuie sur Suppr pour l’enlever.</p>
            {list.length ? (
              <Roadmap tasks={list} resourceCounts={resourceCounts} selectedId={selectedId} now={now}
                onSelect={setSelectedId} onConnectError={setFlash} wouldCycle={(from, to) => createsCycle(list, from, to)} />
            ) : <p className="empty">Ajoute la première étape de ta roadmap.</p>}
          </>
        ) : rows(topoOrder(list), { showDay: true, numbered: true })}
        <div className="danger-zone">
          {confirmDeleteProject ? (
            <>
              <span>Supprimer « {project.name} » et ses {list.length} étapes ?</span>
              <button className="btn btn-danger" onClick={() => { deleteProject(project.id); go({ kind: 'today' }) }}>Supprimer</button>
              <button className="btn" onClick={() => setConfirmDeleteProject(false)}>Annuler</button>
            </>
          ) : <button className="btn btn-ghost danger" onClick={() => setConfirmDeleteProject(true)}>Supprimer le projet</button>}
        </div>
      </>
    ) : <p className="empty">Projet introuvable.</p>
  }

  return (
    <div className={`app${selected ? ' has-panel' : ''}`}>
      <nav className="side" aria-label="Navigation">
        <div className="brand">TaskManager</div>
        <ul className="nav">
          <li><button aria-current={isView({ kind: 'today' })} onClick={() => go({ kind: 'today' })}>Tâches du jour{todayOpen > 0 && <span className="badge">{todayOpen}</span>}</button></li>
          <li><button aria-current={isView({ kind: 'upcoming' })} onClick={() => go({ kind: 'upcoming' })}>À venir</button></li>
          <li><button aria-current={isView({ kind: 'inbox' })} onClick={() => go({ kind: 'inbox' })}>Boîte de réception</button></li>
        </ul>
        <div className="side-label">Projets</div>
        <ul className="nav">
          {projects.map((pr) => {
            const pg = progress(tasks.filter((t) => t.projectId === pr.id))
            return (
              <li key={pr.id}>
                <button aria-current={isView({ kind: 'project', id: pr.id })} onClick={() => { go({ kind: 'project', id: pr.id }); setMode('roadmap') }}>
                  <span className="nav-name">{pr.name}</span><span className="nav-pct">{pg.pct} %</span>
                </button>
              </li>
            )
          })}
        </ul>
        <form className="new-project" onSubmit={async (e) => {
          e.preventDefault()
          if (!newProject.trim()) return
          const id = await addProject(newProject.trim())
          setNewProject('')
          go({ kind: 'project', id })
          setMode('roadmap')
        }}>
          <input id="new-project" value={newProject} onChange={(e) => setNewProject(e.target.value)} placeholder="Nouveau projet" aria-label="Nom du nouveau projet" />
          <button className="btn" type="submit" disabled={!newProject.trim()}>Créer</button>
        </form>
        <div className="notif">
          {perm === 'granted' ? <span className="ok">Notifications activées</span>
            : perm === 'unsupported' ? <span>Rappels affichés dans l’app</span>
            : <button className="btn" onClick={async () => setPerm(await requestNotifications())}>Activer les notifications</button>}
          {perm === 'denied' && <span className="hint">Bloquées par le navigateur : les rappels s’affichent dans l’app.</span>}
        </div>
      </nav>

      <main className="main">{main}</main>

      {selected && (
        <TaskPanel task={selected} projects={projects} siblings={tasks.filter((t) => t.projectId && t.projectId === selected.projectId)}
          onClose={() => setSelectedId(null)} onError={setFlash} />
      )}

      <div className="toasts" aria-live="polite">
        {flash && <div className="toast toast-info">{flash}</div>}
        {alerts.map(({ task }) => (
          <div key={task.id} className="toast" role="alert">
            <span className="toast-time">{task.time ?? 'Rappel'}</span>
            <strong>{task.title}</strong>
            <div className="toast-actions">
              <button className="btn btn-primary" onClick={() => { updateTask(task.id, { status: 'done' }); dismiss(task.id) }}>Terminé</button>
              <button className="btn" onClick={() => { db.tasks.update(task.id, { notifiedAt: undefined, snoozeUntil: Date.now() + 10 * 60_000 }); dismiss(task.id) }}>Dans 10 min</button>
              <button className="btn btn-ghost" onClick={() => { setSelectedId(task.id); dismiss(task.id) }}>Ouvrir</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
