import type { Keyframe, TrimRange } from '../types'
import { interpolateAtTime } from './interpolate'

const SAMPLE_INTERVAL = 0.1

interface Sample {
  t: number       // time relative to trim.start (0-based, matches ffmpeg's in_time)
  zoom: number    // zoompan zoom level (≥1)
  panX: number    // zoompan x position (pixels in zoomed space)
  panY: number    // zoompan y position (pixels in zoomed space)
}

/**
 * Build the ffmpeg -vf filter string for export using the zoompan filter.
 *
 * zoompan outputs a fixed-size frame on every input frame — no filter reinit errors.
 *
 * How zoom/pan map to the preview:
 *   Preview: cropFracH = 1/scale  (portrait-on-landscape case)
 *   zoompan: visible fraction = 1/zoom
 *   → zoom = scale (direct mapping)
 *
 *   Preview: cropX = (srcW - cropW) * x,  cropY = (srcH - cropH) * y
 *   zoompan: the zoomed virtual image is iw*zoom × ih*zoom,
 *            the output window is ow × oh,
 *            pan_x = (iw*zoom - ow) * x,  pan_y = (ih*zoom - oh) * y
 *
 * d=1 means one output frame per input frame (preserve original fps).
 * s=WxH sets fixed output resolution.
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

  // Use interpolation at the slice start time (static crop for now)
  const interp = interpolateAtTime(kfs, trim.start)

  // Match preview crop calculation exactly
  const vidAspect = sourceWidth / sourceHeight
  const outAspect = outW / outH

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

  const cropW = Math.floor((cropFracW * sourceWidth) / 2) * 2
  const cropH = Math.floor((cropFracH * sourceHeight) / 2) * 2
  const cropX = Math.floor(((sourceWidth - cropW) * Math.max(0, Math.min(1, interp.x))) / 2) * 2
  const cropY = Math.floor(((sourceHeight - cropH) * Math.max(0, Math.min(1, interp.y))) / 2) * 2

  return `crop=${cropW}:${cropH}:${cropX}:${cropY},scale=${outW}:${outH}`
}