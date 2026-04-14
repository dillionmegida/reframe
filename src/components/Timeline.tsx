import { useRef, useEffect, useState, useCallback, useMemo, memo } from 'react'
import { createPortal } from 'react-dom'
import styled from 'styled-components'
import { useEditorStore } from '../store/editorStore'
import { useAppStore } from '../store/appStore'
import { useExport } from '../contexts/ExportContext'
import type { SliceStatus } from '../types'
import Playback from './Playback'
import KeyframeInspector from './KeyframeInspector'
import MultiKeyframeInspector from './MultiKeyframeInspector'
import { formatTime } from '../utils/formatTime'

// Memoized component that only re-renders when currentTime changes
const TimelinePlayhead = memo(({ timeToX }: { timeToX: (t: number) => number }) => {
  const currentTime = useEditorStore((s) => s.currentTime)
  
  return (
    <>
      <PlayheadLine style={{ left: timeToX(currentTime) - 1 }} />
      <PlayheadLabel style={{ left: timeToX(currentTime) }}>{formatTime(currentTime)}</PlayheadLabel>
      <Playhead style={{ left: timeToX(currentTime) }} />
    </>
  )
})

const Container = styled.div`
  height: 100%;
  background: #161616;
  border-top: 1px solid #2a2a2a;
  display: flex;
  flex-direction: column;
  position: relative;
  user-select: none;

  &::after {
    content: '';
    position: absolute;
    inset: 0;
    background-image: url('/assets/noise.svg');
    background-repeat: repeat;
    opacity: 0.4;
    pointer-events: none;
    z-index: 0;
  }
`

const ScrollArea = styled.div`
  margin: 0 1.5rem;
  flex: 1;
  min-height: 0;
  overflow-x: auto;
  overflow-y: hidden;
  position: relative;
  z-index: 1;
  cursor: pointer;
  pointer-events: auto;
`

const Filmstrip = styled.div`
  position: relative;
  height: 100%;
  display: flex;
  flex-direction: column;
`

const PlayheadLine = styled.div`
  pointer-events: none;
  position: absolute;
  top: 0;
  bottom: 0;
  width: 2px;
  background: rgba(249, 115, 22, 0.4);
  z-index: 22;
`

const Ruler = styled.div`
  height: 18px;
  position: relative;
  flex-shrink: 0;
  border-bottom: 1px solid rgba(42, 42, 42, 0.5);
`

const Tick = styled.div`
  position: absolute;
  top: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
`

const TickBar = styled.div`
  width: 1px;
  height: 8px;
  background: #2a2a2a;
`

const TickLabel = styled.span`
  font-size: 9px;
  font-family: 'IBM Plex Mono', monospace;
  color: #6b7280;
  line-height: 1;
  margin-top: 2px;
`

const PlayheadLabel = styled.div`
  position: absolute;
  top: -2px;
  transform: translateX(-50%);
  background: #f97316;
  color: #000;
  font-size: 9px;
  font-family: 'IBM Plex Mono', monospace;
  padding: 0 4px;
  border-radius: 2px;
`

const TrackArea = styled.div`
  position: relative;
  flex: 1;
  min-height: 0;
`

const FilmstripCanvas = styled.canvas`
  position: absolute;
  top: 22px;
  left: 0;
  width: 100%;
  height: calc(100% - 22px);
  pointer-events: none;
  z-index: 1;
`

const DimOverlay = styled.div`
  position: absolute;
  top: 0;
  height: 100%;
  background: rgba(0, 0, 0, 0.6);
  pointer-events: none;
  z-index: 10;
`

const TrimHandle = styled.div`
  position: absolute;
  top: 0;
  height: 100%;
  width: 6px;
  background: #3b82f6;
  cursor: ew-resize;
  z-index: 30;
  display: flex;
  align-items: center;
  justify-content: center;
`

const TrimHandleInner = styled.div`
  width: 2px;
  height: 16px;
  background: rgba(255, 255, 255, 0.6);
  border-radius: 9999px;
`

const SliceWrapper = styled.div`
  position: absolute;
  top: 0;
  height: 20px;
  z-index: 15;
`

const SliceBg = styled.div<{ $selected: boolean; $hidden: boolean }>`
  position: absolute;
  inset: 0;
  cursor: pointer;
  background: ${(p) => (p.$hidden ? 'rgba(255,255,255,0.08)' : 'rgba(249,115,22,0.25)')};
  border-top: 2px solid
    ${(p) => (p.$selected ? 'rgba(249,115,22,1)' : 'rgba(249,115,22,0.6)')};
  border-bottom: 2px solid
    ${(p) => (p.$selected ? 'rgba(249,115,22,1)' : 'rgba(249,115,22,0.6)')};
  opacity: ${(p) => (p.$hidden ? 0.5 : 1)};
`

