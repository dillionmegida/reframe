import { useEffect, useCallback } from 'react'
import styled from 'styled-components'
import { useEditorStore } from '../store/editorStore'
import { useAppStore } from '../store/appStore'
import { ExportProvider, useExport } from '../contexts/ExportContext'
import SourcePanel from '../components/SourcePanel'
import PreviewPanel from '../components/PreviewPanel'
import Timeline from '../components/Timeline'
import Toolbar from '../components/Toolbar'
import { interpolateAtTime } from '../utils/interpolate'

const Container = styled.div`
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
`

const MainContent = styled.div`
  display: flex;
  flex: 1;
  min-height: 0;
  border-bottom: 1px solid #2a2a2a;
`

const SourceContainer = styled.div`
  flex: 1;
  min-width: 0;
  position: relative;
`

const PreviewContainer = styled.div`
  width: 360px;
  border-left: 1px solid #2a2a2a;
  flex-shrink: 0;
  display: flex;
`

const TimelineContainer = styled.div`
  height: 160px;
  flex-shrink: 0;
  overflow: visible;
  position: relative;
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
  width: 480px;
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
  font-size: 1rem;
  font-weight: 600;
  color: #e5e5e5;
  margin: 0;
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
  margin: 0;
`

const SliceCard = styled.div`
  padding: 0.875rem;
  border: 1px solid #2a2a2a;
  border-radius: 0.5rem;
  background: rgba(255, 255, 255, 0.02);
  display: flex;
  flex-direction: column;
  gap: 0.625rem;
`

const SliceHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
`

const SliceInfo = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
`

const SliceTitle = styled.div`
  font-size: 0.8125rem;
  font-weight: 500;
  color: #e5e5e5;
`

const SliceTimestamp = styled.div`
  font-family: 'IBM Plex Mono', monospace;
  font-size: 0.6875rem;
  color: #6b7280;
`

const SliceStatus = styled.div`
  display: flex;
  align-items: center;
  gap: 0.5rem;
`

const StatusText = styled.div<{ $state: 'progress' | 'done' | 'error' }>`
  font-size: 0.75rem;
  font-weight: 500;
  color: ${p => p.$state === 'done' ? '#10b981' : p.$state === 'error' ? '#f87171' : '#f97316'};
`

const TimeRemaining = styled.div`
  font-family: 'IBM Plex Mono', monospace;
  font-size: 0.6875rem;
  color: #9ca3af;
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

const CancelButton = styled.button`
  width: 20px;
  height: 20px;
  border-radius: 50%;
  border: none;
  background: rgba(248, 113, 113, 0.2);
  color: #f87171;
  font-size: 14px;
  line-height: 1;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  transition: background-color 0.15s, color 0.15s;

  &:hover {
    background: rgba(248, 113, 113, 0.4);
    color: #fca5a5;
  }
