/**
 * Web Worker for export frame capture.
 * Receives ImageBitmap frames from the main thread, draws the cropped region
 * onto an OffscreenCanvas, and encodes to JPEG — all off the main thread.
 *
 * Messages IN:
 *   { type: 'init', outputWidth, outputHeight }
 *   { type: 'frame', index, bitmap (ImageBitmap), cropX, cropY, cropW, cropH }
 *   { type: 'done' }
 *
 * Messages OUT:
 *   { type: 'encoded', index, data (ArrayBuffer) }
 *   { type: 'finished' }
 *   { type: 'error', message }
 */

let canvas: OffscreenCanvas | null = null
let ctx: OffscreenCanvasRenderingContext2D | null = null

self.onmessage = async (e: MessageEvent) => {
  const msg = e.data

  switch (msg.type) {
    case 'init': {
      canvas = new OffscreenCanvas(msg.outputWidth, msg.outputHeight)
      ctx = canvas.getContext('2d')!
      break
    }

    case 'frame': {
      if (!canvas || !ctx) {
        self.postMessage({ type: 'error', message: 'Worker not initialized' })
        return
      }

      try {
        const { index, bitmap, cropX, cropY, cropW, cropH } = msg

        ctx.clearRect(0, 0, canvas.width, canvas.height)
        ctx.drawImage(
          bitmap,
          cropX, cropY, cropW, cropH,
          0, 0, canvas.width, canvas.height
        )

        // Release the bitmap now that we've drawn it
        bitmap.close()

        // Encode to JPEG on this worker thread (the expensive part)
        const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.97 })
        const buffer = await blob.arrayBuffer()

        // Transfer the ArrayBuffer back (zero-copy)
        // Worker global postMessage supports transferables as second arg
        ;(postMessage as any)({ type: 'encoded', index, data: buffer }, [buffer])
      } catch (err: any) {
        self.postMessage({ type: 'error', message: err?.message || 'Frame encoding failed' })
      }
      break
    }

    case 'done': {
      self.postMessage({ type: 'finished' })
      break
    }
  }
}
