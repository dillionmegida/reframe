import { describe, it, expect, vi } from 'vitest'
import { toGrey, getPatch, ncc, trackFrames } from '../src/utils/simpleTracker'
import type { BBox } from '../src/utils/simpleTracker'

/**
 * Helper to create a mock ImageData (not available in Node).
 * Pixels are RGBA Uint8ClampedArray.
 */
function makeImageData(width: number, height: number, fill?: (x: number, y: number) => [number, number, number, number]): ImageData {
  const data = new Uint8ClampedArray(width * height * 4)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const off = (y * width + x) * 4
      const [r, g, b, a] = fill ? fill(x, y) : [128, 128, 128, 255]
      data[off] = r
      data[off + 1] = g
      data[off + 2] = b
      data[off + 3] = a
    }
  }
  return { data, width, height, colorSpace: 'srgb' } as ImageData
}

/** Create a uniform grey image */
function uniformImage(width: number, height: number, grey: number): ImageData {
  return makeImageData(width, height, () => [grey, grey, grey, 255])
}

/** Create an image with a textured square patch at a given position.
 *  The patch has a gradient so NCC can compute meaningful scores. */
function imageWithPatch(
  width: number, height: number,
  patchX: number, patchY: number,
  patchW: number, patchH: number,
  bg = 50, fgBase = 120
): ImageData {
  return makeImageData(width, height, (x, y) => {
    const inPatch = x >= patchX && x < patchX + patchW && y >= patchY && y < patchY + patchH
    if (inPatch) {
      // Gradient inside patch so it has non-zero variance
      const localX = x - patchX
      const localY = y - patchY
      const v = fgBase + Math.round(((localX + localY) / (patchW + patchH)) * 120)
      return [v, v, v, 255]
    }
    return [bg, bg, bg, 255]
  })
}

describe('toGrey', () => {
  it('converts RGBA to greyscale using luminance weights', () => {
    // Pure red pixel
    const img = makeImageData(1, 1, () => [255, 0, 0, 255])
    const grey = toGrey(img)
    expect(grey.length).toBe(1)
    expect(grey[0]).toBeCloseTo(0.299 * 255, 1)
  })

  it('converts pure green', () => {
    const img = makeImageData(1, 1, () => [0, 255, 0, 255])
    const grey = toGrey(img)
    expect(grey[0]).toBeCloseTo(0.587 * 255, 1)
  })

  it('converts pure blue', () => {
    const img = makeImageData(1, 1, () => [0, 0, 255, 255])
    const grey = toGrey(img)
    expect(grey[0]).toBeCloseTo(0.114 * 255, 1)
  })

  it('converts white to ~255', () => {
    const img = makeImageData(1, 1, () => [255, 255, 255, 255])
    const grey = toGrey(img)
    expect(grey[0]).toBeCloseTo(255, 0)
  })

  it('converts black to 0', () => {
    const img = makeImageData(1, 1, () => [0, 0, 0, 255])
    const grey = toGrey(img)
    expect(grey[0]).toBe(0)
  })

  it('handles multi-pixel images', () => {
    const img = makeImageData(3, 2, (x, y) => {
      const v = (y * 3 + x) * 40
      return [v, v, v, 255]
    })
    const grey = toGrey(img)
    expect(grey.length).toBe(6)
    // First pixel (0,0) = 0
    expect(grey[0]).toBeCloseTo(0, 0)
    // Last pixel (2,1) = 5*40 = 200
    expect(grey[5]).toBeCloseTo(200, 0)
  })
})