`

function EditorContent() {
  const project = useEditorStore((s) => s.project)
  const isPlaying = useEditorStore((s) => s.isPlaying)
  const currentTime = useEditorStore((s) => s.currentTime)
  const selectedKeyframeId = useEditorStore((s) => s.selectedKeyframeId)
  const selectedSliceId = useEditorStore((s) => s.selectedSliceId)
  const setPlaying = useEditorStore((s) => s.setPlaying)
  const setCurrentTime = useEditorStore((s) => s.setCurrentTime)
  const selectKeyframe = useEditorStore((s) => s.selectKeyframe)
  const addOrUpdateKeyframe = useEditorStore((s) => s.addOrUpdateKeyframe)
  const deleteKeyframe = useEditorStore((s) => s.deleteKeyframe)
  const cloneKeyframeMinus = useEditorStore((s) => s.cloneKeyframeMinus)
  const addSlice = useEditorStore((s) => s.addSlice)
  const selectSlice = useEditorStore((s) => s.selectSlice)
  const deleteSlice = useEditorStore((s) => s.deleteSlice)
  const undo = useEditorStore((s) => s.undo)
  const redo = useEditorStore((s) => s.redo)
  const updateVideo = useAppStore((s) => s.updateVideo)
  
  const { showExportModal, setShowExportModal, sliceProgress, exportComplete, exportError, exportingSlices, isExporting, cancelExport, cancelSliceExport } = useExport()

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!project) return

      const target = e.target as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return

      const fps = 30

      if (e.code === 'Space') {
        e.preventDefault()
        setPlaying(!isPlaying)
        return
      }

      if (e.code === 'ArrowLeft') {
        e.preventDefault()
        if (e.shiftKey) {
          setCurrentTime(currentTime - 5)
        } else {
          setCurrentTime(currentTime - 1 / fps)
        }
        return
      }

      if (e.code === 'ArrowRight') {
        e.preventDefault()
        if (e.shiftKey) {
          setCurrentTime(currentTime + 5)
        } else {
          setCurrentTime(currentTime + 1 / fps)
        }
        return
      }

      if (e.code === 'KeyK') {
        const interp = interpolateAtTime(project.keyframes, currentTime)
        addOrUpdateKeyframe({
          timestamp: currentTime,
          x: interp.x,
          y: interp.y,
          scale: interp.scale,
          easing: 'linear',
        })
        return
      }

      if (e.code === 'KeyS' && !e.metaKey && !e.ctrlKey) {
        addSlice(currentTime)
        return
      }

      if (e.code === 'Backspace' || e.code === 'Delete') {
        if (selectedSliceId) {
          deleteSlice(selectedSliceId)
          return
        }
        if (selectedKeyframeId) {
          deleteKeyframe(selectedKeyframeId)
        }
        return
      }

      if (e.code === 'KeyC' && !e.metaKey && !e.ctrlKey) {
        if (selectedKeyframeId) {
          cloneKeyframeMinus(selectedKeyframeId)
        }
        return
      }

      if (e.code === 'Escape') {
        selectKeyframe(null)
        selectSlice(null)
        return
      }

      if ((e.metaKey || e.ctrlKey) && e.code === 'KeyZ') {
        e.preventDefault()
        if (e.shiftKey) {
          redo()
        } else {
          undo()
        }
        return
      }

      if ((e.metaKey || e.ctrlKey) && e.code === 'KeyE') {
        e.preventDefault()
        // Export modal handled by Toolbar
        return
      }
    },
    [
      project,
      isPlaying,
      currentTime,
      selectedKeyframeId,
      selectedSliceId,
      setPlaying,
      setCurrentTime,
      selectKeyframe,
      addOrUpdateKeyframe,
      deleteKeyframe,
      cloneKeyframeMinus,
      addSlice,
      selectSlice,
      deleteSlice,
      undo,
      redo,
    ]
  )

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  // Auto-save to appStore on keyframe/trim/ratio mutations
  useEffect(() => {
    if (!project) return
    const timer = setTimeout(() => {
      updateVideo(project.id, {
        keyframes: project.keyframes,
        trim: project.trim,
        slices: project.slices,
        outputRatio: project.outputRatio,
        outputWidth: project.outputWidth,
        outputHeight: project.outputHeight,
      })
    }, 500)
    return () => clearTimeout(timer)
  }, [project?.keyframes, project?.trim, project?.slices, project?.outputRatio, project?.id, updateVideo])

  if (!project) return null

  return (
    <Container>
      <Toolbar />
      <MainContent>
        <SourceContainer>
          <SourcePanel />
        </SourceContainer>
        <PreviewContainer>
          <PreviewPanel />
        </PreviewContainer>
      </MainContent>
      <TimelineContainer>
        <Timeline />
      </TimelineContainer>
      
      {showExportModal && (
        <ModalBackdrop>
          <Modal>
            <ModalTitle>
              {exportComplete ? '✓ Export Complete' : exportError ? '✗ Export Failed' : 
               exportingSlices.length === 1 ? 'Exporting Slice' : `Exporting ${exportingSlices.length} Slices`}
            </ModalTitle>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
              {exportingSlices.map((slice: any, idx: number) => {
                const state = sliceProgress[slice.id]
                const pct = Math.round(state?.progress ?? 0)
                const isDone = state?.state === 'done'
                const isError = state?.state === 'error'
                const timeRemaining = state?.estimatedTimeRemaining

                // Format time for display
                const formatTime = (seconds: number) => {
                  const roundedSeconds = Math.round(seconds)
                  if (roundedSeconds < 60) {
                    return `${roundedSeconds}s`
                  }
                  const mins = Math.floor(roundedSeconds / 60)
                  const secs = roundedSeconds % 60
                  return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`
                }

                const formatSliceTime = (seconds: number) => {
                  const roundedSeconds = Math.round(seconds)
                  if (roundedSeconds < 60) {
                    return `${roundedSeconds}s`
                  }
                  const mins = Math.floor(roundedSeconds / 60)
                  const secs = roundedSeconds % 60
                  return secs > 0 ? `${mins}m${secs}s` : `${mins}m`
                }

                return (
                  <SliceCard key={slice.id}>
                    <SliceHeader>
                      <SliceInfo>
                        <SliceTitle>Slice {idx + 1}</SliceTitle>
                        <SliceTimestamp>
                          {formatSliceTime(slice.start)} → {formatSliceTime(slice.end)}
                        </SliceTimestamp>
                      </SliceInfo>
                      <SliceStatus>
                        {!isDone && !isError && timeRemaining !== undefined && timeRemaining > 0 && (
                          <TimeRemaining>{formatTime(timeRemaining)} left</TimeRemaining>
                        )}
                        <StatusText $state={state?.state || 'progress'}>
                          {isDone ? 'Done' : isError ? 'Failed' : `${pct}%`}
                        </StatusText>
                        {isExporting && !isDone && !isError && (
                          <CancelButton onClick={() => cancelSliceExport(slice.id)} title="Cancel export">
                            ×
                          </CancelButton>
                        )}
                      </SliceStatus>
                    </SliceHeader>

                    {!isDone && !isError && (
                      <ProgressTrack>
                        <ProgressFill $pct={pct} />
                      </ProgressTrack>
                    )}

                    {isDone && state?.path && (
                      <PrimaryGhost onClick={() => window.electron.showInFolder(state.path!)}>
                        Show in Folder
                      </PrimaryGhost>
                    )}

                    {isError && state?.error && <ErrorText>{state.error}</ErrorText>}
                  </SliceCard>
                )
              })}
            </div>

            {exportError && <ErrorText>{exportError}</ErrorText>}

            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', marginTop: '0.25rem' }}>
              {isExporting && (
                <SecondaryGhost onClick={cancelExport}>
                  Cancel All
                </SecondaryGhost>
              )}
              {(exportComplete || exportError) && (
                <SecondaryGhost onClick={() => setShowExportModal(false)}>Close</SecondaryGhost>
              )}
            </div>
          </Modal>
        </ModalBackdrop>
      )}
    </Container>
  )
}

export default function EditorScreen() {
  return (
    <ExportProvider>
      <EditorContent />
    </ExportProvider>
  )
}
