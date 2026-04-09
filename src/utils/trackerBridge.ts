import type { TrackResult, UntrackedRange } from '../types'
import { trackFrames, type BBox } from './simpleTracker'

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

async function extractFrames(
  videoPath: string,
  start: number,
  end: number,
  fps: number,
  sourceWidth: number,
  sourceHeight: number,
  onProgress?: (n: number, total: number) => void
): Promise<{ frames: ImageData[]; trackW: number; trackH: number }> {
  // Downscale for tracking speed
  const scale = Math.min(1, TRACKING_WIDTH / sourceWidth)
  const trackW = Math.round(sourceWidth * scale)
  const trackH = Math.round(sourceHeight * scale)

  console.log('[TrackerBridge] Extracting frames', { videoPath, start, end, fps, sourceWidth, sourceHeight, trackW, trackH })

  const video = document.createElement('video')
  video.src = `file://${videoPath}`
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

  const frameDuration = 1 / fps
  const frameCount = Math.max(1, Math.round((end - start) * fps))
  const frames: ImageData[] = []

  console.log('[TrackerBridge] Extracting', frameCount, 'frames at', fps, 'fps')

  for (let i = 0; i < frameCount; i++) {
    const seekTime = start + i * frameDuration
    video.currentTime = seekTime

    await new Promise<void>((resolve) => {
      const timeout = setTimeout(() => {
        console.warn('[TrackerBridge] Seek timeout at frame', i, 'time', seekTime)
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
    frames.push(ctx.getImageData(0, 0, trackW, trackH))

    onProgress?.(i + 1, frameCount)
  }

  console.log('[TrackerBridge] Extracted', frames.length, 'frames')
  return { frames, trackW, trackH }
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

  const cancel = () => {
    cancelled = true
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

    // Phase 1: Extract frames at downscaled resolution (0–50% progress)
    const { frames, trackW, trackH } = await extractFrames(
      options.videoPath,
      options.start,
      options.end,
      options.fps,
      options.frameWidth,
      options.frameHeight,
      (n, total) => {
        if (cancelled) return
        const pct = (n / total) * 50
        options.onProgress(pct, n, totalFrames, true)
      }
    )

    if (cancelled) return cancel

    if (frames.length === 0) {
      options.onError('No frames extracted from video')
      return cancel
    }

    // Scale the user-drawn bbox from source resolution to tracking resolution
    const scaleX = trackW / options.frameWidth
    const scaleY = trackH / options.frameHeight
    const scaledBbox: BBox = {
      x: Math.round(options.initialBbox.x * scaleX),
      y: Math.round(options.initialBbox.y * scaleY),
      w: Math.max(8, Math.round(options.initialBbox.w * scaleX)),
      h: Math.max(8, Math.round(options.initialBbox.h * scaleY)),
    }

    console.log('[TrackerBridge] Phase 2: Running tracker on', frames.length, 'frames at', trackW, 'x', trackH, 'scaledBbox:', scaledBbox)

    // Phase 2: Run tracker on extracted frames (50–100% progress)
    const trackResults = await trackFrames(
      frames,
      scaledBbox,
      options.start,
      options.fps,
      (frame, total) => {
        if (cancelled) return
        const pct = 50 + (frame / total) * 50
        const confident = true
        options.onProgress(pct, frame, total, confident)
      }
    )

    if (cancelled) return cancel

    console.log('[TrackerBridge] Tracking complete:', trackResults.length, 'results')

    // Convert to TrackResult format
    const results: TrackResult[] = trackResults.map((r) => ({
      frame: r.frame,
      t: r.t,
      x: r.cx,
      y: r.cy,
      confident: r.confidence >= 0.4,
    }))

    const untrackedRanges = computeUntrackedRanges(results)
    console.log('[TrackerBridge] Untracked ranges:', untrackedRanges.length)

    options.onDone(results, untrackedRanges)
  } catch (err: any) {
    console.error('[TrackerBridge] Error:', err)
    if (!cancelled) {
      options.onError(err?.message || 'Tracking failed')
    }
  }

  return cancel
}
