import { useState, useCallback, useMemo, DragEvent } from 'react'
import { v4 as uuidv4 } from 'uuid'
import { useAppStore } from '../store/appStore'
import { useEditorStore } from '../store/editorStore'

export default function ProjectDetail({ projectId }: { projectId: string }) {
  const projects = useAppStore((s) => s.projects)
  const allVideos = useAppStore((s) => s.videos)
  const project = useMemo(() => projects.find((p) => p.id === projectId), [projects, projectId])
  const videos = useMemo(
    () => allVideos.filter((v) => v.projectId === projectId),
    [allVideos, projectId]
  )
  const addVideo = useAppStore((s) => s.addVideo)
  const removeVideo = useAppStore((s) => s.removeVideo)
  const navigate = useAppStore((s) => s.navigate)
  const loadEditorProject = useEditorStore((s) => s.loadProject)

  const [isDragging, setIsDragging] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; videoId: string } | null>(null)

  const processFile = useCallback(
    async (filePath: string) => {
      setLoading(true)
      setError(null)
      try {
        const meta = await window.electron.getVideoMetadata(filePath)
        const videoId = addVideo(projectId, {
          videoPath: filePath,
          videoDuration: meta.duration,
          videoWidth: meta.width,
          videoHeight: meta.height,
          outputRatio: '9:16',
          outputWidth: 1080,
          outputHeight: 1920,
          trim: { start: 0, end: meta.duration },
          keyframes: [
            {
              id: uuidv4(),
              timestamp: 0,
              x: 0.5,
              y: 0.5,
              scale: 1.0,
              easing: 'linear',
            },
          ],
        })
        // Open the editor immediately
        const video = useAppStore.getState().getVideo(videoId)
        if (video) {
          loadEditorProject(video)
          navigate({ view: 'editor', projectId, videoId })
        }
      } catch (e: any) {
        setError(e.message || 'Failed to read video metadata')
      } finally {
        setLoading(false)
      }
    },
    [projectId, addVideo, navigate, loadEditorProject]
  )

  const handleDragOver = useCallback((e: DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(true)
  }, [])

  const handleDragLeave = useCallback((e: DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
  }, [])

  const handleDrop = useCallback(
    async (e: DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
      setIsDragging(false)
      const files = e.dataTransfer.files
      if (files.length > 0) {
        try {
          const filePath = window.electron.getPathForFile(files[0])
          if (filePath) { processFile(filePath); return }
        } catch { /* fallback */ }
        const file = files[0] as File & { path?: string }
        if (file.path) { processFile(file.path); return }
        setError('Could not read file path. Please use the button.')
      }
    },
    [processFile]
  )

  const handleOpenFile = useCallback(async () => {
    const filePath = await window.electron.openFile()
    if (filePath) processFile(filePath)
  }, [processFile])

  const handleOpenVideo = useCallback(
    (videoId: string) => {
      const video = useAppStore.getState().getVideo(videoId)
      if (video) {
        loadEditorProject(video)
        navigate({ view: 'editor', projectId, videoId })
      }
    },
    [projectId, navigate, loadEditorProject]
  )

  if (!project) return null

  const sorted = [...videos].sort((a, b) => b.addedAt - a.addedAt)

  return (
    <div
      className="w-full h-full flex flex-col overflow-hidden"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Header */}
      <div
        className="h-12 flex items-center px-4 gap-3 border-b border-border panel-bg flex-shrink-0"
        style={{ WebkitAppRegion: 'drag' } as any}
      >
        <span className="text-sm font-medium text-text-primary" style={{ WebkitAppRegion: 'no-drag' } as any}>
          {project.name}
        </span>
        <span className="text-xs text-text-muted">
          {videos.length} video{videos.length !== 1 ? 's' : ''}
        </span>
        <div className="flex-1" />
        <button
          onClick={handleOpenFile}
          disabled={loading}
          className="px-3 py-1.5 text-xs font-medium rounded bg-accent text-black hover:bg-accent/90 disabled:opacity-50 transition-colors"
          style={{ WebkitAppRegion: 'no-drag' } as any}
        >
          {loading ? 'Reading...' : '+ Add Video'}
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {error && (
          <div className="mb-4 px-3 py-2 rounded bg-red-500/10 border border-red-500/20 text-red-400 text-xs">
            {error}
          </div>
        )}

        {sorted.length === 0 ? (
          <div
            className={`flex flex-col items-center justify-center gap-4 py-16 rounded-xl border-2 border-dashed transition-all duration-200 ${
              isDragging ? 'border-accent bg-accent/5' : 'border-border'
            }`}
          >
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke={isDragging ? '#f97316' : '#6b7280'} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
            <div className="text-center">
              <p className="text-sm text-text-primary">Drop a video or click "Add Video"</p>
              <p className="text-xs text-text-muted mt-1">MP4, MOV, AVI, MKV, WebM</p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-2">
            {sorted.map((v) => {
              const fileName = v.videoPath.split('/').pop() || v.videoPath
              return (
                <button
                  key={v.id}
                  className="flex items-center gap-3 px-3 py-3 rounded-lg hover:bg-white/5 transition-colors text-left group"
                  onClick={() => handleOpenVideo(v.id)}
                  onContextMenu={(e) => {
                    e.preventDefault()
                    setContextMenu({ x: e.clientX, y: e.clientY, videoId: v.id })
                  }}
                >
                  <div className="w-10 h-10 rounded bg-white/5 flex items-center justify-center flex-shrink-0">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#f97316" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polygon points="5 3 19 12 5 21 5 3" />
                    </svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-text-primary truncate">{fileName}</div>
                    <div className="text-[11px] text-text-muted">
                      {v.videoWidth}x{v.videoHeight} &middot; {Math.round(v.videoDuration)}s &middot; {v.outputRatio}
                    </div>
                  </div>
                  <span className="text-[11px] text-text-muted opacity-0 group-hover:opacity-100 transition-opacity">
                    Edit
                  </span>
                </button>
              )
            })}
          </div>
        )}
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
                removeVideo(contextMenu.videoId)
                setContextMenu(null)
              }}
            >
              Remove video
            </button>
          </div>
        </>
      )}
    </div>
  )
}
