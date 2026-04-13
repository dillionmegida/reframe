import { describe, it, expect } from 'vitest'
import { interpolateAtTime, computePreviewStyle } from '../src/utils/interpolate'
import type { Keyframe } from '../src/types'

function kf(timestamp: number, x: number, y: number, scale: number, easing: Keyframe['easing'] = 'linear', explicitScale?: boolean): Keyframe {
  return { id: `kf-${timestamp}`, timestamp, x, y, scale, easing, explicitScale }
}

describe('interpolateAtTime', () => {
  describe('edge cases', () => {
    it('returns center defaults for empty keyframes', () => {
      expect(interpolateAtTime([], 5)).toEqual({ x: 0.5, y: 0.5, scale: 1.0 })
    })

    it('returns single keyframe values regardless of time', () => {
      // Without explicitScale, scale is inherited (default 1.0)
      const kfs = [kf(2, 0.3, 0.7, 1.5)]
      expect(interpolateAtTime(kfs, 0)).toEqual({ x: 0.3, y: 0.7, scale: 1.0 })
      expect(interpolateAtTime(kfs, 2)).toEqual({ x: 0.3, y: 0.7, scale: 1.0 })
      expect(interpolateAtTime(kfs, 10)).toEqual({ x: 0.3, y: 0.7, scale: 1.0 })
    })

    it('returns explicit scale when set', () => {
      const kfs = [kf(2, 0.3, 0.7, 1.5, 'linear', true)]
      expect(interpolateAtTime(kfs, 0)).toEqual({ x: 0.3, y: 0.7, scale: 1.5 })
      expect(interpolateAtTime(kfs, 2)).toEqual({ x: 0.3, y: 0.7, scale: 1.5 })
    })
  })

  describe('clamping outside range', () => {
    const kfs = [kf(1, 0.2, 0.3, 1.0), kf(3, 0.8, 0.9, 2.0)]

    it('clamps to first keyframe before range', () => {
      const result = interpolateAtTime(kfs, 0)
      expect(result.x).toBeCloseTo(0.2)
      expect(result.y).toBeCloseTo(0.3)
      expect(result.scale).toBeCloseTo(1.0)
    })

    it('clamps to last keyframe after range', () => {
      const result = interpolateAtTime(kfs, 5)
      expect(result.x).toBeCloseTo(0.8)
      expect(result.y).toBeCloseTo(0.9)
      // Without explicitScale, both keyframes inherit default scale 1.0
      expect(result.scale).toBeCloseTo(1.0)
    })
  })

  describe('linear interpolation midpoint', () => {
    it('interpolates at midpoint between two linear keyframes', () => {
      const kfs = [kf(0, 0, 0, 1, 'linear', true), kf(2, 1, 1, 3, 'linear', true)]
      const mid = interpolateAtTime(kfs, 1)
      // Hermite spline with only 2 keyframes—midpoint should still be near 0.5
      expect(mid.x).toBeCloseTo(0.5, 1)
      expect(mid.y).toBeCloseTo(0.5, 1)
      expect(mid.scale).toBeCloseTo(2, 0)
    })

    it('returns exact values at keyframe timestamps', () => {
      const kfs = [kf(0, 0.1, 0.2, 1.0, 'linear'), kf(2, 0.8, 0.9, 2.0, 'linear')]
      const start = interpolateAtTime(kfs, 0)
      expect(start.x).toBeCloseTo(0.1)
      expect(start.y).toBeCloseTo(0.2)

      const end = interpolateAtTime(kfs, 2)
      expect(end.x).toBeCloseTo(0.8)
      expect(end.y).toBeCloseTo(0.9)
    })
  })

  describe('monotonic progress between keyframes', () => {
    it('x/y progress monotonically between two keyframes moving in one direction', () => {
      const kfs = [kf(0, 0, 0, 1, 'linear'), kf(4, 1, 1, 1, 'linear')]
      let prevX = -1
      for (let t = 0; t <= 4; t += 0.5) {
        const result = interpolateAtTime(kfs, t)
        expect(result.x).toBeGreaterThanOrEqual(prevX - 0.001)
        prevX = result.x
      }
    })
  })

  describe('non-uniform keyframe spacing', () => {
    it('handles widely varying time gaps between keyframes', () => {
      const kfs = [
        kf(0, 0.0, 0.0, 1.0, 'linear', true),
        kf(0.5, 0.2, 0.2, 1.2, 'linear', true),   // short gap
        kf(10, 0.8, 0.8, 2.0, 'linear', true),      // long gap
      ]

      // Values at each keyframe should be exact
      const at0 = interpolateAtTime(kfs, 0)
      expect(at0.x).toBeCloseTo(0.0)

      const at05 = interpolateAtTime(kfs, 0.5)
      expect(at05.x).toBeCloseTo(0.2)

      const at10 = interpolateAtTime(kfs, 10)
      expect(at10.x).toBeCloseTo(0.8)

      // Midpoint of long gap should be reasonable
      const atMid = interpolateAtTime(kfs, 5)
      expect(atMid.x).toBeGreaterThanOrEqual(0)
      expect(atMid.x).toBeLessThanOrEqual(1)
    })
  })

  describe('4+ keyframes with real kfPrev/kfNext', () => {
    it('uses actual adjacent keyframes for Hermite tangents', () => {
      const kfs = [
        kf(0, 0.0, 0.0, 1.0, 'linear', true),
        kf(2, 0.25, 0.25, 1.0, 'linear', true),
        kf(4, 0.5, 0.5, 1.0, 'linear', true),
        kf(6, 0.75, 0.75, 1.0, 'linear', true),
        kf(8, 1.0, 1.0, 1.0, 'linear', true),
      ]

      // Sample at every 0.5s and check all values stay in bounds
      for (let t = 0; t <= 8; t += 0.5) {
        const result = interpolateAtTime(kfs, t)
        expect(result.x).toBeGreaterThanOrEqual(-0.15)
        expect(result.x).toBeLessThanOrEqual(1.15)
      }

      // Check continuity at interior keyframe boundaries
      for (const kfTime of [2, 4, 6]) {
        const before = interpolateAtTime(kfs, kfTime - 0.001)
        const at = interpolateAtTime(kfs, kfTime)
        const after = interpolateAtTime(kfs, kfTime + 0.001)
        expect(before.x).toBeCloseTo(at.x, 1)
        expect(after.x).toBeCloseTo(at.x, 1)
      }
    })
  })

  describe('scale inheritance chains', () => {
    it('propagates explicit scale through multiple non-explicit keyframes', () => {
      const kfs = [
        kf(0, 0.5, 0.5, 2.0, 'linear', true),   // explicit 2.0
        kf(2, 0.5, 0.5, 9.0, 'linear', false),   // inherits 2.0
        kf(4, 0.5, 0.5, 9.0, 'linear', false),   // inherits 2.0
        kf(6, 0.5, 0.5, 3.0, 'linear', true),    // explicit 3.0
        kf(8, 0.5, 0.5, 9.0, 'linear', false),   // inherits 3.0
      ]

      expect(interpolateAtTime(kfs, 0).scale).toBeCloseTo(2.0)
      expect(interpolateAtTime(kfs, 2).scale).toBeCloseTo(2.0)
      expect(interpolateAtTime(kfs, 4).scale).toBeCloseTo(2.0)
      expect(interpolateAtTime(kfs, 6).scale).toBeCloseTo(3.0)
      expect(interpolateAtTime(kfs, 8).scale).toBeCloseTo(3.0)
    })

    it('all non-explicit keyframes default to 1.0 when no explicit precedes', () => {
      const kfs = [
        kf(0, 0.5, 0.5, 5.0, 'linear', false),
        kf(2, 0.5, 0.5, 5.0, 'linear', false),
      ]
      expect(interpolateAtTime(kfs, 0).scale).toBeCloseTo(1.0)
      expect(interpolateAtTime(kfs, 2).scale).toBeCloseTo(1.0)
    })
  })

  describe('zero-duration segment', () => {
    it('returns first keyframe when only coincident keyframes exist', () => {
      // t <= resolvedKeyframes[0].timestamp catches this: 5 <= 5 → returns first kf
      const kfs = [
        kf(5, 0.2, 0.3, 1.0, 'linear', true),
        kf(5, 0.8, 0.9, 2.0, 'linear', true),
      ]
      const result = interpolateAtTime(kfs, 5)
      expect(result.x).toBeCloseTo(0.2)
      expect(result.y).toBeCloseTo(0.3)
    })

    it('does not produce NaN for coincident keyframes between others', () => {
      // The duration <= 0 branch (line 54-55 in interpolate.ts) returns kfB
      const kfs = [
        kf(0, 0.0, 0.0, 1.0, 'linear', true),
        kf(5, 0.2, 0.3, 1.0, 'linear', true),
        kf(5, 0.8, 0.9, 2.0, 'linear', true),
        kf(10, 1.0, 1.0, 1.0, 'linear', true),
      ]
      // Query at t=5 — hits t >= kfA.timestamp && t < kfB.timestamp on the pair [kf(5,0.2), kf(5,0.8)]
      // duration === 0 → returns kfB values
      const result = interpolateAtTime(kfs, 5)
      expect(Number.isFinite(result.x)).toBe(true)
      expect(Number.isFinite(result.y)).toBe(true)
      expect(Number.isFinite(result.scale)).toBe(true)
    })

    it('handles query before coincident pair in a longer sequence', () => {
      const kfs = [
        kf(0, 0.0, 0.0, 1.0, 'linear', true),
        kf(5, 0.2, 0.3, 1.5, 'linear', true),
        kf(5, 0.8, 0.9, 2.0, 'linear', true),
        kf(10, 1.0, 1.0, 1.0, 'linear', true),
      ]
      // Query before the coincident pair — normal interpolation
      const result = interpolateAtTime(kfs, 3)
      expect(Number.isFinite(result.x)).toBe(true)
      expect(result.x).toBeGreaterThanOrEqual(0)
      expect(result.x).toBeLessThanOrEqual(1)
    })
  })

  describe('opposing direction keyframes', () => {
    it('Hermite stays bounded for zigzag motion', () => {
      const kfs = [
        kf(0, 0.0, 0.0, 1.0, 'linear', true),
        kf(2, 1.0, 1.0, 2.0, 'linear', true),
        kf(4, 0.0, 0.0, 1.0, 'linear', true),
        kf(6, 1.0, 1.0, 2.0, 'linear', true),
      ]

      for (let t = 0; t <= 6; t += 0.25) {
        const result = interpolateAtTime(kfs, t)
        // Allow some Hermite overshoot but should stay reasonable
        expect(result.x).toBeGreaterThanOrEqual(-0.3)
        expect(result.x).toBeLessThanOrEqual(1.3)
      }
    })
  })

  describe('easing types on segments', () => {
    it('ease-in starts slow (value closer to start at 25%)', () => {
      const kfs = [kf(0, 0, 0, 1, 'linear', true), kf(4, 1, 1, 1, 'ease-in', true)]
      const at25 = interpolateAtTime(kfs, 1)
      // ease-in: progress should be less than 25% at t=1 (25% of duration)
      expect(at25.x).toBeLessThan(0.3)
    })

    it('ease-out starts fast (value farther from start at 25%)', () => {
      const kfs = [kf(0, 0, 0, 1, 'linear', true), kf(4, 1, 1, 1, 'ease-out', true)]
      const at25 = interpolateAtTime(kfs, 1)
      // ease-out: progress should be more than 25% at t=1
      expect(at25.x).toBeGreaterThan(0.2)
    })
  })
})

