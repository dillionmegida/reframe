import { createContext, useContext, useState, ReactNode, useRef } from 'react'

interface ExportProgress {
  progress: number
  state: 'progress' | 'done' | 'error'
  path?: string
  error?: string
  startTime?: number
  estimatedTimeRemaining?: number
}

interface ExportContextType {
  showExportModal: boolean
  setShowExportModal: (show: boolean) => void
  sliceProgress: Record<string, ExportProgress>
  setSliceProgress: (progress: Record<string, ExportProgress>) => void
  exportComplete: boolean
  setExportComplete: (complete: boolean) => void
  exportError: string | null
  setExportError: (error: string | null) => void
  exportingSlices: any[]
  isExporting: boolean
  cancelExport: () => void
  cancelSliceExport: (sliceId: string) => Promise<void>
  startExport: (slices: any[], project: any, basePath: string, projectName: string, videoId: string) => Promise<void>
}

const ExportContext = createContext<ExportContextType | null>(null)

export function ExportProvider({ children }: { children: ReactNode }) {
  const [showExportModal, setShowExportModal] = useState(false)
  const [sliceProgress, setSliceProgress] = useState<Record<string, ExportProgress>>({})
  const [exportComplete, setExportComplete] = useState(false)
  const [exportError, setExportError] = useState<string | null>(null)
  const [exportingSlices, setExportingSlices] = useState<any[]>([])
  const [isExporting, setIsExporting] = useState(false)
  const jobIdRef = useRef<string>('')

  const cancelExport = () => {
    setIsExporting(false)
    setExportError('Export cancelled')
    // Cancel all active jobs
    if (jobIdRef.current) {
      window.electron.cancelExport(jobIdRef.current)
    }
  }

  const cancelSliceExport = async (sliceId: string) => {
    const fullJobId = `${jobIdRef.current}-${sliceId}`
    await window.electron.cancelExport(fullJobId)
    
    // Update progress to show cancelled state
    setSliceProgress((prev) => ({
      ...prev,
      [sliceId]: { ...prev[sliceId], state: 'error', error: 'Cancelled' },
    }))
  }

  const startExport = async (slices: any[], project: any, basePath: string, projectName: string, videoId: string) => {
    const exportJobId = `export-${Date.now()}`
    jobIdRef.current = exportJobId
    
    setShowExportModal(true)
    setExportComplete(false)
    setExportError(null)
    setExportingSlices(slices)
    setIsExporting(true)
    setSliceProgress(
      Object.fromEntries(
        slices.map((s) => [s.id, { progress: 0, state: 'progress' as const, startTime: Date.now() }])
      )
    )

    window.electron.onExportProgress((payload: any) => {
      if (!payload || typeof payload !== 'object') return
      const { sliceId, progress, state, path, error } = payload as {
        sliceId?: string
        progress?: number
        state?: 'progress' | 'done' | 'error'
        path?: string
        error?: string
      }
      if (!sliceId) return

      setSliceProgress((prev) => {
        const existing = prev[sliceId] || { progress: 0, state: 'progress' as const, startTime: Date.now() }
        const newProgress = typeof progress === 'number' ? progress : existing.progress
        
        // Calculate estimated time remaining
        let estimatedTimeRemaining: number | undefined
        if (newProgress > 0 && newProgress < 100 && existing.startTime) {
          const elapsed = Date.now() - existing.startTime
          const progressFraction = newProgress / 100
          const totalEstimated = elapsed / progressFraction
          estimatedTimeRemaining = Math.max(0, (totalEstimated - elapsed) / 1000) // in seconds
        }
        
        return {
          ...prev,
          [sliceId]: {
            ...existing,
            progress: newProgress,
            state: state || existing.state,
            path: path || existing.path,
            error: error || existing.error,
            estimatedTimeRemaining,
          },
        }
      })
    })

    window.electron.onExportDone((payload: any) => {
      setExportComplete(true)

      const results: { sliceId: string; path: string }[] = Array.isArray(payload?.results)
        ? payload.results
        : []

      if (results.length === 0) return

      setSliceProgress((prev) => {
        const next = { ...prev }
        results.forEach(({ sliceId, path }) => {
          const existing = next[sliceId] || { progress: 0, state: 'progress' as const }
          // Don't override cancelled/error state
          if (existing.state === 'error') return
          next[sliceId] = { ...existing, progress: 100, state: 'done', path }
        })
        return next
      })
    })

    try {
      await window.electron.exportVideo({
        project,
        slices,
        basePath,
        projectName,
        videoId,
        jobId: exportJobId,
      })
    } catch (err: any) {
      setExportError(err.message || 'Export failed')
    } finally {
      setIsExporting(false)
    }
  }

  return (
    <ExportContext.Provider value={{
      showExportModal,
      setShowExportModal,
      sliceProgress,
      setSliceProgress,
      exportComplete,
      setExportComplete,
      exportError,
      setExportError,
      exportingSlices,
      isExporting,
      cancelExport,
      cancelSliceExport,
      startExport
    }}>
      {children}
    </ExportContext.Provider>
  )
}

export function useExport() {
  const context = useContext(ExportContext)
  if (!context) {
    throw new Error('useExport must be used within ExportProvider')
  }
  return context
}