const SliceHandle = styled.div<{ $pos: 'left' | 'right'; $selected: boolean }>`
  position: absolute;
  top: 0;
  height: 100%;
  width: 8px;
  cursor: ew-resize;
  z-index: 30;
  display: flex;
  align-items: center;
  justify-content: center;
  ${(p) => (p.$pos === 'left' ? 'left: -4px;' : 'right: -4px;')}
  background: ${(p) => (p.$selected ? 'rgba(74,222,128,0.6)' : 'rgba(74,222,128,0.3)')};
`

const SliceHandleInner = styled.div`
  width: 2px;
  height: 16px;
  background: rgba(255, 255, 255, 0.6);
  border-radius: 9999px;
`

const SliceActions = styled.div`
  position: absolute;
  bottom: -32px;
  left: 50%;
  transform: translateX(-50%);
  white-space: nowrap;
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 6px;
  border-radius: 0.5rem;
  background: #161616;
  border: 1px solid #2a2a2a;
  box-shadow: 0 10px 25px -8px rgba(0, 0, 0, 0.6);
  z-index: 80;
`

const SliceActionButton = styled.button<{ $active?: boolean; $danger?: boolean }>`
  padding: 4px 8px;
  font-size: 10px;
  border-radius: 0.375rem;
  border: none;
  cursor: pointer;
  background: ${(p) => (p.$active ? '#f97316' : 'rgba(255,255,255,0.05)')};
  color: ${(p) => (p.$active ? '#000' : p.$danger ? '#f87171' : '#6b7280')};
  font-weight: ${(p) => (p.$active ? 600 : 400)};
  transition: background-color 0.15s, color 0.15s;

  &:hover {
    background: ${(p) => (p.$active ? 'rgba(249,115,22,0.9)' : 'rgba(255,255,255,0.1)')};
    color: ${(p) => (p.$danger ? '#f87171' : '#e5e5e5')};
  }
`

const HiddenLabel = styled.span`
  font-size: 9px;
  color: rgba(107, 114, 128, 0.6);
  font-family: 'IBM Plex Mono', monospace;
`

const UntrackedOverlay = styled.div`
  position: absolute;
  top: 0;
  height: 100%;
  background: rgba(251, 146, 60, 0.4);
  cursor: pointer;
  z-index: 18;
`

const KeyframeDot = styled.div<{ $size: number; $active: boolean; $selected: boolean }>`
  position: absolute;
  z-index: 20;
  display: flex;
  align-items: center;
  justify-content: center;
  width: ${(p) => p.$size}px;
  height: ${(p) => p.$size}px;
  margin-top: ${(p) => -p.$size / 2}px;
  top: 0;
  left: 0;
  cursor: pointer;

  > div {
    width: ${(p) => p.$size}px;
    height: ${(p) => p.$size}px;
    transform: rotate(45deg);
    background: ${(p) => (p.$active ? '#ffffff' : '#f97316')};
    border: ${(p) => (p.$selected ? '2px solid #ffffff' : 'none')};
    box-shadow: ${(p) => (p.$active ? '0 0 6px rgba(255,255,255,0.7)' : 'none')};
  }
`

const Playhead = styled.div`
  position: absolute;
  top: 0;
  height: 100%;
  width: 2px;
  background: rgba(249, 115, 22, 0.7);
  z-index: 25;
  pointer-events: none;
`

const Controls = styled.div`
  flex-shrink: 0;
  display: flex;
  align-items: center;
  border-top: 1px solid rgba(42, 42, 42, 0.5);
  padding: 0.5rem;
  position: relative;
  z-index: 1;
`

const ZoomRow = styled.div`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0 0.75rem;
`

const ZoomLabel = styled.span`
  font-size: 10px;
  color: #6b7280;
  font-family: 'IBM Plex Mono', monospace;
`

const ZoomValue = styled.span`
  font-size: 10px;
  color: #6b7280;
  font-family: 'IBM Plex Mono', monospace;
  width: 2rem;
`

const ContextMenu = styled.div`
  position: fixed;
  background: #161616;
  border: 1px solid #2a2a2a;
  border-radius: 0.5rem;
  box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.6);
  padding: 0.25rem 0;
  z-index: 9999;
  min-width: 160px;
`

const ContextItem = styled.button`
  width: 100%;
  text-align: left;
  padding: 0.4rem 0.75rem;
  font-size: 0.875rem;
  color: #e5e5e5;
  background: transparent;
  border: none;
  cursor: pointer;
  transition: background-color 0.15s;

  &:hover {
    background: rgba(255, 255, 255, 0.05);
  }
`

const SelectionBox = styled.div`
  position: absolute;
  border: 2px solid #f97316;
  background: rgba(249, 115, 22, 0.1);
  pointer-events: none;
  z-index: 30;
`

