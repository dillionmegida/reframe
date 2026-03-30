import { useEffect, useCallback } from 'react'
import { useEditorStore } from '../store/editorStore'
import { useAppStore } from '../store/appStore'
import SourcePanel from '../components/SourcePanel'
import PreviewPanel from '../components/PreviewPanel'
import Timeline from '../components/Timeline'
import Toolbar from '../components/Toolbar'
import { interpolateAtTime } from '../utils/interpolate'

export default function EditorScreen() {
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
    <div className="w-full h-full flex flex-col">
      <Toolbar />
      <div className="flex flex-1 min-h-0 border-b border-border">
        <div className="flex-1 min-w-0 relative">
          <SourcePanel />
        </div>
        <div className="w-[360px] border-l border-border flex-shrink-0 flex">
          <PreviewPanel />
        </div>
      </div>
      <div className="h-[160px] flex-shrink-0">
        <Timeline />
      </div>
    </div>
  )
}
