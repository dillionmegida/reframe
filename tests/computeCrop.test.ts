import { describe, it, expect } from 'vitest'
import { computeCrop } from '../src/utils/computeCrop'

describe('computeCrop', () => {
  const landscape = { sourceW: 1920, sourceH: 1080 }
  const portraitOut = { outW: 1080, outH: 1920 }
  const landscapeOut = { outW: 1920, outH: 1080 }
  const squareOut = { outW: 1080, outH: 1080 }

  describe('portrait output on landscape source (height-limited)', () => {
    it('at scale=1, center, crop covers full height', () => {
      const crop = computeCrop(
        { x: 0.5, y: 0.5, scale: 1 },
        landscape.sourceW, landscape.sourceH,
        portraitOut.outW, portraitOut.outH
      )
      // Height-limited: cropH should be full height (scale=1 → 1/1 = 1.0)
      expect(crop.cropH).toBeCloseTo(landscape.sourceH, 0)
      // Width is narrower (portrait aspect on landscape)
      expect(crop.cropW).toBeLessThan(landscape.sourceW)
      // Centered
      expect(crop.cropY).toBeCloseTo(0, 0)
    })

    it('at scale=2, crop is half the area', () => {
      const crop = computeCrop(
        { x: 0.5, y: 0.5, scale: 2 },
        landscape.sourceW, landscape.sourceH,
        portraitOut.outW, portraitOut.outH
      )
      expect(crop.cropH).toBeCloseTo(landscape.sourceH / 2, 0)
      expect(crop.cropW).toBeLessThan(crop.cropH)
    })
  })

  describe('landscape output on landscape source (width-limited)', () => {
    it('at scale=1, crop covers full width', () => {
      const crop = computeCrop(
        { x: 0.5, y: 0.5, scale: 1 },
        landscape.sourceW, landscape.sourceH,
        landscapeOut.outW, landscapeOut.outH
      )
      expect(crop.cropW).toBeCloseTo(landscape.sourceW, 0)
      expect(crop.cropH).toBeCloseTo(landscape.sourceH, 0)
    })
  })

  describe('square output on landscape source', () => {
    it('at scale=1, crop height equals source height', () => {
      const crop = computeCrop(
        { x: 0.5, y: 0.5, scale: 1 },
        landscape.sourceW, landscape.sourceH,
        squareOut.outW, squareOut.outH
      )
      // square aspect < landscape aspect → height-limited
      expect(crop.cropH).toBeCloseTo(landscape.sourceH, 0)
      expect(crop.cropW).toBeCloseTo(landscape.sourceH, 0) // square crop
    })
  })

  describe('pan positioning', () => {
    it('x=0 positions crop at left edge', () => {
      const crop = computeCrop(
        { x: 0, y: 0.5, scale: 2 },
        landscape.sourceW, landscape.sourceH,
        portraitOut.outW, portraitOut.outH
      )
      expect(crop.cropX).toBeCloseTo(0, 0)
    })

    it('x=1 positions crop at right edge', () => {
      const crop = computeCrop(
        { x: 1, y: 0.5, scale: 2 },
        landscape.sourceW, landscape.sourceH,
        portraitOut.outW, portraitOut.outH
      )
      expect(crop.cropX + crop.cropW).toBeCloseTo(landscape.sourceW, 0)
    })

    it('y=0 positions crop at top edge', () => {
      const crop = computeCrop(
        { x: 0.5, y: 0, scale: 2 },
        landscape.sourceW, landscape.sourceH,
        portraitOut.outW, portraitOut.outH
      )
      expect(crop.cropY).toBeCloseTo(0, 0)
    })

    it('y=1 positions crop at bottom edge', () => {
      const crop = computeCrop(
        { x: 0.5, y: 1, scale: 2 },
        landscape.sourceW, landscape.sourceH,
        portraitOut.outW, portraitOut.outH
      )
      expect(crop.cropY + crop.cropH).toBeCloseTo(landscape.sourceH, 0)
    })

    it('x/y clamped: negative values same as 0', () => {
      const neg = computeCrop(
        { x: -1, y: -1, scale: 2 },
        landscape.sourceW, landscape.sourceH,
        portraitOut.outW, portraitOut.outH
      )
      const zero = computeCrop(
        { x: 0, y: 0, scale: 2 },
        landscape.sourceW, landscape.sourceH,
        portraitOut.outW, portraitOut.outH
      )
      expect(neg.cropX).toBeCloseTo(zero.cropX)
      expect(neg.cropY).toBeCloseTo(zero.cropY)
    })

    it('x/y clamped: values > 1 same as 1', () => {
      const over = computeCrop(
        { x: 2, y: 2, scale: 2 },
        landscape.sourceW, landscape.sourceH,
        portraitOut.outW, portraitOut.outH
      )
      const one = computeCrop(
        { x: 1, y: 1, scale: 2 },
        landscape.sourceW, landscape.sourceH,
        portraitOut.outW, portraitOut.outH
      )
      expect(over.cropX).toBeCloseTo(one.cropX)
      expect(over.cropY).toBeCloseTo(one.cropY)
    })
  })

  describe('scale floor protection', () => {
    it('scale near zero does not produce NaN or Infinity', () => {
      const crop = computeCrop(
        { x: 0.5, y: 0.5, scale: 0.0001 },
        landscape.sourceW, landscape.sourceH,
        portraitOut.outW, portraitOut.outH
      )
      expect(Number.isFinite(crop.cropW)).toBe(true)
      expect(Number.isFinite(crop.cropH)).toBe(true)
      expect(Number.isFinite(crop.cropX)).toBe(true)
      expect(Number.isFinite(crop.cropY)).toBe(true)
    })

    it('scale=0 does not produce NaN', () => {
      const crop = computeCrop(
        { x: 0.5, y: 0.5, scale: 0 },
        landscape.sourceW, landscape.sourceH,
        portraitOut.outW, portraitOut.outH
      )
      expect(Number.isFinite(crop.cropW)).toBe(true)
      expect(Number.isFinite(crop.cropH)).toBe(true)
    })
  })

  describe('crop dimensions match output aspect ratio', () => {
    it('crop aspect ratio matches output aspect ratio', () => {
      const crop = computeCrop(
        { x: 0.5, y: 0.5, scale: 1.5 },
        landscape.sourceW, landscape.sourceH,
        portraitOut.outW, portraitOut.outH
      )
      const cropAspect = crop.cropW / crop.cropH
      const outAspect = portraitOut.outW / portraitOut.outH
      expect(cropAspect).toBeCloseTo(outAspect, 2)
    })

    it('landscape output crop aspect matches', () => {
      const crop = computeCrop(
        { x: 0.5, y: 0.5, scale: 1.5 },
        landscape.sourceW, landscape.sourceH,
        landscapeOut.outW, landscapeOut.outH
      )
      const cropAspect = crop.cropW / crop.cropH
      const outAspect = landscapeOut.outW / landscapeOut.outH
      expect(cropAspect).toBeCloseTo(outAspect, 2)
    })
  })
})