export default function Timeline() {
  const project = useEditorStore((s) => s.project!)
  const selectedKeyframeIds = useEditorStore((s) => s.selectedKeyframeIds)
  const setCurrentTime = useEditorStore((s) => s.setCurrentTime)
  const selectKeyframe = useEditorStore((s) => s.selectKeyframe)
  const selectKeyframes = useEditorStore((s) => s.selectKeyframes)
  const toggleKeyframeSelection = useEditorStore((s) => s.toggleKeyframeSelection)
  const updateKeyframe = useEditorStore((s) => s.updateKeyframe)
  const deleteKeyframe = useEditorStore((s) => s.deleteKeyframe)
  const cloneKeyframeMinus = useEditorStore((s) => s.cloneKeyframeMinus)
  const setTrimStart = useEditorStore((s) => s.setTrimStart)
  const setTrimEnd = useEditorStore((s) => s.setTrimEnd)
  const selectedSliceId = useEditorStore((s) => s.selectedSliceId)
  const selectSlice = useEditorStore((s) => s.selectSlice)
  const updateSlice = useEditorStore((s) => s.updateSlice)
  const setSliceStatus = useEditorStore((s) => s.setSliceStatus)
  const deleteSlice = useEditorStore((s) => s.deleteSlice)
  const tracking = useEditorStore((s) => s.tracking)
  const retrackFromFrame = useEditorStore((s) => s.retrackFromFrame)
  const basePath = useAppStore((s) => s.basePath)
  const route = useAppStore((s) => s.route)
  const getProject = useAppStore((s) => s.getProject)
  const { startExport } = useExport()

  const containerRef = useRef<HTMLDivElement>(null)
  const filmstripRef = useRef<HTMLDivElement>(null)
  const trackAreaRef = useRef<HTMLDivElement>(null)
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const thumbVideoRef = useRef<HTMLVideoElement>(null)
  const filmstripCanvasRef = useRef<HTMLCanvasElement>(null)
  const thumbImagesRef = useRef<Map<string, HTMLImageElement>>(new Map())
  const thumbRequestIdRef = useRef(0)
  const [thumbVersion, setThumbVersion] = useState(0)
  const [viewportWidth, setViewportWidth] = useState(0)
  const [scrollLeft, setScrollLeft] = useState(0)
  const [zoom, setZoom] = useState(() => {
    if (typeof window !== 'undefined' && project.id) {
      const stored = window.localStorage.getItem(`timelineZoom.${project.id}`)
      const parsed = stored ? parseFloat(stored) : NaN
      return Number.isFinite(parsed) ? parsed : 1
    }
    return 1
  })
  const prevZoomRef = useRef(zoom)
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; kfId: string } | null>(null)
  const [dragBox, setDragBox] = useState<{ left: number; top: number; width: number; height: number } | null>(null)
  const [draggingOverIds, setDraggingOverIds] = useState<string[]>([])

  const duration = project.videoDuration
  const trim = project.trim

  const filmstripWidth = viewportWidth * zoom

  const tickInterval = useMemo(() => {
    const pxPerSec = filmstripWidth / duration
    if (pxPerSec > 80) return 1
    if (pxPerSec > 20) return 5
    if (pxPerSec > 8) return 10
    return 30
  }, [duration, filmstripWidth])

  useEffect(() => {
    const update = () => {
      if (scrollContainerRef.current) setViewportWidth(scrollContainerRef.current.clientWidth)
    }
    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [])

  useEffect(() => {
    if (typeof window !== 'undefined' && project.id) {
      window.localStorage.setItem(`timelineZoom.${project.id}`, zoom.toString())
    }
  }, [zoom, project.id])

  useEffect(() => {
    const sc = scrollContainerRef.current
    if (!sc || filmstripWidth <= 0) return
    const prevZoom = prevZoomRef.current
    if (prevZoom === zoom) return
    prevZoomRef.current = zoom
    const currentTime = useEditorStore.getState().currentTime
    const prevFilmstripWidth = viewportWidth * prevZoom
    const playheadX = (currentTime / duration) * prevFilmstripWidth
    const viewportFraction = (playheadX - sc.scrollLeft) / sc.clientWidth
    const newPlayheadX = (currentTime / duration) * filmstripWidth
    sc.scrollLeft = newPlayheadX - viewportFraction * sc.clientWidth
    setScrollLeft(sc.scrollLeft)
  }, [zoom, filmstripWidth, viewportWidth, duration])

  useEffect(() => {
    const sc = scrollContainerRef.current
    if (!sc) return
    const onScroll = () => setScrollLeft(sc.scrollLeft)
    sc.addEventListener('scroll', onScroll)
    onScroll()
    return () => sc.removeEventListener('scroll', onScroll)
  }, [])

  const lastAutoScrollTimeRef = useRef(0)
  // Subscribe to isPlaying to trigger auto-scroll check during playback
  const isPlaying = useEditorStore((s) => s.isPlaying)
  
  useEffect(() => {
    if (!isPlaying) return
    
    const sc = scrollContainerRef.current
    if (!sc || filmstripWidth <= 0) return
    
    let rafId: number
    const checkScroll = () => {
      const currentTime = useEditorStore.getState().currentTime
      const timeDiff = Math.abs(currentTime - lastAutoScrollTimeRef.current)
      
      if (timeDiff >= 0.5) {
        lastAutoScrollTimeRef.current = currentTime
        const playheadX = (currentTime / duration) * filmstripWidth
        const sl = sc.scrollLeft
        const sr = sl + sc.clientWidth
        if (playheadX < sl + 40 || playheadX > sr - 40) {
          sc.scrollLeft = playheadX - sc.clientWidth / 2
          setScrollLeft(sc.scrollLeft)
        }
      }
      
      if (useEditorStore.getState().isPlaying) {
        rafId = requestAnimationFrame(checkScroll)
      }
    }
    
    rafId = requestAnimationFrame(checkScroll)
    return () => cancelAnimationFrame(rafId)
  }, [isPlaying, filmstripWidth, duration])

  const timeToX = useCallback((t: number) => (filmstripWidth > 0 ? (t / duration) * filmstripWidth : 0), [filmstripWidth, duration])
  const xToTime = useCallback((x: number) => (filmstripWidth > 0 ? (x / filmstripWidth) * duration : 0), [filmstripWidth, duration])

  // Time-based grouping: compute a capture interval so ~1 thumb per 80px of timeline
  const THUMB_RENDER_PX = 80
  const captureInterval = useMemo(() => {
    if (filmstripWidth <= 0 || duration <= 0) return 2
    const secsPerPx = duration / filmstripWidth
    const rawInterval = secsPerPx * THUMB_RENDER_PX
    // Snap to nice intervals: 1, 2, 5, 10, 15, 30, 60...
    const nice = [0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300]
    return nice.find((n) => n >= rawInterval) ?? Math.ceil(rawInterval / 60) * 60
  }, [filmstripWidth, duration])

  const THUMB_BUFFER_PX = Math.max(viewportWidth * 0.5, THUMB_RENDER_PX * 4)
  const visibleThumbRegionLeft = Math.max(0, scrollLeft - THUMB_BUFFER_PX)
  const visibleThumbRegionWidth = Math.max(
    0,
    Math.min(filmstripWidth - visibleThumbRegionLeft, viewportWidth + THUMB_BUFFER_PX * 2)
  )
  const visibleThumbSpecs = useMemo(() => {
    if (duration <= 0 || filmstripWidth <= 0 || visibleThumbRegionWidth <= 0) return []
    const slotWidthPx = (captureInterval / duration) * filmstripWidth
    const startTime = Math.max(0, Math.floor(xToTime(visibleThumbRegionLeft) / captureInterval) * captureInterval)
    const endTime = Math.min(duration, xToTime(visibleThumbRegionLeft + visibleThumbRegionWidth) + captureInterval)

    const specs: { key: string; time: number; left: number; width: number }[] = []
    for (let t = startTime; t < endTime; t += captureInterval) {
      const left = timeToX(t)
      const right = timeToX(Math.min(t + captureInterval, duration))
      specs.push({
        key: t.toFixed(2),
        time: t,
        left,
        width: right - left,
      })
    }
    return specs
  }, [duration, filmstripWidth, visibleThumbRegionLeft, visibleThumbRegionWidth, captureInterval, xToTime, timeToX])

  useEffect(() => {
    thumbImagesRef.current.clear()
    setThumbVersion((v) => v + 1)
  }, [project.videoPath])

  useEffect(() => {
    const video = thumbVideoRef.current
    if (!video || !project.videoPath) return
    video.src = `file://${project.videoPath}`
    video.preload = 'auto'
  }, [project.videoPath])

  useEffect(() => {
    const video = thumbVideoRef.current
    if (!video || !project.videoPath || visibleThumbSpecs.length === 0) return

    const pendingByKey = new Map<string, number>()
    visibleThumbSpecs.forEach((spec) => {
      if (!thumbImagesRef.current.has(spec.key) && !pendingByKey.has(spec.key)) {
        pendingByKey.set(spec.key, spec.time)
      }
    })

    const pendingSpecs = Array.from(pendingByKey, ([key, time]) => ({ key, time }))
    if (pendingSpecs.length === 0) return

    let cancelled = false
    const requestId = ++thumbRequestIdRef.current

    const captureCanvas = document.createElement('canvas')
    captureCanvas.width = 480
    captureCanvas.height = 270
    const captureCtx = captureCanvas.getContext('2d')
    if (!captureCtx) return

    let index = 0

    const storeFrame = () => {
      if (cancelled || requestId !== thumbRequestIdRef.current || index >= pendingSpecs.length) return
      const spec = pendingSpecs[index]

      try {
        captureCtx.drawImage(video, 0, 0, 480, 270)
        const dataUrl = captureCanvas.toDataURL('image/jpeg', 0.9)
        const img = new Image()
        img.decoding = 'async'
        img.src = dataUrl
        thumbImagesRef.current.set(spec.key, img)

        if (img.complete) {
          setThumbVersion((v) => v + 1)
        } else {
          const handleLoad = () => {
            img.removeEventListener('load', handleLoad)
            if (!cancelled && requestId === thumbRequestIdRef.current) {
              setThumbVersion((v) => v + 1)
            }
          }
          img.addEventListener('load', handleLoad)
        }
      } catch {
      }

      index += 1
      captureNext()
    }

    const captureNext = () => {
      if (cancelled || requestId !== thumbRequestIdRef.current || index >= pendingSpecs.length) return
      const targetTime = pendingSpecs[index].time

      if (Math.abs(video.currentTime - targetTime) < 0.01) {
        storeFrame()
        return
      }

      video.currentTime = targetTime
    }

    const onSeeked = () => {
      storeFrame()
    }

    const onReady = () => {
      captureNext()
    }

    const onError = () => {
      console.error('[Timeline thumbnails] Video load error:', video.error)
    }

    video.addEventListener('seeked', onSeeked)
    video.addEventListener('error', onError)

    if (video.readyState >= 1) {
      onReady()
    } else {
      video.addEventListener('loadedmetadata', onReady)
    }

    return () => {
      cancelled = true
      video.removeEventListener('seeked', onSeeked)
      video.removeEventListener('loadedmetadata', onReady)
      video.removeEventListener('error', onError)
    }
  }, [project.videoPath, visibleThumbSpecs])

  useEffect(() => {
    const canvas = filmstripCanvasRef.current
    const trackArea = trackAreaRef.current
    if (!canvas) return

    if (!trackArea || visibleThumbRegionWidth <= 0 || visibleThumbSpecs.length === 0) {
      canvas.width = 0
      canvas.height = 0
      return
    }

    const trackH = trackArea.getBoundingClientRect().height
    const canvasHeight = Math.max(0, trackH - 22)
    if (canvasHeight <= 0) return

    const dpr = window.devicePixelRatio || 1
    canvas.width = Math.max(1, Math.round(visibleThumbRegionWidth * dpr))
    canvas.height = Math.max(1, Math.round(canvasHeight * dpr))

    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, visibleThumbRegionWidth, canvasHeight)

    visibleThumbSpecs.forEach((spec) => {
      const img = thumbImagesRef.current.get(spec.key)
      if (!img || !img.complete || !img.naturalWidth) return
      const drawX = spec.left - visibleThumbRegionLeft
      const drawW = spec.width + 0.75

      // object-fit: cover — crop source to match destination aspect ratio
      const srcAspect = img.naturalWidth / img.naturalHeight
      const dstAspect = drawW / canvasHeight
      let sx = 0, sy = 0, sw = img.naturalWidth, sh = img.naturalHeight
      if (srcAspect > dstAspect) {
        // source is wider — crop horizontally
        sw = img.naturalHeight * dstAspect
        sx = (img.naturalWidth - sw) / 2
      } else {
        // source is taller — crop vertically
        sh = img.naturalWidth / dstAspect
        sy = (img.naturalHeight - sh) / 2
      }
      ctx.drawImage(img, sx, sy, sw, sh, drawX, 0, drawW, canvasHeight)
    })
  }, [thumbVersion, visibleThumbRegionLeft, visibleThumbRegionWidth, visibleThumbSpecs])

  const computeIdsInBox = useCallback(
    (boxLeft: number, boxRight: number, boxTop: number, boxBottom: number) => {
      const kfs = useEditorStore.getState().project?.keyframes ?? []
      // kfY: keyframes sit at 50% of TrackArea height (top: 50% in CSS)
      const trackAreaH = trackAreaRef.current?.offsetHeight ?? 60
      const kfY = trackAreaH / 2
      // half-size of the keyframe diamond for overlap check
      const kfHalf = 6
      const ids: string[] = []
      kfs.forEach((kf) => {
        const kfX = timeToX(kf.timestamp)
        if (
          kfX >= boxLeft &&
          kfX <= boxRight &&
          boxTop <= kfY + kfHalf &&
          boxBottom >= kfY - kfHalf
        ) {
          ids.push(kf.id)
        }
      })
      return ids
    },
    [timeToX]
  )

  const handleScrollAreaMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (e.button !== 0) return
      const target = e.target as HTMLElement

      // ── Keyframe dot: start reposition drag ──────────────────────────────
      const kfDot = target.closest('[data-keyframe-dot]') as HTMLElement | null
      if (kfDot) {
        const kfId = kfDot.getAttribute('data-keyframe-id')
        if (!kfId) return
        const sc = scrollContainerRef.current
        if (!sc) return
        const rect = sc.getBoundingClientRect()
        let moved = false
        const onMouseMove = (ev: MouseEvent) => {
          moved = true
          const newT = xToTime(ev.clientX - rect.left + sc.scrollLeft)
          updateKeyframe(kfId, { timestamp: Math.max(trim.start, Math.min(trim.end, newT)) })
        }
        const onMouseUp = () => {
          document.removeEventListener('mousemove', onMouseMove)
          document.removeEventListener('mouseup', onMouseUp)
          // If the mouse barely moved, treat as click — selection handled by onClick
          if (moved) selectKeyframe(kfId)
        }
        document.addEventListener('mousemove', onMouseMove)
        document.addEventListener('mouseup', onMouseUp)
        return
      }

      // ── Slice handles and other interactive children handle themselves ────
      if (target.closest('[data-slice-handle]')) return
      if (target.closest('[data-untracked]')) return

      // ── Empty area: click-to-seek  OR  drag-to-select ───────────────────
      const sc = scrollContainerRef.current
      if (!sc) return
      const scRect = sc.getBoundingClientRect()
      const isCmd = e.metaKey || e.ctrlKey
      const startClientX = e.clientX
      const startClientY = e.clientY

      // X in filmstrip space; Y in TrackArea space (direct from trackAreaRef)
      const trackRect = trackAreaRef.current?.getBoundingClientRect()
      const startFX = startClientX - scRect.left + sc.scrollLeft
      const startFY = startClientY - (trackRect?.top ?? scRect.top)

      let isDragging = false

      const updateBox = (ev: MouseEvent) => {
        const currFX = ev.clientX - scRect.left + sc.scrollLeft
        const currFY = ev.clientY - (trackAreaRef.current?.getBoundingClientRect().top ?? scRect.top)
        const boxLeft = Math.min(startFX, currFX)
        const boxRight = Math.max(startFX, currFX)
        const boxTop = Math.min(startFY, currFY)
        const boxBottom = Math.max(startFY, currFY)
        setDragBox({ left: boxLeft, top: boxTop, width: boxRight - boxLeft, height: boxBottom - boxTop })
        setDraggingOverIds(computeIdsInBox(boxLeft, boxRight, boxTop, boxBottom))
      }

      const onMouseMove = (ev: MouseEvent) => {
        const dx = Math.abs(ev.clientX - startClientX)
        const dy = Math.abs(ev.clientY - startClientY)
        if (!isDragging && (dx > 4 || dy > 4)) isDragging = true
        if (isDragging) updateBox(ev)
      }

      const onMouseUp = (ev: MouseEvent) => {
        document.removeEventListener('mousemove', onMouseMove)
        document.removeEventListener('mouseup', onMouseUp)

        if (!isDragging) {
          // Plain click: seek
          const t = xToTime(ev.clientX - scRect.left + sc.scrollLeft)
          setCurrentTime(Math.max(0, Math.min(duration, t)))
          selectSlice(null)
          selectKeyframes([])
        } else {
          // End of drag: commit selection
          const currFX = ev.clientX - scRect.left + sc.scrollLeft
          const currFY = ev.clientY - (filmstripRef.current?.getBoundingClientRect().top ?? scRect.top)
          const boxLeft = Math.min(startFX, currFX)
          const boxRight = Math.max(startFX, currFX)
          const boxTop = Math.min(startFY, currFY)
          const boxBottom = Math.max(startFY, currFY)
          const ids = computeIdsInBox(boxLeft, boxRight, boxTop, boxBottom)

          if (isCmd) {
            const current = useEditorStore.getState().selectedKeyframeIds
            const merged = [...current]
            ids.forEach((id) => {
              const idx = merged.indexOf(id)
              if (idx >= 0) merged.splice(idx, 1)
              else merged.push(id)
            })
            selectKeyframes(merged)
          } else {
            selectKeyframes(ids)
          }
        }
        setDragBox(null)
        setDraggingOverIds([])
      }

      document.addEventListener('mousemove', onMouseMove)
      document.addEventListener('mouseup', onMouseUp)
    },
    [xToTime, setCurrentTime, selectSlice, selectKeyframe, selectKeyframes, duration, trim, updateKeyframe, computeIdsInBox]
  )

  const handleSliceHandleDrag = useCallback(
    (e: React.MouseEvent, sliceId: string, which: 'start' | 'end') => {
      e.stopPropagation()
      selectSlice(sliceId)

      if (which === 'start') {
        const slice = project.slices.find((s) => s.id === sliceId)
        if (slice) setCurrentTime(slice.start)
      }

      const sc = scrollContainerRef.current
      if (!sc) return
      const rect = sc.getBoundingClientRect()

      const onMouseMove = (ev: MouseEvent) => {
        const newT = xToTime(ev.clientX - rect.left + sc.scrollLeft)
        const clamped = Math.max(trim.start, Math.min(trim.end, newT))
        const slice = useEditorStore.getState().project?.slices.find((s) => s.id === sliceId)
        if (!slice) return
        if (which === 'start') {
          const newStart = Math.min(clamped, slice.end - 0.5)
          updateSlice(sliceId, { start: newStart })
          setCurrentTime(newStart)
        } else {
          const newEnd = Math.max(clamped, slice.start + 0.5)
          updateSlice(sliceId, { end: newEnd })
        }
      }
      const onMouseUp = () => {
        document.removeEventListener('mousemove', onMouseMove)
        document.removeEventListener('mouseup', onMouseUp)
      }
      document.addEventListener('mousemove', onMouseMove)
      document.addEventListener('mouseup', onMouseUp)
    },
    [xToTime, trim, selectSlice, updateSlice, setCurrentTime, project.slices]
  )

  const handleSliceClick = useCallback(
    (e: React.MouseEvent, sliceId: string) => {
      e.stopPropagation()
      selectSlice(sliceId)
      const sc = scrollContainerRef.current
      if (!sc) return
      const rect = sc.getBoundingClientRect()
      const t = xToTime(e.clientX - rect.left + sc.scrollLeft)
      setCurrentTime(t)
    },
    [xToTime, selectSlice, setCurrentTime]
  )

  const handleTrimDrag = useCallback(
    (e: React.MouseEvent, which: 'start' | 'end') => {
      e.stopPropagation()
      const sc = scrollContainerRef.current
      if (!sc) return
      const rect = sc.getBoundingClientRect()

      const onMouseMove = (ev: MouseEvent) => {
        const newT = xToTime(ev.clientX - rect.left + sc.scrollLeft)
        if (which === 'start') setTrimStart(newT)
        else setTrimEnd(newT)
      }
      const onMouseUp = () => {
        document.removeEventListener('mousemove', onMouseMove)
        document.removeEventListener('mouseup', onMouseUp)
      }
      document.addEventListener('mousemove', onMouseMove)
      document.addEventListener('mouseup', onMouseUp)
    },
    [xToTime, setTrimStart, setTrimEnd]
  )

  const handleKeyframeContextMenu = useCallback((e: React.MouseEvent, kfId: string) => {
    e.preventDefault()
    e.stopPropagation()
    setContextMenu({ x: e.clientX, y: e.clientY, kfId })
  }, [])

  const handleExportSlice = useCallback(async (sliceId: string) => {
    console.log('Export slice clicked:', sliceId)
    
    const slice = project.slices.find((s) => s.id === sliceId)
    if (!slice || slice.status !== 'keep' || !basePath) {
      console.error('Slice not found, not keep status, or no basePath:', { sliceId, slice, basePath })
      return
    }

    const reframeProject = route.view === 'editor' ? getProject(route.projectId) : null
    const projectName = reframeProject?.name || 'unknown-project'

    console.log('Exporting slice:', { sliceId, slice, projectName, basePath })

    try {
      await startExport([slice], project, basePath, projectName, project.id)
      console.log('Export completed successfully')
    } catch (err: any) {
      console.error('Export failed:', err)
    }
  }, [project, basePath, route, getProject, startExport])

  useEffect(() => {
    const handler = () => setContextMenu(null)
    if (contextMenu) {
      window.addEventListener('click', handler)
      return () => window.removeEventListener('click', handler)
    }
  }, [contextMenu])

  const ticks = useMemo(() => {
    const arr: number[] = []
    for (let t = 0; t <= duration; t += tickInterval) {
      arr.push(t)
    }
    return arr
  }, [duration, tickInterval])

  return (
    <Container ref={containerRef} data-testid="timeline">
      <video ref={thumbVideoRef} style={{ display: 'none' }} muted playsInline />

      <ScrollArea ref={scrollContainerRef} onMouseDown={handleScrollAreaMouseDown}>
        <Filmstrip ref={filmstripRef} style={{ width: filmstripWidth }}>
          <Ruler>
            {ticks.map((t) => (
              <Tick key={t} style={{ left: timeToX(t) }}>
                <TickBar />
                <TickLabel>{formatTime(t)}</TickLabel>
              </Tick>
            ))}
          </Ruler>
          
          <TimelinePlayhead timeToX={timeToX} />

          <TrackArea ref={trackAreaRef}>
            <FilmstripCanvas ref={filmstripCanvasRef} style={{ left: visibleThumbRegionLeft, width: visibleThumbRegionWidth }} />

            <DimOverlay style={{ left: 0, width: timeToX(trim.start) }} />
            <DimOverlay style={{ left: timeToX(trim.end), width: Math.max(0, filmstripWidth - timeToX(trim.end)) }} />

            <TrimHandle style={{ left: timeToX(trim.start) - 3 }} onMouseDown={(e) => handleTrimDrag(e, 'start')} title={formatTime(trim.start)}>
              <TrimHandleInner />
            </TrimHandle>
            <TrimHandle style={{ left: timeToX(trim.end) - 3 }} onMouseDown={(e) => handleTrimDrag(e, 'end')} title={formatTime(trim.end)}>
              <TrimHandleInner />
            </TrimHandle>

            {project.slices.map((slice) => {
              const leftPx = timeToX(slice.start)
              const widthPx = timeToX(slice.end) - leftPx
              const isSelected = selectedSliceId === slice.id
              const isHidden = slice.status === 'hidden'

              return (
                <SliceWrapper key={slice.id} style={{ left: leftPx, width: widthPx }}>
                  <SliceBg
                    $selected={isSelected}
                    $hidden={isHidden}
                    onMouseDown={(e) => handleSliceClick(e, slice.id)}
                  />
                  <SliceHandle
                    $pos="left"
                    $selected={isSelected}
                    onMouseDown={(e) => handleSliceHandleDrag(e, slice.id, 'start')}
                  >
                    <SliceHandleInner />
                  </SliceHandle>
                  <SliceHandle
                    $pos="right"
                    $selected={isSelected}
                    onMouseDown={(e) => handleSliceHandleDrag(e, slice.id, 'end')}
                  >
                    <SliceHandleInner />
                  </SliceHandle>

                  {isSelected && (
                    <SliceActions onMouseDown={(e) => e.stopPropagation()}>
                      {(['keep', 'hidden'] as SliceStatus[]).map((status) => (
                        <SliceActionButton
                          key={status}
                          $active={slice.status === status}
                          onMouseDown={(e) => e.stopPropagation()}
                          onClick={(e) => {
                            e.stopPropagation()
                            setSliceStatus(slice.id, status)
                          }}
                        >
                          {status === 'keep' ? 'Keep' : 'Hide'}
                        </SliceActionButton>
                      ))}
                      {slice.status === 'keep' && (
                        <SliceActionButton
                          onMouseDown={(e) => e.stopPropagation()}
                          onClick={(e) => {
                            e.stopPropagation()
                            handleExportSlice(slice.id)
                          }}
                        >
                          Export
                        </SliceActionButton>
                      )}
                      <SliceActionButton
                        $danger
                        onMouseDown={(e) => e.stopPropagation()}
                        onClick={(e) => {
                          e.stopPropagation()
                          deleteSlice(slice.id)
                        }}
                      >
                        Delete
                      </SliceActionButton>
                    </SliceActions>
                  )}

                  {isHidden && (
                    <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
                      <HiddenLabel>hidden</HiddenLabel>
                    </div>
                  )}
                </SliceWrapper>
              )
            })}

            {tracking.untrackedRanges.map((range, i) => (
              <UntrackedOverlay
                key={`untracked-${i}`}
                style={{ left: timeToX(range.start), width: timeToX(range.end) - timeToX(range.start) }}
                onClick={(e) => {
                  e.stopPropagation()
                  setCurrentTime(range.start)
                  retrackFromFrame(Math.round(range.start * (project.videoFps || 30)))
                }}
                title="Tracking lost — click to retrack from here"
              />
            ))}

            {project.keyframes.map((kf) => {
              const currentTime = useEditorStore.getState().currentTime
              const isActive = Math.abs(currentTime - kf.timestamp) < 0.1
              const isSelected = selectedKeyframeIds.includes(kf.id) || draggingOverIds.includes(kf.id)
              const size = isActive ? 12 : 10

              return (
                <KeyframeDot
                  key={kf.id}
                  $size={size}
                  $active={isActive}
                  $selected={isSelected}
                  data-keyframe-dot
                  data-keyframe-id={kf.id}
                  style={{
                    left: timeToX(kf.timestamp) - size / 2,
                  }}
                  onClick={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    toggleKeyframeSelection(kf.id, e.metaKey || e.ctrlKey, e.shiftKey)
                  }}
                  onContextMenu={(e) => handleKeyframeContextMenu(e, kf.id)}
                >
                  <div />
                </KeyframeDot>
              )
            })}

            {dragBox && (
              <SelectionBox
                style={{ left: dragBox.left, top: dragBox.top, width: dragBox.width, height: dragBox.height }}
              />
            )}
          </TrackArea>
        </Filmstrip>
      </ScrollArea>

      <Controls>
        <div style={{ flex: 1 }}>
          <Playback />
        </div>
        <ZoomRow>
          <ZoomLabel>−</ZoomLabel>
          <input
            type="range"
            min="1"
            max="20"
            step="0.5"
            value={zoom}
            onChange={(e) => setZoom(parseFloat(e.target.value))}
            style={{ width: '6rem' }}
            title={`Zoom: ${zoom.toFixed(1)}×`}
          />
          <ZoomLabel>+</ZoomLabel>
          <ZoomValue>{zoom.toFixed(1)}×</ZoomValue>
        </ZoomRow>
      </Controls>

      {selectedKeyframeIds.length === 1 && !dragBox && (
        <KeyframeInspector
          keyframeId={selectedKeyframeIds[0]}
          anchorX={timeToX(project.keyframes.find((k) => k.id === selectedKeyframeIds[0])?.timestamp ?? 0) - scrollLeft}
          containerRef={containerRef}
        />
      )}

      {selectedKeyframeIds.length > 1 && !dragBox && (
        <MultiKeyframeInspector
          keyframeIds={selectedKeyframeIds}
          containerRef={containerRef}
        />
      )}

      {contextMenu && createPortal(
        <ContextMenu style={{ left: contextMenu.x, top: contextMenu.y }}>
          <ContextItem
            onClick={() => {
              deleteKeyframe(contextMenu.kfId)
              setContextMenu(null)
            }}
          >
            Delete
          </ContextItem>
          <ContextItem
            onClick={() => {
              cloneKeyframeMinus(contextMenu.kfId)
              setContextMenu(null)
            }}
          >
            Clone to -1s
          </ContextItem>
        </ContextMenu>,
        document.body
      )}
    </Container>
  )
}
