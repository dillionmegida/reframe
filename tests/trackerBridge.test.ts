import { describe, it, expect } from 'vitest'
import type { TrackResult, UntrackedRange } from '../src/types'

/**
 * Tests for the pure logic in trackerBridge.ts.
 * We can't import runTracker directly (it relies on DOM globals like
 * document.createElement('video')), so we test the pure helper functions
 * by re-implementing them here — same pattern as exportPipeline.test.ts.
 */

// --- Copied from trackerBridge.ts for unit testing ---

function computeUntrackedRanges(
  results: TrackResult[],
  minRangeDuration = 0.2
): UntrackedRange[] {
  const ranges: UntrackedRange[] = []
  let rangeStart: number | null = null

  for (let i = 0; i < results.length; i++) {
    if (!results[i].confident && rangeStart === null) {
      rangeStart = results[i].t
    } else if (results[i].confident && rangeStart !== null) {
      const duration = results[i].t - rangeStart
      if (duration >= minRangeDuration) {
        ranges.push({ start: rangeStart, end: results[i].t })
      }
      rangeStart = null
    }
  }

  if (rangeStart !== null) {
    const duration = results[results.length - 1].t - rangeStart
    if (duration >= minRangeDuration) {
      ranges.push({ start: rangeStart, end: results[results.length - 1].t })
    }
  }

  return ranges
}

// --- Helper ---

function result(frame: number, t: number, confident: boolean): TrackResult {
  return { frame, t, x: 0.5, y: 0.5, confident }
}

// --- Tests ---

describe('computeUntrackedRanges', () => {
  it('returns empty array for empty results', () => {
    expect(computeUntrackedRanges([])).toEqual([])
  })

  it('returns empty array when all results are confident', () => {
    const results = [
      result(0, 0, true),
      result(1, 0.033, true),
      result(2, 0.066, true),
    ]
    expect(computeUntrackedRanges(results)).toEqual([])
  })

  it('detects a single untracked range in the middle', () => {
    const results = [
      result(0, 0, true),
      result(1, 0.1, false),
      result(2, 0.2, false),
      result(3, 0.3, false),
      result(4, 0.4, true),
    ]
    const ranges = computeUntrackedRanges(results)
    expect(ranges.length).toBe(1)
    expect(ranges[0].start).toBe(0.1)
    expect(ranges[0].end).toBe(0.4)
  })

  it('detects untracked range at the end', () => {
    const results = [
      result(0, 0, true),
      result(1, 1, true),
      result(2, 2, false),
      result(3, 3, false),
      result(4, 4, false),
    ]
    const ranges = computeUntrackedRanges(results)
    expect(ranges.length).toBe(1)
    expect(ranges[0].start).toBe(2)
    expect(ranges[0].end).toBe(4)
  })

  it('detects untracked range at the start', () => {
    const results = [
      result(0, 0, false),
      result(1, 0.5, false),
      result(2, 1.0, true),
      result(3, 1.5, true),
    ]
    const ranges = computeUntrackedRanges(results)
    expect(ranges.length).toBe(1)
    expect(ranges[0].start).toBe(0)
    expect(ranges[0].end).toBe(1.0)
  })

  it('detects multiple untracked ranges', () => {
    const results = [
      result(0, 0, true),
      result(1, 0.5, false),
      result(2, 1.0, false),
      result(3, 1.5, true),
      result(4, 2.0, true),
      result(5, 2.5, false),
      result(6, 3.0, false),
      result(7, 3.5, true),
    ]
    const ranges = computeUntrackedRanges(results)
    expect(ranges.length).toBe(2)
    expect(ranges[0]).toEqual({ start: 0.5, end: 1.5 })
    expect(ranges[1]).toEqual({ start: 2.5, end: 3.5 })
  })

  it('filters out ranges shorter than minRangeDuration', () => {
    const results = [
      result(0, 0, true),
      result(1, 0.1, false), // only 0.1s gap — below default 0.2 threshold
      result(2, 0.2, true),
      result(3, 0.5, false), // 0.5s gap — above threshold
      result(4, 0.7, false),
      result(5, 1.0, true),
    ]
    const ranges = computeUntrackedRanges(results)
    expect(ranges.length).toBe(1)
    expect(ranges[0]).toEqual({ start: 0.5, end: 1.0 })
  })

  it('respects custom minRangeDuration', () => {
    const results = [
      result(0, 0, true),
      result(1, 1, false),
      result(2, 2, false),
      result(3, 3, true),
    ]
    // With minRangeDuration = 3, the 2s gap should be filtered out
    const ranges = computeUntrackedRanges(results, 3)
    expect(ranges.length).toBe(0)

    // With minRangeDuration = 1, it should pass
    const ranges2 = computeUntrackedRanges(results, 1)
    expect(ranges2.length).toBe(1)
  })

  it('handles all unconfident results', () => {
    const results = [
      result(0, 0, false),
      result(1, 1, false),
      result(2, 2, false),
    ]
    const ranges = computeUntrackedRanges(results)
    expect(ranges.length).toBe(1)
    expect(ranges[0]).toEqual({ start: 0, end: 2 })
  })

  it('handles single unconfident result below duration', () => {
    const results = [result(0, 0, false)]
    // Duration is 0 - 0 = 0, which is < 0.2
    const ranges = computeUntrackedRanges(results)
    expect(ranges.length).toBe(0)
  })

  it('handles alternating confident/unconfident below threshold', () => {
    const results = [
      result(0, 0, false),
      result(1, 0.05, true),
      result(2, 0.1, false),
      result(3, 0.15, true),
    ]
    // Each gap is only 0.05s — below 0.2 threshold
    const ranges = computeUntrackedRanges(results)
    expect(ranges.length).toBe(0)
  })
})
