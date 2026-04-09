import { useState, useCallback, useRef } from 'react'
import styled from 'styled-components'

interface TrackingOverlayProps {
  videoRendered: { x: number; y: number; w: number; h: number }
  videoWidth: number
  videoHeight: number
  onBoxDrawn: (bbox: { x: number; y: number; w: number; h: number }) => void
  onCancel: () => void
}

const Overlay = styled.div`
  position: absolute;
  inset: 0;
  z-index: 50;
  cursor: crosshair;
`

const SelectionBox = styled.div<{ $left: number; $top: number; $width: number; $height: number }>`
  position: absolute;
  left: ${(p) => p.$left}px;
  top: ${(p) => p.$top}px;
  width: ${(p) => p.$width}px;
  height: ${(p) => p.$height}px;
  border: 2px dashed rgba(74, 222, 128, 0.8);
  background: rgba(74, 222, 128, 0.15);
  pointer-events: none;
  z-index: 51;
`

const HintText = styled.div`
  position: absolute;
  top: 12px;
  left: 50%;
  transform: translateX(-50%);
  background: rgba(0, 0, 0, 0.7);
  color: #e5e5e5;
  font-size: 0.75rem;
  padding: 0.375rem 0.75rem;
  border-radius: 0.375rem;
  z-index: 52;
  pointer-events: none;
  white-space: nowrap;
`

export default function TrackingOverlay({
  videoRendered,
  videoWidth,
  videoHeight,
  onBoxDrawn,
  onCancel,
}: TrackingOverlayProps) {
  const [drawing, setDrawing] = useState(false)
  const [startPos, setStartPos] = useState({ x: 0, y: 0 })
  const [currentPos, setCurrentPos] = useState({ x: 0, y: 0 })
  const overlayRef = useRef<HTMLDivElement>(null)

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      e.stopPropagation()
      const rect = overlayRef.current?.getBoundingClientRect()
      if (!rect) return

      const x = e.clientX - rect.left
      const y = e.clientY - rect.top

      // Only start if click is within the video rendered area
      if (
        x < videoRendered.x ||
        x > videoRendered.x + videoRendered.w ||
        y < videoRendered.y ||
        y > videoRendered.y + videoRendered.h
      ) {
        return
      }

      setDrawing(true)
      setStartPos({ x, y })
      setCurrentPos({ x, y })
    },
    [videoRendered]
  )

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!drawing) return
      const rect = overlayRef.current?.getBoundingClientRect()
      if (!rect) return

      const x = Math.max(videoRendered.x, Math.min(videoRendered.x + videoRendered.w, e.clientX - rect.left))
      const y = Math.max(videoRendered.y, Math.min(videoRendered.y + videoRendered.h, e.clientY - rect.top))
      setCurrentPos({ x, y })
    },
    [drawing, videoRendered]
  )

  const handleMouseUp = useCallback(() => {
    if (!drawing) return
    setDrawing(false)

    const left = Math.min(startPos.x, currentPos.x)
    const top = Math.min(startPos.y, currentPos.y)
    const width = Math.abs(currentPos.x - startPos.x)
    const height = Math.abs(currentPos.y - startPos.y)

    // Minimum box size check (at least 10px in container space)
    if (width < 10 || height < 10) return

    // Convert from container pixels to source video pixels
    const scaleX = videoWidth / videoRendered.w
    const scaleY = videoHeight / videoRendered.h

    const bboxX = Math.round((left - videoRendered.x) * scaleX)
    const bboxY = Math.round((top - videoRendered.y) * scaleY)
    const bboxW = Math.round(width * scaleX)
    const bboxH = Math.round(height * scaleY)

    onBoxDrawn({
      x: Math.max(0, bboxX),
      y: Math.max(0, bboxY),
      w: Math.min(bboxW, videoWidth - Math.max(0, bboxX)),
      h: Math.min(bboxH, videoHeight - Math.max(0, bboxY)),
    })
  }, [drawing, startPos, currentPos, videoRendered, videoWidth, videoHeight, onBoxDrawn])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.code === 'Escape') {
        onCancel()
      }
    },
    [onCancel]
  )

  const boxLeft = Math.min(startPos.x, currentPos.x)
  const boxTop = Math.min(startPos.y, currentPos.y)
  const boxWidth = Math.abs(currentPos.x - startPos.x)
  const boxHeight = Math.abs(currentPos.y - startPos.y)

  return (
    <Overlay
      ref={overlayRef}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onKeyDown={handleKeyDown}
      tabIndex={0}
    >
      <HintText>Draw a box around the subject to track — Esc to cancel</HintText>

      {drawing && boxWidth > 0 && boxHeight > 0 && (
        <SelectionBox $left={boxLeft} $top={boxTop} $width={boxWidth} $height={boxHeight} />
      )}
    </Overlay>
  )
}
