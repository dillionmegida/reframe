import { useState } from 'react'
import { useAppStore } from '../store/appStore'

export default function Sidebar() {
  const projects = useAppStore((s) => s.projects)
  const route = useAppStore((s) => s.route)
  const navigate = useAppStore((s) => s.navigate)
  const createProject = useAppStore((s) => s.createProject)
  const deleteProject = useAppStore((s) => s.deleteProject)
  const [showNew, setShowNew] = useState(false)
  const [newName, setNewName] = useState('')
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; id: string } | null>(null)

  const activeProjectId = route.view !== 'projects' ? route.projectId : null

  const handleCreate = () => {
    const name = newName.trim() || 'Untitled'
    createProject(name)
    setNewName('')
    setShowNew(false)
  }

  const sorted = [...projects].sort((a, b) => b.createdAt - a.createdAt)

  return (
    <div className="w-[200px] h-full flex flex-col panel-bg border-r border-border flex-shrink-0 select-none">
      {/* Header / drag region */}
      <div
        className="h-12 flex items-center px-3 gap-2 border-b border-border flex-shrink-0"
        style={{ WebkitAppRegion: 'drag' } as any}
      >
        <div className="w-[52px]" />
        <span className="text-[11px] font-semibold tracking-[0.15em] text-text-muted uppercase">
          Projects
        </span>
        <div className="flex-1" />
        <button
          className="w-6 h-6 flex items-center justify-center rounded hover:bg-white/10 text-text-muted hover:text-text-primary transition-colors"
          onClick={() => setShowNew(true)}
          style={{ WebkitAppRegion: 'no-drag' } as any}
          title="New project"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        </button>
      </div>

      {/* New project input */}
      {showNew && (
        <div className="px-2 py-2 border-b border-border/50">
          <input
            autoFocus
            className="w-full bg-white/5 border border-border rounded px-2 py-1 text-xs text-text-primary outline-none focus:border-accent"
            placeholder="Project name..."
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleCreate()
              if (e.key === 'Escape') { setShowNew(false); setNewName('') }
            }}
            onBlur={() => { if (!newName.trim()) { setShowNew(false) } }}
          />
        </div>
      )}

      {/* Project list */}
      <div className="flex-1 overflow-y-auto py-1">
        {sorted.length === 0 && !showNew && (
          <div className="px-3 py-6 text-center">
            <p className="text-[11px] text-text-muted">No projects yet</p>
            <button
              className="mt-2 text-[11px] text-accent hover:underline"
              onClick={() => setShowNew(true)}
            >
              Create one
            </button>
          </div>
        )}
        {sorted.map((p) => (
          <button
            key={p.id}
            className={`w-full text-left px-3 py-2 text-xs flex items-center gap-2 transition-colors ${
              activeProjectId === p.id
                ? 'bg-white/10 text-text-primary'
                : 'text-text-muted hover:bg-white/5 hover:text-text-primary'
            }`}
            onClick={() => navigate({ view: 'project', projectId: p.id })}
            onContextMenu={(e) => {
              e.preventDefault()
              setContextMenu({ x: e.clientX, y: e.clientY, id: p.id })
            }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0 opacity-50">
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
            </svg>
            <span className="truncate">{p.name}</span>
          </button>
        ))}
      </div>

      {/* Context menu */}
      {contextMenu && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setContextMenu(null)} />
          <div
            className="fixed bg-panel border border-border rounded-lg shadow-xl py-1 z-50 min-w-[120px]"
            style={{ left: contextMenu.x, top: contextMenu.y }}
          >
            <button
              className="w-full text-left px-3 py-1.5 text-xs text-red-400 hover:bg-white/5"
              onClick={() => {
                deleteProject(contextMenu.id)
                setContextMenu(null)
              }}
            >
              Delete project
            </button>
          </div>
        </>
      )}
    </div>
  )
}
