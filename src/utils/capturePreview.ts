import { interpolateAtTime } from './interpolate'
import type { Keyframe } from '../types'

// Helper to compute crop same as PreviewPanel
function computeCrop(
  interp: { x: number; y: number; scale: number },
  sourceWidth: number,
  sourceHeight: number,
  outputWidth: number,
  outputHeight: number
) {
  const vidAspect = sourceWidth / sourceHeight
  const outAspect = outputWidth / outputHeight

  let cropFracW: number
  let cropFracH: number
  if (outAspect < vidAspect) {
    cropFracH = 1 / Math.max(interp.scale, 0.0001)
    cropFracW = (outAspect / vidAspect) * cropFracH
  } else {
    cropFracW = 1 / Math.max(interp.scale, 0.0001)
    cropFracH = (vidAspect / outAspect) * cropFracW
  }

  cropFracW = Math.min(1, Math.max(0.0001, cropFracW))
  cropFracH = Math.min(1, Math.max(0.0001, cropFracH))

  const cropW = cropFracW * sourceWidth
  const cropH = cropFracH * sourceHeight
  const cropX = (sourceWidth - cropW) * Math.max(0, Math.min(1, interp.x))
  const cropY = (sourceHeight - cropH) * Math.max(0, Math.min(1, interp.y))

  return { cropW, cropH, cropX, cropY }
}

// Capture preview using canvas.captureStream + MediaRecorder
async function handleCapture(payload: any) {
  try {
    const {
      videoPath,
      start,
      end,
      fps,
      outputWidth,
      outputHeight,
      keyframes,
      videoWidth,
      videoHeight,
      replyChannel,
    } = payload

    const video = document.createElement('video')
    video.src = `file://${videoPath}`
    video.crossOrigin = 'anonymous'
    video.muted = true

    await new Promise((resolve, reject) => {
      video.onloadedmetadata = () => resolve(null)
      video.onerror = () => reject(new Error('video load failed'))
    })

    const canvas = document.createElement('canvas')
    canvas.width = outputWidth
    canvas.height = outputHeight
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('No canvas context')

    const stream = canvas.captureStream(fps)
    const chunks: BlobPart[] = []
    const recorder = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp9' })

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data)
    }

    const done = new Promise<void>((resolve) => {
      recorder.onstop = () => resolve()
    })

    // Seek to start and play
    video.currentTime = start
    await new Promise((resolve) => (video.onseeked = () => resolve(null)))

    recorder.start()
    await video.play()

    const vidW = video.videoWidth || videoWidth
    const vidH = video.videoHeight || videoHeight

    let rafId = 0
    const draw = () => {
      const t = video.currentTime
      if (t >= end || video.ended) {
        recorder.stop()
        cancelAnimationFrame(rafId)
        video.pause()
        return
      }

      const interp = interpolateAtTime(keyframes as Keyframe[], t)
      const { cropW, cropH, cropX, cropY } = computeCrop(
        interp,
        vidW,
        vidH,
        outputWidth,
        outputHeight
      )

      ctx.clearRect(0, 0, outputWidth, outputHeight)
      ctx.drawImage(video, cropX, cropY, cropW, cropH, 0, 0, outputWidth, outputHeight)

      rafId = requestAnimationFrame(draw)
    }

    rafId = requestAnimationFrame(draw)

    await done

    const blob = new Blob(chunks, { type: 'video/webm' })
    const buf = new Uint8Array(await blob.arrayBuffer())
    const tempPath = await (window as any).electron.saveTempBlob(buf, 'webm')
    ;(window as any).electron.respondCapture(replyChannel, { path: tempPath })
  } catch (err: any) {
    console.error('capture error', err)
    ;(window as any).electron.respondCapture(payload.replyChannel, { error: err?.message || 'capture failed' })
  }
}

// Register listener once
;(window as any).electron.onCaptureRequest((payload: any) => {
  handleCapture(payload)
})
