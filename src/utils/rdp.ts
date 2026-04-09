export interface RDPPoint {
  t: number
  x: number
  y: number
}

export function ramerDouglasPeucker(points: RDPPoint[], epsilon: number): RDPPoint[] {
  if (points.length <= 2) return points

  let maxDist = 0
  let maxIdx = 0
  const start = points[0]
  const end = points[points.length - 1]

  for (let i = 1; i < points.length - 1; i++) {
    const dist = perpendicularDistance(points[i], start, end)
    if (dist > maxDist) {
      maxDist = dist
      maxIdx = i
    }
  }

  if (maxDist > epsilon) {
    const left = ramerDouglasPeucker(points.slice(0, maxIdx + 1), epsilon)
    const right = ramerDouglasPeucker(points.slice(maxIdx), epsilon)
    return [...left.slice(0, -1), ...right]
  }

  return [start, end]
}

function perpendicularDistance(p: RDPPoint, a: RDPPoint, b: RDPPoint): number {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const len = Math.sqrt(dx * dx + dy * dy)
  if (len === 0) return Math.sqrt((p.x - a.x) ** 2 + (p.y - a.y) ** 2)
  return Math.abs(dx * (a.y - p.y) - (a.x - p.x) * dy) / len
}