describe('getPatch', () => {
  it('extracts a rectangular patch from greyscale buffer', () => {
    // 4x4 image with known values
    const grey = new Float32Array([
      1, 2, 3, 4,
      5, 6, 7, 8,
      9, 10, 11, 12,
      13, 14, 15, 16,
    ])
    const patch = getPatch(grey, 4, 1, 1, 2, 2)
    expect(patch.length).toBe(4)
    expect(Array.from(patch)).toEqual([6, 7, 10, 11])
  })

  it('extracts full image when patch covers entire image', () => {
    const grey = new Float32Array([1, 2, 3, 4])
    const patch = getPatch(grey, 2, 0, 0, 2, 2)
    expect(Array.from(patch)).toEqual([1, 2, 3, 4])
  })

  it('extracts top-left corner', () => {
    const grey = new Float32Array([
      1, 2, 3,
      4, 5, 6,
      7, 8, 9,
    ])
    const patch = getPatch(grey, 3, 0, 0, 2, 2)
    expect(Array.from(patch)).toEqual([1, 2, 4, 5])
  })

  it('extracts bottom-right corner', () => {
    const grey = new Float32Array([
      1, 2, 3,
      4, 5, 6,
      7, 8, 9,
    ])
    const patch = getPatch(grey, 3, 1, 1, 2, 2)
    expect(Array.from(patch)).toEqual([5, 6, 8, 9])
  })

  it('extracts single pixel', () => {
    const grey = new Float32Array([1, 2, 3, 4])
    const patch = getPatch(grey, 2, 1, 0, 1, 1)
    expect(Array.from(patch)).toEqual([2])
  })
})

describe('ncc', () => {
  it('returns 1 for identical patches', () => {
    const a = new Float32Array([10, 20, 30, 40])
    expect(ncc(a, a)).toBeCloseTo(1.0, 5)
  })

  it('returns -1 for perfectly inverted patches', () => {
    const a = new Float32Array([0, 10, 20, 30])
    const b = new Float32Array([30, 20, 10, 0])
    expect(ncc(a, b)).toBeCloseTo(-1.0, 5)
  })

  it('returns 0 for constant patches', () => {
    const a = new Float32Array([5, 5, 5, 5])
    const b = new Float32Array([10, 20, 30, 40])
    // Constant patch has zero variance → den = 0 → returns 0
    expect(ncc(a, b)).toBe(0)
  })

  it('returns 0 when both patches are constant', () => {
    const a = new Float32Array([5, 5, 5, 5])
    const b = new Float32Array([10, 10, 10, 10])
    expect(ncc(a, b)).toBe(0)
  })

  it('returns 1 for linearly scaled versions', () => {
    const a = new Float32Array([10, 20, 30, 40])
    const b = new Float32Array([20, 40, 60, 80]) // 2x scale
    expect(ncc(a, b)).toBeCloseTo(1.0, 5)
  })

  it('returns 1 for shifted versions', () => {
    const a = new Float32Array([10, 20, 30, 40])
    const b = new Float32Array([110, 120, 130, 140]) // +100 offset
    expect(ncc(a, b)).toBeCloseTo(1.0, 5)
  })

  it('returns value between -1 and 1 for arbitrary patches', () => {
    const a = new Float32Array([10, 50, 30, 80])
    const b = new Float32Array([20, 40, 70, 10])
    const result = ncc(a, b)
    expect(result).toBeGreaterThanOrEqual(-1)
    expect(result).toBeLessThanOrEqual(1)
  })
})

