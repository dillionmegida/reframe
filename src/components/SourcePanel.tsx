import { useRef, useEffect, useState, useCallback, useMemo } from 'react'
import styled from 'styled-components'
import { useEditorStore } from '../store/editorStore'
import { interpolateAtTime } from '../utils/interpolate'
import TrackingOverlay from './TrackingOverlay'
import TrackingProgress from './TrackingProgress'

const Container = styled.div`
  width: 100%;
  height: 100%;
  position: relative;
  overflow: hidden;
  background: #161616;
`

const VideoEl = styled.video`
  width: 100%;
  height: 100%;
  object-fit: contain;
`

const CropOverlay = styled.div<{
  $left: number
  $top: number
  $width: number
  $height: number
  $isDragging: boolean
  $isPlaying: boolean
  $isResizing: boolean
  $disableTransition: boolean
}>`
  position: absolute;
  left: ${({ $left }) => `${$left}px`};
  top: ${({ $top }) => `${$top}px`};
  width: ${({ $width }) => `${$width}px`};
  height: ${({ $height }) => `${$height}px`};
  border: 2px dashed #f97316;
  background: rgba(249, 115, 22, 0.08);
  cursor: ${({ $isDragging }) => ($isDragging ? 'grabbing' : 'grab')};
  z-index: 10;
  pointer-events: auto;
  transition: none;
  will-change: left, top, width, height;
`

const ResizeHandle = styled.div<{ $left: number; $top: number; $cursor: string }>`
  position: absolute;
  width: 12px;
  height: 12px;
  border-radius: 2px;
  background: #f97316;
  box-shadow: 0 0 4px rgba(0, 0, 0, 0.35);
  cursor: ${({ $cursor }) => $cursor};
  z-index: 12;
  left: ${({ $left }) => `${$left}px`};
  top: ${({ $top }) => `${$top}px`};
`

const DimLayer = styled.div<{ $x: number; $y: number; $width: number; $height: number }>`
  position: absolute;
  left: ${({ $x }) => `${$x}px`};
  top: ${({ $y }) => `${$y}px`};
  width: ${({ $width }) => `${$width}px`};
  height: ${({ $height }) => `${$height}px`};
  pointer-events: none;
  z-index: 5;
`

const DimPart = styled.div<{
  $left?: number
  $top?: number
  $width?: number | string
  $height?: number | string
  $bottom?: number
  $right?: number
}>`
  position: absolute;
  ${({ $left }) => ($left !== undefined ? `left: ${$left}px;` : '')}
  ${({ $top }) => ($top !== undefined ? `top: ${$top}px;` : '')}
  ${({ $bottom }) => ($bottom !== undefined ? `bottom: ${$bottom}px;` : '')}
  ${({ $right }) => ($right !== undefined ? `right: ${$right}px;` : '')}
  ${({ $width }) =>
    $width !== undefined ? `width: ${typeof $width === 'string' ? $width : `${$width}px`};` : ''}
  ${({ $height }) =>
    $height !== undefined ? `height: ${typeof $height === 'string' ? $height : `${$height}px`};` : ''}
  background: rgba(0, 0, 0, 0.4);
`

const SnapLine = styled.div<{ $left: number; $top: number; $height: number }>`
  position: absolute;
  left: ${({ $left }) => `${$left}px`};
  top: ${({ $top }) => `${$top}px`};
  width: 1px;
  height: ${({ $height }) => `${$height}px`};
  background: #f97316;
  z-index: 20;
  pointer-events: none;
`

