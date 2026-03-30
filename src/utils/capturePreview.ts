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

    await new Promise((resolve, reject) => {
      video.onloadedmetadata = () => resolve(null)
      video.onerror = () => reject(new Error('Video failed to load'))
    })

    const canvas = document.createElement('canvas')
    canvas.width = outputWidth
    canvas.height = outputHeight
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Could not get canvas 2D context')

    const bitrate = computeBitrate(outputWidth, outputHeight)
    const stream = canvas.captureStream(fps)
    const chunks: BlobPart[] = []

    const recorder = new MediaRecorder(stream, {
      mimeType: 'video/webm;codecs=vp9',
      videoBitsPerSecond: bitrate,
    })

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data)
    }

    const recordingDone = new Promise<void>((resolve) => {
      recorder.onstop = () => resolve()
    })

    // Seek to start
    video.currentTime = start
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Seek timed out')), 10_000)
      video.onseeked = () => {
        clearTimeout(timeout)
        resolve()
      }
    })

    recorder.start()
    await video.play()

    const vidW = video.videoWidth || videoWidth
    const vidH = video.videoHeight || videoHeight

    // Use requestVideoFrameCallback if available — fires exactly once per decoded
    // video frame with the precise frame timestamp, eliminating rAF timing jitter
    // that causes choppy playback on iPhone.
    // Falls back to requestAnimationFrame on browsers that don't support it.
    const supportsRVFC = 'requestVideoFrameCallback' in video

    if (supportsRVFC) {
      await new Promise<void>((resolve) => {
        const onFrame = (_now: number, meta: { mediaTime: number }) => {
          const t = meta.mediaTime

          if (t >= end || video.ended) {
            recorder.stop()
            video.pause()
            resolve()
            return
          }

          const interp = interpolateAtTime(keyframes as Keyframe[], t)
          const { cropW, cropH, cropX, cropY } = computeCrop(
            interp, vidW, vidH, outputWidth, outputHeight
          )

          ctx.clearRect(0, 0, outputWidth, outputHeight)
          ctx.drawImage(video, cropX, cropY, cropW, cropH, 0, 0, outputWidth, outputHeight)

          if (progressChannel) {
            const pct = Math.min(100, ((t - start) / (end - start)) * 100)
            ;(window as any).electron.respondCaptureProgress(progressChannel, { progress: pct })
          }

          ;(video as any).requestVideoFrameCallback(onFrame)
        }

        ;(video as any).requestVideoFrameCallback(onFrame)
      })
    } else {
      // rAF fallback
      await new Promise<void>((resolve) => {
        let rafId = 0

        const draw = () => {
          const t = video.currentTime

          if (t >= end || video.ended) {
            recorder.stop()
            cancelAnimationFrame(rafId)
            video.pause()
            resolve()
            return
          }

          const interp = interpolateAtTime(keyframes as Keyframe[], t)
          const { cropW, cropH, cropX, cropY } = computeCrop(
            interp, vidW, vidH, outputWidth, outputHeight
          )

          ctx.clearRect(0, 0, outputWidth, outputHeight)
          ctx.drawImage(video, cropX, cropY, cropW, cropH, 0, 0, outputWidth, outputHeight)

          if (progressChannel) {
            const pct = Math.min(100, ((t - start) / (end - start)) * 100)
            ;(window as any).electron.respondCaptureProgress(progressChannel, { progress: pct })
          }

          rafId = requestAnimationFrame(draw)
        }

        rafId = requestAnimationFrame(draw)
      })
    }

    await recordingDone

    if (progressChannel) {
      ;(window as any).electron.respondCaptureProgress(progressChannel, { progress: 100 })
    }

    const blob = new Blob(chunks, { type: 'video/webm' })
    const buf = new Uint8Array(await blob.arrayBuffer())
    const tempPath = await (window as any).electron.saveTempBlob(buf, 'webm')
    ;(window as any).electron.respondCapture(replyChannel, { path: tempPath })
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