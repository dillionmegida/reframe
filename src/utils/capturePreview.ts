import { interpolateAtTime } from './interpolate'
import { computeCrop } from './computeCrop'
import type { Keyframe } from '../types'
import CaptureWorker from './captureWorker?worker'

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

    const vidW = video.videoWidth || videoWidth
    const vidH = video.videoHeight || videoHeight

    const frameDuration = 1 / fps
    const frameCount = Math.round((end - start) * fps)

    const frameDir: string = await (window as any).electron.createFrameDir()
    const savePromises: Promise<any>[] = []

    // Spin up a worker that handles drawing + JPEG encoding off the main thread
    const worker = new CaptureWorker()
    worker.postMessage({ type: 'init', outputWidth, outputHeight })

    // Set up a promise-based mechanism to handle worker responses
    let resolveEncoded: ((data: ArrayBuffer) => void) | null = null
    let rejectEncoded: ((err: Error) => void) | null = null

    worker.onmessage = (e: MessageEvent) => {
      const msg = e.data
      if (msg.type === 'encoded' && resolveEncoded) {
        resolveEncoded(msg.data)
        resolveEncoded = null
        rejectEncoded = null
      } else if (msg.type === 'error' && rejectEncoded) {
        rejectEncoded(new Error(msg.message))
        resolveEncoded = null
        rejectEncoded = null
      }
    }

    function waitForEncoded(): Promise<ArrayBuffer> {
      return new Promise<ArrayBuffer>((resolve, reject) => {
        resolveEncoded = resolve
        rejectEncoded = reject
      })
    }

    for (let i = 0; i < frameCount; i++) {
      const targetTime = start + i * frameDuration

      // Seek to the exact frame time (must happen on main thread — DOM-bound)
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

      // Create a transferable ImageBitmap from the video frame (lightweight on main thread)
      const bitmap = await createImageBitmap(video)

      // Send bitmap + crop params to worker for draw + JPEG encode
      const encodedPromise = waitForEncoded()
      worker.postMessage(
        { type: 'frame', index: i, bitmap, cropX, cropY, cropW, cropH },
        [bitmap]
      )

      // Wait for the worker to encode and return the JPEG buffer
      const jpegBuffer = await encodedPromise
      const savePromise = (async () => {
        const buf = new Uint8Array(jpegBuffer)
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

    // Clean up the worker
    worker.terminate()

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