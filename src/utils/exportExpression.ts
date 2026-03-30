import type { Keyframe, TrimRange } from '../types'
import { interpolateAtTime } from './interpolate'

const SAMPLE_INTERVAL = 0.1

interface Sample {
  t: number       // time relative to trim.start (seconds)
  frame: number   // frame index relative to trim.start (on)
  zoom: number    // zoompan zoom level (>=1)
  panX: number    // zoompan x position (pixels in zoomed space)
  panY: number    // zoompan y position (pixels in zoomed space)
}

/**
 * Build the ffmpeg -vf filter string for export using zoompan.
 * zoompan keeps output size fixed, allowing per-frame zoom/pan without filter reinit.
 *
 * Mapping to preview logic:
 *   preview scale -> zoompan zoom (direct)
 *   preview pan   -> panX/panY = (iw*zoom - ow) * x/y
 */
export function buildCropExpression(
  keyframes: Keyframe[],
  trim: TrimRange,
  sourceWidth: number,
  sourceHeight: number,
  outputWidth: number,
  outputHeight: number,
  fps: number = 30
): string {
  const outW = Math.floor(outputWidth / 2) * 2
  const outH = Math.floor(outputHeight / 2) * 2

  const kfs = keyframes.length > 0
    ? keyframes
    : [{ id: '', timestamp: trim.start, x: 0.5, y: 0.5, scale: 1.0, easing: 'linear' as const }]

  const duration = Math.max(0, trim.end - trim.start)

  // Base zoom so that scale=1 matches the preview visible area
  const vidAspect = sourceWidth / sourceHeight
  const outAspect = outW / outH
  const baseZoom = outAspect < vidAspect
    ? outH / sourceHeight // height-limited: full height visible at scale=1
    : outW / sourceWidth  // width-limited: full width visible at scale=1

  // Build sampled timeline
  const samples: Sample[] = []
  const stepCount = Math.max(1, Math.ceil(duration / SAMPLE_INTERVAL))
  for (let i = 0; i <= stepCount; i++) {
    const tRel = i === stepCount ? duration : i * SAMPLE_INTERVAL
    const tAbs = trim.start + tRel
    const interp = interpolateAtTime(kfs, tAbs)

    const frame = Math.round(tRel * fps)

    const zoom = Math.max(1, baseZoom * Math.max(interp.scale, 1))
    const maxPanX = Math.max(0, sourceWidth * zoom - outW)
    const maxPanY = Math.max(0, sourceHeight * zoom - outH)
    const panX = maxPanX * Math.max(0, Math.min(1, interp.x))
    const panY = maxPanY * Math.max(0, Math.min(1, interp.y))

    samples.push({ t: tRel, frame, zoom, panX, panY })
  }

  const buildExpr = (getValue: (s: Sample) => number): string => {
    if (samples.length === 1) return getValue(samples[0]).toFixed(4)

    let expr = getValue(samples[samples.length - 1]).toFixed(4)
    for (let i = samples.length - 2; i >= 0; i--) {
      const s0 = samples[i]
      const s1 = samples[i + 1]
      const v0 = getValue(s0)
      const v1 = getValue(s1)
      const segFrames = s1.frame - s0.frame
      if (segFrames <= 0) continue

      let segExpr: string
      if (Math.abs(v0 - v1) < 0.001) {
        segExpr = v0.toFixed(4)
      } else {
        const slope = (v1 - v0) / segFrames
        segExpr = `${v0.toFixed(4)}+${slope.toFixed(6)}*(on-${s0.frame})`
      }

      expr = `if(lte(on,${s1.frame}),${segExpr},${expr})`
    }

    return expr
  }

  const zExpr = buildExpr(s => s.zoom)
  const xExpr = buildExpr(s => s.panX)
  const yExpr = buildExpr(s => s.panY)

  // setpts to reset timestamps after input-level -ss, then zoompan with fixed size
  return `setpts=PTS-STARTPTS,zoompan=z='${zExpr}':x='${xExpr}':y='${yExpr}':d=1:s=${outW}x${outH}`
}