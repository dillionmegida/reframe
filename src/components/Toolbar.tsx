import { useState } from 'react'
import styled from 'styled-components'
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

const Bar = styled.div`
  height: 3rem;
  display: flex;
  align-items: center;
  padding: 0 1rem;
  gap: 0.75rem;
  border-bottom: 1px solid #2a2a2a;
  background: #161616;
  position: relative;
  flex-shrink: 0;

  &::after {
    content: '';
    position: absolute;
    inset: 0;
    background-image: url('/assets/noise.svg');
    background-repeat: repeat;
    opacity: 0.4;
    pointer-events: none;
  }

  > * {
    position: relative;
    z-index: 1;
  }
`

const Spacer = styled.div`
  flex: 1;
`

const Ghost = styled.div`
  width: 4rem;
`

const IconButton = styled.button`
  color: #6b7280;
  background: transparent;
  border: none;
  padding: 0.25rem 0.5rem;
  border-radius: 0.375rem;
  font-size: 0.75rem;
  cursor: pointer;
  transition: color 0.2s, background-color 0.2s;

  &:hover {
    color: #e5e5e5;
    background: rgba(255, 255, 255, 0.05);
  }
`

const Divider = styled.div`
  width: 1px;
  height: 1.25rem;
  background: #2a2a2a;
`

const RatioGroup = styled.div`
  display: flex;
  gap: 0.25rem;
`

const RatioButton = styled.button<{ $active: boolean }>`
  padding: 0.25rem 0.6rem;
  font-size: 0.75rem;
  border-radius: 0.375rem;
  border: none;
  cursor: pointer;
  transition: background-color 0.2s, color 0.2s;
  background: ${(p) => (p.$active ? '#f97316' : 'transparent')};
  color: ${(p) => (p.$active ? '#000' : '#6b7280')};
  font-weight: ${(p) => (p.$active ? 600 : 400)};

  &:hover {
    background: ${(p) => (p.$active ? 'rgba(249, 115, 22, 0.9)' : 'rgba(255, 255, 255, 0.05)')};
    color: ${(p) => (p.$active ? '#000' : '#e5e5e5')};
  }
`

const TrimText = styled.span`
  font-family: 'IBM Plex Mono', monospace;
  font-size: 0.75rem;
  color: #6b7280;
`

const HistoryButton = styled.button<{ $enabled: boolean }>`
  padding: 0.25rem 0.5rem;
  font-size: 0.875rem;
  border-radius: 0.375rem;
  border: none;
  cursor: ${(p) => (p.$enabled ? 'pointer' : 'not-allowed')};
  color: ${(p) => (p.$enabled ? '#e5e5e5' : 'rgba(229, 229, 229, 0.3)')};
  background: transparent;
  transition: background-color 0.2s;

  &:hover {
    background: ${(p) => (p.$enabled ? 'rgba(255, 255, 255, 0.05)' : 'transparent')};
  }
`

const ExportButton = styled.button<{ $enabled: boolean }>`
  padding: 0.45rem 1rem;
  font-size: 0.75rem;
  font-weight: 600;
  border-radius: 0.375rem;
  border: none;
  cursor: ${(p) => (p.$enabled ? 'pointer' : 'not-allowed')};
  background: ${(p) => (p.$enabled ? '#f97316' : 'rgba(255, 255, 255, 0.05)')};
  color: ${(p) => (p.$enabled ? '#000' : 'rgba(107, 114, 128, 0.4)')};
  transition: background-color 0.2s;

  &:hover {
    background: ${(p) => (p.$enabled ? 'rgba(249, 115, 22, 0.9)' : 'rgba(255, 255, 255, 0.05)')};
  }
`

const ModalBackdrop = styled.div`
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
`

const Modal = styled.div`
  width: 380px;
  background: #161616;
  border: 1px solid #2a2a2a;
  border-radius: 0.75rem;
  padding: 1.5rem;
  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.6);
  display: flex;
  flex-direction: column;
  gap: 1rem;
`

const ModalTitle = styled.h2`
  font-size: 0.875rem;
  font-weight: 600;
  color: #e5e5e5;
`

const ProgressTrack = styled.div`
  width: 100%;
  height: 0.5rem;
  background: #2a2a2a;
  border-radius: 9999px;
  overflow: hidden;
`

const ProgressFill = styled.div<{ $pct: number }>`
  height: 100%;
  background: #f97316;
  width: ${(p) => Math.max(0, Math.min(100, p.$pct))}%;
  transition: width 0.3s ease;
  border-radius: 9999px;
`

const MonoText = styled.p`
  font-family: 'IBM Plex Mono', monospace;
  font-size: 0.75rem;
  color: #6b7280;
`

const ErrorText = styled.p`
  font-size: 0.875rem;
  color: #f87171;
`

const PrimaryGhost = styled.button`
  padding: 0.6rem 1rem;
  font-size: 0.75rem;
  font-weight: 600;
  border-radius: 0.375rem;
  border: none;
  background: rgba(255, 255, 255, 0.05);
  color: #e5e5e5;
  cursor: pointer;
  transition: background-color 0.2s;

  &:hover {
    background: rgba(255, 255, 255, 0.1);
  }
`

