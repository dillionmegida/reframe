import { describe, it, expect } from 'vitest'

/**
 * Tests for pure logic in capturePreview.ts.
 * We can't import directly (module runs DOM code at load time),
 * so we copy the pure function for testing.
 */

// --- Copied from capturePreview.ts ---

function computeBitrate(outputWidth: number, outputHeight: number): number {
  const pixels = outputWidth * outputHeight
  const pixels1080p = 1080 * 1920
  const baseBitrate = 8_000_000
  return Math.round(baseBitrate * (pixels / pixels1080p))
}

// --- Tests ---

describe('computeBitrate', () => {
  it('returns ~8 Mbps for 1080x1920', () => {
    const bitrate = computeBitrate(1080, 1920)
    expect(bitrate).toBe(8_000_000)
  })

  it('scales linearly with pixel count', () => {
    const base = computeBitrate(1080, 1920)
    // 4x the pixels → 4x the bitrate
    const double = computeBitrate(2160, 3840)
    expect(double).toBeCloseTo(base * 4, -3)
  })

  it('returns lower bitrate for smaller resolutions', () => {
    const small = computeBitrate(540, 960)
    const full = computeBitrate(1080, 1920)
    expect(small).toBeLessThan(full)
    // Quarter pixels → quarter bitrate
    expect(small).toBeCloseTo(full / 4, -3)
  })

  it('handles square output', () => {
    const bitrate = computeBitrate(1080, 1080)
    const expected = Math.round(8_000_000 * (1080 * 1080) / (1080 * 1920))
    expect(bitrate).toBe(expected)
  })

  it('handles landscape output', () => {
    const bitrate = computeBitrate(1920, 1080)
    // Same pixel count as portrait → same bitrate
    expect(bitrate).toBe(8_000_000)
  })

  it('returns 0 for zero dimensions', () => {
    expect(computeBitrate(0, 0)).toBe(0)
  })
})
