import { useRef, useEffect, useState, useCallback, useMemo } from 'react'
import { useEditorStore } from '../store/editorStore'
import { interpolateAtTime } from '../utils/interpolate'

export default function SourcePanel() {
  const project = useEditorStore((s) => s.project!)
  const currentTime = useEditorStore((s) => s.currentTime)
  const isPlaying = useEditorStore((s) => s.isPlaying)
  const setCurrentTime = useEditorStore((s) => s.setCurrentTime)
  const setPlaying = useEditorStore((s) => s.setPlaying)
  const addOrUpdateKeyframe = useEditorStore((s) => s.addOrUpdateKeyframe)

  const videoRef = useRef<HTMLVideoElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [videoRendered, setVideoRendered] = useState({ x: 0, y: 0, w: 0, h: 0 })
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const interp = useMemo(
    () => interpolateAtTime(project.keyframes, currentTime),
    [project.keyframes, currentTime]
  )

  // Compute video rendered area (object-fit: contain)
  const updateVideoRendered = useCallback(() => {
    const container = containerRef.current
    const video = videoRef.current
    if (!container || !video) return

    const cw = container.clientWidth
    const ch = container.clientHeight
    const vw = project.videoWidth
    const vh = project.videoHeight

    const containerAspect = cw / ch
    const videoAspect = vw / vh

    let renderW: number, renderH: number, renderX: number, renderY: number
    if (videoAspect > containerAspect) {
      renderW = cw
      renderH = cw / videoAspect
      renderX = 0
      renderY = (ch - renderH) / 2
    } else {
      renderH = ch
      renderW = ch * videoAspect
      renderX = (cw - renderW) / 2
      renderY = 0
    }

    setVideoRendered({ x: renderX, y: renderY, w: renderW, h: renderH })
  }, [project.videoWidth, project.videoHeight])

  useEffect(() => {
    updateVideoRendered()
    window.addEventListener('resize', updateVideoRendered)
    return () => window.removeEventListener('resize', updateVideoRendered)
  }, [updateVideoRendered])

  // Sync video element with store
  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    if (Math.abs(video.currentTime - currentTime) > 0.05) {
      video.currentTime = currentTime
    }
  }, [currentTime])

  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    if (isPlaying) {
      video.play().catch(() => {})
    } else {
      video.pause()
    }
  }, [isPlaying])

  // Playback time sync via rAF for smooth ~60fps updates
  const playbackRafRef = useRef<number>(0)
  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    if (!isPlaying) {
      cancelAnimationFrame(playbackRafRef.current)
      return
    }

    const tick = () => {
      if (!video || video.paused) return
      const t = video.currentTime
      if (t >= project.trim.end) {
        video.pause()
        setPlaying(false)
        setCurrentTime(project.trim.end)
        return
      }
      setCurrentTime(t)
      playbackRafRef.current = requestAnimationFrame(tick)
    }

    playbackRafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(playbackRafRef.current)
  }, [isPlaying, project.trim.end, setCurrentTime, setPlaying])

  // Crop rectangle dimensions in rendered pixels
  // The crop region in source-video pixels has aspect ratio = outputWidth/outputHeight.
  // At scale=1 the crop should be as large as possible while fitting inside the source.
  const outputAspect = project.outputWidth / project.outputHeight   // e.g. 9/16 = 0.5625
  const videoAspect = project.videoWidth / project.videoHeight       // e.g. 16/9 = 1.778

  // Decide whether the crop is height-limited or width-limited inside the source frame
  let cropFractionW: number, cropFractionH: number
  if (outputAspect < videoAspect) {
    // Portrait output on landscape source: crop is full height, narrow width
    cropFractionH = 1 / interp.scale
    cropFractionW = (cropFractionH * outputAspect) / videoAspect
  } else {
    // Landscape or square output: crop is full width, shorter height
    cropFractionW = 1 / interp.scale
    cropFractionH = (cropFractionW * videoAspect) / outputAspect
  }

  const cropRenderW = cropFractionW * videoRendered.w
  const cropRenderH = cropFractionH * videoRendered.h

  const cropRenderX = videoRendered.x + interp.x * (videoRendered.w - cropRenderW)
  const cropRenderY = videoRendered.y + interp.y * (videoRendered.h - cropRenderH)

  // Snap guides
  const snapThreshold = 8
  const snapPositions = useMemo(() => {
    return {
      left: videoRendered.x,
      center: videoRendered.x + videoRendered.w / 2 - cropRenderW / 2,
      right: videoRendered.x + videoRendered.w - cropRenderW,
    }
  }, [videoRendered, cropRenderW])

  const [showSnaps, setShowSnaps] = useState({ left: false, center: false, right: false })

  // Drag to reposition
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      setIsDragging(true)
      setShowSnaps({ left: false, center: false, right: false })

      const startMouse = { x: e.clientX, y: e.clientY }
      const startX = interp.x
      const startY = interp.y

      const onMouseMove = (ev: MouseEvent) => {
        const dx = ev.clientX - startMouse.x
        const dy = ev.clientY - startMouse.y

        const maxDx = videoRendered.w - cropRenderW
        const maxDy = videoRendered.h - cropRenderH

        let newX = maxDx > 0 ? Math.max(0, Math.min(1, startX + dx / maxDx)) : 0.5
        let newY = maxDy > 0 ? Math.max(0, Math.min(1, startY + dy / maxDy)) : 0.5

        // Snap logic
        const newCropX = videoRendered.x + newX * (videoRendered.w - cropRenderW)
        const snaps = {
          left: Math.abs(newCropX - snapPositions.left) < snapThreshold,
          center: Math.abs(newCropX - snapPositions.center) < snapThreshold,
          right: Math.abs(newCropX - snapPositions.right) < snapThreshold,
        }
        setShowSnaps(snaps)

        if (snaps.left) newX = 0
        if (snaps.center) newX = 0.5
        if (snaps.right) newX = 1

        dragValRef.current = { x: newX, y: newY }
        setCropOverride({ x: newX, y: newY })
      }

      const onMouseUp = () => {
        setIsDragging(false)
        setShowSnaps({ left: false, center: false, right: false })
        document.removeEventListener('mousemove', onMouseMove)
        document.removeEventListener('mouseup', onMouseUp)

        const final = dragValRef.current || { x: interp.x, y: interp.y }
        addOrUpdateKeyframe({
          timestamp: currentTime,
          x: final.x,
          y: final.y,
          scale: interp.scale,
          easing: 'linear',
        })
        setCropOverride(null)
      }

      document.addEventListener('mousemove', onMouseMove)
      document.addEventListener('mouseup', onMouseUp)
    },
    [interp, currentTime, cropRenderW, cropRenderH, videoRendered, snapPositions, addOrUpdateKeyframe]
  )

  const dragValRef = useRef<{ x: number; y: number } | null>(null)
  const [cropOverride, setCropOverride] = useState<{ x: number; y: number } | null>(null)

  const displayX = cropOverride ? cropOverride.x : interp.x
  const displayY = cropOverride ? cropOverride.y : interp.y

  const finalCropX = videoRendered.x + displayX * (videoRendered.w - cropRenderW)
  const finalCropY = videoRendered.y + displayY * (videoRendered.h - cropRenderH)

  // Scroll to zoom
  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      e.preventDefault()
      const delta = e.deltaY > 0 ? -0.05 : 0.05
      const newScale = Math.max(1.0, Math.min(4.0, interp.scale + delta))

      if (debounceRef.current) clearTimeout(debounceRef.current)
      debounceRef.current = setTimeout(() => {
        addOrUpdateKeyframe({
          timestamp: currentTime,
          x: interp.x,
          y: interp.y,
          scale: newScale,
          easing: 'linear',
        })
      }, 150)
    },
    [interp, currentTime, addOrUpdateKeyframe]
  )

  return (
    <div
      ref={containerRef}
      className="w-full h-full panel-bg relative overflow-hidden"
      onWheel={handleWheel}
    >
      <video
        ref={videoRef}
        id="source-video"
        src={`file://${project.videoPath}`}
        className="w-full h-full object-contain"
        muted
        playsInline
        preload="auto"
        onLoadedMetadata={updateVideoRendered}
      />

      {/* Crop rectangle overlay */}
      <div
        style={{
          position: 'absolute',
          left: finalCropX,
          top: finalCropY,
          width: cropRenderW,
          height: cropRenderH,
          border: '2px dashed #f97316',
          background: 'rgba(249,115,22,0.08)',
          cursor: isDragging ? 'grabbing' : 'grab',
          zIndex: 10,
          pointerEvents: 'auto',
          transition: (isDragging || isPlaying) ? 'none' : 'left 0.15s ease-out, top 0.15s ease-out, width 0.15s ease-out, height 0.15s ease-out',
        }}
        onMouseDown={handleMouseDown}
      />

      {/* Dim areas outside crop */}
      <div
        style={{
          position: 'absolute',
          left: videoRendered.x,
          top: videoRendered.y,
          width: videoRendered.w,
          height: videoRendered.h,
          pointerEvents: 'none',
          zIndex: 5,
        }}
      >
        {/* Top */}
        <div
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            width: '100%',
            height: Math.max(0, finalCropY - videoRendered.y),
            background: 'rgba(0,0,0,0.4)',
          }}
        />
        {/* Bottom */}
        <div
          style={{
            position: 'absolute',
            left: 0,
            bottom: 0,
            width: '100%',
            height: Math.max(0, videoRendered.y + videoRendered.h - finalCropY - cropRenderH),
            background: 'rgba(0,0,0,0.4)',
          }}
        />
        {/* Left */}
        <div
          style={{
            position: 'absolute',
            left: 0,
            top: Math.max(0, finalCropY - videoRendered.y),
            width: Math.max(0, finalCropX - videoRendered.x),
            height: cropRenderH,
            background: 'rgba(0,0,0,0.4)',
          }}
        />
        {/* Right */}
        <div
          style={{
            position: 'absolute',
            right: 0,
            top: Math.max(0, finalCropY - videoRendered.y),
            width: Math.max(0, videoRendered.x + videoRendered.w - finalCropX - cropRenderW),
            height: cropRenderH,
            background: 'rgba(0,0,0,0.4)',
          }}
        />
      </div>

      {/* Snap guides */}
      {showSnaps.left && (
        <div
          style={{
            position: 'absolute',
            left: snapPositions.left,
            top: videoRendered.y,
            width: 1,
            height: videoRendered.h,
            background: '#f97316',
            zIndex: 20,
            pointerEvents: 'none',
          }}
        />
      )}
      {showSnaps.center && (
        <div
          style={{
            position: 'absolute',
            left: snapPositions.center + cropRenderW / 2,
            top: videoRendered.y,
            width: 1,
            height: videoRendered.h,
            background: '#f97316',
            zIndex: 20,
            pointerEvents: 'none',
          }}
        />
      )}
      {showSnaps.right && (
        <div
          style={{
            position: 'absolute',
            left: snapPositions.right + cropRenderW,
            top: videoRendered.y,
            width: 1,
            height: videoRendered.h,
            background: '#f97316',
            zIndex: 20,
            pointerEvents: 'none',
          }}
        />
      )}
    </div>
  )
}
