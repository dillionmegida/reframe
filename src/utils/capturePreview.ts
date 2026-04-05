import { interpolateAtTime } from './interpolate'
import type { Keyframe } from '../types'

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

// Bitrate scaled to output resolution:
// 1080x1920 -> ~8 Mbps, 1214x2160 (4K) -> ~20 Mbps
function computeBitrate(outputWidth: number, outputHeight: number): number {
  const pixels = outputWidth * outputHeight
  const pixels1080p = 1080 * 1920
  const baseBitrate = 8_000_000
  return Math.round(baseBitrate * (pixels / pixels1080p))
}

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
      progressChannel,
    } = payload

    const video = document.createElement('video')
    video.src = `file://${videoPath}`
    video.crossOrigin = 'anonymous'
    video.muted = true
    video.playsInline = true
    video.preload = 'auto'

    await new Promise((resolve, reject) => {
      video.onloadedmetadata = () => resolve(null)
      video.onerror = () => reject(new Error('Video failed to load'))
    })

    const canvas = document.createElement('canvas')
    canvas.width = outputWidth
    canvas.height = outputHeight
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Could not get canvas 2D context')

    const vidW = video.videoWidth || videoWidth
    const vidH = video.videoHeight || videoHeight

    const frameDuration = 1 / fps
    const frameCount = Math.round((end - start) * fps)

    const frameDir: string = await (window as any).electron.createFrameDir()
    const savePromises: Promise<any>[] = []

    for (let i = 0; i < frameCount; i++) {
      const targetTime = start + i * frameDuration

      // Seek to the exact frame time
      video.currentTime = targetTime
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error(`Seek timed out at frame ${i}`)), 8_000)
        const onSeeked = () => {
          clearTimeout(timeout)
          video.removeEventListener('seeked', onSeeked)
          resolve()
        }
        video.addEventListener('seeked', onSeeked)
      })

      // Use actual decoded frame time for crop calculation so crop matches visual content
      const frameTime = video.currentTime

      const interp = interpolateAtTime(keyframes as Keyframe[], frameTime)
      const { cropW, cropH, cropX, cropY } = computeCrop(
        interp, vidW, vidH, outputWidth, outputHeight
      )

      ctx.clearRect(0, 0, outputWidth, outputHeight)
      ctx.drawImage(video, cropX, cropY, cropW, cropH, 0, 0, outputWidth, outputHeight)

      // Export frame as JPEG and save via IPC
      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(
          (b) => (b ? resolve(b) : reject(new Error('canvas.toBlob failed'))),
          'image/jpeg',
          0.97
        )
      })
      const savePromise = (async () => {
        const buf = new Uint8Array(await blob.arrayBuffer())
        await (window as any).electron.saveFrame(buf, frameDir, i)
      })()
      savePromises.push(savePromise)

      if (progressChannel) {
        const pct = Math.min(99, ((i + 1) / frameCount) * 100)
        ;(window as any).electron.respondCaptureProgress(progressChannel, { progress: pct })
      }
    }

    if (progressChannel) {
      ;(window as any).electron.respondCaptureProgress(progressChannel, { progress: 100 })
    }

    // Ensure all frame writes finished before responding
    await Promise.all(savePromises)

    ;(window as any).electron.respondCapture(replyChannel, { frameDir, frameCount })
  } catch (err: any) {
    console.error('[capturePreview] error:', err)
    ;(window as any).electron.respondCapture(payload.replyChannel, {
      error: err?.message || 'Capture failed',
    })
  }
}

// Register listener once at module load
;(window as any).electron.onCaptureRequest((payload: any) => {
  handleCapture(payload)
})