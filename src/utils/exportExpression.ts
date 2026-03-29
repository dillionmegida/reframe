import type { Keyframe, TrimRange } from '../types'
import { applyEasing } from './easing'

export function buildCropExpression(
  keyframes: Keyframe[],
  trim: TrimRange,
  sourceWidth: number,
  sourceHeight: number,
  outputWidth: number,
  outputHeight: number
): string {
  const sorted = [...keyframes].sort((a, b) => a.timestamp - b.timestamp)

  if (sorted.length === 0) {
    const cropW = sourceWidth
    const cropH = cropW * (outputHeight / outputWidth)
    const cropX = 0.5 * (sourceWidth - cropW)
    const cropY = 0.5 * (sourceHeight - cropH)
    return `crop=w=${Math.round(cropW)}:h=${Math.round(cropH)}:x=${Math.round(cropX)}:y=${Math.round(cropY)},scale=${outputWidth}:${outputHeight}`
  }

  if (sorted.length === 1) {
    const kf = sorted[0]
    const cropW = sourceWidth / kf.scale
    const cropH = cropW * (outputHeight / outputWidth)
    const cropX = kf.x * (sourceWidth - cropW)
    const cropY = kf.y * (sourceHeight - cropH)
    return `crop=w=${Math.round(cropW)}:h=${Math.round(cropH)}:x=${Math.round(cropX)}:y=${Math.round(cropY)},scale=${outputWidth}:${outputHeight}`
  }

  const buildDimExpr = (dim: 'w' | 'h' | 'x' | 'y'): string => {
    const segments: string[] = []

    for (let i = 0; i < sorted.length - 1; i++) {
      const kfA = sorted[i]
      const kfB = sorted[i + 1]
      const t0 = kfA.timestamp - trim.start
      const t1 = kfB.timestamp - trim.start

      const cropW_A = sourceWidth / kfA.scale
      const cropW_B = sourceWidth / kfB.scale
      const cropH_A = cropW_A * (outputHeight / outputWidth)
      const cropH_B = cropW_B * (outputHeight / outputWidth)
      const cropX_A = kfA.x * (sourceWidth - cropW_A)
      const cropX_B = kfB.x * (sourceWidth - cropW_B)
      const cropY_A = kfA.y * (sourceHeight - cropH_A)
      const cropY_B = kfB.y * (sourceHeight - cropH_B)

      let valA: number, valB: number
      switch (dim) {
        case 'w': valA = cropW_A; valB = cropW_B; break
        case 'h': valA = cropH_A; valB = cropH_B; break
        case 'x': valA = cropX_A; valB = cropX_B; break
        case 'y': valA = cropY_A; valB = cropY_B; break
      }

      const duration = t1 - t0
      if (duration <= 0 || Math.abs(valA - valB) < 0.001) {
        segments.push(`if(between(t,${t0.toFixed(3)},${t1.toFixed(3)}),${Math.round(valA)}`)
      } else {
        // Linear interpolation in ffmpeg expression (easing baked as linear approximation)
        const steps = 10
        let expr = ''
        for (let s = 0; s < steps; s++) {
          const sStart = t0 + (duration * s) / steps
          const sEnd = t0 + (duration * (s + 1)) / steps
          const pStart = s / steps
          const pEnd = (s + 1) / steps
          const easedStart = applyEasing(pStart, kfB.easing)
          const easedEnd = applyEasing(pEnd, kfB.easing)
          const vStart = valA + (valB - valA) * easedStart
          const vEnd = valA + (valB - valA) * easedEnd
          const slope = (vEnd - vStart) / (sEnd - sStart)
          const subExpr = `${vStart.toFixed(2)}+${slope.toFixed(4)}*(t-${sStart.toFixed(3)})`
          if (s === 0) {
            expr = `if(between(t,${sStart.toFixed(3)},${sEnd.toFixed(3)}),${subExpr}`
          } else {
            expr += `,if(between(t,${sStart.toFixed(3)},${sEnd.toFixed(3)}),${subExpr}`
          }
        }
        // Close all if statements and add fallback
        expr += `,${Math.round(valB)}`
        for (let s = 0; s < steps; s++) {
          expr += ')'
        }
        segments.push(`if(between(t,${t0.toFixed(3)},${t1.toFixed(3)}),${expr}`)
      }
    }

    // Fallback: last keyframe values
    const lastKf = sorted[sorted.length - 1]
    const cropW_last = sourceWidth / lastKf.scale
    const cropH_last = cropW_last * (outputHeight / outputWidth)
    const cropX_last = lastKf.x * (sourceWidth - cropW_last)
    const cropY_last = lastKf.y * (sourceHeight - cropH_last)

    let fallback: number
    switch (dim) {
      case 'w': fallback = cropW_last; break
      case 'h': fallback = cropH_last; break
      case 'x': fallback = cropX_last; break
      case 'y': fallback = cropY_last; break
    }

    let result = ''
    for (let i = 0; i < segments.length; i++) {
      result += segments[i] + ','
    }
    result += Math.round(fallback).toString()
    for (let i = 0; i < segments.length; i++) {
      result += ')'
    }

    return result
  }

  const wExpr = buildDimExpr('w')
  const hExpr = buildDimExpr('h')
  const xExpr = buildDimExpr('x')
  const yExpr = buildDimExpr('y')

  return `crop=w='${wExpr}':h='${hExpr}':x='${xExpr}':y='${yExpr}',scale=${outputWidth}:${outputHeight}`
}
