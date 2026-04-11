import { describe, it, expect } from 'vitest'
import type { Keyframe, Slice } from '../src/types'

// We can't import electron/export.ts directly because it pulls in electron + ffmpeg.
// Instead, we extract and test the pure logic functions by re-implementing them here
// based on the source, to verify the algorithms work.

// --- Copied from electron/export.ts for unit testing ---

function interpolateAtTime(keyframes: Keyframe[], t: number): { x: number; y: number; scale: number } {
  // Inline a simplified version — the real one is tested in interpolate.test.ts
  // Here we just need it for buildSliceKeyframes tests
  if (keyframes.length === 0) return { x: 0.5, y: 0.5, scale: 1 }
  const sorted = [...keyframes].sort((a, b) => a.timestamp - b.timestamp)
  if (t <= sorted[0].timestamp) return { x: sorted[0].x, y: sorted[0].y, scale: sorted[0].scale }
  const last = sorted[sorted.length - 1]
  if (t >= last.timestamp) return { x: last.x, y: last.y, scale: last.scale }

  let i = 0
  for (; i < sorted.length - 1; i++) {
    if (t >= sorted[i].timestamp && t < sorted[i + 1].timestamp) break
  }
  const kfA = sorted[i]
  const kfB = sorted[i + 1]
  const duration = kfB.timestamp - kfA.timestamp
  if (duration <= 0) return { x: kfB.x, y: kfB.y, scale: kfB.scale }
  const p = (t - kfA.timestamp) / duration
  return {
    x: kfA.x + (kfB.x - kfA.x) * p,
    y: kfA.y + (kfB.y - kfA.y) * p,
    scale: kfA.scale + (kfB.scale - kfA.scale) * p,
  }
}

