import { useRef, useEffect, useState, useCallback, useMemo } from 'react'
import { useEditorStore } from '../store/editorStore'
import Playback from './Playback'
import KeyframeInspector from './KeyframeInspector'

function formatTime(s: number): string {
  const m = Math.floor(s / 60)
  const sec = s - m * 60
  return `${String(m).padStart(2, '0')}:${sec.toFixed(1).padStart(4, '0')}`
}

export default function Timeline() {
  const project = useEditorStore((s) => s.project!)
  const currentTime = useEditorStore((s) => s.currentTime)
  const selectedKeyframeId = useEditorStore((s) => s.selectedKeyframeId)
  const setCurrentTime = useEditorStore((s) => s.setCurrentTime)
  const selectKeyframe = useEditorStore((s) => s.selectKeyframe)
  const updateKeyframe = useEditorStore((s) => s.updateKeyframe)
  const deleteKeyframe = useEditorStore((s) => s.deleteKeyframe)
  const cloneKeyframeMinus = useEditorStore((s) => s.cloneKeyframeMinus)
  const setTrimStart = useEditorStore((s) => s.setTrimStart)
  const setTrimEnd = useEditorStore((s) => s.setTrimEnd)

  const filmstripRef = useRef<HTMLDivElement>(null)
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const thumbVideoRef = useRef<HTMLVideoElement>(null)
  const [thumbnails, setThumbnails] = useState<string[]>([])
  const [viewportWidth, setViewportWidth] = useState(0)
  const [scrollLeft, setScrollLeft] = useState(0)
  const [zoom, setZoom] = useState(() => {
    const stored = typeof window !== 'undefined' ? window.localStorage.getItem('timelineZoom') : null
    const parsed = stored ? parseFloat(stored) : NaN
    return Number.isFinite(parsed) ? parsed : 1
  })
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; kfId: string } | null>(null)

  const duration = project.videoDuration
  const trim = project.trim

  // The actual filmstrip content width is viewportWidth * zoom
  const filmstripWidth = viewportWidth * zoom

  // Tick interval (adjusted for zoom)
  const tickInterval = useMemo(() => {
    const pxPerSec = filmstripWidth / duration
    if (pxPerSec > 80) return 1
    if (pxPerSec > 20) return 5
    if (pxPerSec > 8) return 10
    return 30
  }, [duration, filmstripWidth])

  // Update viewport width on resize
  useEffect(() => {
    const update = () => {
      if (scrollContainerRef.current) setViewportWidth(scrollContainerRef.current.clientWidth)
    }
    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [])

  // Persist zoom to localStorage
  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('timelineZoom', zoom.toString())
    }
  }, [zoom])

  // Track scroll for inspector anchoring
  useEffect(() => {
    const sc = scrollContainerRef.current
    if (!sc) return
    const onScroll = () => setScrollLeft(sc.scrollLeft)
    sc.addEventListener('scroll', onScroll)
    onScroll()
    return () => sc.removeEventListener('scroll', onScroll)
  }, [])

  // Auto-scroll to keep playhead visible
  useEffect(() => {
    const sc = scrollContainerRef.current
    if (!sc || filmstripWidth <= 0) return
    const playheadX = (currentTime / duration) * filmstripWidth
    const scrollLeft = sc.scrollLeft
    const scrollRight = scrollLeft + sc.clientWidth
    if (playheadX < scrollLeft + 40 || playheadX > scrollRight - 40) {
      sc.scrollLeft = playheadX - sc.clientWidth / 2
      setScrollLeft(sc.scrollLeft)
    }
  }, [currentTime, filmstripWidth, duration])

  // Time to pixel
  const timeToX = useCallback(
    (t: number) => (filmstripWidth > 0 ? (t / duration) * filmstripWidth : 0),
    [filmstripWidth, duration]
  )

  const xToTime = useCallback(
    (x: number) => (filmstripWidth > 0 ? (x / filmstripWidth) * duration : 0),
    [filmstripWidth, duration]
  )

  // Extract thumbnails lazily
  useEffect(() => {
    const video = thumbVideoRef.current
    if (!video || !project.videoPath) return

    video.src = `file://${project.videoPath}`
    video.preload = 'auto'

    const canvas = document.createElement('canvas')
    canvas.width = 160
    canvas.height = 90
    const ctx = canvas.getContext('2d')!

    const thumbCount = Math.ceil(duration / 2)
    const thumbs: string[] = new Array(thumbCount).fill('')
    let idx = 0

    const extractNext = () => {
      if (idx >= thumbCount) {
        setThumbnails([...thumbs])
        return
      }
      const targetTime = idx * 2
      video.currentTime = targetTime
    }

    const onSeeked = () => {
      ctx.drawImage(video, 0, 0, 160, 90)
      thumbs[idx] = canvas.toDataURL('image/jpeg', 0.6)
      if (idx % 5 === 0) setThumbnails([...thumbs])
      idx++
      extractNext()
    }

    video.addEventListener('seeked', onSeeked)
    video.addEventListener('loadedmetadata', () => extractNext())

    return () => {
      video.removeEventListener('seeked', onSeeked)
    }
  }, [project.videoPath, duration])

  // Playhead drag — account for scroll offset
  const handleFilmstripMouseDown = useCallback(
    (e: React.MouseEvent) => {
      const sc = scrollContainerRef.current
      if (!sc) return
      const rect = sc.getBoundingClientRect()
      const t = xToTime(e.clientX - rect.left + sc.scrollLeft)
      setCurrentTime(t)

      const onMouseMove = (ev: MouseEvent) => {
        const newT = xToTime(ev.clientX - rect.left + sc.scrollLeft)
        setCurrentTime(Math.max(0, Math.min(duration, newT)))
      }
      const onMouseUp = () => {
        document.removeEventListener('mousemove', onMouseMove)
        document.removeEventListener('mouseup', onMouseUp)
      }
      document.addEventListener('mousemove', onMouseMove)
      document.addEventListener('mouseup', onMouseUp)
    },
    [xToTime, setCurrentTime, duration]
  )

  // Keyframe drag
  const handleKeyframeDragStart = useCallback(
    (e: React.MouseEvent, kfId: string) => {
      e.stopPropagation()
      selectKeyframe(kfId)

      const sc = scrollContainerRef.current
      if (!sc) return
      const rect = sc.getBoundingClientRect()

      const onMouseMove = (ev: MouseEvent) => {
        const newT = xToTime(ev.clientX - rect.left + sc.scrollLeft)
        const clamped = Math.max(trim.start, Math.min(trim.end, newT))
        updateKeyframe(kfId, { timestamp: clamped })
      }
      const onMouseUp = () => {
        document.removeEventListener('mousemove', onMouseMove)
        document.removeEventListener('mouseup', onMouseUp)
      }
      document.addEventListener('mousemove', onMouseMove)
      document.addEventListener('mouseup', onMouseUp)
    },
    [xToTime, trim, selectKeyframe, updateKeyframe]
  )

  // Trim handle drag
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

  // Right-click context menu
  const handleKeyframeContextMenu = useCallback(
    (e: React.MouseEvent, kfId: string) => {
      e.preventDefault()
      e.stopPropagation()
      setContextMenu({ x: e.clientX, y: e.clientY, kfId })
    },
    []
  )

  // Close context menu on click outside
  useEffect(() => {
    const handler = () => setContextMenu(null)
    if (contextMenu) {
      window.addEventListener('click', handler)
      return () => window.removeEventListener('click', handler)
    }
  }, [contextMenu])

  // Thumb width in pixels
  const thumbWidthPx = filmstripWidth > 0 ? (2 / duration) * filmstripWidth : 0

  // Time ruler ticks
  const ticks = useMemo(() => {
    const arr: number[] = []
    for (let t = 0; t <= duration; t += tickInterval) {
      arr.push(t)
    }
    return arr
  }, [duration, tickInterval])

  return (
    <div className="h-full panel-bg border-t border-border flex flex-col relative select-none">
      {/* Hidden video for thumbnail extraction */}
      <video ref={thumbVideoRef} className="hidden" muted playsInline />

      {/* Scrollable timeline area */}
      <div
        ref={scrollContainerRef}
        className="flex-1 min-h-0 overflow-x-auto overflow-y-hidden relative"
        onMouseDown={handleFilmstripMouseDown}
        style={{ cursor: 'pointer' }}
      >
        {/* Inner content — width determined by zoom */}
        <div ref={filmstripRef} style={{ width: filmstripWidth, minHeight: '100%', position: 'relative' }}>
          {/* Full-height playhead line (scrolls with content) */}
          <div
            className="pointer-events-none absolute top-0 bottom-0 w-[2px] bg-accent/40"
            style={{ left: timeToX(currentTime) - 1, zIndex: 22 }}
          />
          {/* Time ruler */}
          <div className="h-[18px] relative flex-shrink-0 border-b border-border/50">
            {ticks.map((t) => (
              <div
                key={t}
                className="absolute top-0 flex flex-col items-center"
                style={{ left: timeToX(t) }}
              >
                <div className="w-px h-2 bg-border" />
                <span className="text-[9px] font-mono text-text-muted leading-none mt-0.5">
                  {formatTime(t)}
                </span>
              </div>
            ))}
            {/* Playhead time label */}
            <div
              className="absolute -top-0.5 bg-accent text-black text-[9px] font-mono px-1 rounded-sm"
              style={{ left: timeToX(currentTime), transform: 'translateX(-50%)' }}
            >
              {formatTime(currentTime)}
            </div>
          </div>

          {/* Filmstrip + keyframe markers */}
          <div className="relative" style={{ height: 'calc(100% - 18px)' }}>
            {/* Thumbnail images */}
            {thumbnails.map((thumb, i) =>
              thumb ? (
                <img
                  key={i}
                  src={thumb}
                  alt=""
                  className="absolute top-0 h-full object-cover pointer-events-none"
                  style={{
                    left: i * thumbWidthPx,
                    width: thumbWidthPx,
                  }}
                />
              ) : null
            )}

            {/* Trim overlay — before trim.start */}
            <div
              className="absolute top-0 h-full bg-black/60 pointer-events-none z-10"
              style={{ left: 0, width: timeToX(trim.start) }}
            />
            {/* Trim overlay — after trim.end */}
            <div
              className="absolute top-0 h-full bg-black/60 pointer-events-none z-10"
              style={{ left: timeToX(trim.end), width: filmstripWidth - timeToX(trim.end) }}
            />

            {/* Trim handles */}
            <div
              className="absolute top-0 h-full w-[6px] bg-trim cursor-ew-resize z-30 flex items-center justify-center"
              style={{ left: timeToX(trim.start) - 3 }}
              onMouseDown={(e) => handleTrimDrag(e, 'start')}
              title={formatTime(trim.start)}
            >
              <div className="w-[2px] h-4 bg-white/60 rounded-full" />
            </div>
            <div
              className="absolute top-0 h-full w-[6px] bg-trim cursor-ew-resize z-30 flex items-center justify-center"
              style={{ left: timeToX(trim.end) - 3 }}
              onMouseDown={(e) => handleTrimDrag(e, 'end')}
              title={formatTime(trim.end)}
            >
              <div className="w-[2px] h-4 bg-white/60 rounded-full" />
            </div>

            {/* Keyframe markers */}
            {project.keyframes.map((kf) => {
              const isActive = Math.abs(currentTime - kf.timestamp) < 0.1
              const isSelected = selectedKeyframeId === kf.id
              const size = isActive ? 12 : 10

              return (
                <div
                  key={kf.id}
                  className="absolute z-20 flex items-center justify-center"
                  style={{
                    left: timeToX(kf.timestamp) - size / 2,
                    top: '50%',
                    marginTop: -size / 2,
                    width: size,
                    height: size,
                    cursor: 'pointer',
                  }}
                  onMouseDown={(e) => handleKeyframeDragStart(e, kf.id)}
                  onClick={(e) => {
                    e.stopPropagation()
                    setCurrentTime(kf.timestamp)
                    selectKeyframe(kf.id)
                  }}
                  onContextMenu={(e) => handleKeyframeContextMenu(e, kf.id)}
                >
                  <div
                    style={{
                      width: size,
                      height: size,
                      transform: 'rotate(45deg)',
                      background: isActive ? '#ffffff' : '#f97316',
                      border: isSelected ? '2px solid #ffffff' : 'none',
                      boxShadow: isActive ? '0 0 6px rgba(255,255,255,0.7)' : 'none',
                    }}
                  />
                </div>
              )
            })}

            {/* Playhead (filmstrip area only) */}
            <div
              className="absolute top-0 h-full w-[2px] bg-accent/70 z-25 pointer-events-none"
              style={{ left: timeToX(currentTime) - 1 }}
            />
          </div>
        </div>
      </div>

      {/* Playback controls + zoom slider */}
      <div className="flex-shrink-0 flex items-center border-t border-border/50">
        <div className="flex-1">
          <Playback />
        </div>
        <div className="flex items-center gap-2 px-3">
          <span className="text-[10px] text-text-muted font-mono">−</span>
          <input
            type="range"
            min="1"
            max="20"
            step="0.5"
            value={zoom}
            onChange={(e) => setZoom(parseFloat(e.target.value))}
            className="w-24 accent-accent"
            title={`Zoom: ${zoom.toFixed(1)}×`}
          />
          <span className="text-[10px] text-text-muted font-mono">+</span>
          <span className="text-[10px] text-text-muted font-mono w-8">{zoom.toFixed(1)}×</span>
        </div>
      </div>

      {/* Keyframe Inspector */}
      {selectedKeyframeId && (
        <KeyframeInspector
          keyframeId={selectedKeyframeId}
          anchorX={
            timeToX(project.keyframes.find((k) => k.id === selectedKeyframeId)?.timestamp ?? 0) -
            scrollLeft
          }
        />
      )}

      {/* Context menu */}
      {contextMenu && (
        <div
          className="fixed bg-panel border border-border rounded-lg shadow-xl py-1 z-50 min-w-[160px]"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          <button
            className="w-full text-left px-3 py-1.5 text-sm text-text-primary hover:bg-white/5"
            onClick={() => {
              deleteKeyframe(contextMenu.kfId)
              setContextMenu(null)
            }}
          >
            Delete
          </button>
          <button
            className="w-full text-left px-3 py-1.5 text-sm text-text-primary hover:bg-white/5"
            onClick={() => {
              cloneKeyframeMinus(contextMenu.kfId)
              setContextMenu(null)
            }}
          >
            Clone to -1s
          </button>
        </div>
      )}
    </div>
  )
}