const SecondaryGhost = styled.button`
  padding: 0.6rem 1rem;
  font-size: 0.75rem;
  border-radius: 0.375rem;
  border: none;
  background: rgba(255, 255, 255, 0.05);
  color: #6b7280;
  cursor: pointer;
  transition: background-color 0.2s;

  &:hover {
    background: rgba(255, 255, 255, 0.1);
  }
`

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
  const [sliceProgress, setSliceProgress] = useState<Record<string, {
    progress: number
    state: 'progress' | 'done' | 'error'
    path?: string
    error?: string
  }>>({})
  const [exportComplete, setExportComplete] = useState(false)
  const [exportError, setExportError] = useState<string | null>(null)

  const exportableSlices = (project.slices || []).filter((s) => s.status === 'keep')
  const hasExportableSlices = exportableSlices.length > 0

  const handleExport = async () => {
    if (!hasExportableSlices) return

    setShowExportModal(true)
    setExportComplete(false)
    setExportError(null)
    setSliceProgress(
      Object.fromEntries(
        exportableSlices.map((s) => [s.id, { progress: 0, state: 'progress' as const }])
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
        const existing = prev[sliceId] || { progress: 0, state: 'progress' as const }
        return {
          ...prev,
          [sliceId]: {
            ...existing,
            progress: typeof progress === 'number' ? progress : existing.progress,
            state: state || existing.state,
            path: path || existing.path,
            error: error || existing.error,
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
          next[sliceId] = { ...existing, progress: 100, state: 'done', path }
        })
        return next
      })
    })

    try {
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
    }
  }

  return (
    <>
      <Bar style={{ WebkitAppRegion: 'drag' } as any}>
        <Ghost />

        <IconButton
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
          <LeftCaretIcon size={20} />
        </IconButton>

        <Divider />

        <RatioGroup style={{ WebkitAppRegion: 'no-drag' } as any}>
          {ratioOptions.map((opt) => (
            <RatioButton
              key={opt.value}
              $active={project.outputRatio === opt.value}
              onClick={() => setOutputRatio(opt.value, opt.w, opt.h)}
            >
              {opt.label}
            </RatioButton>
          ))}
        </RatioGroup>

        <Divider />

        <TrimText style={{ WebkitAppRegion: 'no-drag' } as any}>
          {formatTime(project.trim.start)} – {formatTime(project.trim.end)}
        </TrimText>

        <Spacer />

        <div style={{ display: 'flex', gap: '0.25rem', WebkitAppRegion: 'no-drag' } as any}>
          <HistoryButton $enabled={past.length > 0} onClick={undo} disabled={past.length === 0} title="Undo (Cmd+Z)">
            ↩
          </HistoryButton>
          <HistoryButton $enabled={future.length > 0} onClick={redo} disabled={future.length === 0} title="Redo (Cmd+Shift+Z)">
            ↪
          </HistoryButton>
        </div>

        <ExportButton
          onClick={handleExport}
          disabled={!hasExportableSlices}
          $enabled={hasExportableSlices}
          style={{ WebkitAppRegion: 'no-drag' } as any}
        >
          {hasExportableSlices
            ? `Export ${exportableSlices.length} Slice${exportableSlices.length !== 1 ? 's' : ''}`
            : 'Export'}
        </ExportButton>
      </Bar>

      {showExportModal && (
        <ModalBackdrop>
          <Modal>
            <ModalTitle>
              {exportComplete ? 'Export Complete' : exportError ? 'Export Failed' : 'Exporting...'}
            </ModalTitle>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {exportableSlices.map((slice, idx) => {
                const state = sliceProgress[slice.id]
                const pct = Math.round(state?.progress ?? 0)
                const isDone = state?.state === 'done'
                const isError = state?.state === 'error'

                return (
                  <div
                    key={slice.id}
                    style={{
                      padding: '0.75rem 0.75rem 0.5rem',
                      border: '1px solid #2a2a2a',
                      borderRadius: '0.5rem',
                      background: 'rgba(255, 255, 255, 0.02)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '0.35rem',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <MonoText style={{ color: '#e5e5e5' }}>Slice {idx + 1}</MonoText>
                      <MonoText style={{ color: isDone ? '#10b981' : isError ? '#f87171' : '#6b7280' }}>
                        {isDone ? 'Completed' : isError ? 'Failed' : `${pct}%`}
                      </MonoText>
                    </div>

                    {!isDone && !isError && (
                      <ProgressTrack>
                        <ProgressFill $pct={pct} />
                      </ProgressTrack>
                    )}

                    {isDone && state?.path && (
                      <PrimaryGhost onClick={() => window.electron.showInFolder(state.path!)}>
                        Show file
                      </PrimaryGhost>
                    )}

                    {isError && state?.error && <ErrorText>{state.error}</ErrorText>}
                  </div>
                )
              })}
            </div>

            {exportError && <ErrorText>{exportError}</ErrorText>}

            {(exportComplete || exportError) && (
              <SecondaryGhost onClick={() => setShowExportModal(false)}>Close</SecondaryGhost>
            )}
          </Modal>
        </ModalBackdrop>
      )}
    </>
  )
}
