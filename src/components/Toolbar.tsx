import { useState } from 'react'
import { LeftCaretIcon } from './icons'
import { useEditorStore } from '../store/editorStore'
import { useAppStore } from '../store/appStore'
import type { AspectRatio } from '../types'

function formatTime(s: number): string {
  const m = Math.floor(s / 60)
  const sec = s - m * 60
  return `${String(m).padStart(2, '0')}:${sec.toFixed(1).padStart(4, '0')}`
}

const ratioOptions: { label: string; value: AspectRatio; w: number; h: number }[] = [
  { label: '9:16', value: '9:16', w: 1080, h: 1920 },
  { label: '4:5', value: '4:5', w: 1080, h: 1350 },
  { label: '1:1', value: '1:1', w: 1080, h: 1080 },
]

export default function Toolbar() {
  const project = useEditorStore((s) => s.project!)
  const past = useEditorStore((s) => s.past)
  const future = useEditorStore((s) => s.future)
  const undo = useEditorStore((s) => s.undo)
  const redo = useEditorStore((s) => s.redo)
  const setOutputRatio = useEditorStore((s) => s.setOutputRatio)
  const closeProject = useEditorStore((s) => s.closeProject)
  const navigate = useAppStore((s) => s.navigate)
  const route = useAppStore((s) => s.route)
  const basePath = useAppStore((s) => s.basePath)
  const getProject = useAppStore((s) => s.getProject)

  const [showExportModal, setShowExportModal] = useState(false)
  const [exportProgress, setExportProgress] = useState<number | null>(null)
  const [exportDone, setExportDone] = useState<string | null>(null)
  const [exportError, setExportError] = useState<string | null>(null)

  const exportableSlices = (project.slices || []).filter((s) => s.status === 'keep')
  const hasExportableSlices = exportableSlices.length > 0

  const handleExport = async () => {
    if (!hasExportableSlices) return

    setShowExportModal(true)
    setExportProgress(0)
    setExportDone(null)
    setExportError(null)

    window.electron.onExportProgress((pct: number) => {
      setExportProgress(pct)
    })
    window.electron.onExportDone((path: string) => {
      setExportDone(path)
      setExportProgress(null)
    })

    try {
      // Get project name for export path
      const reframeProject = route.view === 'editor' ? getProject(route.projectId) : null
      const projectName = reframeProject?.name || 'unknown-project'
      
      const result = await window.electron.exportVideo({ 
        project, 
        slices: exportableSlices,
        basePath,
        projectName,
        videoId: project.id,
      })
      if (!result) {
        setShowExportModal(false)
      }
    } catch (err: any) {
      setExportError(err.message || 'Export failed')
      setExportProgress(null)
    }
  }

  return (
    <>
      <div className="h-12 flex items-center px-4 gap-3 border-b border-border panel-bg flex-shrink-0"
        style={{ WebkitAppRegion: 'drag' } as any}
      >
        {/* Drag region spacer for traffic lights */}
        <div className="w-16" />

        {/* Back to project */}
        <button
          className="text-text-muted hover:text-text-primary text-xs px-2 py-1 rounded hover:bg-white/5 transition-colors"
          onClick={() => {
            closeProject()
            if (route.view === 'editor') {
              navigate({ view: 'project', projectId: route.projectId })
            } else {
              navigate({ view: 'projects' })
            }
          }}
          style={{ WebkitAppRegion: 'no-drag' } as any}
          title="Back to project"
        >
          <LeftCaretIcon size={20} className="inline-block" />
        </button>

        {/* Divider */}
        <div className="w-px h-5 bg-border" />

        {/* Ratio buttons */}
        <div className="flex gap-1" style={{ WebkitAppRegion: 'no-drag' } as any}>
          {ratioOptions.map((opt) => (
            <button
              key={opt.value}
              className={`px-2.5 py-1 text-xs rounded transition-colors ${
                project.outputRatio === opt.value
                  ? 'bg-accent text-black font-medium'
                  : 'text-text-muted hover:text-text-primary hover:bg-white/5'
              }`}
              onClick={() => setOutputRatio(opt.value, opt.w, opt.h)}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {/* Divider */}
        <div className="w-px h-5 bg-border" />

        {/* Trim display */}
        <span className="font-mono text-xs text-text-muted" style={{ WebkitAppRegion: 'no-drag' } as any}>
          {formatTime(project.trim.start)} – {formatTime(project.trim.end)}
        </span>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Undo/Redo */}
        <div className="flex gap-1" style={{ WebkitAppRegion: 'no-drag' } as any}>
          <button
            className={`px-2 py-1 text-sm rounded transition-colors ${
              past.length > 0
                ? 'text-text-primary hover:bg-white/5'
                : 'text-text-muted/30 cursor-not-allowed'
            }`}
            onClick={undo}
            disabled={past.length === 0}
            title="Undo (Cmd+Z)"
          >
            ↩
          </button>
          <button
            className={`px-2 py-1 text-sm rounded transition-colors ${
              future.length > 0
                ? 'text-text-primary hover:bg-white/5'
                : 'text-text-muted/30 cursor-not-allowed'
            }`}
            onClick={redo}
            disabled={future.length === 0}
            title="Redo (Cmd+Shift+Z)"
          >
            ↪
          </button>
        </div>

        {/* Export button */}
        <button
          className={`px-4 py-1.5 text-xs font-medium rounded transition-colors ${
            hasExportableSlices
              ? 'bg-accent text-black hover:bg-accent/90'
              : 'bg-white/5 text-text-muted/40 cursor-not-allowed'
          }`}
          onClick={handleExport}
          disabled={!hasExportableSlices}
          style={{ WebkitAppRegion: 'no-drag' } as any}
        >
          {hasExportableSlices
            ? `Export ${exportableSlices.length} Slice${exportableSlices.length !== 1 ? 's' : ''}`
            : 'Export'}
        </button>
      </div>

      {/* Export modal */}
      {showExportModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[100]">
          <div className="bg-panel border border-border rounded-xl p-6 w-[380px] shadow-2xl flex flex-col gap-4">
            <h2 className="text-sm font-medium text-text-primary">
              {exportDone ? 'Export Complete' : exportError ? 'Export Failed' : 'Exporting...'}
            </h2>

            {exportProgress !== null && (
              <div className="w-full h-2 bg-border rounded-full overflow-hidden">
                <div
                  className="h-full bg-accent transition-all duration-300 rounded-full"
                  style={{ width: `${Math.max(0, Math.min(100, exportProgress))}%` }}
                />
              </div>
            )}

            {exportProgress !== null && (
              <p className="font-mono text-xs text-text-muted">
                {Math.round(exportProgress)}%
              </p>
            )}

            {exportError && (
              <p className="text-red-400 text-sm">{exportError}</p>
            )}

            {exportDone && (
              <div className="flex flex-col gap-2">
                <p className="text-text-muted text-xs font-mono break-all">{exportDone}</p>
                <button
                  className="px-4 py-2 text-xs font-medium rounded bg-white/10 text-text-primary hover:bg-white/15 transition-colors"
                  onClick={() => window.electron.showInFolder(exportDone!)}
                >
                  Show in Finder
                </button>
              </div>
            )}

            {(exportDone || exportError) && (
              <button
                className="px-4 py-2 text-xs rounded bg-white/5 text-text-muted hover:bg-white/10 transition-colors"
                onClick={() => setShowExportModal(false)}
              >
                Close
              </button>
            )}
          </div>
        </div>
      )}
    </>
  )
}
