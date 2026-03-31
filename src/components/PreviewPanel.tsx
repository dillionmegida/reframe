import { useRef, useEffect, useState } from 'react'
import styled from 'styled-components'
import { useEditorStore } from '../store/editorStore'
import { interpolateAtTime } from '../utils/interpolate'

const Wrapper = styled.div`
  height: 100%;
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 1rem;
`

const PlayerFrame = styled.div<{ $w: number; $h: number }>`
  position: relative;
  overflow: hidden;
  border-radius: 0.125rem;
  width: ${(p) => (p.$w ? `${p.$w}px` : '320px')};
  height: ${(p) => (p.$h ? `${p.$h}px` : '568px')};
  background: #000;
`

const CanvasEl = styled.canvas<{ $w: number; $h: number }>`
  width: ${(p) => (p.$w ? `${p.$w}px` : '320px')};
  height: ${(p) => (p.$h ? `${p.$h}px` : '568px')};
  display: block;
`

const LoadingOverlay = styled.div`
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #6b7280;
  font-size: 0.75rem;
`

const HudBadge = styled.div`
  position: absolute;
  bottom: 0.5rem;
  right: 0.5rem;
  font-family: 'IBM Plex Mono', monospace;
  font-size: 0.75rem;
  color: #f97316;
  background: rgba(0, 0, 0, 0.6);
  padding: 0.375rem 0.6rem;
  border-radius: 0.25rem;
  z-index: 10;
`

export default function PreviewPanel() {
  const project = useEditorStore((s) => s.project!)

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const containerSizeRef = useRef({ w: 0, h: 0 })
  const [containerSize, setContainerSize] = useState({ w: 0, h: 0 })
  const rafRef = useRef<number>(0)
  const vfcRef = useRef<number>(0)
  const hudRef = useRef<HTMLDivElement>(null)
  const lastDrawnTimeRef = useRef<number>(-1)

  const outputAspect = project.outputWidth / project.outputHeight

  // Calculate container size using ResizeObserver on the wrapper
  useEffect(() => {
    const wrapper = wrapperRef.current
    if (!wrapper) return

    const update = () => {
      const availW = wrapper.clientWidth
      const availH = wrapper.clientHeight
      if (availW === 0 || availH === 0) return

      const padding = 32
      const usableW = Math.max(0, availW - padding)
      const usableH = Math.max(0, availH - padding)
      if (usableW === 0 || usableH === 0) return

      let h = usableH
      let w = h * outputAspect
      if (w > usableW) {
        w = usableW
        h = w / outputAspect
      }

      w = Math.round(w)
      h = Math.round(h)

      if (Math.abs(containerSizeRef.current.w - w) > 0.5 || Math.abs(containerSizeRef.current.h - h) > 0.5) {
        containerSizeRef.current = { w, h }
        setContainerSize({ w, h })
      }
    }

    const observer = new ResizeObserver(update)
    observer.observe(wrapper)
    update()
    return () => observer.disconnect()
  }, [outputAspect])

  // Draw the crop region onto the canvas, synchronized with decoded video frames when possible
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let stopped = false
    lastDrawnTimeRef.current = -1

    const drawAtTime = (t: number) => {
      const state = useEditorStore.getState()
      if (!state.project) return

      const sz = containerSizeRef.current
      if (sz.w === 0 || sz.h === 0) return

      if (canvas.width !== sz.w || canvas.height !== sz.h) {
        canvas.width = sz.w
        canvas.height = sz.h
      }

      const source = document.getElementById('source-video') as HTMLVideoElement | null
      if (!source || source.readyState < 2) return

      if (Math.abs(t - lastDrawnTimeRef.current) < 0.0005) return
      lastDrawnTimeRef.current = t

      const { videoWidth, videoHeight } = state.project
      const interp = interpolateAtTime(state.project.keyframes, t)

      const vidAspect = videoWidth / videoHeight
      const outAspect = state.project.outputWidth / state.project.outputHeight

      let cropFracW: number
      let cropFracH: number
      if (outAspect < vidAspect) {
        cropFracH = 1 / interp.scale
        cropFracW = (outAspect / vidAspect) * cropFracH
      } else {
        cropFracW = 1 / interp.scale
        cropFracH = (vidAspect / outAspect) * cropFracW
      }
      cropFracW = Math.min(1, Math.max(0.0001, cropFracW))
      cropFracH = Math.min(1, Math.max(0.0001, cropFracH))

      const cropW = cropFracW * videoWidth
      const cropH = cropFracH * videoHeight
      const cropX = (videoWidth - cropW) * Math.max(0, Math.min(1, interp.x))
      const cropY = (videoHeight - cropH) * Math.max(0, Math.min(1, interp.y))

      ctx.clearRect(0, 0, sz.w, sz.h)
      ctx.drawImage(source, cropX, cropY, cropW, cropH, 0, 0, sz.w, sz.h)

      if (hudRef.current) {
        hudRef.current.textContent = `${interp.scale.toFixed(1)}×`
      }
    }

    const startRaf = () => {
      const tick = () => {
        if (stopped) return
        const state = useEditorStore.getState()
        drawAtTime(state.currentTime)
        rafRef.current = requestAnimationFrame(tick)
      }
      rafRef.current = requestAnimationFrame(tick)
    }

    const startVfc = (video: HTMLVideoElement) => {
      const onFrame = (_now: number, meta: { mediaTime: number }) => {
        if (stopped) return
        drawAtTime(meta.mediaTime)
        vfcRef.current = (video as any).requestVideoFrameCallback(onFrame)
      }
      vfcRef.current = (video as any).requestVideoFrameCallback(onFrame)
    }

    const source = document.getElementById('source-video') as HTMLVideoElement | null
    const supportsVfc = !!source && typeof (source as any).requestVideoFrameCallback === 'function'

    if (supportsVfc && source) {
      startVfc(source)
    } else {
      startRaf()
    }

    return () => {
      stopped = true
      cancelAnimationFrame(rafRef.current)
      if (source && typeof (source as any).cancelVideoFrameCallback === 'function') {
        (source as any).cancelVideoFrameCallback(vfcRef.current)
      }
    }
  }, [project.videoPath])

  return (
    <Wrapper ref={wrapperRef}>
      <PlayerFrame $w={containerSize.w || 320} $h={containerSize.h || 568}>
        <CanvasEl ref={canvasRef} $w={containerSize.w || 320} $h={containerSize.h || 568} />
        {containerSize.w === 0 && <LoadingOverlay>Loading...</LoadingOverlay>}
        <HudBadge ref={hudRef}>1.0×</HudBadge>
      </PlayerFrame>
    </Wrapper>
  )
}