export default function SourcePanel({
  onTrackingBoxDrawn,
}: {
  onTrackingBoxDrawn?: (bbox: { x: number; y: number; w: number; h: number }) => void
}) {
  const project = useEditorStore((s) => s.project!)
  const currentTime = useEditorStore((s) => s.currentTime)
  const isPlaying = useEditorStore((s) => s.isPlaying)
  const setCurrentTime = useEditorStore((s) => s.setCurrentTime)
  const setPlaying = useEditorStore((s) => s.setPlaying)
  const addOrUpdateKeyframe = useEditorStore((s) => s.addOrUpdateKeyframe)
  const tracking = useEditorStore((s) => s.tracking)
  const cancelTracking = useEditorStore((s) => s.cancelTracking)

  const videoRef = useRef<HTMLVideoElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [isResizing, setIsResizing] = useState(false)
  const [disableTransition, setDisableTransition] = useState(true)
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

  // Disable the crop overlay transition on first mount so it doesn't jump from (0,0)
  useEffect(() => {
    if (!disableTransition) return
    if (videoRendered.w === 0 || videoRendered.h === 0) return

    const id = requestAnimationFrame(() => setDisableTransition(false))
    return () => cancelAnimationFrame(id)
  }, [disableTransition, videoRendered])

  // Sync video element with store
  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    // When not playing, always sync
    // When playing, only sync if there's a large difference (user clicked timeline)
    const threshold = isPlaying ? 0.5 : 0.05
    if (Math.abs(video.currentTime - currentTime) > threshold) {
      video.currentTime = currentTime
    }
  }, [currentTime, isPlaying])

  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    if (isPlaying) {
      video.play().catch(() => {})
    } else {
      video.pause()
    }
  }, [isPlaying])

  const playbackRafRef = useRef<number>(0)
  const playbackVfcRef = useRef<number>(0)
  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    let stopped = false

    const endPlayback = () => {
      stopped = true
      cancelAnimationFrame(playbackRafRef.current)
      if (typeof (video as any).cancelVideoFrameCallback === 'function') {
        (video as any).cancelVideoFrameCallback(playbackVfcRef.current)
      }
    }

    if (!isPlaying) {
      endPlayback()
      return
    }

    const tickRaf = () => {
      if (stopped || !video || video.paused) return
      const t = video.currentTime
      if (t >= project.trim.end) {
        video.pause()
        setPlaying(false)
        setCurrentTime(project.trim.end)
        return
      }
      setCurrentTime(t)
      playbackRafRef.current = requestAnimationFrame(tickRaf)
    }

    const tickVfc = (_now: number, meta: { mediaTime: number }) => {
      if (stopped) return
      const t = meta.mediaTime
      if (t >= project.trim.end) {
        video.pause()
        setPlaying(false)
        setCurrentTime(project.trim.end)
        return
      }
      setCurrentTime(t)
      playbackVfcRef.current = (video as any).requestVideoFrameCallback(tickVfc)
    }

    const supportsVfc = typeof (video as any).requestVideoFrameCallback === 'function'

    if (supportsVfc) {
      playbackVfcRef.current = (video as any).requestVideoFrameCallback(tickVfc)
    } else {
      playbackRafRef.current = requestAnimationFrame(tickRaf)
    }

    return endPlayback
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

  // Corner resize handles — anchor at the opposite corner instead of center
  const handleResizeMouseDown = useCallback(
    (e: React.MouseEvent, dir: 'tl' | 'tr' | 'bl' | 'br') => {
      e.stopPropagation()
      e.preventDefault()

      setIsResizing(true)

      if (videoRendered.w === 0 || videoRendered.h === 0) return

      const maxWGlobal = outputAspect < videoAspect ? videoRendered.h * outputAspect : videoRendered.w
      const maxHGlobal = outputAspect < videoAspect ? videoRendered.h : videoRendered.w / outputAspect

      const minScale = 1
      const maxScale = 4
      const minW =
        outputAspect < videoAspect ? videoRendered.h * outputAspect / maxScale : videoRendered.w / maxScale
      const minH =
        outputAspect < videoAspect ? videoRendered.h / maxScale : (videoRendered.w / maxScale) / outputAspect

      const containerRect = containerRef.current?.getBoundingClientRect()
      if (!containerRect) return

      // Anchor is the opposite corner from the handle being dragged
      const anchorX = dir.includes('l') ? finalCropX + cropRenderW : finalCropX
      const anchorY = dir.includes('t') ? finalCropY + cropRenderH : finalCropY

      const maxWidthFromAnchor = dir.includes('l')
        ? anchorX - videoRendered.x
        : videoRendered.x + videoRendered.w - anchorX
      const maxHeightFromAnchor = dir.includes('t')
        ? anchorY - videoRendered.y
        : videoRendered.y + videoRendered.h - anchorY

      const onMouseMove = (ev: MouseEvent) => {
        const pointerX = ev.clientX - containerRect.left
        const pointerY = ev.clientY - containerRect.top

        const absDx = Math.abs(pointerX - anchorX)
        const absDy = Math.abs(pointerY - anchorY)

        let newW: number
        let newH: number

        if (absDx <= absDy * outputAspect) {
          newW = absDx
          newH = newW / outputAspect
        } else {
          newH = absDy
          newW = newH * outputAspect
        }

        // Clamp to available space from anchor and global bounds
        const maxW = Math.min(maxWidthFromAnchor, maxWGlobal)
        const maxH = Math.min(maxHeightFromAnchor, maxHGlobal)

        if (newW > maxW) {
          newW = maxW
          newH = newW / outputAspect
        }
        if (newH > maxH) {
          newH = maxH
          newW = newH * outputAspect
        }

        if (newW < minW) {
          newW = minW
          newH = newW / outputAspect
        }
        if (newH < minH) {
          newH = minH
          newW = newH * outputAspect
        }

        let newScale: number
        if (outputAspect < videoAspect) {
          newScale = videoRendered.h / newH
        } else {
          newScale = videoRendered.w / newW
        }
        newScale = Math.max(minScale, Math.min(maxScale, newScale))

        const newX = dir.includes('l') ? anchorX - newW : anchorX
        const newY = dir.includes('t') ? anchorY - newH : anchorY

        const normX = (newX - videoRendered.x) / (videoRendered.w - newW || 1)
        const normY = (newY - videoRendered.y) / (videoRendered.h - newH || 1)

        addOrUpdateKeyframe({
          timestamp: currentTime,
          x: Math.max(0, Math.min(1, normX)),
          y: Math.max(0, Math.min(1, normY)),
          scale: newScale,
          easing: 'linear',
        })
      }

      const onMouseUp = () => {
        setIsResizing(false)
        document.removeEventListener('mousemove', onMouseMove)
        document.removeEventListener('mouseup', onMouseUp)
      }

      document.addEventListener('mousemove', onMouseMove)
      document.addEventListener('mouseup', onMouseUp)
    },
    [cropRenderW, cropRenderH, finalCropX, finalCropY, videoRendered, outputAspect, videoAspect, addOrUpdateKeyframe, currentTime]
  )

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
    <Container ref={containerRef} onWheel={handleWheel}>
      <VideoEl
        ref={videoRef}
        id="source-video"
        src={`file://${project.videoPath}`}
        muted
        playsInline
        preload="auto"
        onLoadedMetadata={updateVideoRendered}
      />

      <CropOverlay
        $left={finalCropX}
        $top={finalCropY}
        $width={cropRenderW}
        $height={cropRenderH}
        $isDragging={isDragging}
        $isPlaying={isPlaying}
        $isResizing={isResizing}
        $disableTransition={disableTransition}
        onMouseDown={handleMouseDown}
      />

      {[
        { key: 'tl', left: finalCropX - 6, top: finalCropY - 6, cursor: 'nw-resize' },
        { key: 'tr', left: finalCropX + cropRenderW - 6, top: finalCropY - 6, cursor: 'ne-resize' },
        { key: 'bl', left: finalCropX - 6, top: finalCropY + cropRenderH - 6, cursor: 'sw-resize' },
        { key: 'br', left: finalCropX + cropRenderW - 6, top: finalCropY + cropRenderH - 6, cursor: 'se-resize' },
      ].map((h) => (
        <ResizeHandle
          key={h.key}
          $left={h.left}
          $top={h.top}
          $cursor={h.cursor}
          onMouseDown={(ev) => handleResizeMouseDown(ev, h.key as 'tl' | 'tr' | 'bl' | 'br')}
        />
      ))}

      <DimLayer $x={videoRendered.x} $y={videoRendered.y} $width={videoRendered.w} $height={videoRendered.h}>
        <DimPart $left={0} $top={0} $width="100%" $height={Math.max(0, finalCropY - videoRendered.y)} />
        <DimPart
          $left={0}
          $bottom={0}
          $width="100%"
          $height={Math.max(0, videoRendered.y + videoRendered.h - finalCropY - cropRenderH)}
        />
        <DimPart
          $left={0}
          $top={Math.max(0, finalCropY - videoRendered.y)}
          $width={Math.max(0, finalCropX - videoRendered.x)}
          $height={cropRenderH}
        />
        <DimPart
          $right={0}
          $top={Math.max(0, finalCropY - videoRendered.y)}
          $width={Math.max(0, videoRendered.x + videoRendered.w - finalCropX - cropRenderW)}
          $height={cropRenderH}
        />
      </DimLayer>

      {showSnaps.left && (
        <SnapLine $left={snapPositions.left} $top={videoRendered.y} $height={videoRendered.h} />
      )}
      {showSnaps.center && (
        <SnapLine
          $left={snapPositions.center + cropRenderW / 2}
          $top={videoRendered.y}
          $height={videoRendered.h}
        />
      )}
      {showSnaps.right && (
        <SnapLine $left={snapPositions.right + cropRenderW} $top={videoRendered.y} $height={videoRendered.h} />
      )}

      {tracking.drawingBox && (
        <TrackingOverlay
          videoRendered={videoRendered}
          videoWidth={project.videoWidth}
          videoHeight={project.videoHeight}
          onBoxDrawn={(bbox) => onTrackingBoxDrawn?.(bbox)}
          onCancel={cancelTracking}
        />
      )}

      {tracking.active && <TrackingProgress />}
    </Container>
  )
}
