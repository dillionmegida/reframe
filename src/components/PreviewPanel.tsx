import { useRef, useEffect, useState } from 'react'
import { useEditorStore } from '../store/editorStore'
import { interpolateAtTime } from '../utils/interpolate'

export default function PreviewPanel() {
  const project = useEditorStore((s) => s.project!)

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const containerSizeRef = useRef({ w: 0, h: 0 })
  const [containerSize, setContainerSize] = useState({ w: 0, h: 0 })
  const rafRef = useRef<number>(0)
  const hudRef = useRef<HTMLDivElement>(null)

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

  // rAF loop: draw the crop region from the source video onto the canvas
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const tick = () => {
      const state = useEditorStore.getState()
      if (!state.project) {
        rafRef.current = requestAnimationFrame(tick)
        return
      }

      const sz = containerSizeRef.current
      if (sz.w === 0 || sz.h === 0) {
        rafRef.current = requestAnimationFrame(tick)
        return
      }

      // Ensure canvas backing size matches display size
      if (canvas.width !== sz.w || canvas.height !== sz.h) {
        canvas.width = sz.w
        canvas.height = sz.h
      }

      const source = document.getElementById('source-video') as HTMLVideoElement | null
      if (!source || source.readyState < 2) {
        rafRef.current = requestAnimationFrame(tick)
        return
      }

      const { videoWidth, videoHeight } = state.project
      const interp = interpolateAtTime(state.project.keyframes, state.currentTime)

      const vidAspect = videoWidth / videoHeight
      const outAspect = state.project.outputWidth / state.project.outputHeight

      // Compute crop region as fraction of source
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

      // Crop in source pixels
      const cropW = cropFracW * videoWidth
      const cropH = cropFracH * videoHeight
      const cropX = (videoWidth - cropW) * Math.max(0, Math.min(1, interp.x))
      const cropY = (videoHeight - cropH) * Math.max(0, Math.min(1, interp.y))

      // Draw the crop region scaled to fill the canvas
      ctx.clearRect(0, 0, sz.w, sz.h)
      ctx.drawImage(source, cropX, cropY, cropW, cropH, 0, 0, sz.w, sz.h)

      // Update HUD
      if (hudRef.current) {
        hudRef.current.textContent = `${interp.scale.toFixed(1)}×`
      }

      rafRef.current = requestAnimationFrame(tick)
    }

    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [project.videoPath])

  return (
    <div ref={wrapperRef} className="h-full w-full flex flex-col items-center justify-center p-4">
      <div
        className="relative overflow-hidden rounded-sm"
        style={{
          width: containerSize.w || 320,
          height: containerSize.h || 568,
          background: '#000',
        }}
      >
        <canvas
          ref={canvasRef}
          style={{
            width: containerSize.w || 320,
            height: containerSize.h || 568,
            display: 'block',
          }}
        />
        {containerSize.w === 0 && (
          <div className="absolute inset-0 flex items-center justify-center text-text-muted text-xs">
            Loading...
          </div>
        )}
        {/* HUD badge */}
        <div
          ref={hudRef}
          className="absolute bottom-2 right-2 font-mono text-xs text-accent bg-black/60 px-1.5 py-0.5 rounded z-10"
        >
          1.0×
        </div>
      </div>
    </div>
  )
}
