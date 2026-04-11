import { describe, it, expect } from 'vitest'
import { ramerDouglasPeucker, type RDPPoint } from '../src/utils/rdp'

describe('ramerDouglasPeucker', () => {
  it('returns input unchanged when 2 or fewer points', () => {
    const single: RDPPoint[] = [{ t: 0, x: 0, y: 0 }]
    expect(ramerDouglasPeucker(single, 0.01)).toEqual(single)

    const two: RDPPoint[] = [
      { t: 0, x: 0, y: 0 },
      { t: 1, x: 1, y: 1 },
    ]
    expect(ramerDouglasPeucker(two, 0.01)).toEqual(two)
  })

  it('returns empty array for empty input', () => {
    expect(ramerDouglasPeucker([], 0.01)).toEqual([])
  })

  it('simplifies collinear points to start and end', () => {
    const points: RDPPoint[] = [
      { t: 0, x: 0, y: 0 },
      { t: 1, x: 0.5, y: 0.5 },
      { t: 2, x: 1, y: 1 },
    ]
    const result = ramerDouglasPeucker(points, 0.01)
    expect(result).toEqual([points[0], points[2]])
  })

  it('preserves points that deviate more than epsilon', () => {
    const points: RDPPoint[] = [
      { t: 0, x: 0, y: 0 },
      { t: 1, x: 0.5, y: 1 }, // far off the line from (0,0)->(1,0)
      { t: 2, x: 1, y: 0 },
    ]
    const result = ramerDouglasPeucker(points, 0.01)
    expect(result.length).toBe(3)
    expect(result).toEqual(points)
  })

  it('simplifies with large epsilon', () => {
    const points: RDPPoint[] = [
      { t: 0, x: 0, y: 0 },
      { t: 1, x: 0.5, y: 0.3 },
      { t: 2, x: 1, y: 0 },
    ]
    // With a very large epsilon, all intermediate points are dropped
    const result = ramerDouglasPeucker(points, 10)
    expect(result).toEqual([points[0], points[2]])
  })

  it('handles a complex path correctly', () => {
    const points: RDPPoint[] = [
      { t: 0, x: 0, y: 0 },
      { t: 1, x: 0.25, y: 0.25 }, // collinear-ish
      { t: 2, x: 0.5, y: 0.5 },   // collinear-ish
      { t: 3, x: 0.5, y: 1.0 },   // big deviation
      { t: 4, x: 0.75, y: 0.75 }, // collinear-ish to end
      { t: 5, x: 1.0, y: 1.0 },
    ]
    const result = ramerDouglasPeucker(points, 0.01)
    // Must keep first, last, and the deviation point
    expect(result.length).toBeGreaterThanOrEqual(3)
    expect(result[0]).toEqual(points[0])
    expect(result[result.length - 1]).toEqual(points[5])
    expect(result.some((p) => p.t === 3)).toBe(true)
  })

  it('preserves all points when epsilon is 0', () => {
    const points: RDPPoint[] = [
      { t: 0, x: 0, y: 0 },
      { t: 1, x: 0.1, y: 0.2 },
      { t: 2, x: 0.5, y: 0.3 },
      { t: 3, x: 1, y: 1 },
    ]
    // epsilon=0 means only truly collinear points are removed
    const result = ramerDouglasPeucker(points, 0)
    // All non-collinear points should be kept
    expect(result.length).toBeGreaterThanOrEqual(3)
  })
})
