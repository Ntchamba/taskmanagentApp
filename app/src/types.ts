export type Status = 'todo' | 'doing' | 'done' | 'skipped'
export type ResourceKind = 'article' | 'video' | 'cours' | 'doc' | 'note'

export interface Project {
  id: string
  name: string
  createdAt: number
}

export interface Task {
  id: string
  /** null = boîte de réception (tâche hors projet) */
  projectId: string | null
  title: string
  description: string
  status: Status
  /** AAAA-MM-JJ */
  date?: string
  /** HH:MM */
  time?: string
  /** minutes d'avance pour le rappel (0 = à l'heure exacte) */
  remindBefore: number
  /** horodatage du dernier rappel envoyé */
  notifiedAt?: number
  /** rappel reporté jusqu'à cet horodatage */
  snoozeUntil?: number
  /** ids des tâches à terminer avant celle-ci */
  deps: string[]
  order: number
  createdAt: number
}

export interface Resource {
  id: string
  taskId: string
  title: string
  url: string
  kind: ResourceKind
  done: boolean
}

export const STATUS_LABEL: Record<Status, string> = {
  todo: 'À faire',
  doing: 'En cours',
  done: 'Terminé',
  skipped: 'Ignoré',
}

export const KIND_LABEL: Record<ResourceKind, string> = {
  article: 'Article',
  video: 'Vidéo',
  cours: 'Cours',
  doc: 'Documentation',
  note: 'Note',
}
