import { useMemo } from 'react'
import {
  Background, Controls, Handle, Position, ReactFlow,
  type Connection, type Edge, type Node, type NodeProps,
} from '@xyflow/react'
import dagre from '@dagrejs/dagre'
import type { Task } from './types'
import { STATUS_LABEL } from './types'
import { formatDay, isBlocked } from './logic'
import { updateTask } from './db'

type StepData = { task: Task; blocked: boolean; resources: number; selected: boolean; now: Date }
type StepNode = Node<StepData, 'step'>

const W = 220
const H = 74

function Step({ data }: NodeProps<StepNode>) {
  const { task, blocked, resources, selected, now } = data
  return (
    <div className={`step step-${task.status}${blocked ? ' step-blocked' : ''}${selected ? ' step-selected' : ''}`} style={{ width: W }}>
      <Handle type="target" position={Position.Top} />
      <div className="step-title">{task.title}</div>
      <div className="step-meta">
        <span className={`dot dot-${task.status}`} />
        <span>{blocked && task.status === 'todo' ? 'Bloquée' : STATUS_LABEL[task.status]}</span>
        {task.date && <span className="step-when">{formatDay(task.date, now)}{task.time ? ` ${task.time}` : ''}</span>}
        {resources > 0 && <span className="step-res">{resources} ress.</span>}
      </div>
      <Handle type="source" position={Position.Bottom} />
    </div>
  )
}

const nodeTypes = { step: Step }

interface Props {
  tasks: Task[]
  resourceCounts: Map<string, number>
  selectedId: string | null
  now: Date
  onSelect: (id: string | null) => void
  onConnectError: (msg: string) => void
  wouldCycle: (from: string, to: string) => boolean
}

export function Roadmap({ tasks, resourceCounts, selectedId, now, onSelect, onConnectError, wouldCycle }: Props) {
  const { nodes, edges } = useMemo(() => {
    const g = new dagre.graphlib.Graph()
    g.setGraph({ rankdir: 'TB', nodesep: 36, ranksep: 64 })
    g.setDefaultEdgeLabel(() => ({}))
    const sorted = [...tasks].sort((a, b) => a.order - b.order)
    for (const t of sorted) g.setNode(t.id, { width: W, height: H })
    const edges: Edge[] = []
    for (const t of sorted) {
      for (const d of t.deps) {
        if (!tasks.some((x) => x.id === d)) continue
        g.setEdge(d, t.id)
        const dep = tasks.find((x) => x.id === d)!
        edges.push({
          id: `${d}->${t.id}`,
          source: d,
          target: t.id,
          className: dep.status === 'done' ? 'edge-done' : 'edge-open',
          animated: dep.status === 'doing',
        })
      }
    }
    dagre.layout(g)
    const nodes: StepNode[] = sorted.map((t) => {
      const p = g.node(t.id)
      return {
        id: t.id,
        type: 'step',
        position: { x: p.x - W / 2, y: p.y - H / 2 },
        data: { task: t, blocked: isBlocked(t, tasks), resources: resourceCounts.get(t.id) ?? 0, selected: t.id === selectedId, now },
        draggable: false,
      }
    })
    return { nodes, edges }
  }, [tasks, resourceCounts, selectedId, now])

  const onConnect = (c: Connection) => {
    if (!c.source || !c.target) return
    const target = tasks.find((t) => t.id === c.target)
    if (!target || target.deps.includes(c.source)) return
    if (wouldCycle(c.source, c.target)) {
      onConnectError('Ce lien créerait une boucle : une étape ne peut pas dépendre d’elle-même.')
      return
    }
    updateTask(target.id, { deps: [...target.deps, c.source] })
  }

  const onEdgesDelete = (deleted: Edge[]) => {
    for (const e of deleted) {
      const target = tasks.find((t) => t.id === e.target)
      if (target) updateTask(target.id, { deps: target.deps.filter((d) => d !== e.source) })
    }
  }

  return (
    <div className="roadmap" aria-label="Roadmap du projet">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onConnect={onConnect}
        onEdgesDelete={onEdgesDelete}
        onNodeClick={(_, n) => onSelect(n.id)}
        onPaneClick={() => onSelect(null)}
        fitView
        fitViewOptions={{ padding: 0.2, maxZoom: 1 }}
        minZoom={0.3}
        proOptions={{ hideAttribution: true }}
        deleteKeyCode={['Backspace', 'Delete']}
      >
        <Background gap={24} size={1} />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  )
}