describe('trackFrames', () => {
  it('returns empty array for empty frames', async () => {
    const results = await trackFrames([], { x: 0, y: 0, w: 10, h: 10 }, 0, 30)
    expect(results).toEqual([])
  })

  it('returns single result for single frame', async () => {
    const frame = uniformImage(100, 100, 128)
    const bbox: BBox = { x: 20, y: 20, w: 20, h: 20 }
    const results = await trackFrames([frame], bbox, 5.0, 30)

    expect(results.length).toBe(1)
    expect(results[0].frame).toBe(0)
    expect(results[0].t).toBe(5.0)
    expect(results[0].confidence).toBe(1.0)
    expect(results[0].cx).toBeCloseTo((20 + 10) / 100)
    expect(results[0].cy).toBeCloseTo((20 + 10) / 100)
  })

  it('tracks a stationary patch across frames', async () => {
    const frames = [
      imageWithPatch(100, 100, 30, 30, 20, 20),
      imageWithPatch(100, 100, 30, 30, 20, 20),
      imageWithPatch(100, 100, 30, 30, 20, 20),
    ]
    const bbox: BBox = { x: 30, y: 30, w: 20, h: 20 }
    const results = await trackFrames(frames, bbox, 0, 30, undefined, { stepSize: 1, confidenceThreshold: 0.3 })

    expect(results.length).toBe(3)
    // First frame is always confidence=1. Subsequent frames should stay near the same position.
    expect(results[0].confidence).toBe(1.0)
    for (const r of results) {
      expect(r.bbox.x).toBeCloseTo(30, -1)
      expect(r.bbox.y).toBeCloseTo(30, -1)
    }
  })

  it('tracks a moving patch', async () => {
    const frames = [
      imageWithPatch(100, 100, 20, 20, 15, 15),
      imageWithPatch(100, 100, 25, 20, 15, 15), // moved right by 5
      imageWithPatch(100, 100, 30, 20, 15, 15), // moved right by 5 more
    ]
    const bbox: BBox = { x: 20, y: 20, w: 15, h: 15 }
    const results = await trackFrames(frames, bbox, 0, 30, undefined, { stepSize: 1, confidenceThreshold: 0.3 })

    expect(results.length).toBe(3)
    // The tracker should follow the patch to the right
    expect(results[0].bbox.x).toBe(20)
    expect(results[1].bbox.x).toBeGreaterThanOrEqual(results[0].bbox.x)
    expect(results[2].bbox.x).toBeGreaterThanOrEqual(results[1].bbox.x)
    // Overall displacement should be positive
    expect(results[2].bbox.x).toBeGreaterThan(results[0].bbox.x)
  })

  it('clamps initial bbox to image bounds', async () => {
    const frame = uniformImage(50, 50, 128)
    // Bbox extends beyond image
    const bbox: BBox = { x: 45, y: 45, w: 20, h: 20 }
    const results = await trackFrames([frame], bbox, 0, 30)

    expect(results.length).toBe(1)
    // x should be clamped: min(45, 50-20) = 30
    expect(results[0].bbox.x).toBe(30)
    expect(results[0].bbox.y).toBe(30)
  })

  it('reports correct timestamps based on fps', async () => {
    const frames = [
      uniformImage(50, 50, 100),
      uniformImage(50, 50, 100),
      uniformImage(50, 50, 100),
    ]
    const results = await trackFrames(frames, { x: 10, y: 10, w: 10, h: 10 }, 2.0, 10)

    expect(results[0].t).toBe(2.0)
    expect(results[1].t).toBeCloseTo(2.1) // 2.0 + 1/10
    expect(results[2].t).toBeCloseTo(2.2) // 2.0 + 2/10
  })

  it('calls onProgress callback', async () => {
    const frames = [
      uniformImage(50, 50, 100),
      uniformImage(50, 50, 100),
    ]
    const progress = vi.fn()
    await trackFrames(frames, { x: 10, y: 10, w: 10, h: 10 }, 0, 30, progress)

    expect(progress).toHaveBeenCalledWith(0, 2) // initial
    expect(progress).toHaveBeenCalledWith(1, 2) // after frame 1
  })

  it('marks low-confidence frames when patch disappears', async () => {
    const frames = [
      imageWithPatch(100, 100, 40, 40, 15, 15, 50, 200),
      uniformImage(100, 100, 50), // patch gone — uniform grey
    ]
    const bbox: BBox = { x: 40, y: 40, w: 15, h: 15 }
    const results = await trackFrames(frames, bbox, 0, 30, undefined, {
      stepSize: 1,
      confidenceThreshold: 0.4,
    })

    expect(results.length).toBe(2)
    expect(results[0].confidence).toBe(1.0) // first frame always 1.0
    // On uniform frame, NCC returns 0 for any position (constant region)
    expect(results[1].confidence).toBeLessThan(0.4)
  })

  it('normalises cx/cy to 0..1 range', async () => {
    const frame = uniformImage(200, 100, 128)
    const bbox: BBox = { x: 0, y: 0, w: 20, h: 20 }
    const results = await trackFrames([frame], bbox, 0, 30)

    expect(results[0].cx).toBeGreaterThanOrEqual(0)
    expect(results[0].cx).toBeLessThanOrEqual(1)
    expect(results[0].cy).toBeGreaterThanOrEqual(0)
    expect(results[0].cy).toBeLessThanOrEqual(1)
  })
})