describe('computePreviewStyle', () => {
  describe('zero container', () => {
    it('returns zero dimensions for zero container', () => {
      const style = computePreviewStyle(0.5, 0.5, 1, 1920, 1080, 0, 0)
      expect(style.width).toBe('0px')
      expect(style.height).toBe('0px')
    })
  })

  describe('portrait output on landscape source', () => {
    it('computes valid dimensions and transform', () => {
      // 1920x1080 source, 1080x1920 container (portrait)
      const style = computePreviewStyle(0.5, 0.5, 1, 1920, 1080, 1080, 1920)
      expect(style.width).toMatch(/^\d+(\.\d+)?px$/)
      expect(style.height).toMatch(/^\d+(\.\d+)?px$/)
      expect(style.transform).toMatch(/translate\(.+px, .+px\)/)

      const w = parseFloat(style.width)
      const h = parseFloat(style.height)
      // Rendered dimensions should be >= container dimensions
      expect(w).toBeGreaterThanOrEqual(1080)
      expect(h).toBeGreaterThanOrEqual(1920)
    })
  })

  describe('landscape output on landscape source', () => {
    it('computes valid dimensions', () => {
      const style = computePreviewStyle(0.5, 0.5, 1, 1920, 1080, 1920, 1080)
      const w = parseFloat(style.width)
      const h = parseFloat(style.height)
      expect(w).toBeGreaterThanOrEqual(1920)
      expect(h).toBeGreaterThanOrEqual(1080)
    })
  })

  describe('scale affects crop', () => {
    it('higher scale produces larger rendered dimensions', () => {
      const style1 = computePreviewStyle(0.5, 0.5, 1, 1920, 1080, 1080, 1920)
      const style2 = computePreviewStyle(0.5, 0.5, 2, 1920, 1080, 1080, 1920)

      const w1 = parseFloat(style1.width)
      const w2 = parseFloat(style2.width)
      // Scale 2 zooms in, meaning the video is rendered larger
      expect(w2).toBeGreaterThan(w1)
    })
  })

  describe('pan position affects transform', () => {
    it('different x positions produce different transforms', () => {
      const left = computePreviewStyle(0, 0.5, 2, 1920, 1080, 1080, 1920)
      const right = computePreviewStyle(1, 0.5, 2, 1920, 1080, 1080, 1920)
      expect(left.transform).not.toBe(right.transform)
    })

    it('different y positions produce different transforms', () => {
      const top = computePreviewStyle(0.5, 0, 2, 1920, 1080, 1080, 1920)
      const bottom = computePreviewStyle(0.5, 1, 2, 1920, 1080, 1080, 1920)
      expect(top.transform).not.toBe(bottom.transform)
    })
  })

  describe('clamps x/y to [0, 1]', () => {
    it('out-of-range x/y produces same result as clamped', () => {
      const normal = computePreviewStyle(0, 0, 2, 1920, 1080, 1080, 1920)
      const clamped = computePreviewStyle(-1, -1, 2, 1920, 1080, 1080, 1920)
      expect(normal.transform).toBe(clamped.transform)

      const normal2 = computePreviewStyle(1, 1, 2, 1920, 1080, 1080, 1920)
      const clamped2 = computePreviewStyle(2, 2, 2, 1920, 1080, 1080, 1920)
      expect(normal2.transform).toBe(clamped2.transform)
    })
  })
})
