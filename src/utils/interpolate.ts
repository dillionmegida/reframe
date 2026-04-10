import type { Keyframe } from '../types'
import { applyEasing } from './easing'

function resolveKeyframeScales(keyframes: Keyframe[]): Keyframe[] {
  if (keyframes.length === 0) return []
  
  const resolved: Keyframe[] = []
  let inheritedScale = 1.0
  
  for (let i = 0; i < keyframes.length; i++) {
    const kf = keyframes[i]
    
    if (kf.explicitScale) {
      inheritedScale = kf.scale
      resolved.push({ ...kf, scale: kf.scale })
    } else {
      resolved.push({ ...kf, scale: inheritedScale })
    }
  }
  
  return resolved
}

export function interpolateAtTime(
  keyframes: Keyframe[],
  t: number
): { x: number; y: number; scale: number } {
  if (keyframes.length === 0) {
    return { x: 0.5, y: 0.5, scale: 1.0 }
  }

  const resolvedKeyframes = resolveKeyframeScales(keyframes)

  if (resolvedKeyframes.length === 1 || t <= resolvedKeyframes[0].timestamp) {
    return { x: resolvedKeyframes[0].x, y: resolvedKeyframes[0].y, scale: resolvedKeyframes[0].scale }
  }

  const last = resolvedKeyframes[resolvedKeyframes.length - 1]
  if (t >= last.timestamp) {
    return { x: last.x, y: last.y, scale: last.scale }
  }

  let i = 0
  for (; i < resolvedKeyframes.length - 1; i++) {
    if (t >= resolvedKeyframes[i].timestamp && t < resolvedKeyframes[i + 1].timestamp) {
      break
    }
  }

  const kfA = resolvedKeyframes[i]
  const kfB = resolvedKeyframes[i + 1]

  const duration = kfB.timestamp - kfA.timestamp
  if (duration <= 0) {
    return { x: kfB.x, y: kfB.y, scale: kfB.scale }
  }

  const rawP = (t - kfA.timestamp) / duration
  const p = applyEasing(Math.max(0, Math.min(1, rawP)), kfB.easing)

  // Hermite (Catmull-Rom style) smoothing for smoother motion.
  // At boundaries, mirror the adjacent keyframe to get a natural non-zero tangent
  // instead of clamping (which produces a flat/jerky start or end).
  const kfPrev = i > 0
    ? resolvedKeyframes[i - 1]
    : {
        ...kfA,
        timestamp: kfA.timestamp - (kfB.timestamp - kfA.timestamp),
        x: 2 * kfA.x - kfB.x,
        y: 2 * kfA.y - kfB.y,
        scale: 2 * kfA.scale - kfB.scale,
      }
  const kfNext = i + 2 < resolvedKeyframes.length
    ? resolvedKeyframes[i + 2]
    : {
        ...kfB,
        timestamp: kfB.timestamp + (kfB.timestamp - kfA.timestamp),
        x: 2 * kfB.x - kfA.x,
        y: 2 * kfB.y - kfA.y,
        scale: 2 * kfB.scale - kfA.scale,
      }

  const t0 = kfPrev.timestamp
  const t1 = kfA.timestamp
  const t2 = kfB.timestamp
  const t3 = kfNext.timestamp

  const dt1 = Math.max(0.0001, t2 - t1)
  const dt0 = Math.max(0.0001, t1 - t0)
  const dt2 = Math.max(0.0001, t3 - t2)

  const tangent = (a: number, b: number, c: number, dtA: number, dtB: number) => {
    // Finite-difference tangent scaled by surrounding durations
    return ((b - a) / (dtA + dt1) + (c - b) / (dt1 + dtB)) * dt1 * 0.5
  }

  const m1x = tangent(kfPrev.x, kfA.x, kfB.x, dt0, dt1)
  const m2x = tangent(kfA.x, kfB.x, kfNext.x, dt1, dt2)
  const m1y = tangent(kfPrev.y, kfA.y, kfB.y, dt0, dt1)
  const m2y = tangent(kfA.y, kfB.y, kfNext.y, dt1, dt2)
  const m1s = tangent(kfPrev.scale, kfA.scale, kfB.scale, dt0, dt1)
  const m2s = tangent(kfA.scale, kfB.scale, kfNext.scale, dt1, dt2)

  const h00 = 2 * p * p * p - 3 * p * p + 1
  const h10 = p * p * p - 2 * p * p + p
  const h01 = -2 * p * p * p + 3 * p * p
  const h11 = p * p * p - p * p

  return {
    x: h00 * kfA.x + h10 * m1x + h01 * kfB.x + h11 * m2x,
    y: h00 * kfA.y + h10 * m1y + h01 * kfB.y + h11 * m2y,
    scale: h00 * kfA.scale + h10 * m1s + h01 * kfB.scale + h11 * m2s,
  }
}

export function computePreviewStyle(
  x: number,
  y: number,
  scale: number,
  sourceWidth: number,
  sourceHeight: number,
  containerWidth: number,
  containerHeight: number
): { width: string; height: string; transform: string } {
  if (containerWidth === 0 || containerHeight === 0) {
    return { width: '0px', height: '0px', transform: 'translate(0px, 0px)' }
  }

  const outputAspect = containerWidth / containerHeight
  const videoAspect = sourceWidth / sourceHeight

  // Compute crop region as a fraction of source dimensions
  let cropFractionW: number
  let cropFractionH: number

  if (outputAspect < videoAspect) {
    // Portrait/taller output on landscape source – height-limited
    cropFractionH = 1 / scale
    cropFractionW = (outputAspect / videoAspect) * cropFractionH
  } else {
    // Landscape or square output – width-limited
    cropFractionW = 1 / scale
    cropFractionH = (videoAspect / outputAspect) * cropFractionW
  }

  cropFractionW = Math.min(1, Math.max(0.0001, cropFractionW))
  cropFractionH = Math.min(1, Math.max(0.0001, cropFractionH))

  // Scale the video so the crop region fills the container exactly
  // We need: cropFractionW * sourceWidth * scaleFactor = containerWidth
  // and:    cropFractionH * sourceHeight * scaleFactor = containerHeight
  // Use the dimension that makes the crop fill the container:
  const scaleFactorW = containerWidth / (cropFractionW * sourceWidth)
  const scaleFactorH = containerHeight / (cropFractionH * sourceHeight)
  // Both should be equal in theory; use the one that ensures full coverage
  const scaleFactor = Math.max(scaleFactorW, scaleFactorH)

  const renderedWidth = sourceWidth * scaleFactor
  const renderedHeight = sourceHeight * scaleFactor

  const clampedX = Math.max(0, Math.min(1, x))
  const clampedY = Math.max(0, Math.min(1, y))

  // Crop position in source pixels
  const cropSourceX = (sourceWidth - cropFractionW * sourceWidth) * clampedX
  const cropSourceY = (sourceHeight - cropFractionH * sourceHeight) * clampedY

  // Translate so the crop region starts at container origin
  const translateX = -(cropSourceX * scaleFactor)
  const translateY = -(cropSourceY * scaleFactor)

  // Center the crop in the container if there's any size mismatch
  const cropRenderedW = cropFractionW * sourceWidth * scaleFactor
  const cropRenderedH = cropFractionH * sourceHeight * scaleFactor
  const offsetX = (containerWidth - cropRenderedW) / 2
  const offsetY = (containerHeight - cropRenderedH) / 2

  return {
    width: `${renderedWidth}px`,
    height: `${renderedHeight}px`,
    transform: `translate(${translateX + offsetX}px, ${translateY + offsetY}px)`,
  }
}
