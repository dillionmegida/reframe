/**
 * Web Worker for NCC template-matching tracker.
 * Receives frames one at a time (streaming) to avoid buffering all frames in memory.
 *
 * Messages IN:
 *   { type: 'init', bbox, width, height, startTime, fps, opts }
 *   { type: 'frame', index, data (ArrayBuffer of RGBA pixels) }
 *   { type: 'done' }
 *
 * Messages OUT:
 *   { type: 'result', result: FrameTrackResult }
 *   { type: 'progress', frame, total }
 *   { type: 'finished', results: FrameTrackResult[] }
 *   { type: 'error', message }
 */

interface BBox {
  x: number
  y: number
  w: number
  h: number
}

interface FrameTrackResult {
  frame: number
  t: number
  cx: number
  cy: number
  bbox: BBox
  confidence: number
}

interface TrackOpts {
  searchPadding: number
  stepSize: number
  confidenceThreshold: number
}

function toGreyFromBuffer(data: Uint8ClampedArray, width: number, height: number): Float32Array {
  const len = width * height
  const grey = new Float32Array(len)
  for (let i = 0; i < len; i++) {
    const off = i * 4
    grey[i] = 0.299 * data[off] + 0.587 * data[off + 1] + 0.114 * data[off + 2]
  }
  return grey
}

function getPatch(grey: Float32Array, imgW: number, x: number, y: number, w: number, h: number): Float32Array {
  const patch = new Float32Array(w * h)
  for (let row = 0; row < h; row++) {
    for (let col = 0; col < w; col++) {
      patch[row * w + col] = grey[(y + row) * imgW + (x + col)]
    }
  }
  return patch
}

function ncc(a: Float32Array, b: Float32Array): number {
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

// Tracker state
let W = 0
let H = 0
let startTime = 0
let fps = 0
let opts: TrackOpts = { searchPadding: 1.5, stepSize: 2, confidenceThreshold: 0.4 }
let bbox: BBox = { x: 0, y: 0, w: 0, h: 0 }
let template: Float32Array | null = null
let results: FrameTrackResult[] = []
let totalFrames = 0

function processFrame(index: number, pixelData: Uint8ClampedArray): FrameTrackResult {
  const grey = toGreyFromBuffer(pixelData, W, H)

  if (index === 0) {
    // First frame: extract template
    template = getPatch(grey, W, bbox.x, bbox.y, bbox.w, bbox.h)
    return {
      frame: 0,
      t: startTime,
      cx: (bbox.x + bbox.w / 2) / W,
      cy: (bbox.y + bbox.h / 2) / H,
      bbox: { ...bbox },
      confidence: 1.0,
    }
  }

  const { searchPadding, stepSize, confidenceThreshold } = opts

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
      const score = ncc(template!, candidate)
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
        const score = ncc(template!, candidate)
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
    const newPatch = getPatch(grey, W, bestX, bestY, bbox.w, bbox.h)
    for (let j = 0; j < template!.length; j++) {
      template![j] = 0.8 * template![j] + 0.2 * newPatch[j]
    }
  }

  return {
    frame: index,
    t: startTime + index / fps,
    cx: (bbox.x + bbox.w / 2) / W,
    cy: (bbox.y + bbox.h / 2) / H,
    bbox: { ...bbox },
    confidence,
  }
}

self.onmessage = (e: MessageEvent) => {
  const msg = e.data

  switch (msg.type) {
    case 'init': {
      W = msg.width
      H = msg.height
      startTime = msg.startTime
      fps = msg.fps
      totalFrames = msg.totalFrames
      opts = {
        searchPadding: msg.opts?.searchPadding ?? 1.5,
        stepSize: msg.opts?.stepSize ?? 2,
        confidenceThreshold: msg.opts?.confidenceThreshold ?? 0.4,
      }
      // Clamp bbox to image bounds
      bbox = {
        x: Math.max(0, Math.min(msg.bbox.x, W - msg.bbox.w)),
        y: Math.max(0, Math.min(msg.bbox.y, H - msg.bbox.h)),
        w: Math.min(msg.bbox.w, W),
        h: Math.min(msg.bbox.h, H),
      }
      template = null
      results = []
      break
    }

    case 'frame': {
      try {
        const pixelData = new Uint8ClampedArray(msg.data)
        const result = processFrame(msg.index, pixelData)
        results.push(result)
        self.postMessage({ type: 'result', result })
        self.postMessage({ type: 'progress', frame: msg.index, total: totalFrames })
      } catch (err: any) {
        self.postMessage({ type: 'error', message: err?.message || 'Frame processing failed' })
      }
      break
    }

    case 'done': {
      self.postMessage({ type: 'finished', results })
      break
    }
  }
}
