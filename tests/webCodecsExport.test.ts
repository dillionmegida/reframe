import { describe, it, expect } from 'vitest'

/**
 * Tests for the crop math in webCodecsExport.ts.
 * We can't import the function directly (it relies on DOM/WebCodecs APIs),
 * so we extract and test the pure crop calculation logic.
 */

// --- Crop math extracted from webCodecsExport.ts ---

function computeWebCodecsCrop(
  interp: { x: number; y: number; scale: number },
  sourceWidth: number,
  sourceHeight: number,
  outputWidth: number,
  outputHeight: number
): { cropX: number; cropY: number; cropW: number; cropH: number } {
  const vidAspect = sourceWidth / sourceHeight
  const outAspect = outputWidth / outputHeight

  let cropFracW: number, cropFracH: number
  if (outAspect < vidAspect) {
    cropFracH = 1 / Math.max(interp.scale, 0.0001)
    cropFracW = (outAspect / vidAspect) * cropFracH
  } else {
    cropFracW = 1 / Math.max(interp.scale, 0.0001)
    cropFracH = (vidAspect / outAspect) * cropFracW
  }

  cropFracW = Math.min(1, Math.max(0.0001, cropFracW))
  cropFracH = Math.min(1, Math.max(0.0001, cropFracH))

  const cropW = cropFracW * sourceWidth
  const cropH = cropFracH * sourceHeight
  const cropX = (sourceWidth - cropW) * Math.max(0, Math.min(1, interp.x))
  const cropY = (sourceHeight - cropH) * Math.max(0, Math.min(1, interp.y))

  return { cropX, cropY, cropW, cropH }
}

// --- Tests ---

