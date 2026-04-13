/**
 * Simple template-matching tracker using normalized cross-correlation (NCC).
 * Runs entirely on the main thread — no OpenCV, no Web Worker dependencies.
 *
 * For each subsequent frame, we search a region around the last known position
 * for the patch that best matches the original template. The search window
 * expands slightly each frame to allow for motion.
 */

export interface BBox {
  x: number
  y: number
  w: number
  h: number
}

export interface FrameTrackResult {
  frame: number
  t: number
  cx: number          // centre-x in 0..1 normalised coords
  cy: number          // centre-y in 0..1 normalised coords
  bbox: BBox          // pixel-space bbox
  confidence: number  // 0..1, from NCC score
}

/** Extract greyscale channel from RGBA ImageData into a Float32Array */
export function toGrey(img: ImageData): Float32Array {
  const len = img.width * img.height
  const grey = new Float32Array(len)
  const d = img.data
  for (let i = 0; i < len; i++) {
    const off = i * 4
    grey[i] = 0.299 * d[off] + 0.587 * d[off + 1] + 0.114 * d[off + 2]
  }
  return grey
}

/** Get a rectangular patch from a greyscale buffer */
export function getPatch(grey: Float32Array, imgW: number, x: number, y: number, w: number, h: number): Float32Array {
  const patch = new Float32Array(w * h)
  for (let row = 0; row < h; row++) {
    for (let col = 0; col < w; col++) {
      patch[row * w + col] = grey[(y + row) * imgW + (x + col)]
    }
  }
  return patch
}

/** Compute normalised cross-correlation between two equal-sized patches */
export function ncc(a: Float32Array, b: Float32Array): number {
  const n = a.length
  let sumA = 0, sumB = 0
  for (let i = 0; i < n; i++) { sumA += a[i]; sumB += b[i] }
  const meanA = sumA / n
  const meanB = sumB / n

  let num = 0, denA = 0, denB = 0
  for (let i = 0; i < n; i++) {
    const da = a[i] - meanA
    const db = b[i] - meanB
    num += da * db
    denA += da * da
    denB += db * db
  }

  const den = Math.sqrt(denA * denB)
  return den === 0 ? 0 : num / den
}

export interface TrackOptions {
  searchPadding?: number   // multiplier of bbox size for search window (default 1.5)
  stepSize?: number        // pixel step for search grid (default 2)
  confidenceThreshold?: number // below this, mark as lost (default 0.4)
}

function yieldToUI(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

/**
 * Track a bounding box across a sequence of frames.
 * `frames` should all be the same dimensions.
 * Returns one result per frame.
 * Async to allow periodic UI yields.
 */
export async function trackFrames(
  frames: ImageData[],
  initialBbox: BBox,
  startTime: number,
  fps: number,
  onProgress?: (frame: number, total: number) => void,
  opts: TrackOptions = {}
): Promise<FrameTrackResult[]> {
  if (frames.length === 0) return []

  const {
    searchPadding = 1.5,
    stepSize = 2,
    confidenceThreshold = 0.4,
  } = opts

  const W = frames[0].width
  const H = frames[0].height

  // Clamp bbox to image bounds
  let bbox: BBox = {
    x: Math.max(0, Math.min(initialBbox.x, W - initialBbox.w)),
    y: Math.max(0, Math.min(initialBbox.y, H - initialBbox.h)),
    w: Math.min(initialBbox.w, W),
    h: Math.min(initialBbox.h, H),
  }

  const results: FrameTrackResult[] = []

  // Build template from first frame
  const firstGrey = toGrey(frames[0])
  let template = getPatch(firstGrey, W, bbox.x, bbox.y, bbox.w, bbox.h)

  results.push({
    frame: 0,
    t: startTime,
    cx: (bbox.x + bbox.w / 2) / W,
    cy: (bbox.y + bbox.h / 2) / H,
    bbox: { ...bbox },
    confidence: 1.0,
  })

  onProgress?.(0, frames.length)

  for (let i = 1; i < frames.length; i++) {
    const grey = toGrey(frames[i])

    // Define search region around last bbox
    const padX = Math.round(bbox.w * searchPadding)
    const padY = Math.round(bbox.h * searchPadding)

    const searchX0 = Math.max(0, bbox.x - padX)
    const searchY0 = Math.max(0, bbox.y - padY)
    const searchX1 = Math.min(W - bbox.w, bbox.x + padX)
    const searchY1 = Math.min(H - bbox.h, bbox.y + padY)

    let bestScore = -Infinity
    let bestX = bbox.x
    let bestY = bbox.y

    for (let sy = searchY0; sy <= searchY1; sy += stepSize) {
      for (let sx = searchX0; sx <= searchX1; sx += stepSize) {
        const candidate = getPatch(grey, W, sx, sy, bbox.w, bbox.h)
        const score = ncc(template, candidate)
        if (score > bestScore) {
          bestScore = score
          bestX = sx
          bestY = sy
        }
      }
    }

    // Sub-pixel refinement: search ±1 around best position at step 1
    if (stepSize > 1) {
      const refX0 = Math.max(0, bestX - stepSize)
      const refY0 = Math.max(0, bestY - stepSize)
      const refX1 = Math.min(W - bbox.w, bestX + stepSize)
      const refY1 = Math.min(H - bbox.h, bestY + stepSize)

      for (let sy = refY0; sy <= refY1; sy++) {
        for (let sx = refX0; sx <= refX1; sx++) {
          const candidate = getPatch(grey, W, sx, sy, bbox.w, bbox.h)
          const score = ncc(template, candidate)
          if (score > bestScore) {
            bestScore = score
            bestX = sx
            bestY = sy
          }
        }
      }
    }

    const confidence = Math.max(0, bestScore)

    if (confidence >= confidenceThreshold) {
      bbox = { x: bestX, y: bestY, w: bbox.w, h: bbox.h }
      // Update template with a blend: 80% original + 20% current match
      // This helps the tracker adapt to gradual appearance changes
      const newPatch = getPatch(grey, W, bestX, bestY, bbox.w, bbox.h)
      for (let j = 0; j < template.length; j++) {
        template[j] = 0.8 * template[j] + 0.2 * newPatch[j]
      }
    }
    // If confidence is low, keep the previous bbox (tracker "lost" — stays in place)

    results.push({
      frame: i,
      t: startTime + i / fps,
      cx: (bbox.x + bbox.w / 2) / W,
      cy: (bbox.y + bbox.h / 2) / H,
      bbox: { ...bbox },
      confidence,
    })

    onProgress?.(i, frames.length)

    // Yield to UI every 5 frames to prevent freeze
    if (i % 5 === 0) {
      await yieldToUI()
    }
  }

  return results
}
