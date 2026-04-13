import type { TrackResult, UntrackedRange } from '../types'
import type { BBox } from './simpleTracker'
import TrackerWorker from './trackerWorker?worker'

const TRACKING_WIDTH = 480 // downscale to this width for speed

export interface TrackerBridgeOptions {
  videoPath: string
  start: number
  end: number
  fps: number
  initialBbox: BBox
  frameWidth: number
  frameHeight: number
  onProgress: (progress: number, frame: number, total: number, confident: boolean) => void
  onDone: (results: TrackResult[], untrackedRanges: UntrackedRange[]) => void
  onError: (message: string) => void
}

/**
 * Extract a single frame at the given seek time onto the provided canvas,
 * then return the pixel data as a transferable ArrayBuffer.
 * The ImageData is NOT retained — only the raw buffer is kept briefly
 * before being transferred to the worker (zero-copy).
 */
async function extractAndTransferFrame(
  video: HTMLVideoElement,
  ctx: CanvasRenderingContext2D,
  trackW: number,
  trackH: number,
  seekTime: number,
  frameIndex: number
): Promise<ArrayBuffer> {
  video.currentTime = seekTime

  await new Promise<void>((resolve) => {
    const timeout = setTimeout(() => {
      console.warn('[TrackerBridge] Seek timeout at frame', frameIndex, 'time', seekTime)
      resolve()
    }, 8_000)
    const onSeeked = () => {
      clearTimeout(timeout)
      video.removeEventListener('seeked', onSeeked)
      resolve()
    }
    video.addEventListener('seeked', onSeeked)
  })

  ctx.drawImage(video, 0, 0, trackW, trackH)
  const imageData = ctx.getImageData(0, 0, trackW, trackH)
  // Return the underlying ArrayBuffer — will be transferred (not copied) to worker
  return imageData.data.buffer
}

function computeUntrackedRanges(
  results: TrackResult[],
  minRangeDuration = 0.2
): UntrackedRange[] {
  const ranges: UntrackedRange[] = []
  let rangeStart: number | null = null

  for (let i = 0; i < results.length; i++) {
    if (!results[i].confident && rangeStart === null) {
      rangeStart = results[i].t
    } else if (results[i].confident && rangeStart !== null) {
      const duration = results[i].t - rangeStart
      if (duration >= minRangeDuration) {
        ranges.push({ start: rangeStart, end: results[i].t })
      }
      rangeStart = null
    }
  }

  if (rangeStart !== null) {
    const duration = results[results.length - 1].t - rangeStart
    if (duration >= minRangeDuration) {
      ranges.push({ start: rangeStart, end: results[results.length - 1].t })
    }
  }

  return ranges
}

export async function runTracker(options: TrackerBridgeOptions): Promise<() => void> {
  let cancelled = false
  let worker: Worker | null = null

  const cancel = () => {
    cancelled = true
    if (worker) {
      worker.terminate()
      worker = null
    }
  }

  try {
    const totalFrames = Math.max(1, Math.round((options.end - options.start) * options.fps))

    console.log('[TrackerBridge] Starting tracking', {
      start: options.start,
      end: options.end,
      fps: options.fps,
      totalFrames,
      bbox: options.initialBbox,
    })

    // Downscale for tracking speed
    const scale = Math.min(1, TRACKING_WIDTH / options.frameWidth)
    const trackW = Math.round(options.frameWidth * scale)
    const trackH = Math.round(options.frameHeight * scale)

    // Scale the user-drawn bbox from source resolution to tracking resolution
    const scaleX = trackW / options.frameWidth
    const scaleY = trackH / options.frameHeight
    const scaledBbox: BBox = {
      x: Math.round(options.initialBbox.x * scaleX),
      y: Math.round(options.initialBbox.y * scaleY),
      w: Math.max(8, Math.round(options.initialBbox.w * scaleX)),
      h: Math.max(8, Math.round(options.initialBbox.h * scaleY)),
    }

    // Set up video element for frame extraction
    const video = document.createElement('video')
    video.src = `file://${options.videoPath}`
    video.crossOrigin = 'anonymous'
    video.muted = true
    video.playsInline = true
    video.preload = 'auto'

    await new Promise((resolve, reject) => {
      video.onloadedmetadata = () => {
        console.log('[TrackerBridge] Video metadata loaded:', video.videoWidth, 'x', video.videoHeight, 'duration:', video.duration)
        resolve(null)
      }
      video.onerror = () => {
        reject(new Error('Failed to load video for frame extraction'))
      }
    })

    const canvas = document.createElement('canvas')
    canvas.width = trackW
    canvas.height = trackH
    const ctx = canvas.getContext('2d')!

    // Spin up the tracker worker
    const w = new TrackerWorker()
    worker = w

    const trackResults: TrackResult[] = []

    // Set up a promise that resolves when the worker finishes
    const workerDone = new Promise<void>((resolve, reject) => {
      w.onmessage = (e: MessageEvent) => {
        const msg = e.data
        if (cancelled) return

        switch (msg.type) {
          case 'result': {
            const r = msg.result
            trackResults.push({
              frame: r.frame,
              t: r.t,
              x: r.cx,
              y: r.cy,
              confident: r.confidence >= 0.4,
            })
            break
          }
          case 'progress': {
            // Map combined progress: extraction is interleaved with tracking
            // Each frame goes through extract (main) → track (worker) as one unit
            const pct = ((msg.frame + 1) / msg.total) * 100
            options.onProgress(pct, msg.frame, msg.total, true)
            break
          }
          case 'finished':
            resolve()
            break
          case 'error':
            reject(new Error(msg.message))
            break
        }
      }
      w.onerror = (err) => {
        reject(new Error(err.message || 'Worker error'))
      }
    })

    // Initialize the worker with bbox and dimensions
    w.postMessage({
      type: 'init',
      bbox: scaledBbox,
      width: trackW,
      height: trackH,
      startTime: options.start,
      fps: options.fps,
      totalFrames,
      opts: {},
    })

    console.log('[TrackerBridge] Streaming', totalFrames, 'frames to worker at', trackW, 'x', trackH, 'scaledBbox:', scaledBbox)

    // Stream frames one at a time: extract on main thread, transfer to worker
    const frameDuration = 1 / options.fps
    for (let i = 0; i < totalFrames; i++) {
      if (cancelled) break

      const seekTime = options.start + i * frameDuration
      const buffer = await extractAndTransferFrame(video, ctx, trackW, trackH, seekTime, i)

      if (cancelled) break

      // Transfer the ArrayBuffer to the worker (zero-copy)
      w.postMessage({ type: 'frame', index: i, data: buffer }, [buffer])
    }

    if (!cancelled) {
      // Signal that all frames have been sent
      w.postMessage({ type: 'done' })
      await workerDone
    }

    if (cancelled) return cancel

    console.log('[TrackerBridge] Tracking complete:', trackResults.length, 'results')

    const untrackedRanges = computeUntrackedRanges(trackResults)
    console.log('[TrackerBridge] Untracked ranges:', untrackedRanges.length)

    options.onDone(trackResults, untrackedRanges)

    // Clean up the worker
    w.terminate()
    worker = null
  } catch (err: any) {
    console.error('[TrackerBridge] Error:', err)
    if (worker) {
      worker.terminate()
      worker = null
    }
    if (!cancelled) {
      options.onError(err?.message || 'Tracking failed')
    }
  }

  return cancel
}