function buildSliceKeyframes(
  allKeyframes: Keyframe[],
  sliceStart: number,
  sliceEnd: number
): Keyframe[] {
  const sorted = [...allKeyframes].sort((a, b) => a.timestamp - b.timestamp)

  const startInterp = interpolateAtTime(sorted, sliceStart)
  const endInterp = interpolateAtTime(sorted, sliceEnd)

  const startKf: Keyframe = {
    id: '__slice_start__',
    timestamp: sliceStart,
    x: startInterp.x,
    y: startInterp.y,
    scale: startInterp.scale,
    easing: 'linear',
  }

  const nextKfAfterEnd = sorted.find((kf) => kf.timestamp > sliceEnd)
  const endKf: Keyframe = {
    id: '__slice_end__',
    timestamp: sliceEnd,
    x: endInterp.x,
    y: endInterp.y,
    scale: endInterp.scale,
    easing: nextKfAfterEnd?.easing ?? 'linear',
  }

  const interior = sorted.filter(
    (kf) => kf.timestamp > sliceStart && kf.timestamp < sliceEnd
  )

  const result = [startKf, ...interior, endKf]
  const seen = new Set<number>()
  return result.filter((kf) => {
    const key = Math.round(kf.timestamp * 10000)
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function formatTimeForFilename(seconds: number): string {
  const roundedSeconds = Math.round(seconds)
  if (roundedSeconds < 60) {
    return `${roundedSeconds}s`
  }
  const mins = Math.floor(roundedSeconds / 60)
  const secs = roundedSeconds % 60
  return secs > 0 ? `${mins}m${secs}s` : `${mins}m`
}

// --- Helper ---

function kf(timestamp: number, x: number, y: number, scale: number, easing: Keyframe['easing'] = 'linear'): Keyframe {
  return { id: `kf-${timestamp}`, timestamp, x, y, scale, easing }
}

// --- Tests ---

describe('buildSliceKeyframes', () => {
  it('creates start and end keyframes via interpolation', () => {
    const keyframes = [kf(0, 0, 0, 1), kf(10, 1, 1, 2)]
    const result = buildSliceKeyframes(keyframes, 3, 7)

    expect(result[0].id).toBe('__slice_start__')
    expect(result[0].timestamp).toBe(3)
    expect(result[0].x).toBeCloseTo(0.3)
    expect(result[0].y).toBeCloseTo(0.3)

    const last = result[result.length - 1]
    expect(last.id).toBe('__slice_end__')
    expect(last.timestamp).toBe(7)
    expect(last.x).toBeCloseTo(0.7)
    expect(last.y).toBeCloseTo(0.7)
  })

  it('preserves interior keyframes', () => {
    const keyframes = [kf(0, 0, 0, 1), kf(5, 0.5, 0.5, 1.5), kf(10, 1, 1, 2)]
    const result = buildSliceKeyframes(keyframes, 2, 8)

    // Should contain start, interior kf at t=5, and end
    expect(result.length).toBe(3)
    expect(result[1].timestamp).toBe(5)
    expect(result[1].x).toBe(0.5)
  })

  it('deduplicates keyframes at same timestamp', () => {
    const keyframes = [kf(0, 0, 0, 1), kf(5, 0.5, 0.5, 1.5), kf(10, 1, 1, 2)]
    // Slice starts exactly at an existing keyframe
    const result = buildSliceKeyframes(keyframes, 5, 10)

    // t=5 appears as both slice_start and interior — should be deduped
    const atFive = result.filter((k) => Math.abs(k.timestamp - 5) < 0.01)
    expect(atFive.length).toBe(1)
  })

  it('preserves easing from the segment after slice end', () => {
    const keyframes = [
      kf(0, 0, 0, 1, 'linear'),
      kf(5, 0.5, 0.5, 1.5, 'ease-in'),
      kf(10, 1, 1, 2, 'ease-in-out'),
    ]
    const result = buildSliceKeyframes(keyframes, 2, 7)

    const endKf = result[result.length - 1]
    // Next kf after sliceEnd=7 is kf at t=10 with 'ease-in-out'
    expect(endKf.easing).toBe('ease-in-out')
  })

  it('defaults end easing to linear when no kf follows', () => {
    const keyframes = [kf(0, 0, 0, 1), kf(5, 0.5, 0.5, 1.5)]
    const result = buildSliceKeyframes(keyframes, 2, 5)

    const endKf = result[result.length - 1]
    expect(endKf.easing).toBe('linear')
  })

  it('handles slice covering full range', () => {
    const keyframes = [kf(0, 0, 0, 1), kf(10, 1, 1, 2)]
    const result = buildSliceKeyframes(keyframes, 0, 10)

    expect(result.length).toBe(2)
    expect(result[0].timestamp).toBe(0)
    expect(result[1].timestamp).toBe(10)
  })

  it('handles empty keyframes', () => {
    const result = buildSliceKeyframes([], 2, 5)
    expect(result.length).toBe(2)
    expect(result[0].x).toBeCloseTo(0.5)
    expect(result[1].x).toBeCloseTo(0.5)
  })
})

describe('formatTimeForFilename', () => {
  it('formats seconds under 60', () => {
    expect(formatTimeForFilename(0)).toBe('0s')
    expect(formatTimeForFilename(30)).toBe('30s')
    expect(formatTimeForFilename(50.5)).toBe('51s') // rounds
    expect(formatTimeForFilename(59.4)).toBe('59s') // rounds down to 59
  })

  it('formats minutes', () => {
    expect(formatTimeForFilename(60)).toBe('1m')
    expect(formatTimeForFilename(90)).toBe('1m30s')
    expect(formatTimeForFilename(125.3)).toBe('2m5s')
    expect(formatTimeForFilename(120)).toBe('2m')
  })

  it('handles edge case of exactly 60s rounding', () => {
    // 59.9 rounds to 60, which is >= 60
    const result = formatTimeForFilename(59.9)
    // 60 rounded seconds = 1m0s → "1m"
    // But the function checks roundedSeconds < 60 first
    // 60 is NOT < 60, so it goes to minutes: 1m with 0s remainder → "1m"
    expect(result).toBe('1m')
  })
})