describe('webCodecsExport crop math', () => {
  const landscape = { sourceW: 1920, sourceH: 1080 }
  const portraitOut = { outW: 1080, outH: 1920 }
  const landscapeOut = { outW: 1920, outH: 1080 }
  const squareOut = { outW: 1080, outH: 1080 }

  describe('aspect ratio preservation', () => {
    it('crop aspect ratio matches output aspect for portrait output', () => {
      const crop = computeWebCodecsCrop(
        { x: 0.5, y: 0.5, scale: 1 },
        landscape.sourceW, landscape.sourceH,
        portraitOut.outW, portraitOut.outH
      )
      const cropAspect = crop.cropW / crop.cropH
      const outAspect = portraitOut.outW / portraitOut.outH
      expect(cropAspect).toBeCloseTo(outAspect, 2)
    })

    it('crop aspect ratio matches output aspect for landscape output', () => {
      const crop = computeWebCodecsCrop(
        { x: 0.5, y: 0.5, scale: 1 },
        landscape.sourceW, landscape.sourceH,
        landscapeOut.outW, landscapeOut.outH
      )
      const cropAspect = crop.cropW / crop.cropH
      const outAspect = landscapeOut.outW / landscapeOut.outH
      expect(cropAspect).toBeCloseTo(outAspect, 2)
    })

    it('crop aspect ratio matches output aspect for square output', () => {
      const crop = computeWebCodecsCrop(
        { x: 0.5, y: 0.5, scale: 1 },
        landscape.sourceW, landscape.sourceH,
        squareOut.outW, squareOut.outH
      )
      const cropAspect = crop.cropW / crop.cropH
      expect(cropAspect).toBeCloseTo(1, 2)
    })
  })

  describe('scale behaviour', () => {
    it('scale=1 uses maximum crop area', () => {
      const crop = computeWebCodecsCrop(
        { x: 0.5, y: 0.5, scale: 1 },
        landscape.sourceW, landscape.sourceH,
        portraitOut.outW, portraitOut.outH
      )
      // For portrait output on landscape: height-limited, so cropH ≈ sourceH
      expect(crop.cropH).toBeCloseTo(landscape.sourceH, 0)
    })

    it('scale=2 halves the crop area', () => {
      const crop = computeWebCodecsCrop(
        { x: 0.5, y: 0.5, scale: 2 },
        landscape.sourceW, landscape.sourceH,
        portraitOut.outW, portraitOut.outH
      )
      expect(crop.cropH).toBeCloseTo(landscape.sourceH / 2, 0)
    })

    it('higher scale means smaller crop (more zoom)', () => {
      const crop1 = computeWebCodecsCrop(
        { x: 0.5, y: 0.5, scale: 1 },
        landscape.sourceW, landscape.sourceH,
        portraitOut.outW, portraitOut.outH
      )
      const crop2 = computeWebCodecsCrop(
        { x: 0.5, y: 0.5, scale: 3 },
        landscape.sourceW, landscape.sourceH,
        portraitOut.outW, portraitOut.outH
      )
      expect(crop2.cropW).toBeLessThan(crop1.cropW)
      expect(crop2.cropH).toBeLessThan(crop1.cropH)
    })
  })

  describe('pan positioning', () => {
    it('x=0 puts crop at left edge', () => {
      const crop = computeWebCodecsCrop(
        { x: 0, y: 0.5, scale: 2 },
        landscape.sourceW, landscape.sourceH,
        portraitOut.outW, portraitOut.outH
      )
      expect(crop.cropX).toBeCloseTo(0, 0)
    })

    it('x=1 puts crop at right edge', () => {
      const crop = computeWebCodecsCrop(
        { x: 1, y: 0.5, scale: 2 },
        landscape.sourceW, landscape.sourceH,
        portraitOut.outW, portraitOut.outH
      )
      expect(crop.cropX + crop.cropW).toBeCloseTo(landscape.sourceW, 0)
    })

    it('y=0 puts crop at top edge', () => {
      const crop = computeWebCodecsCrop(
        { x: 0.5, y: 0, scale: 2 },
        landscape.sourceW, landscape.sourceH,
        portraitOut.outW, portraitOut.outH
      )
      expect(crop.cropY).toBeCloseTo(0, 0)
    })

    it('y=1 puts crop at bottom edge', () => {
      const crop = computeWebCodecsCrop(
        { x: 0.5, y: 1, scale: 2 },
        landscape.sourceW, landscape.sourceH,
        portraitOut.outW, portraitOut.outH
      )
      expect(crop.cropY + crop.cropH).toBeCloseTo(landscape.sourceH, 0)
    })
  })

  describe('boundary clamping', () => {
    it('clamps x/y to [0, 1]', () => {
      const negCrop = computeWebCodecsCrop(
        { x: -1, y: -1, scale: 2 },
        landscape.sourceW, landscape.sourceH,
        portraitOut.outW, portraitOut.outH
      )
      const zeroCrop = computeWebCodecsCrop(
        { x: 0, y: 0, scale: 2 },
        landscape.sourceW, landscape.sourceH,
        portraitOut.outW, portraitOut.outH
      )
      expect(negCrop.cropX).toBeCloseTo(zeroCrop.cropX)
      expect(negCrop.cropY).toBeCloseTo(zeroCrop.cropY)

      const overCrop = computeWebCodecsCrop(
        { x: 2, y: 2, scale: 2 },
        landscape.sourceW, landscape.sourceH,
        portraitOut.outW, portraitOut.outH
      )
      const oneCrop = computeWebCodecsCrop(
        { x: 1, y: 1, scale: 2 },
        landscape.sourceW, landscape.sourceH,
        portraitOut.outW, portraitOut.outH
      )
      expect(overCrop.cropX).toBeCloseTo(oneCrop.cropX)
      expect(overCrop.cropY).toBeCloseTo(oneCrop.cropY)
    })

    it('crop stays within source bounds', () => {
      const positions = [
        { x: 0, y: 0 },
        { x: 1, y: 1 },
        { x: 0.5, y: 0.5 },
        { x: 0, y: 1 },
        { x: 1, y: 0 },
      ]
      for (const pos of positions) {
        const crop = computeWebCodecsCrop(
          { ...pos, scale: 2 },
          landscape.sourceW, landscape.sourceH,
          portraitOut.outW, portraitOut.outH
        )
        expect(crop.cropX).toBeGreaterThanOrEqual(0)
        expect(crop.cropY).toBeGreaterThanOrEqual(0)
        expect(crop.cropX + crop.cropW).toBeLessThanOrEqual(landscape.sourceW + 1)
        expect(crop.cropY + crop.cropH).toBeLessThanOrEqual(landscape.sourceH + 1)
      }
    })
  })

  describe('edge cases', () => {
    it('scale near zero does not produce NaN or Infinity', () => {
      const crop = computeWebCodecsCrop(
        { x: 0.5, y: 0.5, scale: 0 },
        landscape.sourceW, landscape.sourceH,
        portraitOut.outW, portraitOut.outH
      )
      expect(Number.isFinite(crop.cropW)).toBe(true)
      expect(Number.isFinite(crop.cropH)).toBe(true)
      expect(Number.isFinite(crop.cropX)).toBe(true)
      expect(Number.isFinite(crop.cropY)).toBe(true)
      // cropFracW/H clamped to max 1
      expect(crop.cropW).toBeLessThanOrEqual(landscape.sourceW)
      expect(crop.cropH).toBeLessThanOrEqual(landscape.sourceH)
    })

    it('very large scale produces tiny crop', () => {
      const crop = computeWebCodecsCrop(
        { x: 0.5, y: 0.5, scale: 100 },
        landscape.sourceW, landscape.sourceH,
        portraitOut.outW, portraitOut.outH
      )
      expect(crop.cropW).toBeLessThan(landscape.sourceW * 0.05)
      expect(crop.cropH).toBeLessThan(landscape.sourceH * 0.05)
    })

    it('works with portrait source and landscape output', () => {
      const crop = computeWebCodecsCrop(
        { x: 0.5, y: 0.5, scale: 1 },
        1080, 1920,
        1920, 1080
      )
      const cropAspect = crop.cropW / crop.cropH
      const outAspect = 1920 / 1080
      expect(cropAspect).toBeCloseTo(outAspect, 2)
    })
  })
})
